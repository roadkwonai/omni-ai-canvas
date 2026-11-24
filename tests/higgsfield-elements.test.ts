import test from "node:test";
import assert from "node:assert/strict";
import { parseElementRequest, resultData, validateElementToolSchema } from "../lib/higgsfield-elements";
const id = "00000000-0000-4000-8000-000000000001";
const media = { id, type: "media_input", url: "https://upload.higgsfield.ai/reference.png" };
test("참조 생성은 사용자 확인과 공식 HTTPS 이미지 UUID를 요구한다", () => {
  assert.ok(parseElementRequest({ confirmed: true, category: "character", medias: [media] }));
  assert.equal(parseElementRequest({ category: "character", medias: [media] }), null);
  assert.equal(parseElementRequest({ confirmed: true, category: "character", medias: [{ ...media, url: "https://attacker.example/test" }] }), null);
  assert.equal(parseElementRequest({ confirmed: true, category: "character", medias: [{ ...media, id: "../bad" }] }), null);
});
test("활성 MCP 도구가 확인 이미지의 호환 스키마를 제공해야 생성한다", () => {
  const schema = { inputSchema: { properties: { medias: { type: "array", items: { properties: { id: {}, url: {}, type: {} }, required: ["id", "url"] } } }, required: ["medias"] } };
  assert.equal(validateElementToolSchema(schema, true), true);
  assert.equal(validateElementToolSchema({ inputSchema: { properties: {}, required: [] } }, true), false);
  assert.equal(validateElementToolSchema({ inputSchema: { properties: {}, required: ["secret"] } }, false), false);
  assert.deepEqual(resultData({ content: [{ type: "text", text: '{"items":[]}' }] }), { items: [] });
  assert.throws(() => resultData({ isError: true, content: [] }));
});
