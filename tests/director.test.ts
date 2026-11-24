import assert from "node:assert/strict";
import { test } from "node:test";
import { directorPrompt, parseDirectorPlan } from "../lib/director";
import { reviewPrompt } from "../lib/director-review";
import { validateGraph } from "../lib/graph";
import { sampleProject } from "../lib/sample";
import { makeStyleDraft } from "../lib/style-preset";
import { snapshotReferences } from "../lib/run-input";
import type { DirectorOptions, RunInput } from "../lib/types";

const options: DirectorOptions = { format: "short", sceneCount: 2 };
const shot = {
  cast: [{ character: 1, state: "기본" }],
  method: "keyframe",
  title: "빈 극장",
  layoutGuide: "영사기사와 객석을 표시한 평면도",
  durationSeconds: 5,
  cutConnection: "시선은 스크린 방향으로 이어진다",
  start: "불 꺼진 객석",
  action: "영사기가 켜진다",
  end: "빛이 스크린에 닿는다",
  camera: "35mm 고정",
  blocking: "오른쪽 영사기, 왼쪽 스크린",
  performance: "손을 멈춘다",
  sound: "영사기 소리",
  acceptance: "빛과 반응이 이어진다",
};
const sample = {
  title: "마지막 상영",
  logline: "영사기사가 마지막 필름을 튼다",
  idea: "떠나는 관객과의 약속",
  theme: "기억",
  causality: "폐관 때문에 마지막 영화를 준비한다",
  conflict: "필름이 끊어진다",
  turningPoint: "관객이 조각을 찾아준다",
  ending: "마지막 상영을 완성한다",
  motif: "빛",
  look: "따뜻한 실내광",
  constants: "주인공의 낡은 코트",
  characters: [
    {
      name: "민",
      appearance: "회색 머리와 낡은 코트",
      goal: "상영을 마친다",
      obstacle: "끊어진 필름",
      action: "관객에게 도움을 청한다",
      states: [
        { name: "기본", appearance: "마른 코트" },
        { name: "젖음", appearance: "비에 젖은 코트" },
      ],
    },
    {
      name: "서",
      appearance: "검은 머리와 청색 재킷",
      goal: "극장을 기억한다",
      obstacle: "폐관",
      action: "필름 조각을 찾는다",
      states: [{ name: "기본", appearance: "청색 재킷" }],
    },
  ],
  scenes: [
    {
      title: "영사실",
      structure: "도입",
      location: "창가에 영사기",
      purpose: "폐관을 알린다",
      turn: "필름이 끊어진다",
      cast: [{ character: 1, state: "기본" }],
      dialogue: [
        { speaker: "지문", line: "", direction: "민이 영사기를 바라본다" },
      ],
      shots: [shot],
    },
    {
      title: "객석",
      structure: "결말",
      location: "스크린 앞 객석",
      purpose: "도움을 구한다",
      turn: "필름을 되찾는다",
      cast: [
        { character: 1, state: "젖음" },
        { character: 2, state: "기본" },
      ],
      dialogue: [
        { speaker: "서", line: "제가 찾았어요", direction: "필름을 건넨다" },
      ],
      shots: [
        {
          ...shot,
          cast: [
            { character: 1, state: "젖음" },
            { character: 2, state: "기본" },
          ],
        },
      ],
    },
  ],
};

test("감독안의 영문과 한국어 프롬프트를 미디어 노드에 함께 보관한다", () => {
  const pairedShot = {
    ...shot,
    keyframePrompt: { english: "A quiet theatre.", korean: "조용한 극장." },
    videoPrompt: { english: "A projector starts.", korean: "영사기가 켜진다." },
  };
  const plan = { ...sample, scenes: [{ ...sample.scenes[0], shots: [pairedShot] }, sample.scenes[1]] };
  const graph = parseDirectorPlan(JSON.stringify(plan), options);
  const frame = graph.nodes.find((node) => node.id === "frame-1-1");
  const video = graph.nodes.find((node) => node.id === "video-1-1");
  assert.equal(frame?.body, pairedShot.keyframePrompt.english);
  assert.deepEqual(frame?.promptKorean, { text: pairedShot.keyframePrompt.korean });
  assert.equal(video?.body, pairedShot.videoPrompt.english);
  assert.deepEqual(video?.promptKorean, { text: pairedShot.videoPrompt.korean });
  assert.equal(validateGraph(graph), true);
});

