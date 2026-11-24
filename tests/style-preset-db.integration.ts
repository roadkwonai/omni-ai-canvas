import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { GET, POST, PUT } from "../app/api/style-presets/route";
import { makeStyleDraft } from "../lib/style-preset-core";

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!url)
  throw new Error("마이그레이션을 적용한 Neon DB 연결 정보가 필요합니다.");
process.env.DATABASE_URL = url;
const sql = neon(url);
const createdIds: string[] = [];
const marker = `프리셋 통합 테스트 ${crypto.randomUUID()}`;
const base = "http://127.0.0.1:3000/api/style-presets";

function request(
  method: string,
  body?: unknown,
  origin = "http://127.0.0.1:3000",
) {
  return new Request(base, {
    method,
    headers: {
      host: "127.0.0.1:3000",
      origin,
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function main() {
  try {
    const draft = { ...makeStyleDraft("film"), name: marker };
    const invalid = await POST(
      request("POST", { draft: { ...draft, profileId: "unknown" } }),
    );
    assert.equal(invalid.status, 400);
    const crossOrigin = await POST(
      request("POST", { draft }, "https://example.com"),
    );
    assert.equal(crossOrigin.status, 403);
    const response = await POST(request("POST", { draft }));
    assert.equal(response.status, 201);
    const { preset } = await response.json();
    createdIds.push(preset.id);
    assert.equal(preset.version, 1);
    assert.deepEqual(preset.draft, draft);

    const copyResponse = await POST(request("POST", { draft }));
    const copy = (await copyResponse.json()).preset;
    createdIds.push(copy.id);
    assert.notEqual(copy.id, preset.id);
    const list = await (await GET(request("GET"))).json();
    assert.ok(
      list.presets.some((item: { id: string }) => item.id === preset.id),
    );
    assert.ok(list.presets.some((item: { id: string }) => item.id === copy.id));

    const update = { ...draft, concept: "새로운 콘셉트" };
    const competing = await Promise.all([
      PUT(request("PUT", { id: preset.id, version: 1, draft: update })),
      PUT(request("PUT", { id: preset.id, version: 1, draft: update })),
    ]);
    assert.deepEqual(competing.map((item) => item.status).sort(), [200, 409]);
    const saved = (await competing.find((item) => item.status === 200)!.json())
      .preset;
    assert.equal(saved.version, 2);
    assert.equal(saved.draft.concept, update.concept);
    const after = await (await GET(request("GET"))).json();
    assert.equal(
      after.presets.find((item: { id: string }) => item.id === copy.id).draft
        .concept,
      draft.concept,
    );
    console.log(
      "Neon 프리셋 생성, 복사, 목록, 동시 수정 충돌, 원본 보존 및 출처 검증 통과",
    );
  } finally {
    for (const id of createdIds)
      await sql`DELETE FROM drama_canvas.style_presets WHERE id = ${id} AND draft->>'name' = ${marker}`;
  }
}

main().catch((error) => {
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : "Neon 프리셋 통합 테스트를 완료하지 못했습니다.",
  );
  process.exitCode = 1;
});
