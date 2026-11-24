import { isAsset } from "./asset-shape";
import { validateGraph } from "./graph";
import { TIMELINE_MAX_CLIPS, TIMELINE_MAX_FRAMES, validateTimeline, type TimelineSpec } from "./timeline-spec";
import type { Asset, CanvasNode, Graph } from "./types";

export const LENS_MIN_FRAMES = 12;
export const LENS_MAX_FRAMES = 60;
export const LENS_MAX_ANCHOR_CHECKPOINTS = 16;

export type LensPoint = { x: number; y: number };
export type LensMask = { x: number; y: number; width: number; height: number; angle?: number; outline?: LensPoint[] };
export type LensCorrection = { frame: number; outline: LensPoint[] };
export type LensAnchorCheckpoint = { sourceFrame: number; outline: LensPoint[] };
export type LensAnchorTransfer = { mask: LensMask; corrections: LensCorrection[]; needsAdjustment?: true; interruptedFrame?: number };
export type LensTransitionRecipe = {
  version: 1;
  aspect: TimelineSpec["aspect"];
  frames: number;
  outgoing: { nodeId: string; asset: Asset; startFrame: number };
  incoming: { nodeId: string; asset: Asset; startFrame: number };
  mask: LensMask;
  corrections: LensCorrection[];
  anchorCheckpoints?: LensAnchorCheckpoint[];
};
export type LensTransitionSource = Pick<LensTransitionRecipe, "version" | "aspect" | "frames" | "outgoing" | "incoming">;

export type LensReview = {
  frames: { frame: number; sourceFrame: number; outline: LensPoint[]; image: string; needsCorrection?: boolean }[];
  minimumConfidence: number;
};
export type LensTracking = {
  minimumConfidence: number;
  trackedFrames: number;
  finalCenter?: LensPoint;
  finalOutline?: LensPoint[];
};
export type LensTransitionResult = {
  asset: Asset;
  tracking: LensTracking;
  recipe?: LensTransitionRecipe;
  transitionId?: string;
  cutIndex: number;
  frames: number;
  version: number;
};

function cross(a: LensPoint, b: LensPoint, c: LensPoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function intersects(a: LensPoint, b: LensPoint, c: LensPoint, d: LensPoint) {
  const epsilon = 1e-8;
  const [abC, abD, cdA, cdB] = [cross(a, b, c), cross(a, b, d), cross(c, d, a), cross(c, d, b)];
  if (abC * abD < 0 && cdA * cdB < 0) return true;
  function onEdge(p: LensPoint, q: LensPoint, target: LensPoint, distance: number) {
    return Math.abs(distance) < epsilon &&
      target.x >= Math.min(p.x, q.x) - epsilon && target.x <= Math.max(p.x, q.x) + epsilon &&
      target.y >= Math.min(p.y, q.y) - epsilon && target.y <= Math.max(p.y, q.y) + epsilon;
  }
  return onEdge(a, b, c, abC) || onEdge(a, b, d, abD) || onEdge(c, d, a, cdA) || onEdge(c, d, b, cdB);
}

export function isLensPoint(value: unknown): value is LensPoint {
  if (!value || typeof value !== "object") return false;
  const { x, y } = value as LensPoint;
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1;
}

export function isLensOutline(value: unknown): value is LensPoint[] {
  if (!Array.isArray(value) || value.length < 5 || value.length > 32 || !value.every(isLensPoint)) return false;
  const points: LensPoint[] = value;
  let doubleArea = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.001) return false;
    doubleArea += a.x * b.y - a.y * b.x;
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      if (intersects(a, b, points[j], points[(j + 1) % points.length])) return false;
    }
  }
  return Math.abs(doubleArea) >= 0.0004;
}

export function isLensMask(value: unknown): value is LensMask {
  if (!value || typeof value !== "object") return false;
  const { x, y, width, height, angle, outline } = value as LensMask;
  return [x, y, width, height].every(Number.isFinite) &&
    (angle === undefined || (Number.isFinite(angle) && angle >= -90 && angle <= 90)) &&
    (outline === undefined || isLensOutline(outline)) && x >= 0 && y >= 0 &&
    width >= 0.015 && height >= 0.015 && x + width <= 1.000001 && y + height <= 1.000001;
}

