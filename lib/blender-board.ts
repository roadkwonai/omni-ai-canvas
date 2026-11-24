import { parseBlenderScene, type BlenderSceneSpec } from "./blender-scene-spec";
import { validateGraph } from "./graph";
import type { Asset, CanvasNode, Graph } from "./types";

function checked(graph: Graph, nodeId: string) {
  if (!validateGraph(graph))
    throw new Error(
      "현재 보드의 노드·연결 한도 또는 타임라인 길이를 확인해 주세요.",
    );
  return { graph, nodeId };
}

export function saveBlenderShot(
  graph: Graph,
  value: BlenderSceneSpec,
  nodeId?: string,
) {
  const spec = parseBlenderScene(value);
  if (!spec) throw new Error("3D 장면 설정을 확인해 주세요.");
  if (nodeId) {
    const shot = graph.nodes.find(
      (node) => node.id === nodeId && node.kind === "shot",
    );
    if (!shot) throw new Error("편집하던 샷이 삭제되었거나 바뀌었습니다.");
    if (
      JSON.stringify(parseBlenderScene(shot.blenderScene)) ===
      JSON.stringify(spec)
    )
      return { graph, nodeId };
    return checked(
      {
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id === nodeId ? { ...node, blenderScene: spec } : node,
        ),
      },
      nodeId,
    );
  }
  const id = crypto.randomUUID();
  const y = graph.nodes.length
    ? Math.max(...graph.nodes.map((node) => node.y)) + 440
    : 0;
  const shot: CanvasNode = {
    id,
    kind: "shot",
    title: "Blender 3D 장면",
    body: "",
    x: 0,
    y,
    blenderScene: spec,
  };
  return checked({ ...graph, nodes: [...graph.nodes, shot] }, id);
}

export function addBlenderTake(
  graph: Graph,
  sceneId: string,
  spec: BlenderSceneSpec,
  asset: Asset,
  quality: "preview" | "final",
  acceptPrevious = false,
) {
  const shot = graph.nodes.find(
    (node) => node.id === sceneId && node.kind === "shot" && node.blenderScene,
  );
  if (!shot || asset.type !== "video")
    throw new Error("렌더한 장면과 영상 파일을 확인해 주세요.");
  const targets = new Set(
    graph.edges
      .filter((edge) => edge.source === sceneId)
      .map((edge) => edge.target),
  );
  const takes = graph.nodes.filter(
    (node) => targets.has(node.id) && node.blenderTake,
  );
  const existing = takes.find(
    (take) =>
      take.asset?.url === asset.url && take.blenderTake?.quality === quality,
  );
  if (existing) return { graph, nodeId: existing.id };
  if (
    !acceptPrevious &&
    JSON.stringify(parseBlenderScene(shot.blenderScene)) !==
      JSON.stringify(parseBlenderScene(spec))
  )
    throw new Error(
      "렌더 중 샷 설정이 변경됐습니다. 결과를 확인하고 렌더 당시 설정의 테이크로 보관할 수 있습니다.",
    );
  const id = crypto.randomUUID();
  const name = quality === "preview" ? "프리비즈" : "최종 렌더";
  const take: CanvasNode = {
    id,
    kind: "video",
    title: `${shot.title.slice(0, 110)} · ${name}`,
    body: `Blender ${name} · ${spec.aspect} · ${spec.seconds}초 · ${spec.fps}fps\n동작: ${spec.action ?? "정지 포즈"} · 렌즈: ${spec.camera.lens}mm`,
    asset,
    blenderTake: { quality, scene: structuredClone(spec) },
    x: shot.x + 360,
    y: shot.y + takes.length * 320,
  };
  return checked(
    {
      nodes: [...graph.nodes, take],
      edges: [
        ...graph.edges,
        { source: sceneId, target: id, role: "context", usage: "guide" },
      ],
    },
    id,
  );
}

