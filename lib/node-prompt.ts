import type { CanvasNode, Graph, Kind } from "./types";

const promptKinds = new Set<Kind>(["keyframe", "video", "referenceImage", "referenceVideo", "audioCue"]);

export type PromptVersions = { body: string; promptKorean?: { text: string } };
export type PromptLanguage = "en" | "ko";

export function isPromptNode(node: Pick<CanvasNode, "kind" | "imageEdit" | "imageOperation">): boolean {
  return promptKinds.has(node.kind) && !node.imageEdit && !node.imageOperation;
}

export function clearStalePromptVersions(previous: Graph, next: Graph): Graph {
  if (previous.nodes === next.nodes) return next;
  const paired = new Map(previous.nodes.filter(({ promptKorean }) => promptKorean).map((node) => [node.id, node]));
  if (paired.size === 0) return next;

  let changed = false;
  const nodes = next.nodes.map((node) => {
    const prior = paired.get(node.id);
    if (!prior || node.body === prior.body || node.promptKorean !== prior.promptKorean) return node;
    changed = true;
    return { ...node, promptKorean: undefined };
  });
  return changed ? { ...next, nodes } : next;
}