export function isLensCorrections(value: unknown, frames: number, mask: LensMask): value is LensCorrection[] {
  if (!Array.isArray(value) || value.length >= Math.ceil(frames / 2)) return false;
  const indices = new Set<number>();
  return value.every((correction) => {
    if (!correction || !Number.isSafeInteger(correction.frame) || correction.frame < 1 ||
      correction.frame >= Math.ceil(frames / 2) || indices.has(correction.frame) ||
      !isLensOutline(correction.outline) || correction.outline.length !== mask.outline?.length) return false;
    indices.add(correction.frame);
    return true;
  });
}

export function isLensAnchorCheckpoints(value: unknown): value is LensAnchorCheckpoint[] {
  if (!Array.isArray(value) || value.length > LENS_MAX_ANCHOR_CHECKPOINTS) return false;
  const frames = new Set<number>();
  return value.every((checkpoint) => {
    if (!checkpoint || !Number.isSafeInteger(checkpoint.sourceFrame) || checkpoint.sourceFrame < 0 ||
        checkpoint.sourceFrame > TIMELINE_MAX_FRAMES + LENS_MAX_FRAMES || frames.has(checkpoint.sourceFrame) ||
        !isLensOutline(checkpoint.outline)) return false;
    frames.add(checkpoint.sourceFrame);
    return true;
  });
}

export function isLensTransitionRecipe(value: unknown): value is LensTransitionRecipe {
  if (!value || typeof value !== "object") return false;
  const item = value as LensTransitionRecipe;
  if (item.version !== 1 || !["16:9", "9:16", "1:1"].includes(item.aspect) ||
      !Number.isInteger(item.frames) || item.frames < LENS_MIN_FRAMES || item.frames > LENS_MAX_FRAMES ||
      !isLensMask(item.mask) || !isLensCorrections(item.corrections, item.frames, item.mask) ||
      (item.anchorCheckpoints !== undefined && !isLensAnchorCheckpoints(item.anchorCheckpoints))) return false;
  return [item.outgoing, item.incoming].every((source) => source && typeof source.nodeId === "string" &&
    /^[A-Za-z0-9_-]{1,80}$/.test(source.nodeId) && isAsset(source.asset) && source.asset.type === "video" &&
    Number.isInteger(source.startFrame) && source.startFrame >= 0 && source.startFrame <= 12600);
}

function sameLensSources(a: LensTransitionSource, b: LensTransitionSource) {
  return a.frames === b.frames && a.aspect === b.aspect && (["outgoing", "incoming"] as const).every((side) =>
    a[side].nodeId === b[side].nodeId && a[side].startFrame === b[side].startFrame &&
    a[side].asset.type === b[side].asset.type && a[side].asset.url === b[side].asset.url &&
    a[side].asset.name === b[side].asset.name);
}

export function remapLensTransitionRecipe(recipe: LensTransitionRecipe, ids: ReadonlyMap<string, string>): LensTransitionRecipe {
  return {
    ...recipe,
    outgoing: { ...recipe.outgoing, nodeId: ids.get(recipe.outgoing.nodeId) ?? recipe.outgoing.nodeId },
    incoming: { ...recipe.incoming, nodeId: ids.get(recipe.incoming.nodeId) ?? recipe.incoming.nodeId },
  };
}

export function lensTransitionRecipe(graph: Graph, timeline: TimelineSpec, cutIndex: number, frames: number,
  mask: LensMask, corrections: LensCorrection[]): LensTransitionRecipe | null {
  const pair = resolveLensTransition(graph, timeline, cutIndex, frames);
  const outgoingId = timeline.clips[cutIndex - 1]?.nodeId;
  const incomingId = timeline.clips[cutIndex]?.nodeId;
  if (!pair || !outgoingId || !incomingId || !isLensMask(mask) || !isLensCorrections(corrections, frames, mask)) return null;
  return {
    version: 1, aspect: timeline.aspect, frames,
    outgoing: { nodeId: outgoingId, asset: structuredClone(pair.outgoing), startFrame: pair.outgoingStart },
    incoming: { nodeId: incomingId, asset: structuredClone(pair.incoming), startFrame: pair.incomingStart },
    mask: structuredClone(mask), corrections: structuredClone(corrections),
  };
}

