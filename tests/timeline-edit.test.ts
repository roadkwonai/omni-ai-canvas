import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptsTimelineEdit, discardTimelineAttempt, timelineKey, transcriptSignature } from "../lib/timeline-edit";
import type { TimelineSpec } from "../lib/timeline-spec";
import type { CanvasNode, Graph } from "../lib/types";
test("실패한 저장은 재시도하고 외부 변경은 거절한다", () => {
  assert.equal(acceptsTimelineEdit("old", "new", "new"), true);
  assert.equal(acceptsTimelineEdit("old", "other", "new"), false);
});
test("음향·길이·자막이 바뀌면 전사 제안을 무효화한다", () => {
  const data = {
    projectId: "p",
    track: {
      nodeId: "a",
      startFrame: 0,
      inFrame: 0,
      durationFrames: 30,
      gain: 1,
      fadeInFrames: 0,
      fadeOutFrames: 0,
    },
    assetUrl: "/a",
    words: [],
    frames: 30,
  };
  const signature = transcriptSignature(data);
  assert.notEqual(signature, transcriptSignature({ ...data, assetUrl: "/b" }));
  assert.notEqual(signature, transcriptSignature({ ...data, frames: 60 }));
  assert.notEqual(
    signature,
    transcriptSignature({
      ...data,
      words: [{ text: "변경", startFrame: 0, endFrame: 1 }],
    }),
  );
});

const created: TimelineSpec = {
  aspect: "16:9",
  clips: [{ nodeId: null, durationFrames: 90, inFrame: 0, transition: "cut", transitionFrames: 0 }],
  audio: [],
};
// JSONB는 같은 값을 키 순서를 바꿔 돌려준다.
const stored: TimelineSpec = {
  audio: [],
  clips: [{ inFrame: 0, nodeId: null, transition: "cut", durationFrames: 90, transitionFrames: 0 }],
  aspect: "16:9",
};
test("저장소가 키 순서를 바꿔도 같은 타임라인으로 본다", () => {
  assert.notEqual(JSON.stringify(created), JSON.stringify(stored));
  assert.equal(timelineKey(created), timelineKey(stored));
  assert.equal(acceptsTimelineEdit(timelineKey(created), timelineKey(stored), null), true);
  assert.notEqual(timelineKey(created), timelineKey({ ...stored, aspect: "9:16" }));
  assert.notEqual(timelineKey({ ...created, words: [{ text: "가", startFrame: 0, endFrame: 1 }, { text: "나", startFrame: 1, endFrame: 2 }] }),
    timelineKey({ ...created, words: [{ text: "나", startFrame: 1, endFrame: 2 }, { text: "가", startFrame: 0, endFrame: 1 }] }));
  assert.equal(timelineKey(undefined), null);
});
test("저장에 실패한 변경을 버리면 바꾼 노드만 이전 값으로 돌아간다", () => {
  const node = (id: string, title: string, timeline?: TimelineSpec): CanvasNode =>
    ({ id, kind: "previs", title, body: "", x: 0, y: 0, ...(timeline ? { timeline } : {}) });
  const original = { ...node("t", "프리비즈", stored), asset: { url: "/api/assets/a.mp4", type: "video" as const, name: "a.mp4" } };
  const other = node("other", "그사이 바뀐 노드");
  const graph: Graph = {
    nodes: [node("t", "프리비즈", { ...created, aspect: "9:16" }), other, node("lens", "새 렌즈 전환")],
    edges: [{ source: "other", target: "lens" }],
  };
  assert.deepEqual(discardTimelineAttempt(graph, new Map([["t", original], ["lens", null]])), { nodes: [original, other], edges: [] });
  assert.deepEqual(discardTimelineAttempt(graph, new Map([["t", null]])).nodes.map(({ id }) => id), ["other", "lens"]);
});