test("감독안의 내레이션·속마음만 음향 큐와 샷 기준 타임라인으로 이어진다", () => {
  const scene = sample.scenes[1];
  const plan = {
    ...sample,
    audioCues: [{ title: "극장 소리", purpose: "ambience", description: "객석의 잔향", scene: 1, seconds: 1 }],
    scenes: [sample.scenes[0], {
      ...scene,
      shots: [{ ...scene.shots[0], durationSeconds: 2 }, { ...scene.shots[0], durationSeconds: 4 }],
      dialogue: [
        ...scene.dialogue,
        { speaker: "관제사", line: "끝난 뒤 전화 주세요.", direction: "무전기에서 들린다.", delivery: "os" },
        { speaker: "나레이터", line: "그날이 마지막이었다.", direction: "한 번 숨을 고른다.", delivery: "narration", placement: { shot: 2, offsetSeconds: 0.5, durationSeconds: 1.5 } },
        { speaker: "서", line: "아직 떠나고 싶지 않아.", direction: "입은 다문다.", delivery: "innerMonologue", placement: { shot: 1, offsetSeconds: 1.5, durationSeconds: 1 } },
      ],
    }],
  };
  const graph = parseDirectorPlan(JSON.stringify(plan), options);
  assert.ok(validateGraph(graph));
  const script = graph.nodes.find(({ id }) => id === "script-2")?.body ?? "";
  assert.match(script, /\[서\] 제가 찾았어요/);
  assert.match(script, /\[OS\] 관제사：끝난 뒤 전화 주세요\./);
  assert.match(script, /\[VO\] 나레이터（내레이션）：그날이 마지막이었다\./);
  assert.match(script, /\[VO\] 서（속마음）：아직 떠나고 싶지 않아\./);
  const cues = graph.nodes.filter(({ kind }) => kind === "audioCue");
  assert.deepEqual(cues.map(({ id }) => id), ["sound-1", "voiceover-2-3", "voiceover-2-4"]);
  assert.match(cues[1].body, /그날이 마지막이었다/);
  assert.equal(cues[1].asset, undefined);
  const timeline = graph.nodes.find(({ id }) => id === "edit-timeline")!.timeline!;
  assert.deepEqual(timeline.audio.map(({ nodeId, startFrame, durationFrames }) => [nodeId, startFrame, durationFrames]), [
    ["sound-1", 0, 30], ["voiceover-2-3", 225, 45], ["voiceover-2-4", 195, 30],
  ]);
  assert.ok(graph.edges.some(({ source, target, usage }) => source === "script-2" && target === "voiceover-2-3" && usage === "guide"));
  assert.ok(graph.edges.some(({ source, target, role }) => source === "character-2" && target === "voiceover-2-4" && role === "identity"));
  assert.ok(!graph.edges.some(({ target, role }) => target === "voiceover-2-3" && role === "identity"));
  assert.ok(graph.edges.some(({ source, target }) => source === "voiceover-2-3" && target === "edit-timeline"));
});

test("존재하지 않는 샷과 편집 범위를 벗어난 VO를 거절한다", () => {
  const scene = sample.scenes[1];
  for (const placement of [
    { shot: 2, offsetSeconds: 0, durationSeconds: 1 },
    { shot: 1, offsetSeconds: 5, durationSeconds: 1 },
    { shot: 1, offsetSeconds: 4, durationSeconds: 2 },
  ]) {
    const dialogue = [{ speaker: "나레이터", line: "늦었다.", direction: "짧게", delivery: "narration", placement }];
    assert.throws(() => parseDirectorPlan(JSON.stringify({ ...sample, scenes: [sample.scenes[0], { ...scene, dialogue }] }), options), /\[VO\]의 시작 샷·위치·길이/);
  }
  const dialogue = [{ speaker: "나레이터", line: "늦었다.", direction: "짧게", delivery: "narration" }];
  assert.throws(() => parseDirectorPlan(JSON.stringify({ ...sample, scenes: [sample.scenes[0], { ...scene, dialogue }] }), options), /감독안의 scenes\.1\.dialogue\.0/);
});

