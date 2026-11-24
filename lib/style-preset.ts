import { effectiveGuidance } from "./node-guidance";
import { makeProductionTemplate } from "./production-template";
import type { SceneCount } from "./types";
import { validateGraph } from "./graph";
import { validateTimeline } from "./timeline-spec";
import {
  makeStyleDraft,
  parseStyleDraft,
  productionProfiles,
  styleBrief,
  styleFields,
  techniqueChoices,
  type StylePresetDraft,
} from "./style-preset-core";
import type { CanvasNode, Graph, Kind } from "./types";

export {
  makeStyleDraft,
  parseStyleDraft,
  productionProfiles,
  styleBrief,
  styleFields,
  techniqueChoices,
};
export type { StylePresetDraft };

const profileMaterials: Record<string, { title: string; body: string }> = {
  influencer: {
    title: "인플루언서 바이블",
    body: "얼굴·의상·목소리와 말투, 등장 배경, 시청자와의 관계를 정리하고 반복할 기준을 고정하세요.",
  },
  contest: {
    title: "공모 요강과 심사 전략",
    body: "공식 요강의 출처, 심사 기준, 형식과 기한을 기록하고 확인되지 않은 항목을 표시하세요. 공모전 도구에서 원문을 연결할 수 있습니다.",
  },
  shortform: {
    title: "숏폼 훅과 화면 구성",
    body: "첫 장면의 질문이나 행동, 전달 순서, 세로 화면의 안전 영역과 마무리를 설계하세요.",
  },
  "short-drama": {
    title: "숏드라마 회차 설계",
    body: "회차별 갈등, 인물의 선택, 감정 전환과 다음 편의 궁금증을 정리하세요.",
  },
  drama: {
    title: "관계와 감정선",
    body: "인물 간 관계 변화, 장면별 감정 전후와 반응을 기록하세요.",
  },
  film: {
    title: "영화 시각·음향 설계",
    body: "3막의 전환, 시각 모티프, 공간 축과 사운드의 극적 역할을 정리하세요.",
  },
  ad: {
    title: "상품과 전달 근거",
    body: "상품 특징의 출처, 고객의 상황, 시연할 행동과 전달할 메시지를 기록하세요.",
  },
  "music-video": {
    title: "음악 구조와 비트 맵",
    body: "음원의 구간, BPM, 반복되는 동작과 컷 전환점을 기록하세요.",
  },
  "motion-graphics": {
    title: "모션 디자인 보드",
    body: "텍스트 계층, 도형과 화면 배치, 구간별 움직임과 전환 타이밍을 설계하세요.",
  },
  "animated-short": {
    title: "애니메이션 스타일 시트",
    body: "캐릭터의 형태와 표정, 주요 포즈, 배경과 동작의 타이밍을 정리하세요.",
  },
};

const profileExtra: Record<
  string,
  { kind: Kind; title: string; body: string; target: Kind }
> = {
  influencer: {
    kind: "script",
    title: "인플루언서 데모 대본",
    body: "반복할 인사, 화법, 시청자 질문과 데모 장면을 작성하세요.",
    target: "scene",
  },
  contest: {
    kind: "note",
    title: "심사 기준과 근거표",
    body: "공식 심사 기준, 각 기준에 대응하는 장면과 요강 출처를 기록하세요.",
    target: "scenario",
  },
  shortform: {
    kind: "script",
    title: "훅과 자막 대본",
    body: "첫 화면 문구와 핵심 대사, 컷별 자막을 시간 순서로 작성하세요.",
    target: "scene",
  },
  "short-drama": {
    kind: "note",
    title: "감정 비트와 회차 훅",
    body: "상대의 반응과 선택, 감정 전환 및 회차 말미의 궁금증을 기록하세요.",
    target: "shot",
  },
  drama: {
    kind: "note",
    title: "감정 비트와 연속성",
    body: "장면 전후 감정, 의상·소품 상태, 시선 축과 이전 장면과의 연결을 기록하세요.",
    target: "shot",
  },
  film: {
    kind: "note",
    title: "시각 모티프와 축",
    body: "세 막에서 반복할 이미지, 공간 축, 전환에 쓰는 시선과 소리를 기록하세요.",
    target: "shot",
  },
  ad: {
    kind: "referenceImage",
    title: "상품 상태 참조",
    body: "상품 사진과 로고를 첨부하고 형태·색상·문구의 고정 요소를 기록하세요.",
    target: "shot",
  },
  "music-video": {
    kind: "note",
    title: "구간별 컷과 비트 맵",
    body: "곡 구간과 초 단위 시작점, 반복 동작과 컷 전환을 기록하세요.",
    target: "previs",
  },
  "motion-graphics": {
    kind: "script",
    title: "자막·레이어·타이밍",
    body: "문구, 레이어 순서, 등장과 퇴장 시각, 전환과 효과음을 구간별로 작성하세요.",
    target: "previs",
  },
  "animated-short": {
    kind: "referenceImage",
    title: "캐릭터 포즈 시트",
    body: "캐릭터의 표정과 포즈, 전신과 얼굴, 고정 색상 참조를 준비하세요.",
    target: "shot",
  },
};

