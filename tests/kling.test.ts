import assert from "node:assert/strict";
import { test } from "node:test";
import { klingArguments, klingCatalog, resultUrl } from "../lib/kling";

test("Kling 결과에서 신뢰할 수 있는 미디어 URL만 선택한다", () => {
  assert.equal(
    resultUrl({
      data: { works: [{ url: "https://p2-kling.klingai.com/result.mp4" }] },
    }),
    "https://p2-kling.klingai.com/result.mp4",
  );
  assert.equal(
    resultUrl({ works: [{ url: "https://klingai.com.evil.test/result.mp4" }] }),
    null,
  );
  assert.equal(
    resultUrl({ works: [{ url: "http://klingai.com/result.mp4" }] }),
    null,
  );
  assert.equal(resultUrl({ works: [] }), null);
});

test("Kling은 지원하지 않는 참조 역할을 무시하지 않는다", async () => {
  const { klingReferences } = await import("../lib/kling");
  const image = {
    type: "image" as const,
    url: "/sample/frame.webp",
    name: "frame.webp",
  };
  const input = {
    projectId: "p",
    requestId: "r",
    nodeId: "v",
    provider: "kling" as const,
    operation: "video" as const,
    prompt: "장면",
    references: [
      { title: "시작", body: "", role: "start" as const, asset: image },
    ],
  };
  assert.equal(klingReferences(input)[0], image);
  assert.throws(
    () =>
      klingReferences({
        ...input,
        references: [{ ...input.references[0], asset: undefined }],
      }),
    /이미지가 필요/,
  );
  assert.throws(
    () =>
      klingReferences({
        ...input,
        references: [
          { ...input.references[0], role: "motion", asset: undefined },
        ],
      }),
    /지원하지 않습니다/,
  );
  assert.throws(
    () =>
      klingReferences({
        ...input,
        references: [{ ...input.references[0], role: "end" }],
      }),
    /지원하지 않습니다/,
  );
  assert.throws(
    () =>
      klingReferences({
        ...input,
        references: [...input.references, input.references[0]],
      }),
    /하나/,
  );
});

test("Kling 실시간 선언에서 작업별 모델, 옵션과 명시적 미디어 슬롯을 읽는다", () => {
  const catalog = klingCatalog({
    ok: true,
    body: {
      availableModels: {
        text_to_image: { models: [{ model: "image-model", alias: "Image", arguments: [{ name: "prompt", required: true }, { name: "aspect_ratio", allowedValues: ["1:1", "9:16"], default: "1:1" }] }] },
        omni_ref_video: [{ model: "video-model", arguments: [{ name: "duration", allowed_values: ["5", "10"], required: true }], inputs: [{ name: "image_1", required: true }, { name: "video_1", required: false }] }],
        image_to_video: [{ model: "video-model", inputs: [{ name: "first_image", required: true }, { name: "tail_image", required: false }] }],
      },
    },
  });
  assert.deepEqual(catalog.models.map((model) => model.id), ["image-model", "video-model"]);
  const omni = catalog.profiles.find((profile) => profile.mode === "omni_ref_video")!;
  assert.deepEqual(omni.options[0].values, ["5", "10"]);
  assert.deepEqual(omni.slots.map((slot) => [slot.id, slot.type, slot.min]), [["image_1", "image", 1], ["video_1", "video", undefined]]);
  const frames = catalog.profiles.find((profile) => profile.mode === "image_to_video")!;
  assert.deepEqual(frames.slots[1].roles, ["end"]);
  assert.deepEqual(klingCatalog({ body: { available_models: {} } }).models, []);
});

test("Kling 요청은 모델과 옵션 및 이미지·영상 슬롯 이름을 CLI에 전달한다", () => {
  const profile = klingCatalog({ availableModels: { omni_ref_video: [{ model: "video-model", arguments: [{ name: "duration", allowedValues: ["5", "10"] }], inputs: [{ name: "image_1", required: true }, { name: "video_1" }] }] } }).profiles[0];
  const image = { type: "image" as const, url: "/sample/frame.webp", name: "frame.webp" };
  const video = { type: "video" as const, url: "/sample/preview.mp4", name: "preview.mp4" };
  const resolved = { options: { duration: "10" }, media: { image_1: [image], video_1: [video] } };
  const args = klingArguments(profile, resolved, "--장면");
  assert.deepEqual(args.slice(0, 5), ["omni_ref_video", "--model", "video-model", "--prompt=--장면", "--duration=10"]);
  assert.match(args[6], /^image_1=.*frame\.webp$/);
  assert.match(args[8], /^video_1=.*preview\.mp4$/);
  assert.throws(() => klingArguments(profile, { ...resolved, media: { video_1: [video] } }, "장면"), /필수 참조/);
  assert.throws(() => klingArguments(profile, { ...resolved, options: { duration: "20" } }, "장면"), /생성 설정/);
  assert.throws(() => klingArguments(profile, { ...resolved, media: { image_1: [video] } }, "장면"), /참조 슬롯/);
});

test("Kling은 출력 장수를 항상 한 개로 고정한다", () => {
  const catalog = klingCatalog({ availableModels: { text_to_image: [
    { model: "one", arguments: [{ name: "imageCount", default: "4", allowedValues: ["1", "4"] }] },
    { model: "many-only", arguments: [{ name: "imageCount", allowedValues: ["2", "4"] }] },
  ] } });
  assert.deepEqual(catalog.models.map((model) => model.id), ["one"]);
  const profile = catalog.profiles[0];
  assert.deepEqual(profile.options[0].values, ["1"]);
  assert.equal(profile.options[0].default, "1");
  assert.ok(klingArguments(profile, { options: {}, media: {} }, "장면").includes("--imageCount=1"));
  assert.throws(() => klingArguments(profile, { options: { imageCount: "4" }, media: {} }, "장면"), /생성 설정/);
});

test("Kling 카탈로그의 점이 들어간 모델 ID를 선택과 CLI 인수에 보존한다", () => {
  const model = "gemini-3.1-flash-image";
  const catalog = klingCatalog({
    body: { availableModels: { image_to_image: { models: [{
      model,
      alias: "Nano Banana 2",
      arguments: [{ name: "img_resolution", allowedValues: ["0.5k", "1k", "2k", "4k"] }],
      inputs: [{ name: "image_1", required: true }],
    }] } } },
  });
  assert.deepEqual(catalog.models, [{ id: model, label: "Nano Banana 2", operations: ["image"] }]);
  assert.deepEqual(catalog.profiles[0].options[0].values, ["0.5k", "1k", "2k", "4k"]);
  const image = { type: "image" as const, url: "/sample/frame.webp", name: "frame.webp" };
  const args = klingArguments(catalog.profiles[0], {
    options: { img_resolution: "2k" },
    media: { image_1: [image] },
  }, "빈 극장");
  assert.deepEqual(args.slice(0, 3), ["image_to_image", "--model", model]);
});
