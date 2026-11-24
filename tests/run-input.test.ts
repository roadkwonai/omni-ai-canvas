import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRunInput,
  providerSupportsInput,
  resolveProviderInput,
  reviewReferences,
  snapshotReferences,
} from "../lib/run-input";
import { MAX_SCENE_COUNT, type CanvasNode, type Graph, type Project, type ProviderInfo } from "../lib/types";
import { voiceoverLine } from "../lib/character-identity";
import { validateGraph } from "../lib/graph";

const image = {
  url: "/sample/portrait.webp",
  type: "image" as const,
  name: "portrait.webp",
};
const video = {
  url: "/sample/preview.mp4",
  type: "video" as const,
  name: "preview.mp4",
};
const privateGuide = {
  url: "/api/assets/secret.webp",
  type: "image" as const,
  name: "private-filename.webp",
};
const node = (
  id: string,
  kind: CanvasNode["kind"],
  asset?: CanvasNode["asset"],
): CanvasNode => ({
  id,
  kind,
  title: id,
  body: `${id} 본문`,
  x: 0,
  y: 0,
  ...(asset ? { asset } : {}),
});
const graph: Graph = {
  nodes: [
    node("brief", "brief"),
    node("scene", "scene"),
    node("shot", "shot"),
    node("identity", "character", image),
    node("motion", "referenceVideo", video),
    node("guide", "referenceImage", privateGuide),
    node("key", "keyframe", image),
    node("video", "video"),
    node("other", "scene"),
  ],
  edges: [
    { source: "brief", target: "scene" },
    { source: "scene", target: "shot" },
    { source: "identity", target: "shot", role: "identity" },
    { source: "motion", target: "shot", role: "motion" },
    { source: "guide", target: "shot", usage: "guide" },
    { source: "shot", target: "key" },
    { source: "shot", target: "video" },
    { source: "key", target: "video", role: "start" },
  ],
};
const project: Project = {
  id: "project",
  title: "test",
  graph,
  version: 4,
  updatedAt: "2026-01-01T00:00:00Z",
};
const request = {
  nodeId: "video",
  operation: "video",
  provider: "higgsfield",
  prompt: "촬영",
  version: 4,
};

test("캐릭터의 Soul과 목소리를 별도로 저장하고 공급사 실행에서 필요한 값만 고정한다", () => {
  const soul = { id: "409e10d2-ce2c-4121-a645-91399fae23a7", variant: "soul_2", status: "ready" } as const;
  const voice = { id: "db398d08-ef93-49d3-b8f7-eef29d957876", type: "element", status: "ready" } as const;
  const actor = { ...node("actor", "character", image), characterIdentity: { soul, voice } };
  const cue = { ...node("cue", "audioCue"), body: "## 녹음할 대사\n[VO] 서：이제 갈 시간이야.\n뒤돌아보지 마.\n\n## 목소리 연출\n낮게" };
  const cueAsset = { type: "audio", name: "voice.wav", url: "/api/assets/09609f36-5c63-4f78-9612-fc3d411d9738.wav" } as const;
  const videoNode = node("take", "video");
  const graph: Graph = { nodes: [actor, { ...cue, asset: cueAsset }, videoNode], edges: [
    { source: actor.id, target: cue.id, role: "identity" }, { source: actor.id, target: videoNode.id, role: "identity" },
    { source: cue.id, target: videoNode.id },
  ] };
  assert.ok(validateGraph(graph));
  const withSample: Graph = { ...graph, nodes: [
    { ...actor, characterIdentity: { ...actor.characterIdentity, voiceSample: cueAsset } },
    ...graph.nodes.slice(1),
  ] };
  assert.ok(validateGraph(withSample));
  assert.ok(!validateGraph({ ...graph, nodes: [
    { ...actor, characterIdentity: { ...actor.characterIdentity, voiceSample: image } },
    ...graph.nodes.slice(1),
  ] }));
  assert.ok(!validateGraph({ ...graph, nodes: [actor, { ...cue, characterIdentity: actor.characterIdentity }, videoNode] }));
  const current = { ...project, graph };
  const spoken = voiceoverLine(cue.body);
  assert.equal(spoken, "이제 갈 시간이야.\n뒤돌아보지 마.");
  const options = { ...request, nodeId: cue.id, operation: "audio", prompt: spoken, characterVoice: { id: "forged", type: "preset" } };
  const speech = buildRunInput(current, options, "voice-run");
  assert.deepEqual(speech.characterVoice, { id: voice.id, type: voice.type });
  assert.equal(speech.model, "seed_audio");
  assert.equal(speech.prompt, spoken);
  assert.equal(speech.audio, undefined);
  assert.equal(speech.characterSoul, undefined);
  assert.throws(() => buildRunInput(current, { ...options, attachmentIds: ["attachment"] }, "voice-run"), /발화 대사/);
  const privateGraph: Graph = { ...graph, edges: graph.edges.map((edge) => edge.target === cue.id ? { ...edge, usage: "guide" } : edge) };
  assert.throws(() => buildRunInput({ ...current, graph: privateGraph }, options, "voice-run"), /화자/);
  const pending: Graph = { ...graph, nodes: [{ ...actor, characterIdentity: { soul, voice: { ...voice, status: "training" } } }, ...graph.nodes.slice(1)] };
  assert.throws(() => buildRunInput({ ...current, graph: pending }, options, "voice-run"), /화자/);
  const portrait = buildRunInput(current, { ...request, nodeId: actor.id, operation: "image", model: "text2image_soul_v2", media: { mode: "default", options: {} } }, "soul-run");
  assert.deepEqual(portrait.characterSoul, { id: soul.id, variant: soul.variant });
  assert.throws(() => buildRunInput(current, { ...request, nodeId: actor.id, operation: "image", model: "soul_cinematic", media: { mode: "default", options: {} } }, "soul-run"), /Soul 유형/);
  const refs = snapshotReferences(graph, videoNode.id, "video", "higgsfield");
  assert.deepEqual(refs.find((ref) => ref.nodeId === actor.id)?.characterSoul, portrait.characterSoul);
  assert.deepEqual(refs.find((ref) => ref.nodeId === cue.id)?.asset, cueAsset);
  assert.equal(snapshotReferences(graph, videoNode.id, "video", "kling").find((ref) => ref.nodeId === cue.id)?.asset, undefined);
});