test("편집 한도를 넘는 장편에서 VO 타임라인을 조용히 빠뜨리지 않는다", () => {
  const longScene = { ...sample.scenes[0], shots: [{ ...shot, durationSeconds: 420 }] };
  const scenes = [longScene, sample.scenes[1]];
  const legacy = parseDirectorPlan(JSON.stringify({ ...sample, scenes }), options);
  assert.ok(legacy.nodes.some(({ id }) => id === "edit-sequences"));
  const dialogue = [{ speaker: "민", line: "시작은 조용했다.", direction: "회상", delivery: "narration", placement: { shot: 1, offsetSeconds: 1, durationSeconds: 1 } }];
  assert.throws(() => parseDirectorPlan(JSON.stringify({ ...sample, scenes: [{ ...longScene, dialogue }, scenes[1]] }), options), /\[VO\]가 있는 감독안은 타임라인/);
});

test("감독과 검토 지침이 필요한 VO와 OS를 구분한다", () => {
  const input: RunInput = {
    projectId: "p",
    requestId: "r",
    nodeId: null,
    provider: "codex",
    operation: "plan",
    director: options,
    prompt: "VO 없이 만들기",
    references: [],
  };
  const prompt = directorPrompt(input);
  assert.match(prompt, /화면과 대사만으로 전달하기 어려운 정보/);
  assert.match(prompt, /"delivery":"narration","placement"/);
  assert.match(prompt, /\[VO\]·\[OS\] 표시는 앱이 붙입니다/);
  assert.match(reviewPrompt(input), /\[VO\].*\[OS\].*발화 여백/);
});

test("감독 결과에도 선택한 프리셋과 유형별 제작 노드를 보존한다", () => {
  const stylePreset = makeStyleDraft("motion-graphics");
  stylePreset.style.layout = "타이포그래피 중심의 분할 화면";
  stylePreset.beats = [{ endPercent: 50, label: "첫 질문", framing: "근접", caption: "질문" }, { endPercent: 100, label: "답", framing: "와이드", caption: "결말" }];
  const graph = parseDirectorPlan(JSON.stringify(sample), { ...options, stylePreset });
  assert.ok(validateGraph(graph));
  assert.ok(graph.nodes.some((node) => node.title === "모션 디자인 보드"));
  assert.match(graph.nodes.find((node) => node.kind === "video")?.guidance?.text ?? "", /타이포그래피 중심의 분할 화면/);
  assert.ok(graph.nodes.some((node) => node.title === "구간별 연출 비트"));
  assert.match(graph.nodes.find((node) => node.kind === "shot")?.guidance?.text ?? "", /첫 질문/);
  const delivery = parseDirectorPlan(JSON.stringify({ ...sample, deliveryAspect: "16:9" }), { ...options, stylePreset });
  assert.ok(delivery.nodes.filter((node) => node.timeline).every((node) => node.timeline?.aspect === "16:9"));
});

test("감독이 선택한 지침을 관련 노드에 연결하고 스타일 적용 뒤에도 보존한다", () => {
  const stylePreset = makeStyleDraft("short-drama");
  const graph = parseDirectorPlan(JSON.stringify(sample), {
    ...options, stylePreset, skillIds: ["story-hook", "acting", "anamorphic"],
  });
  const shotNode = graph.nodes.find((node) => node.kind === "shot")!;
  const script = graph.nodes.find((node) => node.kind === "script")!;
  assert.deepEqual(shotNode.guidance?.skillIds, ["acting", "anamorphic"]);
  assert.deepEqual(script.guidance?.skillIds, ["story-hook", "acting"]);
  assert.ok(validateGraph(graph));
});

