import type { CanvasNode, Kind } from "./types";

const documentKinds = new Set<Kind>(["brief", "scenario", "script", "scene", "shot", "character", "note"]);

export type NodeDocument = Pick<CanvasNode, "title" | "body">;

export function isDocumentNode(node: Pick<CanvasNode, "kind">): boolean {
  return documentKinds.has(node.kind);
}