const fieldsByKind: Record<Kind, (keyof typeof styleFields)[]> = {
  brief: ["structure", "layout"],
  scenario: ["structure", "pacing"],
  script: ["structure", "performance", "captions", "sound"],
  character: ["performance", "film"],
  scene: ["structure", "performance", "layout"],
  shot: [
    "pacing",
    "composition",
    "camera",
    "performance",
    "film",
    "layout",
    "sound",
  ],
  keyframe: ["composition", "camera", "performance", "film", "layout"],
  referenceImage: ["composition", "film", "layout"],
  referenceVideo: ["pacing", "composition", "camera", "performance"],
  video: [
    "pacing",
    "composition",
    "camera",
    "performance",
    "film",
    "layout",
    "sound",
  ],
  audioCue: ["pacing", "sound"],
  previs: ["structure", "pacing", "captions", "layout", "sound"],
  note: ["structure", "layout"],
  switch: ["pacing", "composition", "camera", "performance"],
};

const techniqueKinds: Record<string, Kind[]> = {
  emotion: ["character", "scene", "script", "shot", "video"],
  previs: ["shot", "previs"],
  composition: ["shot", "keyframe", "video", "previs"],
  camera: ["shot", "keyframe", "video"],
  film: ["shot", "keyframe", "referenceImage", "video"],
  continuity: [
    "character",
    "scene",
    "shot",
    "keyframe",
    "referenceImage",
    "video",
  ],
  economy: ["shot", "keyframe", "video", "previs"],
  "character-sheet": ["character", "referenceImage", "keyframe"],
  "neutral-reference": ["character", "referenceImage", "keyframe"],
  "frame-selection": ["referenceVideo", "keyframe", "video"],
  "camera-path": ["shot", "video", "previs"],
  "single-motion": ["shot", "video", "previs"],
  "story-camera": ["scene", "shot", "video"],
  reframe: ["shot", "video", "previs"],
  blockout: ["shot", "referenceVideo", "previs"],
  "camera-texture": ["shot", "video"],
  dialogue: ["scene", "script", "shot", "audioCue"],
  "draft-review": ["shot", "keyframe", "video", "previs"],
};

function nodeStyle(draft: StylePresetDraft, kind: Kind): string {
  const fields = fieldsByKind[kind].flatMap((key) => {
    const value = draft.style[key].trim();
    return value ? [`${styleFields[key]}: ${value}`] : [];
  });
  const techniques = techniqueChoices
    .filter(
      (item) =>
        draft.techniques.includes(item.id) &&
        techniqueKinds[item.id]?.includes(kind),
    )
    .map((item) => `기법: ${item.instruction}`);
  return [`콘셉트: ${draft.concept}`, ...fields, ...techniques].join("\n");
}

