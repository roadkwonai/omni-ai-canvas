import { isLensTransitionRecipe } from "./lens-transition-spec";
import { isImageOperationDraft } from "./image-operation";
import { validateTimeline } from "./timeline-spec";
import { isImageEditSpec } from "./image-edit";
import { isGridCellProvenance, isPortraitGridConfig } from "./portrait-grid";
import { validateStaging } from "./staging";
import { expectedAssetType } from "./types";
import { isAsset } from "./asset-shape";
import { kinds, roles, type Graph, type CanvasNode } from "./types";
import { isGuidance } from "./node-guidance";
import { parseMotionShort } from "./motion-short-spec";
import { parseBlenderScene } from "./blender-scene-spec";
import { isCharacterIdentity } from "./character-identity";

export const nodeLimit = 120;
const key = /^[A-Za-z0-9_-]{1,80}$/;

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNode(value: unknown): value is CanvasNode {
  if (!record(value)) return false;
  const { id, title, kind, body, x, y, asset } = value;
  return (
    typeof id === "string" &&
    key.test(id) &&
    kinds.some((k) => kind === k) &&
    typeof title === "string" &&
    title.length <= 160 &&
    typeof body === "string" &&
    body.length <= 24_000 &&
    (value.promptKorean === undefined ||
      (record(value.promptKorean) &&
        Object.keys(value.promptKorean).length === 1 &&
        typeof value.promptKorean.text === "string" &&
        value.promptKorean.text.length <= 24_000)) &&
    typeof x === "number" &&
    Math.abs(x) <= 100_000 &&
    typeof y === "number" &&
    Math.abs(y) <= 100_000 &&
    (value.lensTransition === undefined || (kind === "video" && isLensTransitionRecipe(value.lensTransition))) &&
    (value.imageEdit === undefined || (kind === "keyframe" && isImageEditSpec(value.imageEdit))) &&
    (value.imageOperation === undefined || (kind === "keyframe" && isImageOperationDraft(value.imageOperation))) &&
    (value.portraitGrid === undefined ||
      (expectedAssetType(kind as CanvasNode["kind"]) === "image" && isPortraitGridConfig(value.portraitGrid))) &&
    (value.gridCell === undefined || (kind === "keyframe" && isGridCellProvenance(value.gridCell))) &&
    (value.rating === undefined ||
      (typeof value.rating === "number" && Number.isInteger(value.rating) && value.rating >= 1 && value.rating <= 5)) &&
    (value.group === undefined ||
      (typeof value.group === "string" &&
        value.group.trim().length > 0 &&
        value.group.length <= 100)) &&
    (value.timeline === undefined ||
      (kind === "previs" && validateTimeline(value.timeline))) &&
    (value.staging === undefined ||
      (kind === "shot" && validateStaging(value.staging))) &&
    (value.guidance === undefined || isGuidance(value.guidance)) &&
    (value.directorNote === undefined || (typeof value.directorNote === "string" && value.directorNote.length <= 2000)) &&
    (value.motionShort === undefined ||
      (kind === "video" && parseMotionShort(value.motionShort) !== null)) &&
    (value.blenderScene === undefined || (kind === "shot" && parseBlenderScene(value.blenderScene) !== null)) &&
    (value.characterIdentity === undefined || (kind === "character" && isCharacterIdentity(value.characterIdentity))) &&
    (value.blenderTake === undefined || (kind === "video" && record(value.blenderTake) &&
      (value.blenderTake.quality === "preview" || value.blenderTake.quality === "final") &&
      parseBlenderScene(value.blenderTake.scene) !== null)) &&
    (asset === undefined ||
      (isAsset(asset) &&
        asset.type === expectedAssetType(kind as CanvasNode["kind"])))
  );
}

export function validateGraph(value: unknown): value is Graph {
  if (
    !record(value) ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges)
  )
    return false;
  if (
    value.nodes.length > nodeLimit ||
    value.edges.length > 500 ||
    !value.nodes.every(isNode)
  )
    return false;
  const adjacency = new Map<string, Set<string>>(
    value.nodes.map((n) => [n.id, new Set()]),
  );
  if (adjacency.size !== value.nodes.length) return false;
  const nodes = new Map<string, CanvasNode>(
    value.nodes.map((node) => [node.id, node]),
  );
  for (const n of nodes.values()) {
    if (!n.timeline) continue;
    if (
      n.timeline.clips.some(
        (clip) =>
          clip.nodeId !== null &&
          (clip.nodeId === n.id ||
            !nodes.has(clip.nodeId) ||
            nodes.get(clip.nodeId)?.kind === "audioCue"),
      )
    )
      return false;
    if (
      n.timeline.audio.some((cue) => nodes.get(cue.nodeId)?.kind !== "audioCue")
    )
      return false;
  }
  for (const edge of value.edges) {
    if (
      !record(edge) ||
      typeof edge.source !== "string" ||
      typeof edge.target !== "string"
    )
      return false;
    const children = adjacency.get(edge.source);
    if (!children || !adjacency.has(edge.target) || children.has(edge.target))
      return false;
    if (
      edge.usage !== undefined &&
      edge.usage !== "input" &&
      edge.usage !== "guide"
    )
      return false;
    if (edge.role !== undefined && !roles.some((role) => role === edge.role))
      return false;
    const source = nodes.get(edge.source)!;
    const video = expectedAssetType(source.kind) === "video";
    if (edge.role === "motion" && !video) return false;
    if (
      ["identity", "location", "prop", "start", "end"].includes(
        String(edge.role),
      ) &&
      expectedAssetType(source.kind) !== "image"
    )
      return false;
    children.add(edge.target);
  }
  const visiting = new Set<string>();
  const done = new Set<string>();
  function acyclic(id: string): boolean {
    if (visiting.has(id)) return false;
    if (done.has(id)) return true;
    visiting.add(id);
    for (const child of adjacency.get(id)!) if (!acyclic(child)) return false;
    visiting.delete(id);
    done.add(id);
    return true;
  }
  return [...adjacency.keys()].every(acyclic);
}

export function canConnect(graph: Graph, source: string, target: string) {
  return validateGraph({
    nodes: graph.nodes,
    edges: [...graph.edges, { source, target }],
  });
}
