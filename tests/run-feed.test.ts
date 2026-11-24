import test from "node:test";
import assert from "node:assert/strict";
import { mergeRunPages } from "../lib/run-feed";
import type { Run } from "../lib/types";
const row = (id:string, status:Run["status"]="succeeded"):Run => ({id, status, createdAt: `2026-01-01T00:00:${id.padStart(2,"0")}.000Z`,input:{} as Run["input"],result:null,error:null});
test("동시 더 보기와 새 작업 폴링은 기존 항목을 보존하고 중복을 제거한다", () => {
  const loaded=[row("04"),row("03"),row("02"),row("01","queued")];
  const result=mergeRunPages(loaded,[row("05"),row("04")],[row("01","running")]);
  assert.deepEqual(result.map(item=>item.id),["05","04","03","02","01"]);
  assert.equal(result.at(-1)?.status,"running");
});
test("완료된 작업은 늦게 도착한 이전 대기 응답으로 되돌아가지 않는다", () => {
  assert.equal(mergeRunPages([row("01")], [row("01","queued")])[0].status,"succeeded");
});
test("최신 페이지와 이전 최신 페이지가 겹치지 않으면 새 커서부터 빈 구간을 다시 읽는다", async () => {
  const { reconcileHead } = await import("../lib/run-feed");
  assert.equal(reconcileHead(["04","03"],[row("08"),row("07")],"old","new").cursor,"new");
  assert.equal(reconcileHead(["04","03"],[row("05"),row("04")],"old","new").cursor,"old");
});
