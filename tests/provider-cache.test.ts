import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { ProviderCache } from "../lib/provider-cache";

test("캐시 응답은 바로 표시되고 갱신 중 요청은 한 작업을 공유한다", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "video-cache-"));
  let calls = 0;
  let finish!: (value: unknown[]) => void;
  const cache = new ProviderCache(root, () => {
    calls++;
    return new Promise((resolve) => { finish = resolve; });
  }, () => 1_000_000);
  try {
    const cold = await cache.read();
    assert.deepEqual(cold, { providers: [], snapshotAt: null, refreshing: true });
    const first = cache.refresh();
    const second = cache.refresh();
    while (!calls) await new Promise((resolve) => setTimeout(resolve, 1));
    assert.equal(calls, 1);
    finish([{ id: "codex", label: "Codex", operations: ["text"], available: true,
      detail: "연결됨", billing: "구독", website: "https://example.com",
      models: [{id: "opus", label: "Opus", operations: ["text"]}], efforts: ["high"],
      account: { plan: "pro", credits: null, email: "private@example.com" }, token: "secret" }]);
    await Promise.all([first, second]);
    const warm = await cache.read();
    assert.equal(warm.providers[0].account?.plan, "pro");
    assert.equal(warm.providers[0].models?.[0].efforts, undefined);
    assert.deepEqual(warm.providers[0].efforts, ["high"]);
    assert.equal(warm.refreshing, false);
    const file = await readFile(path.join(root, "providers.json"), "utf8");
    assert.ok(!file.includes("private@example.com"));
    assert.ok(!file.includes("secret"));
    const reopened = new ProviderCache(root, async () => [], () => 1_000_000);
    assert.equal((await reopened.read()).providers[0].id, "codex");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("인증 변경 중 끝난 오래된 조회는 표시되지 않으며 다시 조회한다", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "video-cache-"));
  let finish!: (value: unknown[]) => void;
  const cache = new ProviderCache(root, () => new Promise((resolve) => { finish = resolve; }));
  try {
    const pending = cache.refresh();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await cache.invalidate();
    finish([{ id: "codex", label: "Old", operations: ["text"], available: true, detail: "", billing: "", website: "https://example.com" }]);
    await pending;
    const current = await cache.read();
    assert.equal(current.snapshotAt, null);
    assert.equal(current.providers.length, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("갱신 장애 시 마지막 결과를 보관하고 오래된 기록은 표시하지 않는다", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "video-cache-"));
  let now = 1_000_000;
  let fail = false;
  const cache = new ProviderCache(root, async () => {
    if (fail) throw new Error("조회 불가");
    return [{ id: "codex", label: "Codex", operations: ["text"], available: true,
      detail: "연결됨", billing: "구독", website: "https://example.com" }];
  }, () => now);
  try {
    await cache.refresh();
    now += 61_000;
    fail = true;
    const stale = await cache.read();
    assert.equal(stale.providers.length, 1);
    await cache.refresh().catch(() => {});
    now += 31 * 60_000;
    const expired = await cache.read();
    assert.deepEqual(expired.providers, []);
    assert.equal(expired.snapshotAt, null);
  } finally { await rm(root, { recursive: true, force: true }); }
});
