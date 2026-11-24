import assert from "node:assert/strict";
import { test } from "node:test";
import { execute, parseBilingualMediaResult, parsePlan, textPrompt } from "../lib/runner";
import type { RunInput } from "../lib/types";

const graph = {
  nodes: [
    { id: "scene", kind: "script", title: "씬", body: "장면", x: 0, y: 0 },
  ],
  edges: [],
};

test("미디어 프롬프트 제안은 영문과 한국어를 함께 읽고 기존 응답도 수용한다", () => {
  const bilingual = { english: "A close-up of the actor.", korean: "배우의 클로즈업." };
  assert.deepEqual(parseBilingualMediaResult(JSON.stringify(bilingual)), {
    text: bilingual.english, promptKorean: { text: bilingual.korean },
  });
  assert.deepEqual(parseBilingualMediaResult("기존 응답"), { text: "기존 응답" });
  const input: RunInput = {
    projectId: "project", requestId: "request", nodeId: "frame",
    provider: "codex", operation: "text", prompt: "샷을 작성", references: [],
    target: { kind: "keyframe", title: "샷", body: "기존 내용" },
  };
  assert.match(textPrompt(input), /"english":"영문 프롬프트"/);
  assert.match(textPrompt(input), /"korean":"한국어 프롬프트"/);
  const plan = { nodes: [{ id: "frame", kind: "keyframe", title: "샷", body: bilingual.english,
    promptKorean: { text: bilingual.korean }, x: 0, y: 0 }], edges: [] };
  assert.deepEqual(parsePlan(JSON.stringify(plan)), plan);
  assert.throws(() => parsePlan(JSON.stringify({ ...plan, nodes: [{ ...plan.nodes[0],
    promptKorean: { text: "한국어", extra: true } }] })));
});

test("기획 결과의 JSON 형식과 그래프 무결성을 검증한다", () => {
  assert.deepEqual(
    parsePlan(`\`\`\`json\n${JSON.stringify(graph)}\n\`\`\``),
    graph,
  );
  assert.throws(() => parsePlan("결과 없음"));
  assert.throws(() => parsePlan(JSON.stringify({ nodes: [], edges: [] })));
  assert.throws(() =>
    parsePlan(
      JSON.stringify({
        ...graph,
        edges: [{ source: "scene", target: "scene" }],
      }),
    ),
  );
  assert.throws(() =>
    parsePlan(
      JSON.stringify({ ...graph, nodes: [graph.nodes[0], graph.nodes[0]] }),
    ),
  );
});

test("지원하지 않는 제공자 조합은 프로세스를 실행하지 않는다", async () => {
  const input: RunInput = {
    projectId: "project",
    requestId: "request",
    nodeId: null,
    provider: "topview",
    operation: "plan",
    prompt: "테스트",
    references: [],
  };
  await assert.rejects(execute(input), /해당 서비스에서 직접 진행/);
  await assert.rejects(execute({ ...input, operation: "video" }), /작업 방식을/);
});

test("감독 기획과 샷 작성은 요구한 연출 항목과 사용자 자료를 전달한다", async () => {
  const { textPrompt, mediaPrompt } = await import("../lib/runner");
  const input: RunInput = {
    projectId: "project",
    requestId: "request",
    nodeId: "shot",
    provider: "claude",
    operation: "text",
    prompt: "불안에서 안도로",
    target: { kind: "shot", title: "샷 1", body: "인물이 문을 연다" },
    references: [
      { role: "context", title: "대본", body: "민서: 아직 계세요?" },
    ],
  };
  const text = textPrompt(input);
  for (const phrase of [
    "필수 동작",
    "180도",
    "목표와 장애",
    "대사·사운드",
    "테이크 채택 기준",
    "아직 계세요?",
  ])
    assert.ok(text.includes(phrase));
  const media = mediaPrompt(input);
  assert.match(media, /아직 계세요\?/);
  assert.match(media, /내용 참고/);
  const director = textPrompt({
    ...input,
    operation: "plan",
    nodeId: null,
    director: { format: "short", sceneCount: 3 },
  });
  assert.match(director, /장면 수는 정확히 3개/);
  assert.match(director, /시작·필수 동작·마지막 상태/);
});