export function linkBlenderTimeline(
  graph: Graph,
  takeId: string,
  timelineId?: string,
) {
  const take = graph.nodes.find(
    (node) => node.id === takeId && node.asset?.type === "video",
  );
  if (!take?.blenderTake)
    throw new Error("타임라인에 넣을 Blender 테이크를 확인해 주세요.");
  const previous = timelineId
    ? graph.nodes.find(
        (node) => node.id === timelineId && node.kind === "previs",
      )
    : undefined;
  if (timelineId && !previous)
    throw new Error("선택한 타임라인을 찾을 수 없습니다.");
  const { scene } = take.blenderTake;
  const node: CanvasNode = previous ?? {
    id: crypto.randomUUID(),
    kind: "previs",
    title: "3D 장면 편집",
    body: "",
    x: take.x + 360,
    y: take.y,
  };
  const timeline = node.timeline ?? {
    aspect: scene.aspect,
    clips: [],
    audio: [],
  };
  const clips = timeline.clips.some((clip) => clip.nodeId === takeId)
    ? timeline.clips
    : [
        ...timeline.clips,
        {
          nodeId: takeId,
          durationFrames: Math.max(1, Math.round(scene.seconds * 30)),
          inFrame: 0,
          transition: "cut" as const,
          transitionFrames: 0,
        },
      ];
  const edge = graph.edges.find(
    (e) => e.source === takeId && e.target === node.id,
  );
  if (previous && clips === timeline.clips && edge?.usage !== "guide" && edge)
    return { graph, nodeId: node.id };
  // 이미 합성해 둔 MP4는 변경된 컷 목록을 나타내지 않는다.
  const updated = { ...node, timeline: { ...timeline, clips } };
  if (clips !== timeline.clips) delete updated.asset;
  const inputEdge = {
    source: takeId,
    target: node.id,
    role: "context" as const,
    usage: "input" as const,
  };
  return checked(
    {
      nodes: previous
        ? graph.nodes.map((item) => (item.id === node.id ? updated : item))
        : [...graph.nodes, updated],
      edges: edge
        ? graph.edges.map((item) => (item === edge ? inputEdge : item))
        : [...graph.edges, inputEdge],
    },
    node.id,
  );
}

export function addBlockingReference(
  graph: Graph,
  takeId: string,
  still: Asset,
  seconds: number,
) {
  const take = graph.nodes.find(
    (node) => node.id === takeId && node.blenderTake,
  );
  if (
    !take ||
    !take.blenderTake ||
    still.type !== "image" ||
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    seconds >= take.blenderTake.scene.seconds
  )
    throw new Error("저장된 테이크의 프레임과 원본 시각을 확인해 주세요.");
  const imageId = crypto.randomUUID(),
    shotId = crypto.randomUUID();
  const y = Math.max(...graph.nodes.map((node) => node.y)) + 360;
  const image: CanvasNode = {
    id: imageId,
    kind: "referenceImage",
    title: `블로킹 참조 · ${seconds.toFixed(2)}초`,
    body: `원본: ${take.title}, 프레임 시각 ${seconds.toFixed(2)}초\n인물과 소품의 시작 위치, 이동 방향, 시선 축을 적으세요.`,
    x: take.x,
    y,
    asset: still,
  };
  const shot: CanvasNode = {
    id: shotId,
    kind: "shot",
    title: "대안 앵글 · 블로킹",
    body: "같은 인물·동작·공간에서 새 카메라 위치와 렌즈를 정합니다. 참조는 시작 배치 기준이며 촬영 시점은 이 샷의 카메라를 따릅니다.",
    x: take.x + 360,
    y,
    blenderScene: structuredClone(take.blenderTake.scene),
    guidance: { skillIds: ["blocking", "shot-plan"] },
  };
  return checked(
    {
      nodes: [...graph.nodes, image, shot],
      edges: [
        ...graph.edges,
        { source: take.id, target: imageId, role: "context", usage: "guide" },
        { source: imageId, target: shotId, role: "context", usage: "guide" },
      ],
    },
    shotId,
  );
}
