import assert from "node:assert/strict";
import { test } from "node:test";
import { applyReviewEdit, reviewEditState } from "../lib/director-review-apply";
import { parseDirectorReview, reviewPrompt } from "../lib/director-review";
import { sampleProject } from "../lib/sample";
import type { Run } from "../lib/types";

const graph = sampleProject.graph;
const original = graph.nodes.find((node) => node.asset)!;
const input: Run["input"] = {
  projectId: sampleProject.id,
  requestId: "request",
  nodeId: null,
  provider: "codex",
  operation: "plan",
  review: true,
  prompt: "시선 방향을 맞춰 줘",
  references: [
    {
      nodeId: original.id,
      title: original.title,
      body: original.body,
      kind: original.kind,
    },
  ],
};
const note = {
  nodeId: original.id,
  reason: "상대 인물의 방향을 유지한다.",
  body: "정우의 시선은 영사창 왼쪽 끝에 머문다.",
};
const review = {
  summary: "시선을 고정하면 다음 컷과 이어집니다.",
  notes: [note],
};
const run: Run = {
  id: "review",
  status: "succeeded",
  input,
  result: { review },
  error: null,
  createdAt: "2026-11-22T00:00:00Z",
};

test("감독 검토는 허용된 노드의 유효한 수정안만 반환한다", () => {
  assert.match(reviewPrompt(input), /필수 동작/);
  assert.deepEqual(parseDirectorReview(JSON.stringify(review), input), review);
  for (const notes of [
    [{ ...note, nodeId: "unseen" }],
    [note, note],
    [{ ...note, body: " " }],
  ])
    assert.throws(() =>
      parseDirectorReview(JSON.stringify({ ...review, notes }), input),
    );
  assert.deepEqual(
    parseDirectorReview(
      JSON.stringify({ ...review, notes: [{ ...note, body: original.body }] }),
      input,
    ).notes,
    [],
  );
});
test("검토 수정은 원본이 같을 때 해당 본문에만 적용하며 이후 수정을 보호한다", () => {
  const edited = applyReviewEdit(graph, run, note);
  assert.equal(edited.edges, graph.edges);
  assert.equal(
    edited.nodes.find((n) => n.id === original.id)?.asset,
    original.asset,
  );
  assert.equal(
    edited.nodes.find((n) => n.id !== original.id),
    graph.nodes.find((n) => n.id !== original.id),
  );
  assert.equal(applyReviewEdit(edited, run, note), edited);
  const newer = {
    ...graph,
    nodes: graph.nodes.map((n) =>
      n.id === original.id ? { ...n, body: "내가 고친 원고" } : n,
    ),
  };
  assert.equal(reviewEditState(newer, run, note), "conflict");
  assert.throws(() => applyReviewEdit(newer, run, note));
});