test("디렉터 연출을 대상과 연결된 자료에서 이미지 요청으로 전달한다", () => {
  const current = { ...project, graph: { ...graph, nodes: graph.nodes.map((item) =>
    item.id === "key" ? { ...item, directorNote: "조명: 창가의 부드러운 빛\n초점 거리: 85mm\n장르: 미스터리\n편집 리듬: 원테이크" } :
      item.id === "shot" ? { ...item, directorNote: "렌즈: 아나모픽 렌즈" } : item) } };
  const imageOutput = { aspect: "16:9", resolution: "2K", quality: "high" };
  const options = { ...request, nodeId: "key", provider: "codex", operation: "image", imageOutput };
  const image = buildRunInput(current, options, "image-run");
  assert.deepEqual(image.imageOutput, imageOutput);
  assert.match(image.target?.guidance?.text ?? "", /조명: 창가의 부드러운 빛/);
  assert.match(image.target?.guidance?.text ?? "", /초점 거리: 85mm\n장르: 미스터리\n편집 리듬: 원테이크/);
  assert.match(image.references.find((item) => item.nodeId === "shot")?.body ?? "", /렌즈: 아나모픽 렌즈/);
  assert.throws(() => buildRunInput(current, { ...options, imageOutput: { resolution: "16K" } }, "image-run"), /이미지 출력 설정/);
  assert.throws(() => buildRunInput(current, { ...options, provider: "higgsfield" }, "image-run"), /이미지 출력 설정/);
});

test("디렉터 스튜디오의 기법은 펼친 지시로, 움직임은 영상 요청에만 전달한다", () => {
  const note = "촬영 및 시각 연출\n구도: 클로즈업\n카메라 이동: 돌리 인";
  const current = { ...project, graph: { ...graph, nodes: graph.nodes.map((item) =>
    item.id === "key" || item.id === "shot" ? { ...item, directorNote: note } : item) } };
  const image = buildRunInput(current, { ...request, nodeId: "key", provider: "codex", operation: "image" }, "image-run");
  assert.match(image.target?.guidance?.text ?? "", /구도: 클로즈업 \(Close-Up\) · /);
  assert.doesNotMatch(JSON.stringify(image), /돌리 인/);
  const refs = snapshotReferences(current.graph, "video", "video");
  assert.match(refs.find((item) => item.nodeId === "shot")?.body ?? "", /카메라 이동: 돌리 인 \(Dolly In\) · /);
});

