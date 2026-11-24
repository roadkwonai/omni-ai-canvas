import { validateGraph } from "./graph";
import type { Asset, Graph } from "./types";

export type StagingSpec = {
  yaw: number;
  pitch: number;
  focal: number;
  actorX: number;
  actorZ: number;
  propX: number;
  propZ: number;
  angle: string;
  framing: string;
  movement: string;
  expression: string;
  look: string;
  light: string;
  gaze?: "camera" | "left" | "right";
};
export type Staging = StagingSpec;

export function validateStaging(value: unknown): value is StagingSpec {
  if (!value || typeof value !== "object") return false;
  const stage = value as Record<string, unknown>;
  const limits: Record<string, [number, number]> = {
    yaw: [-40, 40],
    pitch: [-25, 25],
    focal: [18, 85],
    actorX: [-4, 4],
    actorZ: [0, 10],
    propX: [-4, 4],
    propZ: [0, 10],
  };
  if (
    stage.gaze !== undefined &&
    !["camera", "left", "right"].some((direction) => direction === stage.gaze)
  )
    return false;
  return (
    Object.entries(limits).every(
      ([key, [min, max]]) =>
        typeof stage[key] === "number" &&
        Number.isFinite(stage[key]) &&
        (stage[key] as number) >= min &&
        (stage[key] as number) <= max,
    ) &&
    ["angle", "framing", "movement", "expression", "look", "light"].every(
      (key) =>
        typeof stage[key] === "string" && (stage[key] as string).length <= 500,
    )
  );
}

export const defaultStaging: Staging = {
  yaw: 0,
  pitch: 0,
  focal: 35,
  actorX: -1,
  actorZ: 3,
  propX: 1.5,
  propZ: 5,
  angle: "눈높이",
  framing: "미디엄",
  movement: "고정",
  expression: "차분하게 상대를 바라본다",
  look: "자연스러운 필름",
  light: "창가의 부드러운 빛",
  gaze: "camera",
};

export function projectPoint(
  x: number,
  z: number,
  height: number,
  stage: Staging,
): { x: number; y: number; scale: number } | null {
  const yaw = (stage.yaw * Math.PI) / 180;
  const pitch = (stage.pitch * Math.PI) / 180;
  const dx = x,
    dz = z + 5,
    dy = height - 1.6;
  const horizontal = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const depth = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  const vertical = dy * Math.cos(pitch) - depth * Math.sin(pitch);
  const forward = dy * Math.sin(pitch) + depth * Math.cos(pitch);
  if (forward <= 0.2) return null;
  const scale = stage.focal / 36 / forward;
  return { x: 0.5 + horizontal * scale, y: 0.5 - vertical * scale, scale };
}

export function stagingText(stage: Staging): string {
  return [
    "## 촬영 지시",
    `구도: ${stage.framing}, 앵글: ${stage.angle}, 카메라: ${stage.movement}`,
    `렌즈 ${stage.focal}mm, 좌우 회전 ${stage.yaw}°, 상하 각도 ${stage.pitch}°`,
    `배우 위치 x ${stage.actorX}m, 깊이 ${stage.actorZ}m. 소품 x ${stage.propX}m, 깊이 ${stage.propZ}m.`,
    `시선: ${stage.gaze === "left" ? "화면 왼쪽" : stage.gaze === "right" ? "화면 오른쪽" : "카메라 방향"}`,
    `표정과 행동: ${stage.expression}`,
    `룩: ${stage.look}, 조명: ${stage.light}`,
  ].join("\n");
}

export function applyStaging(
  graph: Graph,
  shotId: string | null,
  id: string,
  stage: Staging,
): Graph {
  const shot = graph.nodes.find(
    (node) => node.id === shotId && node.kind === "shot",
  );
  if (!validateStaging(stage)) throw new Error("촬영 설정을 확인해 주세요.");
  if (shotId && !shot) throw new Error("샷이 변경되었거나 삭제되었습니다.");
  const body = `<!-- scene-room:staging:start -->\n${stagingText(stage)}\n<!-- scene-room:staging:end -->`;
  const next: Graph = shot
    ? {
        ...graph,
        nodes: graph.nodes.map((node) => {
          if (node.id !== shot.id) return node;
          const previous = node.body.replace(
            /\n*<!-- scene-room:staging:start -->[\s\S]*?<!-- scene-room:staging:end -->/g,
            "",
          );
          return {
            ...node,
            body: `${previous}\n\n${body}`.trim(),
            staging: stage,
          };
        }),
      }
    : {
        ...graph,
        nodes: [
          ...graph.nodes,
          {
            id,
            kind: "shot",
            title: "새 샷",
            body,
            x: 120,
            y: 120,
            staging: stage,
          },
        ],
      };
  if (!validateGraph(next))
    throw new Error(
      "샷을 추가하거나 수정할 수 없습니다. 노드 수와 본문 길이를 확인하세요.",
    );
  return next;
}

export function addStagingGuide(
  graph: Graph,
  shotId: string,
  id: string,
  asset: Asset,
): Graph {
  const shot = graph.nodes.find(
    (node) => node.id === shotId && node.kind === "shot",
  );
  if (!shot) throw new Error("샷이 변경되었거나 삭제되었습니다.");
  const next: Graph = {
    nodes: [
      ...graph.nodes,
      {
        id,
        kind: "referenceImage",
        title: "연출 확인용 배치도",
        body: "로컬 프리비즈 배치도",
        x: shot.x - 330,
        y: shot.y + 200,
        asset,
      },
    ],
    edges: [
      ...graph.edges,
      { source: id, target: shotId, usage: "guide", role: "context" },
    ],
  };
  if (!validateGraph(next))
    throw new Error("배치도를 추가할 수 없습니다. 노드 수를 확인하세요.");
  return next;
}

export function addEditedImage(
  graph: Graph,
  sourceId: string,
  originalUrl: string,
  id: string,
  asset: Asset,
): Graph {
  const source = graph.nodes.find((node) => node.id === sourceId);
  if (!source || source.asset?.url !== originalUrl)
    throw new Error("원본이 변경되었거나 삭제되었습니다.");
  const next: Graph = {
    nodes: [
      ...graph.nodes,
      {
        id,
        kind: "referenceImage",
        title: `${source.title.slice(0, 130)} · 편집본`,
        body: "원본에서 자르기와 색상 조정을 적용한 이미지",
        x: source.x + 330,
        y: source.y + 220,
        asset,
      },
    ],
    edges: [
      ...graph.edges,
      { source: source.id, target: id, usage: "guide", role: "context" },
    ],
  };
  if (!validateGraph(next))
    throw new Error(
      "편집본을 추가할 수 없습니다. 노드 수와 연결을 확인하세요.",
    );
  return next;
}
