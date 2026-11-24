import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSoulOnce, parseRegistration, soulFromProvider, voicesFromProvider } from "../lib/character-registration";

const id = "e2a2d2e6-9ed2-59cd-82af-feaa27f8a678";
const images = Array.from({ length: 5 }, (_, i) => ({
  url: `/api/assets/0000000${i}-0000-4000-8000-000000000000.png`, type: "image", name: `${i}.png`,
}));

test("Soul 등록은 명시적 확인과 서로 다른 로컬 이미지 5~20장이 필요하다", () => {
  const input = { nodeId: "character-1", name: "인물", variant: "soul_2", images, confirmed: true };
  assert.ok(parseRegistration(input));
  assert.equal(parseRegistration({ ...input, confirmed: false }), null);
  assert.equal(parseRegistration({ ...input, images: images.slice(0, 4) }), null);
  assert.equal(parseRegistration({ ...input, images: [...images.slice(0, 4), images[0]] }), null);
  assert.equal(parseRegistration({ ...input, images: [...images.slice(0, 4), { ...images[0], url: "https://example.com/a.png" }] }), null);
});

test("동시 요청과 불확실한 응답의 재시도는 학습을 중복 제출하지 않는다", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "soul-registration-"));
  const input = parseRegistration({ nodeId: "c1", name: "인물", variant: "soul_2", images, confirmed: true })!;
  const soul = { id, name: "인물", variant: "soul_2" as const, status: "training" as const };
  let count = 0;
  let finish!: (value: typeof soul) => void;
  const submit = async () => { count++; return await new Promise<typeof soul>((resolve) => { finish = resolve; }); };
  try {
    const first = createSoulOnce("project", input, submit, directory);
    while (!finish) await new Promise((resolve) => setTimeout(resolve, 1));
    await assert.rejects(createSoulOnce("project", input, submit, directory), /처리하고/);
    finish(soul);
    assert.deepEqual(await first, soul);
    assert.deepEqual(await createSoulOnce("project", input, submit, directory), soul);
    assert.equal(count, 1);
    const failed = { ...input, nodeId: "c2" };
    await assert.rejects(createSoulOnce("project", failed, async () => { throw new Error("timeout"); }, directory));
    await assert.rejects(createSoulOnce("project", failed, submit, directory), /이전 Soul 등록 결과/);
    assert.deepEqual(await createSoulOnce("project", { ...failed, retryConfirmed: true }, async () => soul, directory), soul);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("제공자 결과에서 Soul 상태와 목소리 종류를 보존한다", () => {
  assert.deepEqual(soulFromProvider({ reference_id: id, status: "completed" }, { name: "인물", variant: "soul_2" }),
    { id, name: "인물", variant: "soul_2", status: "ready" });
  assert.deepEqual(voicesFromProvider({ items: [
    { id, name: "나의 목소리", voice_type: "element", status: "completed" },
    { id, name: "처리 중", voice_type: "element", status: "processing" },
  ] }), [{ id, name: "나의 목소리", type: "element" }]);
});