test("영상 프롬프트는 샷·대사·연속성 텍스트를 전달하고 가이드 자료는 제외한다", async () => {
  const { snapshotReferences } = await import("../lib/run-input");
  const { higgsfieldArguments } = await import("../lib/runner");
  const graph = {
    nodes: [
      {
        id: "script",
        kind: "script" as const,
        title: "대본",
        body: "민서: 문을 열어줘",
        x: 0,
        y: 0,
      },
      {
        id: "shot",
        kind: "shot" as const,
        title: "샷",
        body: "시작: 닫힌 문\n필수 동작: 손으로 문을 민다\n끝: 문이 열린다\n카메라: 35mm\n동선: 오른쪽 진입\n사운드: 문소리",
        x: 1,
        y: 0,
      },
      {
        id: "guide",
        kind: "brief" as const,
        title: "비공개 가이드",
        body: "전송 금지",
        x: 0,
        y: 1,
      },
      {
        id: "video",
        kind: "video" as const,
        title: "영상",
        body: "고정값: 남색 코트",
        x: 2,
        y: 0,
      },
    ],
    edges: [
      {
        source: "script",
        target: "shot",
        role: "context" as const,
        usage: "input" as const,
      },
      {
        source: "shot",
        target: "video",
        role: "context" as const,
        usage: "input" as const,
      },
      {
        source: "guide",
        target: "shot",
        role: "context" as const,
        usage: "guide" as const,
      },
    ],
  };
  const input: RunInput = {
    projectId: "p",
    requestId: "r",
    nodeId: "video",
    provider: "higgsfield",
    operation: "video",
    prompt: "이 장면 생성",
    references: snapshotReferences(graph, "video", "video"),
  };
  const prompt = higgsfieldArguments(input)[1];
  for (const phrase of [
    "문을 열어줘",
    "닫힌 문",
    "손으로 문을 민다",
    "35mm",
    "오른쪽 진입",
    "문소리",
    "남색 코트",
  ])
    assert.ok(prompt.includes(phrase));
  assert.ok(!prompt.includes("전송 금지"));
});

test("감독 검토는 기존 카드의 수정안을 요청하며 새 기획과 중복할 수 없다", async () => {
  const { textPrompt } = await import("../lib/runner");
  const input: RunInput = {
    projectId: "p",
    requestId: "r",
    nodeId: null,
    provider: "codex",
    operation: "plan",
    prompt: "검토해줘",
    review: true,
    references: [{ nodeId: "script", title: "대본", body: "기존 대사" }],
  };
  const prompt = textPrompt(input);
  assert.match(prompt, /수정 후 본문 전체/);
  assert.match(prompt, /기존 대사/);
  await assert.rejects(
    execute({ ...input, director: { format: "short", sceneCount: 1 } }),
    /별도로/,
  );
});

test("첨부 질의는 노드 재작성보다 사용자의 읽기 요청을 우선하고 실제 파일 번호를 연결한다", async () => {
  const { textPrompt } = await import("../lib/runner");
  const input: RunInput = {
    projectId: "p",
    requestId: "r",
    nodeId: "s",
    provider: "codex",
    operation: "text",
    target: { kind: "script", title: "대본", body: "기존 대본" },
    prompt: "첨부 장면의 표시를 읽어 줘",
    attachments: [{ id: "a", name: "참조", kind: "image", detail: "원본" }],
    references: [
      {
        title: "참조",
        body: "",
        asset: { type: "image", url: "/sample/frame.webp", name: "참조" },
      },
    ],
  };
  const text = textPrompt(input);
  assert.match(text, /실제 이미지 픽셀/);
  assert.match(text, /"imageNumber":1/);
  assert.ok(text.endsWith(input.prompt));
});

test("Higgsfield 음성은 대사와 목소리 식별자만 전송한다", async () => {
  const { higgsfieldExecutionArguments } = await import("../lib/runner");
  const input = {
    projectId: "p", requestId: "r", nodeId: "voice", provider: "higgsfield" as const,
    operation: "audio" as const, model: "seed_audio", prompt: "안녕하세요.",
    references: [{ title: "인물", body: "전송하지 않을 설정" }],
    characterVoice: { id: "voice-id", type: "element" as const },
  };
  assert.deepEqual(higgsfieldExecutionArguments(input), [
    "seed_audio", "--prompt=안녕하세요.", "--voice_id=voice-id", "--voice_type=element", "--format=wav",
  ]);
  assert.throws(() => higgsfieldExecutionArguments({ ...input, model: "other" }), /목소리와 대사/);
});

test("Soul ID는 지원하는 이미지 모델에 전달하고 영상은 해당 이미지 참조를 확인한다", async () => {
  const { higgsfieldExecutionArguments } = await import("../lib/runner");
  const soul = { id: "soul-id", variant: "soul_2" as const };
  const frame = { type: "image" as const, name: "frame.webp", url: "/sample/frame.webp" };
  const input = {
    projectId: "p", requestId: "r", nodeId: "n", provider: "higgsfield" as const,
    operation: "image" as const, prompt: "인물", references: [], characterSoul: soul,
  };
  const profile = { model: "text2image_soul_v2", operation: "image" as const, mode: "default", label: "Soul", options: [], slots: [], supportsSoulId: true };
  const selection = { profile, resolved: { options: {}, media: {} } };
  assert.ok(higgsfieldExecutionArguments(input, selection).includes("--soul-id"));
  assert.throws(() => higgsfieldExecutionArguments(input), /Soul ID를 지원/);
  const video = { ...input, operation: "video" as const, characterSoul: undefined,
    references: [{ title: "인물", body: "", characterSoul: soul }] };
  assert.throws(() => higgsfieldExecutionArguments(video), /시작 프레임을 영상 참조/);
  assert.doesNotThrow(() => higgsfieldExecutionArguments({ ...video, references: [...video.references, { title: "시작", body: "", role: "start" as const, asset: frame }] }));
});
