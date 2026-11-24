import { validateGraph } from "./graph";
import type { CanvasNode, Graph } from "./types";

export type PortraitKit = {
  name: string;
  identity: string;
  pose: string;
  costume: string;
  expression: string;
  lighting: string;
  camera: string;
  texture: string;
  turnaround: boolean;
  storyboard: boolean;
};

export const portraitOptions = {
  pose: [
    "자연스럽게 서서 상대를 바라본다",
    "의자에 앉아 손을 무릎에 둔다",
    "걸음을 멈추고 뒤를 돌아본다",
    "정면을 향해 걸어온다",
  ],
  costume: [
    "차분한 일상복",
    "단정한 셔츠와 재킷",
    "활동적인 아웃도어 복장",
    "시대극 의상",
  ],
  expression: [
    "차분한 표정에서 작은 미소로 바뀐다",
    "경계하다 눈빛이 부드러워진다",
    "슬픔을 억누르며 시선을 피한다",
    "놀라서 멈춘 뒤 안도한다",
  ],
  lighting: [
    "창가의 부드러운 자연광",
    "측면의 따뜻한 키 라이트와 약한 반대편 보조광",
    "흐린 날의 확산광",
    "역광과 얼굴의 약한 보조광",
  ],
  camera: [
    "눈높이 미디엄 샷",
    "45도 측면 클로즈업",
    "낮은 시점의 미디엄 와이드",
    "인물 너머를 보는 오버숄더",
  ],
  texture: [
    "자연스러운 피부결과 미세한 비대칭, 과하지 않은 선명도",
    "부드러운 필름 그레인과 낮은 대비",
    "깨끗한 디지털 질감과 자연스러운 피부 톤",
  ],
} as const;

export const defaultPortraitKit: PortraitKit = {
  name: "새 캐릭터",
  identity: "고유한 얼굴, 헤어스타일과 반복 유지할 특징을 적어 주세요.",
  pose: portraitOptions.pose[0],
  costume: portraitOptions.costume[0],
  expression: portraitOptions.expression[0],
  lighting: portraitOptions.lighting[0],
  camera: portraitOptions.camera[0],
  texture: portraitOptions.texture[0],
  turnaround: true,
  storyboard: false,
};

