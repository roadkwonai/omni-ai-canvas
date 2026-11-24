import { aiAdGuideIds, buildAiAdGraph } from "./ai-ad-board";
import { productionDefaults } from "./production-start";
import { validateGraph } from "./graph";
import {
  productionGuides,
  type ProductionGuideId,
} from "./higgsfield-guidance-kit";
import type { CanvasNode, Graph, Kind, SceneCount } from "./types";
import type { DramaPremise } from "./drama-premises";

export const workflows = {
  cinema: {
    label: "시네마틱 단편",
    article: "make-a-cinematic-ai-short-film-with-higgsfield-the-workflow",
    stages: [
      "인물과 공간 소개",
      "인물의 선택과 반응",
      "다른 시점에서 드러나는 결말",
    ],
    guides: [
      "cinematic-engine",
      "casting-continuity",
      "acting",
      "shot-plan",
      "voice-performance",
    ] as ProductionGuideId[],
  },
  commercial: {
    label: "제품 광고",
    article: "make-a-realistic-ai-commercial-without-wasting-credits",
    stages: [
      "사용자의 상황과 상품 등장",
      "사용 동작과 상태 변화",
      "결과 확인과 제품 마무리",
    ],
    guides: [
      "commercial-check",
      "casting-continuity",
      "commercial-prompt",
      "commercial-acting",
    ] as ProductionGuideId[],
  },
  "fashion-ad": {
    label: "Higgsfield 패션 광고",
    article: "how-to-make-iman-gadzhi-s-fashion-ad",
    stages: ["제품·인물·공간 참조", "샷별 촬영 지시", "씬별 영상 테이크", "제품 렌즈 전환", "제품 보정과 편집"],
    guides: aiAdGuideIds,
  },
  drama: {
    label: "연속 숏드라마",
    article: "how-to-make-ai-short-drama",
    stages: [
      "훅에서 맥락으로",
      "관계에 생긴 질문",
      "희망이 생기는 순간",
      "새로운 장애와 기회",
      "이동하며 나누는 대화",
      "결정 직전의 클리프행어",
    ],
    guides: [
      "story-hook",
      "acting",
      "casting-continuity",
      "voice-performance",
      "seedance-shot",
    ] as ProductionGuideId[],
  },
} as const;
export type WorkflowFormat = keyof typeof workflows;
export type FashionAdSettings = {
  sceneCount: SceneCount;
  aspect: "16:9" | "9:16" | "1:1";
  transitions: boolean;
};

export function defaultFashionAdSettings(): FashionAdSettings {
  const { sceneCount, aspect } = productionDefaults("ad", "fashion-ad");
  return { sceneCount, aspect, transitions: true };
}