function resolvePair(graph: Graph, spec: TimelineSpec, cutIndex: number) {
  if (!Number.isSafeInteger(cutIndex) || cutIndex < 1 || spec.clips.length >= TIMELINE_MAX_CLIPS) return null;
  const first = spec.clips[cutIndex - 1];
  const second = spec.clips[cutIndex];
  const outgoing = graph.nodes.find(({ id }) => id === first?.nodeId);
  const incoming = graph.nodes.find(({ id }) => id === second?.nodeId);
  if (!first || !second || second.transition !== "cut" ||
      outgoing?.asset?.type !== "video" || incoming?.asset?.type !== "video") return null;
  const outgoingCapacity = first.durationFrames - 1 - first.transitionFrames;
  const incomingCapacity = second.durationFrames - 1 - (spec.clips[cutIndex + 1]?.transitionFrames ?? 0);
  const maxFrames = Math.min(LENS_MAX_FRAMES, 2 * outgoingCapacity, 2 * incomingCapacity + 1);
  if (maxFrames < LENS_MIN_FRAMES) return null;
  return { first, second, outgoing, incoming, maxFrames };
}

export function lensCutPairs(graph: Graph, spec: TimelineSpec) {
  if (!validateTimeline(spec)) return [];
  return spec.clips.flatMap((_, cutIndex) => {
    const pair = resolvePair(graph, spec, cutIndex);
    return pair ? [{ cutIndex, outgoingTitle: pair.outgoing.title, incomingTitle: pair.incoming.title, maxFrames: pair.maxFrames }] : [];
  });
}

export function resolveLensTransition(graph: Graph, timeline: TimelineSpec, cutIndex: number, frames: number) {
  if (!validateTimeline(timeline) || !Number.isSafeInteger(frames) || frames < LENS_MIN_FRAMES) return null;
  const pair = resolvePair(graph, timeline, cutIndex);
  if (!pair || frames > pair.maxFrames) return null;
  const outgoingFrames = Math.ceil(frames / 2);
  const incomingFrames = frames - outgoingFrames;
  return {
    outgoing: pair.outgoing.asset!,
    incoming: pair.incoming.asset!,
    outgoingStart: pair.first.inFrame + pair.first.durationFrames - outgoingFrames,
    incomingStart: pair.second.inFrame,
    outgoingFrames,
    incomingFrames,
  };
}

export function insertLensTransition(graph: Graph, timelineId: string, result: LensTransitionResult, transitionId: string): Graph {
  const edit = graph.nodes.find(({ id, kind }) => id === timelineId && kind === "previs");
  const timeline = edit?.timeline;
  const { cutIndex, frames, asset } = result;
  const selected = timeline && resolveLensTransition(graph, timeline, cutIndex, frames);
  if (!edit || !timeline || !selected || !isAsset(asset) || asset.type !== "video")
    throw new Error("전환을 적용할 두 테이크 또는 타임라인이 바뀌었습니다.");
  if (result.recipe) {
    const expected = lensTransitionRecipe(graph, timeline, cutIndex, frames, result.recipe.mask, result.recipe.corrections);
    if (!expected || !isLensTransitionRecipe(result.recipe) || !sameLensSources(expected, result.recipe))
      throw new Error("렌즈 전환 원본 또는 설정이 변경됐습니다.");
  }
  const clips = [...timeline.clips];
  const first = clips[cutIndex - 1], second = clips[cutIndex];
  const updated = {
    ...timeline,
    clips: [
      ...clips.slice(0, cutIndex - 1),
      { ...first, durationFrames: first.durationFrames - selected.outgoingFrames },
      { nodeId: transitionId, durationFrames: frames, inFrame: 0, transition: "cut" as const, transitionFrames: 0 },
      { ...second, inFrame: second.inFrame + selected.incomingFrames, durationFrames: second.durationFrames - selected.incomingFrames },
      ...clips.slice(cutIndex + 1),
    ],
  };
  const outgoing = graph.nodes.find(({ id }) => id === first.nodeId)!;
  const incoming = graph.nodes.find(({ id }) => id === second.nodeId)!;
  const x = edit.x <= 99_660 ? edit.x + 340 : edit.x - 340;
  let y = edit.y;
  while (graph.nodes.some((node) => Math.abs(node.x - x) < 275 && Math.abs(node.y - y) < 240))
    y += edit.y > 60_000 ? -300 : 300;
  const transition: CanvasNode = {
    id: transitionId, kind: "video", title: `렌즈 전환 · 컷 ${cutIndex} → ${cutIndex + 1}`,
    body: `${outgoing.title} → ${incoming.title}\n앞 테이크의 끝과 뒤 테이크의 시작을 ${frames}프레임으로 합성했습니다.`,
    asset, x, y, ...(result.recipe ? { lensTransition: structuredClone(result.recipe) } : {}),
  };
  const sources = new Set([outgoing.id, incoming.id]);
  const next: Graph = {
    nodes: [...graph.nodes.map((node) => node.id === timelineId ? { ...node, timeline: updated, asset: undefined } : node), transition],
    edges: [
      ...graph.edges,
      ...[...sources].map((source) => ({ source, target: transitionId, usage: "guide" as const })),
      { source: transitionId, target: timelineId },
    ],
  };
  if (!validateGraph(next)) throw new Error("타임라인의 컷 수와 전환 경계를 확인해 주세요.");
  return next;
}


