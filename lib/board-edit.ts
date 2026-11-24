import type { CanvasNode, Graph } from "./types";
import { remapLensTransitionRecipe } from "./lens-transition-spec";
import { remapTimeline } from "./timeline-spec";
import { validateGraph } from "./graph";
import { gridLayouts, samePortraitGrid, type PortraitGridConfig } from "./portrait-grid";

export type BoardPoint = { x: number; y: number };

function outputNodes(graph: Graph, id: string) {
  const targets = new Set(graph.edges.filter((edge) => edge.source === id && edge.usage !== "guide").map((edge) => edge.target));
  return graph.nodes.filter((node) => targets.has(node.id));
}

export function sceneShots(graph: Graph, id: string) {
  const outputs = outputNodes(graph, id);
  const shots = new Set(outputs.flatMap((node) => node.kind === "shot" ? [node] :
    node.kind === "script" ? outputNodes(graph, node.id).filter((item) => item.kind === "shot") : []));
  return graph.nodes.filter((node) => shots.has(node));
}

export function canStartVideo(node: CanvasNode) {
  return node.kind === "scene" || node.kind === "shot" || node.kind === "video" ||
    node.kind === "referenceVideo" || node.asset?.type === "image";
}

export function prepareProductionVideo(graph: Graph, source: CanvasNode, draft: { id: string; position: BoardPoint }) {
  if (!canStartVideo(source)) throw new Error("영상 제작에 사용할 씬, 샷 또는 이미지를 선택해 주세요.");
  if (source.kind === "video" || source.kind === "referenceVideo" && !source.asset) return { graph, id: source.id };

  const outputs = outputNodes(graph, source.id);
  const keyframes = outputs.filter((node) => node.kind === "keyframe");
  const linkedVideo = outputs.find((node) => node.kind === "video") ??
    keyframes.flatMap((node) => outputNodes(graph, node.id)).find((node) => node.kind === "video");
  if (linkedVideo) return { graph, id: linkedVideo.id };

  const readyFrames = keyframes.filter((node) => node.asset?.type === "image");
  const startFrame = source.asset?.type === "image" ? source : readyFrames.length === 1 ? readyFrames[0] : undefined;
  const sourceRole = source.asset?.type === "video" ? "motion" : startFrame === source ? "start" : undefined;
  const next: Graph = {
    nodes: [...graph.nodes, { id: draft.id, ...draft.position, kind: "video", group: source.group,
      title: `${(source.title.trim() || "새 장면").slice(0, 150)} · 영상`, body: "" }],
    edges: [...graph.edges,
      { source: source.id, target: draft.id, usage: "input", ...(sourceRole ? { role: sourceRole } : {}) },
      ...(startFrame && startFrame !== source
        ? [{ source: startFrame.id, target: draft.id, usage: "input" as const, role: "start" as const }] : []),
    ],
  };
  if (!validateGraph(next)) throw new Error("영상 노드를 추가할 수 없습니다. 노드·연결 한도를 확인해 주세요.");
  return { graph: next, id: draft.id };
}

export function addStoryboardVideo(
  graph: Graph, sheetId: string, cutIds: readonly string[], grid: PortraitGridConfig,
  video: { id: string; position: BoardPoint },
): Graph {
  const sheet = graph.nodes.find((item) => item.id === sheetId);
  if (sheet?.asset?.type !== "image" || sheet.asset.url !== grid.assetUrl)
    throw new Error("시트 이미지가 변경됐습니다. 컷을 다시 선택해 주세요.");
  if (!sheet.portraitGrid || !samePortraitGrid(sheet.portraitGrid, grid))
    throw new Error("시트의 경계가 변경됐습니다. 분할 설정을 저장한 뒤 컷을 다시 선택해 주세요.");
  if (!cutIds.length || cutIds.length > 12)
    throw new Error("영상의 참조 컷을 1개에서 12개까지 선택해 주세요.");
  const { rows, columns } = gridLayouts[grid.layout];
  const cuts = cutIds.map((id) => {
    const cut = graph.nodes.find((item) => item.id === id);
    if (cut?.asset?.type !== "image" || cut.gridCell?.sourceNodeId !== sheetId ||
        cut.gridCell.sourceAssetUrl !== grid.assetUrl || cut.gridCell.rows !== rows ||
        cut.gridCell.columns !== columns ||
        !graph.edges.some((edge) => edge.source === sheetId && edge.target === id))
      throw new Error("현재 시트에서 분리된 컷을 다시 선택해 주세요.");
    return { id, index: cut.gridCell.index };
  }).sort((a, b) => a.index - b.index);
  if (new Set(cuts.map(({ index }) => index)).size !== cuts.length)
    throw new Error("같은 칸에 해당하는 컷은 하나만 선택해 주세요.");
  const labels = cuts.map(({ index }) => `${Math.floor(index / columns) + 1}-${index % columns + 1}`);
  const next: Graph = {
    nodes: [...graph.nodes, { id: video.id, ...video.position, kind: "video",
      title: `${sheet.title.slice(0, 145)} · 영상`, body: `스토리보드 컷 ${labels.join(", ")} 순서로 전개를 이어 주세요.` }],
    edges: [...graph.edges, ...cuts.map(({ id }) => ({
      source: id, target: video.id, usage: "input" as const,
      role: cuts.length === 1 ? "start" as const : "context" as const,
    }))],
  };
  if (!validateGraph(next)) throw new Error("영상 노드를 추가할 공간이 부족합니다.");
  return next;
}