test("샷 참조와 서사 연결만 순서대로 수집하고 가이드는 비공개로 둔다", () => {
  const refs = snapshotReferences(graph, "video", "video");
  assert.deepEqual(
    refs.slice(0, 2).map((item) => item.nodeId),
    ["shot", "key"],
  );
  assert.equal(refs.find((item) => item.nodeId === "key")?.role, "start");
  assert.equal(
    refs.find((item) => item.nodeId === "identity")?.asset?.type,
    "image",
  );
  assert.equal(
    refs.find((item) => item.nodeId === "motion")?.asset?.type,
    "video",
  );
  assert.ok(refs.some((item) => item.nodeId === "brief"));
  assert.ok(!JSON.stringify(refs).includes("guide"));
  assert.ok(!JSON.stringify(refs).includes("private-filename"));
  assert.ok(!JSON.stringify(refs).includes("other"));
  const imageRefs = snapshotReferences(graph, "key", "image");
  assert.equal(
    imageRefs.find((item) => item.nodeId === "motion")?.asset,
    undefined,
  );
});

test("기획과 요청 검증은 가이드와 유효하지 않은 연출 입력을 차단한다", () => {
  const plan = {
    nodeId: null,
    operation: "plan",
    provider: "codex",
    prompt: "기획",
    version: 4,
    director: { format: "short", sceneCount: 3 },
  };
  const snapshot = buildRunInput(project, plan, "id");
  assert.deepEqual(snapshot.director, plan.director);
  assert.ok(!JSON.stringify(snapshot.references).includes("guide"));
  assert.ok(!JSON.stringify(snapshot.references).includes("private-filename"));
  for (const sceneCount of [7, "auto"] as const)
    assert.equal(buildRunInput(project, { ...plan, director: { format: "short", sceneCount } }, "id").director?.sceneCount, sceneCount);
  assert.throws(() =>
    buildRunInput(
      project,
      { ...plan, director: { format: "short", sceneCount: MAX_SCENE_COUNT + 1 } },
      "id",
    ),
  );
  assert.throws(() =>
    buildRunInput(project, { ...request, director: plan.director }, "id"),
  );
  assert.throws(() => buildRunInput(project, { ...request, version: 3 }, "id"));
  assert.throws(() =>
    buildRunInput(
      project,
      { ...request, nodeId: "scene", operation: "video" },
      "id",
    ),
  );
});

test("견적과 생성은 요청 번호만 다르고 입력 스냅샷은 같다", () => {
  const estimate = buildRunInput(project, request, "");
  const run = buildRunInput(project, request, "request-id");
  assert.deepEqual({ ...run, requestId: "" }, estimate);
  assert.equal(estimate.target?.kind, "video");
});

test("선택 씬의 검토는 관련 제작 노드만 원문과 함께 전달한다", () => {
  const reviewGraph: Graph = {
    nodes: [
      node("root", "scenario"),
      node("scene-a", "scene"),
      node("scene-b", "scene"),
      node("a-script", "script"),
      node("a-shot", "shot"),
      node("a-video", "video", video),
      node("shared", "shot"),
      node("shared-video", "video"),
      node("b-shot", "shot"),
      node("private", "script"),
      node("guide-only", "shot"),
    ],
    edges: [
      { source: "root", target: "scene-a" },
      { source: "root", target: "scene-b" },
      { source: "scene-a", target: "a-script" },
      { source: "a-script", target: "a-shot" },
      { source: "a-shot", target: "a-video" },
      { source: "scene-a", target: "shared" },
      { source: "scene-b", target: "shared" },
      { source: "shared", target: "shared-video" },
      { source: "scene-b", target: "b-shot" },
      { source: "private", target: "a-shot", usage: "guide" },
      { source: "a-shot", target: "guide-only", usage: "guide" },
    ],
  };
  const scoped = buildRunInput(
    { ...project, graph: reviewGraph },
    {
      nodeId: "scene-a",
      operation: "plan",
      review: true,
      provider: "codex",
      prompt: "수정",
      version: 4,
    },
    "request",
  );
  assert.equal(scoped.review, true);
  assert.equal(scoped.target, undefined);
  assert.deepEqual(
    scoped.references.map((item) => item.nodeId),
    ["scene-a", "a-script", "a-shot", "a-video"],
  );
  for (const item of scoped.references)
    assert.deepEqual(Object.keys(item).sort(), [
      "body",
      "kind",
      "nodeId",
      "title",
    ]);
  const all = buildRunInput(
    { ...project, graph: reviewGraph },
    {
      nodeId: null,
      operation: "plan",
      review: true,
      provider: "codex",
      prompt: "검토",
      version: 4,
    },
    "request",
  );
  assert.ok(all.references.some((item) => item.nodeId === "scene-b"));
  assert.ok(!all.references.some((item) => item.nodeId === "private"));
  assert.ok(!all.references.some((item) => "asset" in item));
  const repeated = buildRunInput(
    { ...project, graph: reviewGraph },
    {
      nodeId: "scene-a",
      operation: "plan",
      review: true,
      provider: "codex",
      prompt: "수정",
      version: 4,
    },
    "request",
  );
  assert.deepEqual(scoped, repeated);
});

