import type { Graph, Run } from "./types";

export const boardEdgeId = (source: string, target: string) =>
  JSON.stringify([source, target]);

export type BoardRunLabel = "queued" | "running" | "review" | "failed";

export function boardRunState(graph: Graph, runs: readonly Run[]) {
  const edges = new Set<string>();
  const nodes = new Map<string, BoardRunLabel>();
  const inputEdges = new Set(graph.edges.filter((edge) => edge.usage !== "guide").map((edge) => boardEdgeId(edge.source, edge.target)));
  const seen = new Set<string>();
  const targets = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const run of runs) {
    const nodeId = run.input.nodeId;
    const target = nodeId && targets.get(nodeId);
    if (!nodeId || !target) continue;
    if (run.status === "running") {
      for (const ref of run.input.references) {
        if (!ref.nodeId) continue;
        const id = boardEdgeId(ref.nodeId, nodeId);
        if (inputEdges.has(id)) edges.add(id);
      }
      nodes.set(nodeId, "running");
    } else if (!seen.has(nodeId)) {
      if (run.status !== "succeeded") nodes.set(nodeId, run.status);
      else if (run.result?.asset && run.result.asset.url !== target.asset?.url)
        nodes.set(nodeId, "review");
    }
    seen.add(nodeId);
  }
  return { edges, nodes };
}
