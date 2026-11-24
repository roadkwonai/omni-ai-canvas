import assert from "node:assert/strict";
import test from "node:test";
import type { MediaProfile } from "../lib/media-model-types";
import { parseMediaSelection, resolveMedia } from "../lib/media-request";
import type { Asset, RunInput } from "../lib/types";

const still: Asset = { type: "image", url: "/sample/test.png", name: "test.png" };
const end: Asset = { type: "image", url: "/sample/end.png", name: "end.png" };
const clip: Asset = { type: "video", url: "/sample/test.mp4", name: "test.mp4" };
const profile: MediaProfile = {
  model: "vendor-model",
  mode: "omni",
  label: "복합 참조",
  operation: "video",
  options: [
    { id: "duration", label: "영상 길이", type: "integer", values: [5, 10], required: true, default: 5 },
    { id: "sound", label: "오디오", type: "boolean" },
  ],
  slots: [
    { id: "start", label: "시작 프레임", type: "image", min: 1, max: 1, roles: ["start"] },
    { id: "end", label: "끝 프레임", type: "image", max: 1, roles: ["end"] },
    { id: "clips", label: "영상", type: "video", max: 1, roles: ["motion"] },
    { id: "images", label: "참조 이미지", type: "image", max: 3 },
  ],
};
const base: RunInput = {
  projectId: "p",
  requestId: "r",
  nodeId: "target",
  provider: "kling",
  operation: "video",
  model: "vendor-model",
  prompt: "천천히 줌인",
  references: [
    { title: "업로드한 영상", body: "", asset: clip, role: "motion", attachmentId: "clip" },
    { title: "첫 장면", body: "설정", asset: still, role: "start", nodeId: "start" },
    { title: "마지막 장면", body: "", asset: end, attachmentId: "last" },
  ],
  media: { mode: "omni", options: { sound: false }, assignments: { "attachment:last": "end" } },
};

test("모델 옵션과 실제 참조를 입력 슬롯에 연결하고 기본값과 false를 보존한다", () => {
  const selected = resolveMedia(profile, base);
  assert.deepEqual(selected, {
    options: { duration: 5, sound: false },
    media: { start: [still], end: [end], clips: [clip], images: [] },
  });
  const automatic = resolveMedia(profile, { ...base, media: { mode: "omni", options: {} } });
  assert.deepEqual(automatic.media.end, []);
  assert.deepEqual(automatic.media.images, [end]);
});

test("지원하지 않는 옵션·누락된 필수 참조·유효하지 않은 슬롯을 제출 전에 거절한다", () => {
  assert.throws(() => resolveMedia(profile, { ...base, media: { mode: "omni", options: { duration: 7 } } }), /영상 길이/);
  assert.throws(() => resolveMedia(profile, { ...base, media: { mode: "omni", options: { watermark: false } } }), /지원하는 옵션/);
  assert.throws(() => resolveMedia(profile, { ...base, media: { mode: "omni", options: {}, assignments: { "attachment:last": "clips" } } }), /입력 슬롯/);
  assert.throws(() => resolveMedia(profile, { ...base, references: [{ title: "빈 시작", body: "", role: "start" }] }), /미디어를 먼저/);
  assert.throws(() => resolveMedia(profile, { ...base, references: [], media: { mode: "omni", options: {} } }), /필요한 참조/);
  assert.throws(() => resolveMedia(profile, { ...base, references: [] }), /참조 목록/);
});

test("연결된 노드를 이 실행에서 본문만 쓰도록 지정할 수 있다", () => {
  const selection = parseMediaSelection({ mode: "t2v", options: {}, assignments: { "node:start": "$text" } });
  const result = resolveMedia(
    { ...profile, mode: "t2v", slots: [] },
    { ...base, media: selection, references: [base.references[1]] },
  );
  assert.deepEqual(result.media, {});
  const pendingFrame = { ...base.references[1], asset: undefined };
  assert.deepEqual(resolveMedia(
    { ...profile, mode: "t2v", slots: [] },
    { ...base, media: selection, references: [pendingFrame] },
  ).media, {});
  assert.throws(() => parseMediaSelection({ mode: "t2v", options: {}, assignments: { "attachment:last": "$text" } }), /입력 슬롯/);
});
