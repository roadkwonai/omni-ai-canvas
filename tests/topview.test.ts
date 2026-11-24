import assert from "node:assert/strict";
import test from "node:test";
import { buildTopviewRequest, executeTopviewSession, parseTopviewProfiles } from "../lib/topview";
import { providerModelId } from "../lib/media-model-types";
import type { Asset, RunInput } from "../lib/types";

test("Topview 실시간 모델 설정에서 제출 모델과 옵션을 읽고 미지원 필수 입력을 거절한다", () => {
  const config = { data: { models: [{ submitModel: "model-1", displayName: "Model", requiredSubmitFields: ["model", "prompt", "resolution"], submitParameterOptions: { resolution: [720, 1080], aspectRatio: ["16:9", "9:16"] }, defaultSubmitParameters: { resolution: 720 } }, { submitModel: "unsupported", requiredSubmitFields: ["unknownRequiredField"] }] } };
  const profiles = parseTopviewProfiles(config, "model-1", "video", "omni_reference");
  assert.equal(profiles.length, 1);
  assert.deepEqual(profiles[0].options.find((option) => option.id === "resolution"), { id: "resolution", label: "해상도", type: "integer", values: [720, 1080], default: 720, required: true });
  assert.equal(profiles[0].requiresMedia, true);
  assert.deepEqual(parseTopviewProfiles(config, "unsupported", "video", "omni_reference"), []);
});

test("Topview 복합 참조는 업로드한 파일 식별자와 선택한 옵션으로 제출된다", async () => {
  const config = { models: [{ submitModel: "model-1", submitParameterOptions: { duration: [5, 10] } }] };
  const [profile] = parseTopviewProfiles(config, "model-1", "video", "omni_reference");
  const image: Asset = { url: "/sample/a.png", name: "a.png", type: "image" };
  const video: Asset = { url: "/sample/b.mp4", name: "b.mp4", type: "video" };
  const uploaded: Asset[] = [];
  const params = await buildTopviewRequest(profile, { options: { duration: 10 }, media: { inputImages: [image], inputVideos: [video] } }, "장면", "board", async (asset) => { uploaded.push(asset); return `file-${uploaded.length}`; });
  assert.deepEqual(params, { taskType: "omni_reference", model: "model-1", prompt: "장면", boardId: "board", duration: 10, inputImages: [{ fileId: "file-1", name: "Image1" }], inputVideos: [{ fileId: "file-2", name: "Video1" }] });
  assert.deepEqual(uploaded, [image, video]);
});

test("Topview의 공백이 있는 공식 모델 ID와 실제 이미지 입력 방식을 유지한다", async () => {
  const models = [
    { submitModel: "Seedance 2.5", inputModes: ["startEndFrame"] },
    { submitModel: "Kling 2.6", inputModes: ["singleImage"] },
    { submitModel: "Kling O3 Reference-to-Video", inputModes: ["multiImage"] },
  ].map((entry) => ({ ...entry, requiredSubmitFields: ["taskType", "model", "firstFrameFileId"] }));
  const profiles = models.map(({ submitModel }) =>
    parseTopviewProfiles({ models }, submitModel, "video", "image_to_video")[0],
  );
  assert.equal(providerModelId("topview", "Seedance 2.5"), true);
  assert.equal(providerModelId("kling", "Seedance 2.5"), false);
  assert.equal(providerModelId("topview", "GPT\nImage"), false);
  assert.deepEqual(profiles.map((p) => p.slots.map((slot) => slot.id)), [
    ["firstFrameFileId", "endFrameFileId"], ["firstFrameFileId"], ["referenceImageFileIds"],
  ]);
  const image: Asset = { url: "/sample/a.png", name: "a.png", type: "image" };
  const request = await buildTopviewRequest(profiles[2], {
    options: {}, media: { referenceImageFileIds: [image] },
  }, "장면", "board", async () => "file-1");
  assert.equal(request.model, "Kling O3 Reference-to-Video");
  assert.deepEqual(request.referenceImageFileIds, ["file-1"]);
  assert.equal(Object.hasOwn(request, "firstFrameFileId"), false);
});

test("Topview 생성 수량은 한 개로 제한하고 빈 미디어 슬롯은 보내지 않는다", async () => {
  const config = { models: [{ submitModel: "model-1", submitParameterOptions: { generatingCount: [1, 2, 4] }, defaultSubmitParameters: { generatingCount: 4 } }] };
  const [profile] = parseTopviewProfiles(config, "model-1", "video", "image_to_video");
  assert.deepEqual(profile.options[0].values, [1]);
  assert.equal(profile.options[0].default, 1);
  const image: Asset = { url: "/sample/a.png", name: "a.png", type: "image" };
  const params = await buildTopviewRequest(profile, { options: { generatingCount: 1 }, media: { firstFrameFileId: [image], endFrameFileId: [] } }, "장면", "board", async () => "file-1");
  assert.equal(params.generatingCount, 1);
  assert.equal(params.firstFrameFileId, "file-1");
  assert.equal(Object.hasOwn(params, "endFrameFileId"), false);
  await assert.rejects(buildTopviewRequest(profile, { options: { generatingCount: 4 }, media: {} }, "장면", "board", async () => "file-1"), /한 개/);
  const onlyMultiple = { models: [{ submitModel: "bad", submitParameterOptions: { generateCount: [2, 4] } }] };
  assert.deepEqual(parseTopviewProfiles(onlyMultiple, "bad", "image", "text_to_image"), []);
});

test("Topview 모의 MCP 실행은 제출 번호를 저장한 뒤 같은 번호로 결과를 조회한다", async () => {
  const [profile] = parseTopviewProfiles({ models: [{ submitModel: "video-1" }] }, "video-1", "video", "omni_reference");
  const input: RunInput = { provider: "topview", operation: "video", prompt: "장면", projectId: "project", requestId: "request", nodeId: null, references: [], model: "video-1" };
  const image: Asset = { url: "/sample/a.png", name: "a.png", type: "image" };
  const asset: Asset = { url: "/sample/result.mp4", name: "result.mp4", type: "video" };
  const events: string[] = [];
  const output = await executeTopviewSession(input, profile, { options: {}, media: { inputImages: [image], inputVideos: [] } }, "장면", async (id) => { events.push(`saved:${id}`); }, {
    upload: async () => "file-1",
    wait: async () => { events.push("wait"); },
    result: async (url) => { assert.equal(url, "https://cdn.topview.ai/output.mp4"); return asset; },
    call: async (name, req) => {
      events.push(name);
      if (name === "topview_list_boards") return { boards: [{ id: "board", isSystemDefault: true }] };
      if (name === "topview_generate_video") { assert.deepEqual(req.inputImages, [{ fileId: "file-1", name: "Image1" }]); return { taskId: "task-1" }; }
      assert.equal(name, "topview_query_task");
      assert.equal(req.taskId, "task-1");
      assert.equal(req.taskType, "omni_reference");
      return { status: "success", videos: [{ status: "success", filePath: "https://cdn.topview.ai/output.mp4" }] };
    },
  });
  assert.deepEqual(output, { asset });
  assert.deepEqual(events, ["topview_list_boards", "topview_generate_video", "saved:task-1", "wait", "topview_query_task"]);
});
