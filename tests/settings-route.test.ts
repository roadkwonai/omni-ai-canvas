import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { GET, PUT } from "../app/api/settings/route";
import { POST } from "../app/api/settings/test/route";
import { readSecret } from "../lib/service-settings";

test("서버 설정에서 키를 저장·재조회해도 값은 응답에 나타나지 않는다", async () => {
  const previous = process.cwd();
  const root = await mkdtemp(path.join(tmpdir(), "scene-settings-route-"));
  const url = "http://127.0.0.1:3000/api/settings";
  const secret = "synthetic-credential-never-return";
  const request = (body?: object, origin = "http://127.0.0.1:3000") => new Request(url, {
    method: body ? "PUT" : "GET",
    headers: { host: "127.0.0.1:3000", origin, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  try {
    process.chdir(root);
    const saved = await PUT(request({ key: "GEMINI_API_KEY", value: secret }));
    assert.equal(saved.status, 200);
    assert.doesNotMatch(await saved.text(), new RegExp(secret));
    assert.equal(await readSecret("GEMINI_API_KEY"), secret);
    const check = await GET(request());
    const body = await check.text();
    assert.doesNotMatch(body, new RegExp(secret));
    assert.equal(JSON.parse(body).plans, undefined);
    assert.equal((await PUT(request({ provider: "claude", plan: "synthetic" }))).status, 400);
    assert.deepEqual(JSON.parse(body).keys.GEMINI_API_KEY, { configured: true, source: "local" });
    assert.equal((await PUT(request({ key: "GEMINI_API_KEY", value: null }, "https://example.com"))).status, 403);
    assert.equal(await readSecret("GEMINI_API_KEY"), secret);
    assert.equal((await PUT(request({ key: "GEMINI_API_KEY", value: null }))).status, 200);
    assert.notEqual(await readSecret("GEMINI_API_KEY"), secret);
  } finally {
    process.chdir(previous);
    await rm(root, { recursive: true, force: true });
  }
});

test("저장한 키만 공급사 읽기 전용 요청에 사용하고 응답에는 공급사 본문과 키를 담지 않는다", async (context) => {
  const previous = process.cwd();
  const root = await mkdtemp(path.join(tmpdir(), "scene-key-check-"));
  const first = "synthetic-first-key";
  const second = "synthetic-replacement-key";
  const options = { method: "POST", headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "content-type": "application/json" } };
  const request = (key: string) => new Request("http://127.0.0.1:3000/api/settings/test", { ...options, body: JSON.stringify({ key }) });
  const sent: string[] = [];
  context.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1");
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "error");
    const key = new Headers(init.headers).get("x-goog-api-key");
    assert.ok(key);
    sent.push(key);
    return Response.json({ models: [], secret: key }, { status: key === second ? 403 : 200 });
  });
  const update = (value: string | null) => PUT(new Request("http://127.0.0.1:3000/api/settings", { ...options, method: "PUT", body: JSON.stringify({ key: "GEMINI_API_KEY", value }) }));
  const previousKey = process.env.GEMINI_API_KEY;
  try {
    process.chdir(root);
    delete process.env.GEMINI_API_KEY;
    assert.equal((await update(first)).status, 200);
    assert.equal((await (await POST(request("GEMINI_API_KEY"))).json()).status, "connected");
    assert.equal((await update(second)).status, 200);
    const denied = await (await POST(request("GEMINI_API_KEY"))).text();
    assert.equal(JSON.parse(denied).status, "denied");
    assert.ok(!denied.includes(second));
    assert.equal((await update(null)).status, 200);
    assert.equal((await (await POST(request("GEMINI_API_KEY"))).json()).status, "missing");
    assert.equal((await POST(request("UNKNOWN_KEY"))).status, 400);
    assert.deepEqual(sent, [first, second]);
  } finally {
    process.chdir(previous);
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    await rm(root, { recursive: true, force: true });
  }
});