const legacyLensFrameLine = /^앞 테이크의 끝과 뒤 테이크의 시작을 (\d+)프레임으로 합성했습니다\.$/m;

export function isLegacyLensTransitionNode(node: CanvasNode): boolean {
  return node.kind === "video" && !node.lensTransition && legacyLensFrameLine.test(node.body);
}

export function legacyLensTransitionFrames(node: CanvasNode): number | null {
  if (!isLegacyLensTransitionNode(node)) return null;
  const frames = Number(node.body.match(legacyLensFrameLine)?.[1]);
  return Number.isInteger(frames) && frames >= LENS_MIN_FRAMES && frames <= LENS_MAX_FRAMES ? frames : null;
}

export function resolveLegacyLensTransition(
  graph: Graph, timeline: TimelineSpec, clipIndex: number, transitionId?: string,
): LensTransitionSource | null {
  if (!validateTimeline(timeline) || !Number.isInteger(clipIndex) || clipIndex < 1) return null;
  const clip = timeline.clips[clipIndex], left = timeline.clips[clipIndex - 1], right = timeline.clips[clipIndex + 1];
  if (!clip || !left || !right || (transitionId && clip.nodeId !== transitionId)) return null;
  const transition = graph.nodes.find(n => n.id === clip.nodeId);
  const before = graph.nodes.find(n => n.id === left.nodeId);
  const after = graph.nodes.find(n => n.id === right.nodeId);
  const frames = transition && legacyLensTransitionFrames(transition);
  if (!transition || !frames || transition.asset?.type !== "video" || !isAsset(transition.asset) ||
      clip.inFrame !== 0 || clip.durationFrames !== frames || clip.transition !== "cut" ||
      right.transition !== "cut" || !before?.asset || before.asset.type !== "video" ||
      !after?.asset || after.asset.type !== "video" || !isAsset(before.asset) || !isAsset(after.asset)) return null;
  const incomingStart = right.inFrame - Math.floor(frames / 2);
  const outgoingStart = left.inFrame + left.durationFrames;
  if (incomingStart < 0 || outgoingStart > 12600) return null;
  const videos = new Set(graph.nodes.filter((node) => node.asset?.type === "video").map(({ id }) => id));
  const sources = new Set(graph.edges.filter((edge) => edge.target === transition.id && edge.usage === "guide" &&
    videos.has(edge.source)).map((edge) => edge.source));
  const expected = new Set([before.id, after.id]);
  if (sources.size !== expected.size || [...expected].some(id => !sources.has(id))) return null;
  return {
    version: 1, aspect: timeline.aspect, frames,
    outgoing: { nodeId: before.id, asset: structuredClone(before.asset), startFrame: outgoingStart },
    incoming: { nodeId: after.id, asset: structuredClone(after.asset), startFrame: incomingStart },
  };
}

export type LensStartFrames = { outgoingStart: number; incomingStart: number };
export type ManualLensSources = LensStartFrames & { outgoingId: string; incomingId: string };

export function isLensStartFrames(value: unknown): value is LensStartFrames {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const { outgoingStart, incomingStart } = value as LensStartFrames;
  return [outgoingStart, incomingStart].every((frame) =>
    Number.isSafeInteger(frame) && frame >= 0 && frame <= TIMELINE_MAX_FRAMES);
}

