import assert from "node:assert/strict";
import { test } from "node:test";
import { validateGraph } from "../lib/graph";
import {
  applyStyleToGraph,
  makeStyleDraft,
  makeStyleGraph,
  parseStyleDraft,
  productionProfiles,
} from "../lib/style-preset";
import { parseDirectorOptions } from "../lib/types";
import { directorPrompt } from "../lib/director";
import type { RunInput } from "../lib/types";

test("각 제작 유형은 관련 작업 노드와 연결된 타임라인을 만든다", () => {
  const materialTitles = new Set<string>();
  for (const profile of productionProfiles) {
    const preset = makeStyleDraft(profile.id);
    preset.style.camera = "35mm 로우 앵글";
    const graph = makeStyleGraph(preset, profile.sceneCount);
    assert.ok(validateGraph(graph), profile.id);
    assert.ok(graph.nodes.some((node) => node.kind === "referenceVideo"));
    assert.ok(
      graph.nodes.some((node) => node.kind === "previs" && node.timeline),
    );
    const shot = graph.nodes.find((node) => node.kind === "shot");
    assert.match(shot?.guidance?.text ?? "", /35mm 로우 앵글/);
    materialTitles.add(
      graph.nodes.find((node) => node.id === "profile-material")!.title,
    );
  }
  assert.equal(materialTitles.size, productionProfiles.length);
});

test("유형별 기본값과 실용 노드, 세로 프리비즈가 구별된다", () => {
  const influencer = makeStyleDraft("influencer");
  const motion = makeStyleDraft("motion-graphics");
  const drama = makeStyleDraft("short-drama");
  assert.notEqual(influencer.style.structure, motion.style.structure);
  assert.notDeepEqual(influencer.techniques, motion.techniques);
  for (const profile of productionProfiles)
    assert.ok(
      Object.values(makeStyleDraft(profile.id).style).every((value) =>
        value.trim(),
      ),
      profile.id,
    );
  const influencerGraph = makeStyleGraph(influencer, 1);
  const motionGraph = makeStyleGraph(motion, 1);
  const dramaGraph = makeStyleGraph(drama, 1);
  assert.ok(
    influencerGraph.nodes.some((node) => node.title === "인플루언서 데모 대본"),
  );
  assert.ok(
    motionGraph.nodes.some((node) => node.title === "자막·레이어·타이밍"),
  );
  assert.ok(
    dramaGraph.nodes.some((node) => node.title === "감정 비트와 회차 훅"),
  );
  assert.ok(
    dramaGraph.nodes
      .filter((node) => node.timeline)
      .every((node) => node.timeline?.aspect === "9:16"),
  );
});

test("선택한 기법과 필드는 관련 노드에만 전달한다", () => {
  const preset = makeStyleDraft("film");
  preset.techniques = ["camera-path"];
  preset.style.camera = "왼쪽으로 천천히 이동";
  const graph = makeStyleGraph(preset, 1);
  const shot = graph.nodes.find((node) => node.kind === "shot")!;
  const audio = graph.nodes.find((node) => node.kind === "audioCue")!;
  assert.match(shot.guidance?.text ?? "", /왼쪽으로 천천히 이동/);
  assert.match(shot.guidance?.text ?? "", /이동 방향·속도·유지 구도·종료 위치/);
  assert.doesNotMatch(
    audio.guidance?.text ?? "",
    /이동 방향·속도·유지 구도·종료 위치/,
  );
  assert.doesNotMatch(shot.guidance?.text ?? "", /주요 카메라 동작을 단순하게/);
});

test("스타일과 기법을 감독 입력에 고정하고 잘못된 프리셋은 거절한다", () => {
  const preset = makeStyleDraft("animated-short");
  preset.style.pacing = "느린 호흡 뒤 빠른 전환";
  preset.techniques = ["previs"];
  const director = parseDirectorOptions({
    format: "short",
    sceneCount: 2,
    stylePreset: preset,
  });
  assert.deepEqual(director?.stylePreset, preset);
  const input: RunInput = {
    projectId: "p",
    requestId: "r",
    nodeId: null,
    operation: "plan",
    provider: "codex",
    prompt: "이야기",
    references: [],
    director: director!,
  };
  assert.match(directorPrompt(input), /느린 호흡 뒤 빠른 전환/);
  assert.match(directorPrompt(input), /프리비즈로 검토/);
  assert.equal(
    parseDirectorOptions({
      format: "short",
      sceneCount: 2,
      stylePreset: { ...preset, techniques: ["unknown"] },
    }),
    null,
  );
  assert.equal(
    parseStyleDraft({
      ...preset,
      style: { ...preset.style, camera: "x".repeat(251) },
    }),
    null,
  );
  assert.equal(parseStyleDraft({ ...preset, profileId: "unknown" }), null);
});