export function makePortraitGraph(input: PortraitKit): Graph {
  for (const field of [
    "name",
    "identity",
    "pose",
    "costume",
    "expression",
    "lighting",
    "camera",
    "texture",
  ] as const) {
    if (
      typeof input[field] !== "string" ||
      !input[field].trim() ||
      input[field].length > (field === "name" ? 80 : 500)
    )
      throw new Error("캐릭터 이름과 연출 항목을 확인해 주세요.");
  }
  if (
    typeof input.turnaround !== "boolean" ||
    typeof input.storyboard !== "boolean"
  )
    throw new Error("캐릭터 제작 옵션을 확인해 주세요.");
  const nodes: CanvasNode[] = [
    {
      id: "character",
      kind: "character",
      title: input.name,
      body: `## 정체성\n${input.identity}\n\n## 연기\n${input.expression}\n\n## 고정할 의상\n${input.costume}`,
      x: 0,
      y: 0,
    },
    {
      id: "identity",
      kind: "referenceImage",
      title: "인물 정체성 참조",
      body: "이 인물의 얼굴과 헤어를 고정할 이미지를 첨부하거나 만드세요. 생성할 때 실제 지원하는 정체성 참조 슬롯을 확인하세요.",
      x: 0,
      y: 300,
    },
    {
      id: "pose",
      kind: "referenceImage",
      title: "포즈 참조",
      body: `자세와 동작만 참고합니다.\n${input.pose}\n포즈 이미지를 첨부하거나 설명을 조정하세요.`,
      x: 0,
      y: 600,
    },
    {
      id: "costume",
      kind: "referenceImage",
      title: "의상 참조",
      body: `의상의 형태, 색과 소재만 참고합니다.\n${input.costume}\n의상 참조 이미지를 첨부하거나 설명을 조정하세요.`,
      x: 0,
      y: 900,
    },
    {
      id: "portrait",
      kind: "keyframe",
      title: `${input.name} · 인물 기준 이미지`,
      body: `## 인물\n${input.identity}\n\n## 포즈\n${input.pose}\n\n## 의상\n${input.costume}\n\n## 표정과 행동\n${input.expression}\n\n## 조명\n${input.lighting}\n\n## 시점\n${input.camera}\n\n## 질감\n${input.texture}\n\n참조별 역할을 확인하고 생성 결과를 채택한 뒤 후속 샷에 연결하세요.`,
      x: 420,
      y: 300,
      guidance: {
        recipeId: "image",
        text: "인물의 정체성은 얼굴 참조, 몸의 동작은 포즈 참조, 옷의 형태와 색은 의상 참조로 구분한다. 피부의 자연스러운 세부, 손과 시선, 빛 방향 및 의상 상태를 검토한다.",
      },
    },
  ];
  const edges: Graph["edges"] = [
    { source: "character", target: "identity", role: "identity" },
    { source: "identity", target: "portrait", role: "identity" },
    { source: "pose", target: "portrait", role: "context" },
    { source: "costume", target: "portrait", role: "prop" },
    { source: "character", target: "portrait", role: "context" },
  ];
  if (input.turnaround) {
    nodes.push({
      id: "sheet-turn",
      kind: "keyframe",
      title: "3면도 이미지 시트",
      body: `${input.name}의 동일한 외형과 ${input.costume}을 유지한 정면·측면·후면 전신을 가로 3칸으로 균등 배치한다. 칸마다 한 인물, 동일 배경과 조명. 글자와 테두리는 제외한다.`,
      x: 800,
      y: -350,
    });
    edges.push({ source: "portrait", target: "sheet-turn", role: "identity" });
    const directions = ["정면", "측면", "후면"];
    directions.forEach((direction, index) => {
      const id = `turn-${index + 1}`;
      nodes.push({
        id,
        kind: "keyframe",
        title: `3면도 · ${direction}`,
        body: `${input.name}의 ${direction} 전신 기준 이미지. 얼굴·머리·체형·${input.costume}을 유지한다. 평이한 자세와 균일한 조명으로 형태를 확인한다.`,
        x: 800 + index * 320,
        y: 0,
      });
      edges.push({ source: "portrait", target: id, role: "identity" });
    });
  }
  if (input.storyboard) {
    nodes.push({
      id: "story-sheet",
      kind: "keyframe",
      title: "25컷 스토리보드 이미지 시트",
      body: `${input.name}의 장면 25개를 5행 5열의 균등한 칸에 시간순으로 배치한다. 인물 외형과 의상을 유지하며 칸마다 명확한 구도와 행동을 표현한다. 글자와 테두리는 제외한다.`,
      x: 800,
      y: 350,
    });
    edges.push({ source: "portrait", target: "story-sheet", role: "identity" });
    const phases = [
      "상황과 공간",
      "인물의 목표",
      "행동과 반응",
      "전환",
      "결과",
    ];
    for (let index = 0; index < 25; index++) {
      const row = Math.floor(index / 5);
      const col = index % 5;
      const number = index + 1;
      const shot = `shot-${number}`,
        frame = `frame-${number}`;
      nodes.push(
        {
          id: shot,
          kind: "shot",
          title: `스토리보드 ${number} · ${phases[row]}`,
          body: `순서 ${number}/25. ${phases[row]}의 비트 ${col + 1}을 구체화합니다.\n인물 행동과 감정: ${input.pose}, ${input.expression}\n카메라: ${input.camera}\n조명: ${input.lighting}\n직전 컷의 시선·방향·의상 상태와 다음 컷으로 이어질 동작을 기록하세요.`,
          x: 800 + col * 660,
          y: 460 + row * 600,
        },
        {
          id: frame,
          kind: "keyframe",
          title: `스토리보드 ${number} · 키프레임`,
          body: `샷 ${number}의 시작 화면을 만듭니다. 같은 인물의 얼굴·머리·의상 상태를 유지하고 샷의 행동 전 상태와 시점을 표현합니다.`,
          x: 1120 + col * 660,
          y: 460 + row * 600,
        },
      );
      edges.push(
        { source: "portrait", target: shot, role: "identity" },
        { source: shot, target: frame, role: "context" },
        { source: "portrait", target: frame, role: "identity" },
        { source: "costume", target: frame, role: "prop" },
        { source: "pose", target: frame, role: "context" },
      );
    }
  }
  const graph = { nodes, edges };
  if (!validateGraph(graph))
    throw new Error("인물 연출 보드를 구성하지 못했습니다.");
  return graph;
}
