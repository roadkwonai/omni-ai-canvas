import type { DirectorReviewNote, Graph, Run } from "./types";

export function reviewEditState(
  graph: Graph,
  run: Run,
  note: DirectorReviewNote,
): "ready" | "applied" | "conflict" {
  const original = run.input.references.find(
    (item) => item.nodeId === note.nodeId,
  );
  const current = graph.nodes.find((node) => node.id === note.nodeId);
  if (
    !run.input.review ||
    run.status !== "succeeded" ||
    !current ||
    !original ||
    current.title !== original.title ||
    current.kind !== original.kind
  )
    return "conflict";
  if (current.body === note.body) return "applied";
  return current.body === original.body ? "ready" : "conflict";
}

export function applyReviewEdit(
  graph: Graph,
  run: Run,
  note: DirectorReviewNote,
): Graph {
  const state = reviewEditState(graph, run, note);
  if (state === "conflict")
    throw new Error(
      "검토 이후 노드가 바뀌었습니다. 현재 내용으로 다시 검토해 주세요.",
    );
  if (state === "applied") return graph;
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === note.nodeId ? { ...node, body: note.body } : node,
    ),
  };
}
