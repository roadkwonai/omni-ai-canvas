import assert from "node:assert/strict";
import { test } from "node:test";
import { neonConfig } from "@neondatabase/serverless";
import {
  allowsPaidImageProvider,
  defaultWorkspaceSettings,
  parseWorkspaceSettings,
  type WorkspaceSettings,
} from "../lib/workspace-settings";
import { getWorkspaceSettings, requirePaidImageAccess } from "../lib/workspace-settings-store";
import { execute } from "../lib/runner";
import * as route from "../app/api/workspace-settings/route";

test("별도 과금 공급사 권한을 기본 이미지 모델과 독립적으로 정규화한다", () => {
  assert.equal(defaultWorkspaceSettings.defaults.image?.provider, "codex");
  const candidate = {
    ...structuredClone(defaultWorkspaceSettings),
    defaults: { image: { provider: "openai-image", model: "gpt-image-1.5" } },
  };
  assert.deepEqual(parseWorkspaceSettings(candidate)?.defaults.image, { provider: "codex", model: "" });
  assert.deepEqual(
    parseWorkspaceSettings({ ...candidate, paidImageProviders: ["openai-image"] })?.defaults.image,
    candidate.defaults.image,
  );
  assert.deepEqual(
    parseWorkspaceSettings({ ...candidate, defaults: { image: { provider: "codex", model: "wrong-model" } } })?.defaults.image,
    { provider: "codex", model: "" },
  );
  assert.equal(parseWorkspaceSettings({ ...candidate, paidImageProviders: ["openai-image", "openai-image"] }), null);
  assert.equal(parseWorkspaceSettings({ ...candidate, secret: "invalid" }), null);
  for (const provider of ["codex", "higgsfield", "kling", "topview"] as const)
    assert.equal(allowsPaidImageProvider(provider, []), true);
  for (const provider of ["openai-image", "gemini-image", "seedream"] as const) {
    assert.equal(allowsPaidImageProvider(provider, []), false);
    assert.equal(allowsPaidImageProvider(provider, [provider]), true);
  }
});

test("공통 설정은 버전 충돌을 막고 권한 철회 시 대기 실행을 차단한다", async () => {
  const originalUrl = process.env.DATABASE_URL;
  const originalFetch = neonConfig.fetchFunction;
  process.env.DATABASE_URL = "postgresql://test:password@localhost/test";
  let row: WorkspaceSettings | null = null;
  let databaseReads = 0;
  neonConfig.fetchFunction = async (_url: string | URL | Request, init?: RequestInit) => {
    databaseReads++;
    const { query, params } = JSON.parse(String(init?.body));
    if (query.includes("INSERT INTO drama_canvas.workspace_settings")) {
      if (!row) row = { version: 1, defaults: JSON.parse(params[0]), workspace: JSON.parse(params[1]), paidImageProviders: JSON.parse(params[2]) };
      else return result([]);
    } else if (query.includes("UPDATE drama_canvas.workspace_settings")) {
      if (!row || row.version !== Number(params[3])) return result([]);
      row = { version: row.version + 1, defaults: JSON.parse(params[0]), workspace: JSON.parse(params[1]), paidImageProviders: JSON.parse(params[2]) };
    }
    return result(row ? [row] : []);
  };
  function result(rows: WorkspaceSettings[]) {
    return new Response(JSON.stringify({
      fields: [
        { name: "version", dataTypeID: 23 },
        { name: "defaults", dataTypeID: 3802 },
        { name: "workspace", dataTypeID: 3802 },
        { name: "paid_image_providers", dataTypeID: 3802 },
      ],
      rows: rows.map((value) => [
        String(value.version), JSON.stringify(value.defaults),
        JSON.stringify(value.workspace), JSON.stringify(value.paidImageProviders),
      ]),
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  const request = (method: "GET" | "PUT", value?: WorkspaceSettings) =>
    new Request("http://localhost:3000/api/workspace-settings", {
      method,
      headers: { host: "localhost:3000", ...(value ? { "Content-Type": "application/json" } : {}) },
      ...(value ? { body: JSON.stringify(value) } : {}),
    });
  try {
    assert.deepEqual(await (await route.GET(request("GET"))).json(), { settings: defaultWorkspaceSettings });
    const first = { ...structuredClone(defaultWorkspaceSettings), paidImageProviders: ["openai-image" as const] };
    const concurrent = await Promise.all([route.PUT(request("PUT", first)), route.PUT(request("PUT", first))]);
    assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 409]);
    assert.equal((await getWorkspaceSettings()).version, 1);
    await requirePaidImageAccess("openai-image");
    const updated: WorkspaceSettings = { ...first, version: 1, paidImageProviders: [] };
    assert.equal((await route.PUT(request("PUT", updated))).status, 200);
    const readsBefore = databaseReads;
    await requirePaidImageAccess("codex");
    assert.equal(databaseReads, readsBefore);
    await assert.rejects(requirePaidImageAccess("openai-image"), /따로 결제하는 이미지 API/);
    await assert.rejects(execute({
      projectId: "project", requestId: "request", nodeId: "image",
      provider: "openai-image", operation: "image", prompt: "image", references: [],
    }), /따로 결제하는 이미지 API/);
  } finally {
    neonConfig.fetchFunction = originalFetch;
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  }
});

