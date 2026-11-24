import assert from "node:assert/strict";
import test from "node:test";
import {
  parseTripoRequest,
  tripoFileToken,
  tripoPayload,
  tripoRequest,
} from "../lib/tripo-tasks";
const id = "00000000-0000-4000-8000-000000000001";
test("Tripo 작업은 고정된 종류와 작업 번호, 버전에 맞는 프리셋을 허용한다", () => {
  const rig = parseTripoRequest({ action: "rig", input: id });
  assert.ok(rig);
  assert.deepEqual(tripoPayload(rig), {
    input: id,
    model: "v3.0-20260909",
    rig_type: "biped",
    spec: "mixamo",
  });
  assert.equal(
    parseTripoRequest({
      action: "retarget",
      input: id,
      animation: "https://other",
    }),
    null,
  );
  assert.equal(parseTripoRequest({ action: "rig", input: "../secret" }), null);
  assert.equal(parseTripoRequest({ action: "delete", input: id }), null);
  assert.ok(parseTripoRequest({ action: "rig-check", input: "file_ABC123" }));
  assert.equal(
    parseTripoRequest({
      action: "retarget",
      input: "file_ABC123",
      animation: "preset:walk",
    }),
    null,
  );
  assert.equal(
    tripoFileToken({ data: { file_token: "file_ABC123" } }),
    "file_ABC123",
  );
});

test("프로젝트 GLB는 공식 파일 API에 multipart로 전송한다", async (testContext) => {
  const previous = process.env.TRIPO_API_KEY;
  process.env.TRIPO_API_KEY = "fixture-test";
  testContext.after(() => {
    if (previous === undefined) delete process.env.TRIPO_API_KEY;
    else process.env.TRIPO_API_KEY = previous;
  });
  testContext.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "https://openapi.tripo3d.ai/v3/files");
    assert.equal(options.redirect, "error");
    const headers = new Headers(options.headers);
    assert.equal(headers.get("authorization"), "Bearer fixture-test");
    assert.equal(headers.has("content-type"), false);
    assert.ok(options.body instanceof FormData);
    assert.ok(options.body.get("file") instanceof File);
    return Response.json({ code: 0, data: { file_token: "file_TEST" } });
  });
  const form = new FormData();
  form.set("file", new Blob(["mock-glb"]), "model.glb");
  assert.equal(tripoFileToken(await tripoRequest("files", "POST", form)), "file_TEST");
});