export function removeBoardItems(graph: Graph, nodeIds: readonly string[], edgeIds: ReadonlySet<string>) {
  const removed = new Map(nodeIds.map((id) => [id, null]));
  return {
    nodes: graph.nodes.filter((node) => !removed.has(node.id)).map((node) =>
      removed.size && node.timeline
        ? { ...node, timeline: remapTimeline(node.timeline, removed) }
        : node,
    ),
    edges: graph.edges.filter((edge) =>
      !removed.has(edge.source) && !removed.has(edge.target) &&
      !edgeIds.has(JSON.stringify([edge.source, edge.target])),
    ),
  };
}

export function positionGraph(graph: Graph, point: BoardPoint): Graph {
  const left = Math.min(...graph.nodes.map((node) => node.x));
  const top = Math.min(...graph.nodes.map((node) => node.y));
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      x: point.x + (node.x - left),
      y: point.y + (node.y - top),
    })),
  };
}

export function selectedGraph(graph: Graph, ids: readonly string[]): Graph {
  const selected = new Set(ids);
  return {
    nodes: graph.nodes.filter((node) => selected.has(node.id)),
    edges: graph.edges.filter(
      (edge) => selected.has(edge.source) && selected.has(edge.target),
    ),
  };
}

export function duplicateGraph(
  graph: Graph,
  makeId: () => string = () => crypto.randomUUID(),
): Graph {
  const ids = new Map(graph.nodes.map((node) => [node.id, makeId()]));
  const groups = new Map<string, string>();
  const nodes: CanvasNode[] = graph.nodes.map((node) => {
    let group = node.group;
    if (group) {
      if (!groups.has(group)) groups.set(group, makeId());
      group = groups.get(group);
    }
    const clone = structuredClone(node);
    delete clone.productionRole;
    return {
      ...clone,
      id: ids.get(node.id)!,
      x: node.x + 40,
      y: node.y + 40,
      ...(group ? { group } : {}),
      ...(node.timeline ? { timeline: remapTimeline(node.timeline, ids) } : {}),
      ...(node.imageEdit ? { imageEdit: {
        ...clone.imageEdit!,
        sourceNodeId: ids.get(node.imageEdit.sourceNodeId) ?? node.imageEdit.sourceNodeId,
      } } : {}),
      ...(clone.imageOperation ? { imageOperation: {
        ...clone.imageOperation,
        sourceId: ids.get(clone.imageOperation.sourceId) ?? clone.imageOperation.sourceId,
      } } : {}),
      ...(clone.lensTransition ? { lensTransition: remapLensTransitionRecipe(clone.lensTransition, ids) } : {}),
      ...(clone.gridCell ? { gridCell: {
        ...clone.gridCell,
        sourceNodeId: ids.get(clone.gridCell.sourceNodeId) ?? clone.gridCell.sourceNodeId,
      } } : {}),
    };
  });
  return {
    nodes,
    edges: graph.edges.map((edge) => ({
      ...edge,
      source: ids.get(edge.source)!,
      target: ids.get(edge.target)!,
    })),
  };
}