export function withLensStartFrames(source: LensTransitionSource, starts: LensStartFrames): LensTransitionSource {
  return {
    version: source.version,
    aspect: source.aspect,
    frames: source.frames,
    outgoing: { nodeId: source.outgoing.nodeId, asset: structuredClone(source.outgoing.asset), startFrame: starts.outgoingStart },
    incoming: { nodeId: source.incoming.nodeId, asset: structuredClone(source.incoming.asset), startFrame: starts.incomingStart },
  };
}

export function isManualLensSources(value: unknown): value is ManualLensSources {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const selection = value as ManualLensSources;
  return [selection.outgoingId, selection.incomingId].every((id) =>
    typeof id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(id)) &&
    isLensStartFrames(selection);
}

export function resolveManualLegacyLensTransition(
  graph: Graph, timeline: TimelineSpec, clipIndex: number, transitionId: string, selection: ManualLensSources,
): LensTransitionSource | null {
  if (!validateTimeline(timeline) || !Number.isInteger(clipIndex) || clipIndex < 0 ||
      timeline.clips[clipIndex]?.nodeId !== transitionId || !isManualLensSources(selection) ||
      selection.outgoingId === transitionId || selection.incomingId === transitionId) return null;
  const target = graph.nodes.find((node) => node.id === transitionId);
  const before = graph.nodes.find((node) => node.id === selection.outgoingId);
  const after = graph.nodes.find((node) => node.id === selection.incomingId);
  const frames = target && legacyLensTransitionFrames(target);
  if (!target || !frames || target.asset?.type !== "video" || !isAsset(target.asset) ||
      before?.asset?.type !== "video" || !isAsset(before.asset) ||
      after?.asset?.type !== "video" || !isAsset(after.asset) ||
      timeline.clips.some((clip) => clip.nodeId === transitionId && clip.inFrame + clip.durationFrames > frames) ||
      graph.nodes.some((node) => node.timeline?.clips.some((clip) =>
        clip.nodeId === transitionId && clip.inFrame + clip.durationFrames > frames))) return null;
  return {
    version: 1, aspect: timeline.aspect, frames,
    outgoing: { nodeId: before.id, asset: structuredClone(before.asset), startFrame: selection.outgoingStart },
    incoming: { nodeId: after.id, asset: structuredClone(after.asset), startFrame: selection.incomingStart },
  };
}

export function updateLensTransition(graph: Graph, timelineId: string, result: LensTransitionResult, transitionId: string,
  manualSources?: ManualLensSources, sourceStarts?: LensStartFrames): Graph {
  const edit = graph.nodes.find((node) => node.id === timelineId && node.kind === "previs");
  const existing = graph.nodes.find((node) => node.id === transitionId && node.kind === "video");
  const source = existing?.lensTransition
    ? manualSources || (sourceStarts && !isLensStartFrames(sourceStarts)) ? null
      : sourceStarts ? withLensStartFrames(existing.lensTransition, sourceStarts) : existing.lensTransition
    : edit?.timeline && !sourceStarts ? manualSources
      ? resolveManualLegacyLensTransition(graph, edit.timeline, result.cutIndex, transitionId, manualSources)
      : resolveLegacyLensTransition(graph, edit.timeline, result.cutIndex, transitionId)
    : null;
  const recipe = result.recipe;
  if (!edit?.timeline || !existing || !source || !recipe || !isLensTransitionRecipe(recipe) ||
      !isAsset(result.asset) || result.asset.type !== "video" || edit.timeline.clips[result.cutIndex]?.nodeId !== transitionId ||
      result.frames !== recipe.frames || (result.transitionId !== undefined && result.transitionId !== transitionId) ||
      !sameLensSources(recipe, source))
    throw new Error("수정할 렌즈 전환 또는 원본 정보가 변경됐습니다.");
  const next: Graph = {
    ...graph,
    nodes: graph.nodes.map((node) => node.id === transitionId
      ? { ...node, asset: result.asset, lensTransition: structuredClone(recipe) }
      : node.timeline?.clips.some((clip) => clip.nodeId === transitionId) ? { ...node, asset: undefined } : node),
  };
  if (!validateGraph(next)) throw new Error("렌즈 전환을 저장하지 못했습니다.");
  return next;
}
