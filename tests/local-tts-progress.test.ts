import assert from "node:assert/strict";
import test from "node:test";
import { createProgress } from "../lib/local-tts-progress";

function track() {
  let time = 0;
  const progress = createProgress({ characters: 100, ahead: 2, loadSeconds: 10, secondsPerCharacter: 0.2, now: () => time * 1000 });
  return { progress, at: (seconds: number) => { time = seconds; return progress.read(); } };
}

test("진행률은 대기부터 저장까지 줄어들지 않고 완성 전에는 100%가 되지 않는다", () => {
  const { progress, at } = track();
  assert.deepEqual(at(5), { phase: "queued", percent: 0, seconds: 0, elapsed: 5, ahead: 2 });
  progress.enter("preparing");
  progress.enter("loading");
  const values = [at(5).percent, at(8).percent, at(60).percent];
  progress.enter("generating");
  for (const fraction of [0, 0.3, 0.2, 0.9, 1]) {
    progress.generated({ seconds: fraction * 20, total: 20, part: 1, parts: 2, fraction });
    values.push(at(70).percent);
  }
  progress.enter("finishing");
  values.push(at(80).percent, at(500).percent);
  assert.deepEqual(values, [...values].sort((a, b) => a - b));
  assert.ok(values.every((value) => Number.isInteger(value) && value >= 0 && value <= 99), values.join());
});

test("남은 시간은 적재 예상과 실제 생성 속도로 계산하고 대기 중에는 추정하지 않는다", () => {
  const { progress, at } = track();
  assert.equal(at(3).remaining, undefined);
  progress.enter("loading");
  assert.equal(at(3).remaining, 10 + 20, "적재 10초와 100자 생성 20초");
  assert.equal(at(7).remaining, 6 + 20);
  assert.equal(at(50).remaining, 1 + 20, "예상보다 오래 걸려도 0 아래로 내려가지 않는다");
  progress.enter("generating");
  assert.equal(at(52).remaining, 18);
  progress.generated({ seconds: 1, total: 16, part: 1, parts: 4, fraction: 0.05 });
  assert.equal(at(56).remaining, 14, "첫 소리 전의 준비 시간을 생성 속도로 세지 않는다");
  at(62);
  progress.generated({ seconds: 6, total: 16, part: 1, parts: 4, fraction: 0.3 });
  assert.equal(at(62).remaining, 20, "10초에 5초 분량을 만들었고 10초 분량이 남았다");
  const reading = at(66);
  assert.equal(reading.remaining, 16, "다음 조각을 기다리는 시간만큼 줄어든다");
  assert.deepEqual([reading.part, reading.parts, reading.seconds, reading.elapsed], [1, 4, 6, 66]);
});

test("첫 소리를 기다리는 동안에도 진행률이 조금씩 오른다", () => {
  const { progress, at } = track();
  progress.enter("loading");
  progress.enter("generating");
  const values = [1, 3, 6, 10].map((time) => at(time).percent);
  assert.ok(values.every((value, index) => index === 0 || value > values[index - 1]), values.join());
  assert.ok(values.at(-1)! < 32);
});

test("이미 올라온 모델은 적재 구간을 건너뛰고 앞선 작업 수를 갱신한다", () => {
  const { progress, at } = track();
  progress.moveUp();
  assert.equal(at(1).ahead, 1);
  progress.enter("preparing");
  progress.enter("generating");
  progress.generated({ seconds: 1, total: 2, part: 1, parts: 1, fraction: 0.5 });
  assert.equal(at(2).phase, "generating");
  assert.equal(at(2).ahead, 0);
  assert.ok(at(2).percent >= 45);
});

test("전체 길이를 모르는 대화는 진행 비율로 남은 시간을 계산한다", () => {
  const { progress, at } = track();
  progress.enter("generating");
  at(0);
  progress.generated({ seconds: 0, total: 0, part: 0, parts: 6, fraction: 0.25 });
  assert.equal(at(10).remaining, 30);
  assert.equal(at(10).part, 0, "화자 목소리를 준비하는 동안에는 줄 번호가 없다");
  progress.generated({ seconds: 8, total: 0, part: 3, parts: 6, fraction: 0.5 });
  assert.equal(at(20).remaining, 20);
});
