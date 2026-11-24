import assert from "node:assert/strict";
import { test } from "node:test";
import {
  higgsfieldModelArguments,
  higgsfieldProfilesFromSchema,
} from "../lib/higgsfield-models";

const schema = {
  job_type: "seedance_2_5",
  display_name: "Seedance 2.5",
  type: "video",
  params: [
    { name: "prompt", type: "string", required: true },
    { name: "mode", type: "string", enum: ["t2v", "omni_reference", "video_edit", "video_extension"] },
    { name: "start_image", type: "object|null" },
    { name: "end_image", type: "object|null" },
    { name: "image_references", type: "array" },
    { name: "video_references", type: "array" },
    { name: "extension_mode", type: "string|null", enum: ["backward", "forward"] },
    { name: "duration", type: "integer", enum: ["5", "10"], default: 5 },
  ],
  rules: [{ cel: "size(params.video_references) <= 3" }],
};
const image = { type: "image" as const, name: "frame.png", url: "/sample/frame.webp" };
const video = { type: "video" as const, name: "ref.mp4", url: "/sample/preview.mp4" };

test("Higgsfield 모델 모드와 참조 슬롯을 실제 스키마로 분리한다", () => {
  const profiles = higgsfieldProfilesFromSchema(schema, "video");
  assert.deepEqual(profiles.map((profile) => profile.mode), ["t2v", "omni_reference", "video_edit", "video_extension"]);
  assert.deepEqual(profiles[0].slots, []);
  assert.equal(profiles[1].slots.find((slot) => slot.id === "video_references")?.max, 3);
  assert.equal(profiles[2].slots.find((slot) => slot.type === "video")?.min, 1);
  assert.equal(profiles[3].options.find((option) => option.id === "extension_mode")?.required, true);
  assert.deepEqual(profiles[0].options.find((option) => option.id === "duration")?.values, [5, 10]);
});

test("선택한 모델과 참조 역할을 쉘 해석 없이 CLI 인수로 전달한다", () => {
  const profile = higgsfieldProfilesFromSchema(schema, "video")[1];
  const args = higgsfieldModelArguments(profile, {
    options: { duration: 10 },
    media: { start_image: [image], video_references: [video] },
  }, "조용한 극장 $(example)");
  assert.equal(args[0], "seedance_2_5");
  assert.equal(args[1], "--prompt=조용한 극장 $(example)");
  assert.ok(args.includes("--duration=10"));
  assert.ok(args.includes("--start-image"));
  assert.ok(args.includes("--video-references"));
  assert.throws(() => higgsfieldModelArguments(profile, { options: { shell: true }, media: {} }, "x"));
  assert.throws(() => higgsfieldModelArguments(profile, { options: {}, media: { start_image: [video] } }, "x"));
});

test("단일 이미지 워크플로는 지원하는 파일 형식만 제공한다", () => {
  const [profile] = higgsfieldProfilesFromSchema({
    job_type: "gpt_image_2_6", display_name: "GPT", type: "image",
    params: [
      { name: "prompt", type: "string" },
      { name: "batch_size", type: "integer", default: 1 },
      { name: "image_references", type: "array" },
      { name: "output_format", type: "string", enum: ["png", "jpeg", "webp", "gif", "svg"], default: "png" },
    ],
  }, "image");
  assert.deepEqual(profile.options.find((option) => option.id === "output_format")?.values, ["png", "jpeg", "webp"]);
  assert.equal(profile.options.some((option) => option.id === "batch_size"), false);
});

test("필수 미디어와 지원하지 않는 필수 입력 및 출력 형식을 구분한다", () => {
  const requiredMedia = {
    job_type: "image_filter", display_name: "Image Filter", type: "image",
    params: [{ name: "image_references", type: "array", required: true }],
  };
  assert.equal(higgsfieldProfilesFromSchema(requiredMedia, "image")[0].slots[0].min, 1);
  assert.throws(() => higgsfieldProfilesFromSchema({
    ...requiredMedia,
    params: [{ name: "input_video", type: "object", required: true }],
  }, "image"), /필수 입력 'input_video'/);
  assert.throws(() => higgsfieldProfilesFromSchema({
    ...requiredMedia,
    params: [{ name: "output_format", type: "string", enum: ["prores", "exr"] }],
  }, "image"), /출력 형식/);
});

test("batch_size를 지원하는 모델은 한 장만 생성하도록 명시한다", () => {
  const profile = higgsfieldProfilesFromSchema({
    job_type: "gpt_image_2_6", display_name: "GPT", type: "image",
    params: [
      { name: "prompt", type: "string", required: true },
      { name: "batch_size", type: "integer", default: 1 },
    ],
  }, "image")[0];
  assert.ok(higgsfieldModelArguments(profile, { options: {}, media: {} }, "test").includes("--batch_size=1"));
});

test("Soul 이미지와 영상 음향 참조의 실제 입력을 노출한다", () => {
  const [soul] = higgsfieldProfilesFromSchema({
    job_type: "text2image_soul_v2", display_name: "Soul", type: "image",
    params: [{ name: "prompt", type: "string", required: true }, { name: "custom_reference_id", type: "string|null" }],
  }, "image");
  assert.equal(soul.supportsSoulId, true);
  assert.equal(soul.options.some((option) => option.id === "custom_reference_id"), false);
  const profile = higgsfieldProfilesFromSchema({
    ...schema,
    params: [...schema.params, { name: "audio_references", type: "array" }],
  }, "video")[1];
  const audio = { type: "audio" as const, name: "voice.wav", url: "/api/assets/12345678-1234-4123-8123-123456789abc.wav" };
  assert.equal(profile.slots.find((slot) => slot.id === "audio_references")?.type, "audio");
  assert.ok(higgsfieldModelArguments(profile, { options: {}, media: { audio_references: [audio] } }, "대사").includes("--audio-references"));
});
