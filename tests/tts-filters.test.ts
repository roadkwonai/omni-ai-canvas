import assert from "node:assert/strict";
import test from "node:test";
import { parseTtsFilters } from "../lib/tts-filters";

test("목소리 필터는 한 값과 여러 값을 같은 모양으로 읽고 빈 값과 중복을 버린다", () => {
  assert.deepEqual(parseTtsFilters({ sort: "recent", gender: "female", age: ["old", "old"], language: ["KO", "en-US"], tag: "" }),
    { sort: "recent", gender: ["female"], age: ["old"], language: ["ko", "en-us"] });
  assert.deepEqual(parseTtsFilters(undefined), {});
  assert.deepEqual(parseTtsFilters({ gender: [] }), {});
});

test("목소리 필터는 정의하지 않은 값과 지나치게 긴 입력을 거절한다", () => {
  for (const value of [null, [], "x", { sort: "name" }, { gender: "other" }, { age: "toString" }, { language: "k" },
    { tag: "a\u0000" }, { tag: "a".repeat(101) }, { tag: [1] }, { unknown: "x" },
    { language: Array.from({ length: 129 }, () => "ko") }, { tag: Array.from({ length: 501 }, (_, i) => `t${i}`) }]) {
    assert.equal(parseTtsFilters(value), null, JSON.stringify(value)?.slice(0, 60));
  }
});