test("감독안을 검증하고 캐릭터·장소·샷·키프레임·영상 참조를 연결한다", () => {
  const graph = parseDirectorPlan(JSON.stringify(sample), options);
  assert.equal(validateGraph(graph), true);
  assert.equal(validateGraph(sampleProject.graph), true);
  assert.equal(graph.nodes.filter((node) => node.kind === "scene").length, 2);
  assert.equal(graph.nodes.filter((node) => node.kind === "script").length, 2);
  assert.equal(
    graph.nodes
      .find((node) => node.id === "shot-2-1")
      ?.body.includes("채택 기준"),
    true,
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.source === "character-ref-2-1" &&
        edge.target === "frame-2-1" &&
        edge.role === "identity" &&
        edge.usage === "input",
    ),
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.source === "location-2" &&
        edge.target === "frame-2-1" &&
        edge.role === "location",
    ),
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.source === "frame-2-1" &&
        edge.target === "video-2-1" &&
        edge.role === "start",
    ),
  );
  assert.ok(
    !graph.edges.some(
      (edge) =>
        edge.source === "character-ref-2-1" && edge.target === "frame-1-1",
    ),
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.source === "character-ref-1-2" && edge.target === "frame-2-1",
    ),
  );
  assert.ok(
    !graph.edges.some(
      (edge) =>
        edge.source === "character-ref-1-1" && edge.target === "frame-2-1",
    ),
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.source === "story" &&
        edge.target === "scene-1" &&
        edge.usage === "input",
    ),
  );
  const shotNode = graph.nodes.find((node) => node.id === "shot-2-1")!;
  assert.match(shotNode.body, /5초/);
  assert.match(shotNode.body, /시선은 스크린 방향으로 이어진다/);
  assert.ok(!shotNode.body.includes(sample.scenes[1].location));
  assert.ok(!shotNode.body.includes(sample.look));
  const guide = graph.nodes.find((node) => node.id === "layout-2-1")!;
  assert.equal(guide.kind, "referenceImage");
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.source === guide.id &&
        edge.target === "shot-2-1" &&
        edge.usage === "guide",
    ),
  );
  guide.asset = {
    url: "/sample/portrait.webp",
    type: "image",
    name: "private-guide.webp",
  };
  graph.nodes.find((node) => node.id === "scene-2")!.body =
    "수정된 장소와 씬 설정";
  graph.nodes.find((node) => node.id === "idea")!.body = "수정된 제작 룩";
  const references = snapshotReferences(graph, "video-2-1", "video");
  assert.ok(references.some((ref) => ref.nodeId === "story"));
  assert.ok(references.some((ref) => ref.nodeId === "script-2"));
  assert.ok(references.some((ref) => ref.nodeId === "character-ref-1-2"));
  assert.ok(references.some((ref) => ref.nodeId === "location-2"));
  assert.ok(
    !references.some(
      (ref) =>
        ref.nodeId === "script-1" ||
        ref.nodeId === "scene-1" ||
        ref.nodeId === "location-1",
    ),
  );
  assert.ok(!references.some((ref) => ref.nodeId === guide.id));
  assert.ok(!JSON.stringify(references).includes("private-guide.webp"));
  assert.ok(
    references.some(
      (ref) => ref.nodeId === "scene-2" && ref.body === "수정된 장소와 씬 설정",
    ),
  );
  assert.ok(
    references.some(
      (ref) => ref.nodeId === "idea" && ref.body === "수정된 제작 룩",
    ),
  );
});

test("범위 밖의 작품·누락·잘못된 출연 번호와 대사 화자는 거절한다", () => {
  assert.throws(() => parseDirectorPlan("{}", options), /누락/);
  assert.throws(
    () =>
      parseDirectorPlan(JSON.stringify(sample), { ...options, sceneCount: 3 }),
    /장면 수/,
  );
  assert.throws(
    () =>
      parseDirectorPlan(
        JSON.stringify({
          ...sample,
          scenes: [
            { ...sample.scenes[0], cast: [{ character: 4, state: "기본" }] },
            sample.scenes[1],
          ],
        }),
        options,
      ),
    /배역 번호/,
  );
  assert.throws(
    () =>
      parseDirectorPlan(
        JSON.stringify({
          ...sample,
          scenes: [
            { ...sample.scenes[0], cast: [{ character: 1, state: "없음" }] },
            sample.scenes[1],
          ],
        }),
        options,
      ),
    /상태/,
  );
  assert.throws(
    () =>
      parseDirectorPlan(
        JSON.stringify({
          ...sample,
          scenes: [
            {
              ...sample.scenes[0],
              dialogue: [{ speaker: "서", line: "대사", direction: "말한다" }],
            },
            sample.scenes[1],
          ],
        }),
        options,
      ),
    /화자/,
  );
  assert.throws(
    () =>
      parseDirectorPlan(
        JSON.stringify({
          ...sample,
          scenes: [{ ...sample.scenes[0], shots: [] }, sample.scenes[1]],
        }),
        options,
      ),
    /shots/,
  );
  assert.throws(
    () =>
      parseDirectorPlan(
        JSON.stringify({
          ...sample,
          scenes: [
            {
              ...sample.scenes[0],
              shots: [{ ...shot, cast: [{ character: 2, state: "기본" }] }],
            },
            sample.scenes[1],
          ],
        }),
        options,
      ),
    /샷 출연/,
  );
});

