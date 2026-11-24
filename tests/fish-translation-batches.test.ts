import assert from "node:assert/strict";
import { test } from "node:test";
import { planFishTranslationBatches, runLanes } from "../lib/fish-translation-batches";

test("번역 작업은 순서를 보존하며 지정한 묶음 수만큼만 배정한다", () => {
  const items = Array.from({ length: 73 }, (_, i) => ({ id: String(i), name: `목소리 ${i}` }));
  const batches = planFishTranslationBatches(items, { groups: 3 });
  assert.deepEqual(batches.map((group) => group.length), [20, 20, 20]);
  assert.deepEqual(batches.flat(), items.slice(0, 60));
  assert.deepEqual(planFishTranslationBatches(items, { groups: 2, rowsPerGroup: 5 }).flat(), items.slice(0, 10));
});

test("번역 실행은 동시 수를 지키고 느린 묶음이 다음 묶음의 시작을 막지 않는다", async () => {
  const items = [0, 1, 2, 3, 4, 5];
  let running = 0;
  let peak = 0;
  let taking = 0;
  const finished: number[] = [];
  let releaseSlow = () => {};
  const slow = new Promise<void>((resolve) => { releaseSlow = resolve; });
  await runLanes(2, async () => {
    assert.equal(++taking, 1, "다음 묶음은 한 번에 하나씩 가져온다");
    await new Promise((resolve) => setTimeout(resolve, 1));
    taking--;
    return items.shift();
  }, async (item) => {
    peak = Math.max(peak, ++running);
    if (item === 0) await slow;
    running--;
    finished.push(item);
    if (item === 5) releaseSlow();
  });
  assert.deepEqual(finished, [1, 2, 3, 4, 5, 0]);
  assert.equal(peak, 2);
});

test("번역 실행은 오류가 나면 새 묶음을 시작하지 않고 진행 중인 묶음을 마친 뒤 오류를 알린다", async () => {
  const items = [0, 1, 2, 3, 4];
  const finished: number[] = [];
  await assert.rejects(runLanes(2, async () => items.shift(), async (item) => {
    if (item === 0) throw new Error("저장 실패");
    await new Promise((resolve) => setTimeout(resolve, 5));
    finished.push(item);
  }), /저장 실패/);
  assert.deepEqual(finished, [1]);
});

test("유니코드와 JSON 이스케이프를 포함한 입력도 크기 제한을 지키고 순서를 유지한다", () => {
  const items = Array.from({ length: 7 }, (_, i) => ({ id: String(i), name: `이름 ${i} 🐟`, description: '한글 "문장"\\'.repeat(12) }));
  const batches = planFishTranslationBatches(items, { groups: 3, rowsPerGroup: 20, maxCharacters: 500 });
  assert.deepEqual(batches.flat(), items.slice(0, batches.flat().length));
  for (const group of batches) {
    assert.ok(JSON.stringify(group.map((v, i) => ({ id: String(i), name: v.name, description: v.description }))).length <= 500);
  }
});

test("개별 항목이 제한을 넘으면 단독 묶음으로 반환하여 누락하지 않는다", () => {
  const items = [{ id: "1", name: "길다".repeat(100) }, { id: "2", name: "다음" }];
  assert.deepEqual(planFishTranslationBatches(items, { maxCharacters: 50 }), [[items[0]], [items[1]]]);
  assert.deepEqual(planFishTranslationBatches([]), []);
});

test("실패한 적이 있는 항목은 더 작은 묶음으로 나눠 문제 항목이 이웃을 막지 않게 한다", () => {
  const items = [...Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, name: "재시도", attempts: 1 })),
    { id: "x", name: "거듭 실패", attempts: 2 }, { id: "y", name: "거듭 실패", attempts: 3 },
    ...Array.from({ length: 21 }, (_, i) => ({ id: `n${i}`, name: "처음", attempts: 0 }))];
  const batches = planFishTranslationBatches(items);
  assert.deepEqual(batches.map((group) => group.length), [4, 1, 1, 1, 20, 1]);
  assert.deepEqual(batches.flat(), items);
});
