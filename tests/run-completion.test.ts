import assert from "node:assert/strict";
import { test } from "node:test";
import { completeRun } from "../lib/run-completion";

test("결과 저장이 일시 실패해도 완료한 작업을 재호출하거나 실패로 저장하지 않는다", async () => {
  let executions = 0;
  let writes = 0;
  await completeRun(async () => {
    executions++;
    return { text: "완료 결과" };
  }, async (result, error) => {
    writes++;
    if (writes === 1) throw new Error("데이터베이스 연결 일시 중단");
    assert.deepEqual(result, { text: "완료 결과" });
    assert.equal(error, null);
  });
  assert.equal(executions, 1);
  assert.equal(writes, 2);
});

test("실제 작업 오류는 완료 결과 없이 기록한다", async () => {
  await completeRun(async () => { throw new Error("작업 실패"); }, async (result, error) => {
    assert.equal(result, null);
    assert.equal(error, "작업 실패");
  });
});