test("비어 있는 무언 인서트와 상태 참조 영상에는 불필요한 시작 프레임이 없다", () => {
  const {
    layoutGuide: _layoutGuide,
    durationSeconds: _durationSeconds,
    cutConnection: _cutConnection,
    ...simpleShot
  } = shot;
  void _layoutGuide;
  void _durationSeconds;
  void _cutConnection;
  const insert = {
    ...sample.scenes[0],
    cast: [],
    dialogue: [],
    shots: [{ ...simpleShot, cast: [], method: "references" }],
  };
  const graph = parseDirectorPlan(
    JSON.stringify({ ...sample, scenes: [insert, sample.scenes[1]] }),
    options,
  );
  assert.equal(
    graph.nodes.some((node) => node.id === "frame-1-1"),
    false,
  );
  assert.equal(
    graph.nodes.some((node) => node.id === "layout-1-1"),
    false,
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.source === "location-1" &&
        edge.target === "video-1-1" &&
        edge.role === "location",
    ),
  );
  assert.ok(
    !graph.edges.some(
      (edge) => edge.target === "video-1-1" && edge.role === "start",
    ),
  );
});

test("최대 6개 씬과 씬별 3샷도 그래프 제한 안에서 생성한다", () => {
  const characters = Array.from({ length: 4 }, (_, index) => ({
    ...sample.characters[0],
    name: `인물 ${index + 1}`,
    states: [
      { name: "기본", appearance: "기본 모습" },
      { name: "비", appearance: "젖은 모습" },
      { name: "전투", appearance: "전투 모습" },
    ],
  }));
  const scene = { ...sample.scenes[0], shots: [shot, shot, shot] };
  const graph = parseDirectorPlan(
    JSON.stringify({
      ...sample,
      characters,
      scenes: Array.from({ length: 6 }, () => scene),
    }),
    { format: "film", sceneCount: 6 },
  );
  assert.equal(graph.nodes.filter((node) => node.kind === "shot").length, 18);
  const stylePreset = makeStyleDraft("film");
  stylePreset.beats = [{ endPercent: 100, label: "결말", framing: "롱샷", caption: "" }];
  const styled = parseDirectorPlan(
    JSON.stringify({ ...sample, characters, scenes: Array.from({ length: 6 }, () => scene) }),
    { format: "film", sceneCount: 6, stylePreset },
  );
  assert.ok(validateGraph(styled));
  assert.equal(validateGraph(graph), true);
});

test("감독 프롬프트는 작품 설정과 참고 자료를 전달한다", () => {
  const input: RunInput = {
    projectId: "p",
    requestId: "r",
    nodeId: null,
    provider: "codex",
    operation: "plan",
    prompt: "작은 극장",
    references: [{ title: "메모", body: "비 오는 밤" }],
    director: options,
  };
  const prompt = directorPrompt(input);
  assert.match(prompt, /정확히 2개/);
  assert.match(prompt, /비 오는 밤/);
  assert.match(prompt, /layoutGuide/);
  assert.match(prompt, /durationSeconds/);
  assert.match(prompt, /cutConnection/);
  assert.match(
    directorPrompt({ ...input, director: { format: "film", sceneCount: 2 } }),
    /3막/,
  );
  assert.match(
    directorPrompt({ ...input, director: { format: "series", sceneCount: 2 } }),
    /회차/,
  );
});

test("자동 장면 수는 자료에 따라 결정하며 최대 12개를 검증한다", () => {
  const auto: DirectorOptions = { format: "film", sceneCount: "auto" };
  const scenes = Array.from({ length: 12 }, (_, index) => ({ ...sample.scenes[0], title: `장면 ${index + 1}`, shots: [{ ...shot, layoutGuide: undefined }] }));
  const graph = parseDirectorPlan(JSON.stringify({ ...sample, scenes }), auto);
  assert.equal(graph.nodes.filter((node) => node.kind === "scene").length, 12);
  assert.throws(() => parseDirectorPlan(JSON.stringify({ ...sample, scenes: [...scenes, scenes[0]] }), auto), /범위/);
  assert.throws(() => parseDirectorPlan(JSON.stringify(sample), { format: "film", sceneCount: 3 }), /장면 수/);
  const oversized = scenes.map((scene) => ({ ...scene, shots: [shot, shot, shot] }));
  assert.throws(() => parseDirectorPlan(JSON.stringify({ ...sample, scenes: oversized }), auto), /노드 120개/);
  const input: RunInput = { projectId: "p", requestId: "r", nodeId: null, provider: "codex", operation: "plan", prompt: "시나리오", references: [], director: auto };
  assert.match(directorPrompt(input), /시나리오의 씬 제목/);
});
