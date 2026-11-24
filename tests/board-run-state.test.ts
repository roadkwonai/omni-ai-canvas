import assert from "node:assert/strict";
import { test } from "node:test";
import { boardEdgeId, boardRunState } from "../lib/board-run-state";
import type { Asset, Graph, Run } from "../lib/types";

const graph: Graph = {
  nodes: [
    { id: "take", kind: "keyframe", title: "Take", body: "", x: 0, y: 0 },
  ],
  edges: [
    { source: "reference", target: "take" },
    { source: "guide", target: "take", usage: "guide" },
    { source: "unused", target: "take" },
  ],
};
const recordedAsset: Asset = { url: "/sample/portrait.webp", type: "image", name: "portrait.webp" };
function run(status: Run["status"], asset?: Asset): Run {
  return {
    id: status,
    input: {
      projectId: "project", requestId: "request", nodeId: "take",
      provider: "codex", operation: "image", prompt: "Edit",
      references: ["guide", "reference"].map((nodeId) => ({ nodeId, title: "", body: "" })),
    },
    status, result: asset ? { asset } : null, error: null, createdAt: "",
  };
}

test("대기 중에는 정적이고 실행 중에 사용한 입력선만 표시한다", () => {
  const queued = boardRunState(graph, [run("queued")]);
  assert.equal(queued.nodes.get("take"), "queued");
  assert.equal(queued.edges.size, 0);
  const running = boardRunState(graph, [run("running")]);
  assert.equal(running.nodes.get("take"), "running");
  assert.deepEqual([...running.edges], [boardEdgeId("reference", "take")]);
});

test("최근 결과가 채택되면 이전 실행의 실패나 후보를 표시하지 않는다", () => {
  assert.equal(boardRunState(graph, [run("succeeded", recordedAsset)]).nodes.get("take"), "review");
  const approved = { ...graph, nodes: [{ ...graph.nodes[0], asset: recordedAsset }] };
  assert.equal(boardRunState(approved, [run("succeeded", recordedAsset), run("failed")]).nodes.size, 0);
});
