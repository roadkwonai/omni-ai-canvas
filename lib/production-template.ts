import { validateGraph } from "./graph";
import { remapLensTransitionRecipe } from "./lens-transition-spec";
import { remapTimeline } from "./timeline-spec";
import {
  DIRECTOR_FORMATS,
  isSceneCount,
  type CanvasNode,
  type DirectorFormat,
  type Graph,
  type SceneCount,
} from "./types";

const directions: Record<
  DirectorFormat,
  {
    brief: string;
    scenario: string;
    character: string;
    reference: string;
    sound: string;
    scene: string[];
  }
> = {
  drama: {
    brief: "드라마 제목, 주제, 시청자와 회차의 핵심 질문을 작성하세요.",
    scenario:
      "인물의 욕망과 갈등, 관계 변화, 다음 장면으로 이어지는 감정선을 정리하세요.",
    character: "이름, 목표, 장애, 말투와 인물 간 관계를 채우세요.",
    reference:
      "인물 의상과 반복 등장하는 장소의 이미지 및 유지할 특징을 정리하세요.",
    sound: "대사를 가리지 않는 배경음과 장면의 생활 소음을 계획하세요.",
    scene: ["장면의 목적, 화자와 상대, 감정의 전환을 적으세요."],
  },
  film: {
    brief: "영화의 로그라인, 장르, 관객에게 남길 질문을 작성하세요.",
    scenario: "1막 설정, 2막 대립, 3막 해결과 각 전환점을 정리하세요.",
    character: "주인공의 목표, 내적 결핍과 마지막 선택을 채우세요.",
    reference: "공간의 질감과 조명, 화면비와 반복할 시각 모티프를 정리하세요.",
    sound: "원음과 환경음, 음악이 시작하고 멈추는 극적 이유를 적으세요.",
    scene: [
      "1막. 인물과 상황을 소개하고 사건의 발단을 적으세요.",
      "2막. 목표를 막는 장애와 갈등의 심화를 적으세요.",
      "3막. 선택과 결과, 마지막 이미지의 의미를 적으세요.",
    ],
  },
  series: {
    brief: "시리즈의 형식, 대상 관객, 시즌을 관통하는 질문을 작성하세요.",
    scenario: "시즌 갈등과 회차별 변화, 다음 화로 이어질 단서를 정리하세요.",
    character: "고정 인물의 관계, 시즌 목표와 회차별 변화를 채우세요.",
    reference: "회차에 걸쳐 유지할 캐릭터·의상·공간의 기준을 정리하세요.",
    sound: "반복할 테마와 회차별 변형, 전환 소리를 계획하세요.",
    scene: ["회차 목적, 관계 변화와 다음 회차의 궁금증을 적으세요."],
  },
  short: {
    brief: "짧은 영상의 대상, 한 문장 메시지와 목표 길이를 적으세요.",
    scenario: "첫 몇 초의 상황, 핵심 전환과 마지막 여운을 정리하세요.",
    character: "한눈에 읽히는 인물의 목표와 행동을 적으세요.",
    reference: "작은 화면에서도 식별할 수 있는 얼굴·장소·소품 기준을 적으세요.",
    sound: "첫 장면의 소리와 마지막 컷을 연결할 음향을 적으세요.",
    scene: ["짧은 장면에서 보여 줄 단일 행동과 전환을 적으세요."],
  },
  ad: {
    brief: "상품명, 대상 고객, 핵심 차별점(USP), 근거와 광고 목표를 적으세요.",
    scenario:
      "고객의 문제 → 상품 시연 → 확인 가능한 혜택 → CTA 순서를 설계하세요.",
    character: "고객 또는 출연자의 상황과 상품 사용 행동을 적으세요.",
    reference:
      "상품의 실제 사진, 로고, 패키지와 반드시 보존할 형태를 첨부하세요.",
    sound: "상품 시연음과 CTA 아래의 음악·보이스오버를 계획하세요.",
    scene: [
      "문제 제기와 USP를 보여 줄 행동을 적으세요.",
      "상품 사용과 기능 시연을 구체적인 동작으로 적으세요.",
      "검증 가능한 혜택과 CTA 문구·화면을 적으세요.",
    ],
  },
  musicVideo: {
    brief: "곡 제목, 아티스트, BPM, 분위기와 영상의 시각 콘셉트를 적으세요.",
    scenario:
      "인트로, 벌스, 후렴, 브리지, 아웃트로의 시간과 이미지 변화를 적으세요.",
    character: "출연자·퍼포먼스, 의상 변화와 구간별 동작을 적으세요.",
    reference: "아티스트 외형, 무대·의상과 색감의 기준 이미지를 첨부하세요.",
    sound:
      "Road Music에서 음악을 제작하거나 원음을 가져오고 BPM과 각 구간의 시작점을 기록하세요.",
    scene: [
      "인트로의 첫 이미지와 박자에 맞는 동작을 적으세요.",
      "벌스의 서사와 후렴 직전 전환을 적으세요.",
      "후렴의 반복되는 이미지와 퍼포먼스를 적으세요.",
      "브리지의 대비와 아웃트로의 마무리를 적으세요.",
    ],
  },
};