test("검토 범위와 입력이 잘못되면 실행 전에 거절한다", () => {
  const input = {
    nodeId: "scene",
    operation: "plan",
    review: true,
    provider: "codex",
    prompt: "검토",
    version: 4,
  };
  assert.throws(() =>
    buildRunInput(project, { ...input, nodeId: "shot" }, "id"),
  );
  assert.throws(() =>
    buildRunInput(
      project,
      { ...input, director: { format: "short", sceneCount: 1 } },
      "id",
    ),
  );
  assert.throws(() =>
    buildRunInput(project, { ...input, operation: "text" }, "id"),
  );
  assert.throws(() =>
    buildRunInput(
      { ...project, graph: { nodes: [], edges: [] } },
      { ...input, nodeId: null },
      "id",
    ),
  );
  const oversized = Array.from({ length: 6 }, (_, i) => ({
    ...node(`large-${i}`, "script"),
    body: "가".repeat(24_000),
  }));
  assert.throws(
    () =>
      buildRunInput(
        { ...project, graph: { nodes: oversized, edges: [] } },
        { ...input, nodeId: null },
        "id",
      ),
    /너무 많거나 깁니다/,
  );
});

test("모델은 공급자와 작업이 일치하는 카탈로그만 허용한다", () => {
  const account: ProviderInfo = {
    id: "codex",
    label: "Codex",
    available: true,
    operations: ["text", "plan"],
    detail: "",
    billing: "",
    website: "",
    models: [
      { id: "model-a", label: "A", operations: ["text", "plan"] },
      { id: "model-b", label: "B", operations: ["text"] },
    ],
  };
  const body = {
    nodeId: null,
    operation: "plan",
    provider: "codex",
    prompt: "기획",
    version: 4,
  };
  const defaults = buildRunInput(project, body, "request");
  const selected = buildRunInput(
    project,
    { ...body, model: "model-a" },
    "request",
  );
  assert.equal(defaults.model, undefined);
  assert.equal(selected.model, "model-a");
  assert.ok(providerSupportsInput(defaults, account));
  assert.ok(providerSupportsInput(selected, account));
  assert.ok(!providerSupportsInput({ ...selected, model: "model-b" }, account));
  assert.ok(!providerSupportsInput({ ...selected, model: "unknown" }, account));
  assert.ok(
    !providerSupportsInput({ ...selected, provider: "claude" }, account),
  );
  const imageAccount: ProviderInfo = {
    ...account,
    id: "openai-image",
    operations: ["image"],
    models: [{ id: "image-default", label: "기본", operations: ["image"] }],
  };
  const imageInput = buildRunInput(
    project,
    { ...request, nodeId: "key", provider: "openai-image", operation: "image" },
    "request",
  );
  assert.equal(
    resolveProviderInput(imageInput, imageAccount).model,
    "image-default",
  );
  assert.throws(() =>
    resolveProviderInput(imageInput, { ...imageAccount, models: [] }),
  );
  assert.throws(() =>
    resolveProviderInput({ ...imageInput, model: "other" }, imageAccount),
  );
  assert.equal(resolveProviderInput(defaults, account).model, undefined);
  assert.notDeepEqual(defaults, selected);
  for (const invalid of ["", "-bad", "invalid model", "a".repeat(129), null]) {
    assert.throws(() =>
      buildRunInput(project, { ...body, model: invalid }, "request"),
    );
  }
});

