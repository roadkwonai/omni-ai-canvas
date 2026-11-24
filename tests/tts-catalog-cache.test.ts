import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogCache, type CatalogSnapshot } from "../lib/tts-catalog-cache";

const page = (id: string): CatalogSnapshot => ({ voices: [{ id, name: id }], providerSearch: "", tags: [], tagLabels: {}, languages: [] });

test("목록 캐시는 만료·최근 사용 한도·전체 무효화를 지킨다", () => {
  let time = 0;
  const cache = createCatalogCache({ maxAge: 100, limit: 2, now: () => time });
  cache.set("a", page("a"));
  cache.set("b", page("b"));
  assert.equal(cache.get("a")?.voices[0].id, "a");
  cache.set("c", page("c"));
  assert.equal(cache.get("b"), undefined);
  time = 60;
  cache.set("a", page("a2"), true);
  time = 101;
  assert.equal(cache.get("a"), undefined, "이어 읽기가 첫 조회의 만료를 늘리지 않는다");
  cache.set("d", page("d"));
  cache.clear();
  assert.equal(cache.get("d"), undefined);
  cache.set("d", page("old"), true);
  assert.equal(cache.get("d"), undefined, "무효화한 목록에 이어 읽은 페이지를 다시 넣지 않는다");
  cache.set("empty", { ...page("x"), voices: [] });
  assert.equal(cache.get("empty"), undefined, "빈 결과는 일시 오류일 수 있어 보관하지 않는다");
});