export function makeProductionTemplate(
  format: DirectorFormat,
  count: SceneCount,
): Graph {
  if (
    !DIRECTOR_FORMATS.includes(format) ||
    !isSceneCount(count)
  )
    throw new Error("작품 형식과 1~12개의 씬 또는 자동을 선택해 주세요.");
  const guide = directions[format];
  const nodes: CanvasNode[] = [];
  const edges: Graph["edges"] = [];
  function add(
    id: string,
    kind: CanvasNode["kind"],
    title: string,
    body: string,
    x: number,
    y: number,
    group?: string,
  ) {
    nodes.push({ id, kind, title, body, x, y, ...(group ? { group } : {}) });
  }
  add("brief", "brief", "작품 기획", guide.brief, 0, 0);
  add("scenario", "scenario", "구성 설계", guide.scenario, 340, 0);
  add("character", "character", "인물 설정", guide.character, 340, 300);
  add(
    "reference",
    "referenceImage",
    format === "ad" ? "상품 레퍼런스" : "비주얼 레퍼런스",
    guide.reference,
    340,
    600,
  );
  add(
    "audio",
    "audioCue",
    format === "musicVideo" ? "Road Music 음원" : "음향 큐",
    guide.sound,
    340,
    900,
  );
  edges.push({ source: "brief", target: "scenario" });
  const sceneCount = count === "auto" ? 0 : count;
  for (let index = 0; index < sceneCount; index++) {
    const suffix = String(index + 1),
      y = index * 420,
      group = `scene-${suffix}`;
    const scene = `scene-${suffix}`,
      script = `script-${suffix}`,
      shot = `shot-${suffix}`,
      frame = `frame-${suffix}`,
      video = `video-${suffix}`,
      previs = `previs-${suffix}`;
    const guidance =
      guide.scene[
        Math.min(
          guide.scene.length - 1,
          Math.floor((index * guide.scene.length) / sceneCount),
        )
      ];
    add(scene, "scene", `씬 ${suffix}`, guidance, 700, y, group);
    add(
      script,
      "script",
      `씬 ${suffix} 대본`,
      "장소와 시간, 인물 행동, 화자별 대사와 반응을 작성하세요.",
      1030,
      y,
      group,
    );
    add(
      shot,
      "shot",
      `씬 ${suffix} 샷`,
      "구도와 시선, 카메라 움직임, 동작의 시작과 끝, 예상 길이를 적으세요.",
      1360,
      y,
      group,
    );
    add(
      frame,
      "keyframe",
      `씬 ${suffix} 키프레임`,
      "승인한 인물·장소 참조를 바탕으로 시작 화면을 준비하세요.",
      1690,
      y,
      group,
    );
    add(
      video,
      "video",
      `씬 ${suffix} 영상`,
      "선택한 샷과 키프레임을 확인한 뒤 장면을 제작하세요.",
      2020,
      y,
      group,
    );
    add(
      previs,
      "previs",
      `씬 ${suffix} 프리비즈`,
      "컷 순서와 임시 화면을 배치하고 음향이 준비되면 타임라인에 추가하세요.",
      2350,
      y,
      group,
    );
    nodes[nodes.length - 1].timeline = {
      aspect: format === "short" || format === "ad" ? "9:16" : "16:9",
      clips: [
        {
          nodeId: shot,
          durationFrames: 90,
          inFrame: 0,
          transition: "cut",
          transitionFrames: 0,
        },
      ],
      audio: [
        {
          nodeId: "audio",
          startFrame: 0,
          inFrame: 0,
          durationFrames: 90,
          gain: 1,
          fadeInFrames: 0,
          fadeOutFrames: 0,
        },
      ],
    };
    edges.push(
      { source: "scenario", target: scene },
      { source: scene, target: script },
      { source: script, target: shot },
      { source: "character", target: shot, role: "identity" },
      {
        source: "reference",
        target: shot,
        role: format === "ad" ? "prop" : "location",
      },
      { source: shot, target: frame },
      { source: frame, target: video, role: "start" },
      { source: shot, target: video },
      { source: video, target: previs },
      { source: "audio", target: previs },
    );
  }
  return { nodes, edges };
}

export function addProductionGraph(current: Graph, addition: Graph): Graph {
  if (!validateGraph(current) || !validateGraph(addition))
    throw new Error("제작 보드 형식을 확인해 주세요.");
  const used = new Set(
    current.nodes.flatMap((node) =>
      node.group ? [node.id, node.group] : [node.id],
    ),
  );
  function newId() {
    let id: string;
    do {
      id = crypto.randomUUID();
    } while (used.has(id));
    used.add(id);
    return id;
  }
  const ids = new Map(addition.nodes.map((node) => [node.id, newId()]));
  const groups = new Map<string, string>();
  for (const node of addition.nodes)
    if (node.group && !groups.has(node.group)) groups.set(node.group, newId());
  const offset = current.nodes.length
    ? Math.max(...current.nodes.map((node) => node.y)) + 460
    : 0;
  const nodes = addition.nodes.map((node) => ({
    ...structuredClone(node),
    id: ids.get(node.id)!,
    y: node.y + offset,
    ...(node.group ? { group: groups.get(node.group)! } : {}),
    ...(node.timeline ? { timeline: remapTimeline(node.timeline, ids) } : {}),
    ...(node.lensTransition ? { lensTransition: remapLensTransitionRecipe(node.lensTransition, ids) } : {}),
  }));
  const edges = addition.edges.map((edge) => ({
    ...edge,
    source: ids.get(edge.source)!,
    target: ids.get(edge.target)!,
  }));
  const graph = {
    nodes: [...current.nodes, ...nodes],
    edges: [...current.edges, ...edges],
  };
  if (!validateGraph(graph))
    throw new Error("프로젝트의 노드 수 또는 연결 한도를 초과했습니다.");
  return graph;
}

export function appendProductionTemplate(
  current: Graph,
  format: DirectorFormat,
  count: SceneCount,
): Graph {
  return addProductionGraph(current, makeProductionTemplate(format, count));
}
