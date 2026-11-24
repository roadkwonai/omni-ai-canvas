import type { TimelineAudio, TimelineSpec, TimelineWord } from "./timeline-spec";
import type { CanvasNode, Graph } from "./types";

/** JSONB는 키 순서를 바꿔 돌려주므로 순서와 빈 자막을 맞춰 비교한다. */
export function timelineKey(spec: TimelineSpec | undefined): string | null {
  if (!spec) return null;
  const value = { ...spec, words: spec.words?.length ? spec.words : undefined };
  return JSON.stringify(value, (_, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : 1)) : item);
}

/** 저장을 시도하기 전 노드(없던 노드는 null)로 되돌린다. */
export function discardTimelineAttempt(graph: Graph, before: ReadonlyMap<string, CanvasNode | null>): Graph {
  const added = (id: string) => before.get(id) === null;
  return {
    ...graph,
    nodes: graph.nodes.flatMap((node) => added(node.id) ? [] : [before.get(node.id) ?? node]),
    edges: graph.edges.filter(({ source, target }) => !added(source) && !added(target)),
  };
}

export function acceptsTimelineEdit(
  baseline: string | null,
  current: string | null,
  attempted: string | null,
) {
  return current === baseline || (attempted !== null && current === attempted);
}

export function transcriptSignature(value: {
  projectId: string;
  track: TimelineAudio | undefined;
  assetUrl: string | undefined;
  words: TimelineWord[];
  frames: number;
}) {
  return JSON.stringify(value);
}