export type WorkflowSettings = {
  format: WorkflowFormat;
  idea: string;
  cast: string[];
  skills: ProductionGuideId[];
  premise?: DramaPremise;
  ad?: FashionAdSettings;
  sceneCast?: Record<number, { actor: number; variant: boolean }[]>;
  blockingInput?: boolean;
  elementInput?: boolean;
  voices: boolean;
  states: boolean;
  extras: boolean;
  roomTour: boolean;
  alternate: boolean;
};
export function defaultWorkflow(format: WorkflowFormat): WorkflowSettings {
  return {
    format,
    idea: "",
    cast: [],
    skills: [...workflows[format].guides],
    voices: format !== "commercial" && format !== "fashion-ad",
    states: true,
    extras: false,
    roomTour: format === "cinema" || format === "fashion-ad",
    ...(format === "fashion-ad" ? { ad: defaultFashionAdSettings() } : {}),
    alternate: format === "cinema",
  };
}
export function workflowBoard(settings: WorkflowSettings): Graph {
  const workflow = workflows[settings.format];
  const cast = [
    ...new Set(settings.cast.map((name) => name.trim()).filter(Boolean)),
  ];
  if (cast.length > 4 || cast.some((name) => name.length > 32))
    throw new Error("배역은 최대 4명, 이름은 각각 32자까지 입력해 주세요.");
  if (settings.format === "fashion-ad") {
    const ad = settings.ad ?? defaultFashionAdSettings();
    const sceneCast = settings.sceneCast && Object.fromEntries(
      Object.entries(settings.sceneCast).map(([scene, actors]) => [scene, actors.map(({ actor }) => actor)]),
    );
    return buildAiAdGraph({ ...ad, idea: settings.idea, cast, guides: settings.skills, blocking: settings.roomTour, sceneCast });
  }
  const graph: Graph = { nodes: [], edges: [] };
  function add(
    id: string,
    kind: Kind,
    title: string,
    body: string,
    x: number,
    y: number,
  ) {
    const skillIds = productionGuides
      .filter(
        (guide) =>
          settings.skills.includes(guide.id) && guide.kinds.includes(kind),
      )
      .map((guide) => guide.id);
    const node: CanvasNode = {
      id,
      kind,
      title,
      body,
      x,
      y,
      guidance: { skillIds },
    };
    graph.nodes.push(node);
  }
  function link(
    source: string,
    target: string,
    role: NonNullable<Graph["edges"][number]["role"]> = "context",
    usage: "input" | "guide" = "input",
  ) {
    graph.edges.push({ source, target, role, usage });
  }
  const source = `https://higgsfield.ai/ko/@adilinthewildtempo/blogs/${workflow.article}`;
  add(
    "brief",
    "brief",
    workflow.label + " 기획",
    settings.idea.trim() ||
      "관객, 장면의 목표와 마지막에 남길 이미지를 적으세요.",
    0,
    0,
  );
  add(
    "outline",
    "scenario",
    "장면 구성과 전환",
    workflow.stages.join("\n"),
    350,
    0,
  );
  link("brief", "outline");
  add("source", "note", "제작자 워크플로우 출처", source, 0, 300);
  link("source", "brief", "context", "guide");
  if (settings.format === "drama" && settings.premise) {
    const seed = settings.premise;
    add(
      "idea-seed",
      "note",
      `아이디어 ${seed.number} · ${seed.title.slice(0, 88)}`,
      `Short Drama Screenwriter · 아이디어 ${seed.number}\n${seed.description.slice(0, 2200)}\n\n새 작품의 인물·장소·갈등과 결말을 정하세요.\n${source}`,
      -350,
      0,
    );
    link("idea-seed", "brief");
  }
  const names = cast.length ? cast : ["주인공"];
  names.forEach((name, i) => {
    const prefix = `cast-${i}`,
      y = 700 + i * 350;
    add(
      prefix,
      "character",
      name,
      "이 배역의 목표, 장애물, 고정할 외형과 장면별 상태를 정합니다.",
      0,
      y,
    );
    add(
      prefix + "-image",
      "referenceImage",
      name + " · 이미지 기준",
      "얼굴, 의상과 소품 상태를 확인한 기준 이미지를 첨부합니다. Higgsfield에서 쓰는 Image Element 이름을 기록할 수 있습니다.",
      350,
      y,
    );
    link(prefix, prefix + "-image", "identity");
    if (settings.states) {
      add(
        prefix + "-state",
        "referenceImage",
        name + " · 변형 상태",
        "안경·의상 등의 변화가 있는 장면에만 연결할 별도 상태입니다. 파일과 활성 상태를 확인하고 샷에 연결하세요.",
        700,
        y,
      );
      link(prefix + "-image", prefix + "-state", "identity");
    }
    if (settings.voices) {
      add(
        prefix + "-voice",
        "audioCue",
        name + " · 보이스 레코딩",
        "배역과 화자를 지정하고 짧은 대사를 녹음하거나 기존 파일을 첨부하세요. 말의 속도·호흡·침묵과 음색을 기록합니다.",
        1050,
        y,
      );
      link(prefix, prefix + "-voice", "context");
      add(
        prefix + "-element",
        "referenceVideo",
        name + " · 비디오 엘리먼트",
        "연기·모습을 보여 주는 승인된 영상을 첨부합니다. Higgsfield Element ID와 Add voice 연결 여부는 실제 계정에서 확인해 기록하세요.",
        1400,
        y,
      );
      link(prefix + "-image", prefix + "-element", "identity");
      link(prefix + "-voice", prefix + "-element", "context", "guide");
    }
  });
  add(
    "location",
    "referenceImage",
    "로케이션 기준 이미지",
    "인물 동선, 광원 방향, 출입구와 고정 소품을 확인할 장소 이미지를 첨부합니다.",
    0,
    -760,
  );
  if (settings.roomTour) {
    add(
      "room-tour",
      "referenceVideo",
      "공간 룸투어",
      "공간을 파악할 짧은 촬영 또는 로컬 Blender 프리비즈를 첨부합니다.",
      350,
      -760,
    );
    add(
      "blocking",
      "referenceImage",
      "블로킹 · 시작 위치",
      "탑뷰 프레임에 인물·카메라의 시작 위치와 시선 축을 표시하세요. 모델에 보내려면 해당 연결의 용도를 직접 변경합니다.",
      700,
      -760,
    );
    link("location", "room-tour", "location");
    link("room-tour", "blocking", "context", "guide");
  }
  if (settings.extras) {
    add(
      "extras",
      "referenceImage",
      "엑스트라 그룹",
      "군중의 수, 의상 범위와 배경 위치를 한 컷에 정리합니다. 필요한 장면에만 연결하세요.",
      0,
      -400,
    );
  }
  if (settings.format === "commercial") {
    add(
      "product",
      "referenceImage",
      "상품 상태와 표시 사항",
      "실제 상품의 로고·형태·개봉 전후와 입증할 특징을 기록하세요. 사용 상태가 바뀌면 참조를 나눕니다.",
      350,
      -400,
    );
  }
  const base = 850 + names.length * 350;
  const clips = workflow.stages.map((stage, i) => {
    const y = base + i * 360,
      script = `script-${i}`,
      shot = `shot-${i}`,
      frame = `frame-${i}`,
      video = `video-${i}`;
    add(
      script,
      "script",
      `씬 ${i + 1} · ${stage}`,
      stage +
        "\n화자·대사·침묵·동작을 차례로 적고, 직전 장면에서 무엇이 달라지는지 정합니다.",
      350,
      y,
    );
    add(
      shot,
      "shot",
      `샷 ${i + 1} · 시작과 끝`,
      "첫 화면의 위치 → 반드시 보일 행동 → 끝 상태\n렌즈·구도·카메라 경로와 컷 연결점을 기록하세요. 블로킹 자료는 시작 배치를, 카메라는 이 샷의 지시를 따릅니다.",
      700,
      y,
    );
    add(
      frame,
      "keyframe",
      `컷 ${i + 1} · 시작 화면`,
      "이 장면에서 실제 등장하는 배역의 기준 또는 변형 상태를 골라 입력에 연결하고 첫 프레임을 검토하세요.",
      1050,
      y,
    );
    add(
      video,
      "video",
      `컷 ${i + 1} · 영상 테이크`,
      "샷의 행동과 카메라 지시를 확인하고 상태·목소리·편집 연결이 맞는 결과를 채택합니다.",
      1400,
      y,
    );
    link("outline", script);
    link(script, shot);
    link("location", frame, "location");
    const actors = settings.sceneCast?.[i] ?? [
      { actor: i % names.length, variant: false },
    ];
    for (const actor of actors) {
      if (!Number.isInteger(actor.actor) || !names[actor.actor])
        throw new Error("씬별 배역을 다시 선택해 주세요.");
      const prefix = `cast-${actor.actor}`;
      link(
        prefix + (actor.variant && settings.states ? "-state" : "-image"),
        frame,
        "identity",
      );
      if (settings.voices) {
        link(
          prefix + "-element",
          settings.elementInput ? video : shot,
          settings.elementInput ? "motion" : "context",
          settings.elementInput ? "input" : "guide",
        );
      }
    }
    if (settings.roomTour)
      link(
        "blocking",
        settings.blockingInput ? video : shot,
        "context",
        settings.blockingInput ? "input" : "guide",
      );
    if (settings.extras && i === 0) link("extras", frame, "context", "guide");
    if (settings.format === "commercial") link("product", frame, "prop");
    link(shot, frame);
    link(frame, video, "start");
    link(shot, video);
    return {
      nodeId: frame,
      durationFrames: 90,
      inFrame: 0,
      transition: "cut" as const,
      transitionFrames: 0,
    };
  });
  if (settings.alternate) {
    add(
      "reverse",
      "shot",
      "대안 앵글 · 같은 동작",
      "첫 샷과 같은 시작·종료 상태와 타이밍을 유지하고 새 카메라 위치·렌즈·축을 지정합니다.",
      1780,
      base,
    );
    link("shot-0", "reverse");
    link("video-0", "reverse", "context", "guide");
    add(
      "reverse-video",
      "video",
      "대안 앵글 테이크",
      "기존 테이크와 연결점을 대조해 장면에서 사용할 각도를 고릅니다.",
      2120,
      base,
    );
    link("reverse", "reverse-video");
  }
  const id = "animatic";
  add(
    id,
    "previs",
    "스토리보드 프리비즈",
    "임시 컷의 길이와 순서를 조정한 뒤 필요한 보이스 큐와 채택 테이크를 배치하세요.",
    1780,
    base + 450,
  );
  graph.nodes[graph.nodes.length - 1].timeline = {
    aspect: settings.format === "drama" ? "9:16" : "16:9",
    clips,
    audio: [],
  };
  for (const clip of clips) link(clip.nodeId, id);
  if (!validateGraph(graph))
    throw new Error("워크플로우 노드 구성을 확인해 주세요.");
  return graph;
}