test("구간 끝점과 길이를 검증하고 이전 프리셋을 받아들인다", () => {
  const preset = makeStyleDraft("shortform");
  assert.ok(parseStyleDraft(preset));
  assert.ok(parseStyleDraft({ ...preset, beats: [] }));
  const beats = [
    { endPercent: 12.5, label: "훅", framing: "클로즈업", caption: "질문" },
    { endPercent: 100, label: "전개", framing: "미디엄", caption: "요점" },
  ];
  assert.deepEqual(parseStyleDraft({ ...preset, beats })?.beats, beats);
  assert.equal(parseStyleDraft({ ...preset, beats: [beats[0]] }), null);
  assert.equal(
    parseStyleDraft({
      ...preset,
      beats: [{ ...beats[0], endPercent: 0 }, beats[1]],
    }),
    null,
  );
  assert.equal(
    parseStyleDraft({
      ...preset,
      beats: [{ ...beats[0], endPercent: 100 }, beats[1]],
    }),
    null,
  );
  assert.equal(
    parseStyleDraft({
      ...preset,
      beats: [{ ...beats[0], label: "x".repeat(81) }, beats[1]],
    }),
    null,
  );
  assert.equal(
    parseStyleDraft({
      ...preset,
      beats: [{ ...beats[0], label: "  " }, beats[1]],
    }),
    null,
  );
  assert.equal(
    parseStyleDraft({
      ...preset,
      beats: [{ ...beats[0], framing: "x".repeat(161) }, beats[1]],
    }),
    null,
  );
  assert.equal(
    parseStyleDraft({
      ...preset,
      beats: [{ ...beats[0], caption: "x".repeat(161) }, beats[1]],
    }),
    null,
  );
  assert.equal(
    parseStyleDraft({
      ...preset,
      beats: Array.from({ length: 25 }, (_, i) => ({
        ...beats[0],
        endPercent: i === 24 ? 100 : i + 1,
      })),
    }),
    null,
  );
});

test("프리셋의 명확한 화면비와 감독 납품비율을 순서대로 사용한다", () => {
  const preset = makeStyleDraft("shortform");
  preset.style.layout = "중앙 피사체, 16:9 화면";
  const manual = makeStyleGraph(preset, 1);
  assert.equal(
    manual.nodes.find((node) => node.timeline)?.timeline?.aspect,
    "16:9",
  );
  preset.style.layout = "9:16과 16:9를 비교";
  assert.equal(
    makeStyleGraph(preset, 1).nodes.find((node) => node.timeline)?.timeline
      ?.aspect,
    "9:16",
  );
  const explicit = applyStyleToGraph(manual, preset, { deliveryAspect: "1:1" });
  assert.ok(
    explicit.nodes
      .filter((node) => node.timeline)
      .every((node) => node.timeline?.aspect === "1:1"),
  );
});

test("합본 타임라인에서 비트 길이가 바뀌면 음향 큐도 원래 컷에 맞춰 이동한다", () => {
  const preset = makeStyleDraft("film");
  preset.beats = [
    { endPercent: 25, label: "첫 컷", framing: "", caption: "" },
    { endPercent: 100, label: "다음 컷", framing: "", caption: "" },
  ];
  const graph = {
    nodes: [
      {
        id: "shot-a",
        kind: "shot" as const,
        title: "첫 컷",
        body: "",
        x: 0,
        y: 0,
      },
      {
        id: "shot-b",
        kind: "shot" as const,
        title: "둘째 컷",
        body: "",
        x: 0,
        y: 300,
      },
      {
        id: "sound",
        kind: "audioCue" as const,
        title: "음향",
        body: "",
        x: 0,
        y: 600,
      },
      {
        id: "edit",
        kind: "previs" as const,
        title: "합본",
        body: "",
        x: 300,
        y: 0,
        timeline: {
          aspect: "16:9" as const,
          clips: ["shot-a", "shot-b"].map((nodeId) => ({
            nodeId,
            inFrame: 0,
            durationFrames: 100,
            transition: "cut" as const,
            transitionFrames: 0,
          })),
          audio: [
            {
              nodeId: "sound",
              startFrame: 100,
              inFrame: 0,
              durationFrames: 40,
              gain: 1,
              fadeInFrames: 0,
              fadeOutFrames: 0,
            },
            {
              nodeId: "sound",
              startFrame: 120,
              inFrame: 0,
              durationFrames: 20,
              gain: 1,
              fadeInFrames: 0,
              fadeOutFrames: 0,
            },
          ],
        },
      },
    ],
    edges: [],
  };
  const timeline = applyStyleToGraph(graph, preset).nodes.find(
    (node) => node.id === "edit",
  )!.timeline!;
  assert.deepEqual(
    timeline.clips.map((clip) => clip.durationFrames),
    [50, 150],
  );
  assert.deepEqual(
    timeline.audio.map((cue) => cue.startFrame),
    [50, 80],
  );
  assert.equal(timeline.audio[1].durationFrames, 30);
  assert.equal(graph.nodes[3].timeline!.audio[0].startFrame, 100);
});

test("프리비즈 비트 비율을 유지하고 장면·샷에 구간을 연결한다", () => {
  const preset = makeStyleDraft("shortform");
  preset.beats = [
    { endPercent: 25, label: "훅", framing: "얼굴 근접", caption: "질문" },
    { endPercent: 100, label: "반전", framing: "와이드", caption: "결말" },
  ];
  const graph = makeStyleGraph(preset, 2);
  assert.ok(validateGraph(graph));
  const sheet = graph.nodes.find((node) => node.title === "구간별 연출 비트")!;
  assert.match(sheet.body, /0~25% 훅/);
  assert.match(sheet.body, /총 길이를 유지/);
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.source === sheet.id &&
        graph.nodes.find((node) => node.id === edge.target)?.kind === "shot",
    ),
  );
  const timelines = graph.nodes
    .filter((node) => node.timeline)
    .map((node) => node.timeline!);
  assert.deepEqual(
    timelines.map((timeline) => timeline.clips[0].durationFrames),
    [45, 135],
  );
  assert.equal(timelines[0].audio[0].durationFrames, 45);
  assert.match(
    graph.nodes.find((node) => node.id === "scene-1")?.guidance?.text ?? "",
    /훅/,
  );
  assert.match(
    graph.nodes.find((node) => node.id === "shot-2")?.guidance?.text ?? "",
    /반전/,
  );
});