/** 적용 시점의 선택을 각 노드 지침에 보존한다. 원본 그래프는 수정하지 않는다. */
export function applyStyleToGraph(
  graph: Graph,
  draft: StylePresetDraft,
  options?: { deliveryAspect?: "16:9" | "9:16" | "1:1" },
): Graph {
  const parsed = parseStyleDraft(draft);
  if (!parsed || !validateGraph(graph))
    throw new Error("스타일과 제작 보드를 확인해 주세요.");
  const selectedAspects = [
    ...new Set(
      parsed.style.layout.match(/(?<!\d)(?:16:9|9:16|1:1)(?!\d)/g) ?? [],
    ),
  ];
  const selectedAspect =
    selectedAspects.length === 1
      ? (selectedAspects[0] as "16:9" | "9:16" | "1:1")
      : undefined;
  const aspect =
    options?.deliveryAspect ??
    selectedAspect ??
    ([
      "influencer",
      "contest",
      "shortform",
      "short-drama",
      "motion-graphics",
      "animated-short",
    ].includes(parsed.profileId)
      ? "9:16"
      : undefined);
  const nodes: CanvasNode[] = graph.nodes.map((node) => {
    const guidance = effectiveGuidance(node);
    return {
      ...node,
      ...(node.timeline && aspect
        ? { timeline: { ...node.timeline, aspect } }
        : {}),
      guidance: {
        recipeId: guidance.recipe.id,
        ...(node.guidance?.skillIds ? { skillIds: [...node.guidance.skillIds] } : {}),
        text: `${guidance.text}\n\n제작 스타일\n${nodeStyle(parsed, node.kind)}`.slice(
          0,
          4000,
        ),
      },
    };
  });
  const beats = parsed.beats ?? [];
  let timingApplied = false;
  if (beats.length) {
    const timelines = nodes.filter((node) => node.timeline?.clips.length);
    const combined =
      timelines.length === 1 &&
      timelines[0].timeline!.clips.length === beats.length;
    const separate =
      timelines.length === beats.length &&
      timelines.every((node) => node.timeline!.clips.length === 1);
    if (
      (combined || separate) &&
      timelines.every((node) =>
        node.timeline!.clips.every((clip) => clip.transition === "cut"),
      )
    ) {
      const total = timelines.reduce(
        (sum, node) =>
          sum +
          node.timeline!.clips.reduce(
            (frames, clip) => frames + clip.durationFrames,
            0,
          ),
        0,
      );
      let previous = 0;
      const durations = beats.map((beat) => {
        const end = Math.round((total * beat.endPercent) / 100);
        const duration = end - previous;
        previous = end;
        return duration;
      });
      if (durations.every((duration) => duration > 0)) {
        const candidates = timelines.map((node, index) => {
          const timeline = node.timeline!;
          const clips = timeline.clips.map((clip, clipIndex) => ({
            ...clip,
            durationFrames: durations[combined ? clipIndex : index],
          }));
          const frames = clips.reduce(
            (sum, clip) => sum + clip.durationFrames,
            0,
          );
          function mapFrame(frame: number): number {
            let oldStart = 0;
            let newStart = 0;
            for (let i = 0; i < timeline.clips.length; i++) {
              const oldDuration = timeline.clips[i].durationFrames;
              const newDuration = clips[i].durationFrames;
              if (frame < oldStart + oldDuration)
                return (
                  newStart +
                  Math.round(((frame - oldStart) * newDuration) / oldDuration)
                );
              oldStart += oldDuration;
              newStart += newDuration;
            }
            return newStart;
          }
          const audio = timeline.audio.map((cue) => {
            const startFrame = Math.min(mapFrame(cue.startFrame), frames - 1);
            const endFrame = Math.min(
              mapFrame(cue.startFrame + cue.durationFrames),
              frames,
            );
            const durationFrames = Math.max(1, endFrame - startFrame);
            return {
              ...cue,
              startFrame,
              durationFrames,
              fadeInFrames: Math.min(cue.fadeInFrames, durationFrames),
              fadeOutFrames: Math.min(cue.fadeOutFrames, durationFrames),
            };
          });
          return { ...timeline, clips, audio };
        });
        if (candidates.every(validateTimeline)) {
          timelines.forEach((node, index) => {
            node.timeline = candidates[index];
          });
          timingApplied = true;
        }
      }
    }
    for (const kind of ["scene", "shot", "previs"] as const) {
      const targets = nodes.filter((node) => node.kind === kind);
      for (const [index, node] of targets.entries()) {
        const assigned = beats.filter(
          (_, beatIndex) =>
            Math.floor((beatIndex * targets.length) / beats.length) === index,
        );
        if (!assigned.length || !node.guidance) continue;
        const slots = assigned
          .map(
            (beat) =>
              `${beat.label} (끝 ${beat.endPercent}%): 구도 ${beat.framing}, 자막 ${beat.caption}`,
          )
          .join("\n");
        node.guidance = {
          ...node.guidance,
          text: `${node.guidance.text}\n\n구간별 연출 슬롯\n${slots}`.slice(
            0,
            4000,
          ),
        };
      }
    }
  }
  const ids = new Set(nodes.map((node) => node.id));
  function unusedId(prefix: string) {
    let id = prefix;
    let suffix = 2;
    while (ids.has(id)) id = `${prefix}-${suffix++}`;
    ids.add(id);
    return id;
  }
  const styleId = unusedId("style-preset");
  const sourceId = unusedId("style-reference");
  const profileId = unusedId("profile-material");
  const extraId = unusedId("profile-extra");
  const beatsId = beats.length ? unusedId("style-beats") : undefined;
  const baseX = Math.min(0, ...nodes.map((node) => node.x)) - 360;
  const material = profileMaterials[parsed.profileId];
  const extra = profileExtra[parsed.profileId];
  nodes.push(
    {
      id: sourceId,
      kind: "referenceVideo",
      title: "레퍼런스 영상",
      body: "참고할 영상을 첨부하고 구도, 리듬, 화면 구성과 관찰 구간을 기록하세요.",
      x: baseX,
      y: 0,
    },
    {
      id: styleId,
      kind: "note",
      title: parsed.name,
      body: styleBrief(parsed),
      x: baseX,
      y: 340,
    },
    {
      id: profileId,
      kind: "note",
      title: material.title,
      body: material.body,
      x: baseX,
      y: 680,
    },
    {
      id: extraId,
      kind: extra.kind,
      title: extra.title,
      body: extra.body,
      x: baseX,
      y: 1020,
    },
  );
  if (beatsId) {
    const beatLines =
      styleBrief({ ...parsed, evidence: "" }).split("구간별 연출 슬롯:\n")[1] ??
      "";
    nodes.push({
      id: beatsId,
      kind: "note",
      title: "구간별 연출 비트",
      body: `${beatLines}\n\n${timingApplied ? "기존 프리비즈 총 길이를 유지하며 각 구간 비율을 컷 길이에 적용했습니다. 음향 큐의 시작과 끝은 해당 컷의 새로운 위치에 맞춰 조정했습니다." : "구간과 프리비즈 컷 수가 다르거나 전환이 있어 타이밍은 수동으로 맞춰 주세요."}`,
      x: baseX,
      y: 1360,
    });
  }
  const firstBrief = nodes.find(
    (node) => node.kind === "brief" && node.id !== sourceId,
  );
  const edges = [
    ...graph.edges,
    {
      source: sourceId,
      target: styleId,
      role: "context" as const,
      usage: "guide" as const,
    },
  ];
  if (firstBrief)
    edges.push(
      {
        source: styleId,
        target: firstBrief.id,
        role: "context",
        usage: "input",
      },
      {
        source: profileId,
        target: firstBrief.id,
        role: "context",
        usage: "input",
      },
    );
  const target = nodes.find(
    (node) => node.id !== extraId && node.kind === extra.target,
  );
  if (target)
    edges.push({
      source: extraId,
      target: target.id,
      role: "context",
      usage: "input",
    });
  if (beatsId)
    for (const node of nodes)
      if (["scene", "shot", "previs"].includes(node.kind))
        edges.push({
          source: beatsId,
          target: node.id,
          role: "context",
          usage: "input",
        });
  const result = { nodes, edges };
  if (!validateGraph(result))
    throw new Error("스타일을 적용할 노드 수와 연결을 확인해 주세요.");
  return result;
}

export function makeStyleGraph(draft: StylePresetDraft, count: SceneCount): Graph {
  const parsed = parseStyleDraft(draft);
  if (!parsed) throw new Error("스타일 프리셋을 확인해 주세요.");
  const profile = productionProfiles.find(
    (item) => item.id === parsed.profileId,
  )!;
  return applyStyleToGraph(
    makeProductionTemplate(profile.format, count),
    parsed,
  );
}
