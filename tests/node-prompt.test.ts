import assert from "node:assert/strict";
import test from "node:test";
import { clearStalePromptVersions } from "../lib/node-prompt";
import type { CanvasNode, Graph } from "../lib/types";

const node: CanvasNode = {
  id: "video", kind: "video", title: "영상", body: "Medium shot.", x: 0, y: 0,
  promptKorean: { text: "미디엄 숏." },
};
const previous: Graph = { nodes: [node], edges: [] };

test("영문만 바뀌면 이전 한국어 프롬프트를 지운다", () => {
  const next = { ...previous, nodes: [{ ...node, body: "Extreme close-up." }] };
  assert.equal(clearStalePromptVersions(previous, next).nodes[0].promptKorean, undefined);
  assert.equal(previous.nodes[0].promptKorean?.text, "미디엄 숏.");
});

test("두 버전을 적용한 편집은 같은 번역 문장도 새 쌍으로 보존한다", () => {
  const next = { ...previous, nodes: [{ ...node, body: "Medium shot", promptKorean: { text: "미디엄 숏." } }] };
  assert.equal(clearStalePromptVersions(previous, next), next);
});
