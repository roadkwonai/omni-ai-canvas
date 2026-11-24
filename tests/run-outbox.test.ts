import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeRunOutcome, replayRunOutcomes } from "../lib/run-outbox";

test("DB 장애 후 다른 복구기와 동시 재시도해도 완료 결과가 보존된다", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "scene-outbox-test-"));
  const record = { projectId: crypto.randomUUID(), runId: crypto.randomUUID(), result: { text: "결과" }, error: null };
  try {
    await writeRunOutcome(record, root);
    await assert.rejects(replayRunOutcomes(async () => { throw new Error("db offline"); }, undefined, root));
    const recovered: string[] = [];
    await Promise.all(Array.from({length: 4}, () => replayRunOutcomes(async (item) => {
      recovered.push(item.runId);
    }, record.projectId, root)));
    assert.ok(recovered.length >= 1);
    assert.ok(recovered.every((item) => item === record.runId));
    assert.equal(await replayRunOutcomes(async () => { throw new Error("already resolved"); }, undefined, root), 0);
  } finally { await rm(root, {recursive:true,force:true}); }
});