test("작품 전체 검토에는 기획과 캐릭터 본문이 포함되고 첨부는 빠진다", () => {
  const refs = reviewReferences(graph, null);
  assert.ok(
    refs.some((item) => item.nodeId === "brief" && item.kind === "brief"),
  );
  assert.ok(
    refs.some(
      (item) => item.nodeId === "identity" && item.kind === "character",
    ),
  );
  assert.ok(!refs.some((item) => item.nodeId === "guide"));
  assert.ok(!refs.some((item) => item.asset));
});

test("기존 연결의 미디어는 유지하며 허용 개수를 초과하면 거절한다", () => {
  const sources = Array.from({ length: 13 }, (_, index) =>
    node(`image-${index}`, "referenceImage", image),
  );
  const target = node("video-target", "video");
  const expanded: Graph = {
    nodes: [...sources, target],
    edges: sources.map((item) => ({ source: item.id, target: target.id })),
  };
  const value = { ...request, nodeId: target.id };
  assert.throws(
    () => buildRunInput({ ...project, graph: expanded }, value, "request"),
    /너무 많거나 깁니다/,
  );
  const limited = { ...expanded, edges: expanded.edges.slice(0, 1) };
  const input = buildRunInput({ ...project, graph: limited }, value, "request");
  assert.deepEqual(input.references[0].asset, image);
});

test("Codex 텍스트 작업만 연결된 이미지를 첨부하고 가이드와 영상은 제외한다", () => {
  const textRequest = {
    nodeId: "shot",
    operation: "text",
    prompt: "연출을 보완해 줘",
    version: 4,
  };
  const codex = buildRunInput(
    project,
    { ...textRequest, provider: "codex" },
    "request",
  );
  assert.deepEqual(
    codex.references.find((item) => item.nodeId === "identity")?.asset,
    image,
  );
  assert.equal(
    codex.references.find((item) => item.nodeId === "motion")?.asset,
    undefined,
  );
  assert.ok(!JSON.stringify(codex.references).includes("guide"));
  assert.ok(!JSON.stringify(codex.references).includes("private-filename"));
  for (const provider of ["claude", "agy"]) {
    const input = buildRunInput(
      project,
      { ...textRequest, provider },
      "request",
    );
    assert.ok(
      input.references.some(
        (item) => item.nodeId === "identity" && item.body === "identity 본문",
      ),
    );
    assert.ok(input.references.every((item) => !item.asset));
    assert.ok(!JSON.stringify(input.references).includes("private-filename"));
  }
  assert.deepEqual(
    snapshotReferences(graph, "shot", "text", "codex"),
    codex.references,
  );
});

test("영상에 지정한 시작 프레임이나 동작 파일이 비어 있으면 유료 제출 전에 설명한다", () => {
  for (const missing of ["key", "motion"]) {
    const incomplete = {
      ...project,
      graph: {
        ...graph,
        nodes: graph.nodes.map((n) =>
          n.id === missing ? { ...n, asset: undefined } : n,
        ),
      },
    };
    assert.throws(
      () => buildRunInput(incomplete, request, "test"),
      /먼저 적용/,
    );
  }
});

test("추론 강도는 텍스트 실행에 고정하며 모델이 지원하지 않으면 대기열 등록 전 거절한다", () => {
  const payload = {
    nodeId: "shot", operation: "text", provider: "codex", model: "gpt-test",
    effort: "high", prompt: "검토", version: 4,
  };
  const input = buildRunInput(project, payload, "request");
  assert.equal(input.effort, "high");
  const account: ProviderInfo = {
    id: "codex", label: "Codex", operations: ["text"], available: true,
    detail: "", billing: "", website: "",
    models: [{ id: "gpt-test", label: "Test", operations: ["text"], efforts: ["low", "high"] }],
  };
  assert.equal(resolveProviderInput(input, account).effort, "high");
  assert.throws(() => resolveProviderInput({ ...input, effort: "max" }, account));
  assert.throws(() => buildRunInput(project, { ...payload, effort: "--invalid" }, "request"));
  assert.throws(() => buildRunInput(project, { ...request, effort: "high" }, "request"));
});
