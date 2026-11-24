import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptsTimelineEdit, transcriptSignature } from "../lib/timeline-edit";
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
