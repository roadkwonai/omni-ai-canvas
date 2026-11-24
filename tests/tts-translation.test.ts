import assert from "node:assert/strict";
import test from "node:test";
import { createVoiceTranslator, parseVoiceTranslationInput } from "../lib/tts-translation";

test("목소리 번역은 동일 설명을 묶어 캐시하고 고유 ID에 다시 연결한다", async () => {
  let calls = 0;
  const translate = createVoiceTranslator(async (input) => {
    calls++;
    const rows = JSON.parse(input);
    return JSON.stringify(rows.map((row: {id: string}) => ({ id: row.id, name: "차분한 목소리", description: "낮고 부드럽습니다." })));
  });
  const rows = [{ id: "a", name: "Calm voice", description: "Low and soft" }, { id: "b", name: "Calm voice", description: "Low and soft" }];
  const result = await translate(rows);
  assert.deepEqual(result.map((row) => row.id), ["a", "b"]);
  assert.equal(result[0].nameKo, "차분한 목소리");
  await translate([{ ...rows[0], id: "c" }]);
  assert.equal(calls, 1);
});

test("목소리 번역은 잘못된 입력을 거절하고 실패한 항목을 제외한다", async () => {
  assert.equal(parseVoiceTranslationInput([{ id: "x", name: "" }]), null);
  assert.equal(parseVoiceTranslationInput([{ id: "x", name: "A" }, { id: "x", name: "B" }]), null);
  const translate = createVoiceTranslator(async () => "[]");
  assert.deepEqual(await translate([{ id: "z", name: "Unique invalid response voice" }]), []);
});

test("일부 응답이 누락되면 번역된 항목을 보존하고 누락된 항목만 재요청한다", async () => {
  const requests: string[][] = [];
  const translate = createVoiceTranslator(async (input) => {
    const rows = JSON.parse(input) as {id:string}[];
    requests.push(rows.map((row) => row.id));
    return JSON.stringify(rows.slice(0, 1).map((row) => ({ id: row.id, name: "한글 이름" })));
  });
  const result = await translate([{ id: "x", name: "Unique name one" }, { id: "y", name: "Unique name two" }]);
  assert.deepEqual(requests, [["0", "1"], ["1"]]);
  assert.deepEqual(result, [{ id: "x", nameKo: "한글 이름" }, { id: "y", nameKo: "한글 이름" }]);
});

test("목소리 번역은 옮길 글자가 없는 원문을 받고 덜 번역된 결과를 거절한다", async () => {
  const cases: [name: string, output: string, accepted: boolean][] = [
    ["9900", "9900", true], ["💗", "💗", true], ["P", "P", true], ["lol", "ㅋㅋ", true], ["Calm", "차분함", true],
    ["Calm", "Calm", false], ["मोदी", "मोदी", false], ["ดี", "ดี", false], ["雪", "雪", false], ["ю", "ю", false],
    ["J.A.R.V.I.S", "J.A.R.V.I.S", true], ["A1b", "A1b", true], ["B&G", "B&G", true],
    ["Voice", "적合한 목소리", false], ["Voice", "목소리 (声優)", false], ["Voice", "목소리 こえ", false],
  ];
  for (const [index, [name, output, accepted]] of cases.entries()) {
    const translate = createVoiceTranslator(async () => JSON.stringify([{ id: "0", name: output }]));
    const result = await translate([{ id: String(index), name }]).catch(() => []);
    assert.deepEqual(result, accepted ? [{ id: String(index), nameKo: output }] : [], `${name} → ${output}`);
  }
});

test("설명이 없는 목소리에는 모델이 만든 설명을 붙이지 않는다", async () => {
  const translate = createVoiceTranslator(async () => JSON.stringify([{ id: "0", name: "차분함", description: "지어낸 설명입니다." }]));
  assert.deepEqual(await translate([{ id: "a", name: "Calm" }]), [{ id: "a", nameKo: "차분함" }]);
});

test("번역 호출 자체가 거듭 실패하면 빈 번역과 구분되는 오류를 알린다", async () => {
  let calls = 0;
  const limited = createVoiceTranslator(async () => { calls++; throw new Error("사용량 한도"); });
  await assert.rejects(limited([{ id: "a", name: "Calm" }]), /사용량 한도/);
  assert.equal(calls, 2);
  const refused = createVoiceTranslator(async () => "번역할 수 없습니다.");
  assert.deepEqual(await refused([{ id: "a", name: "Calm" }]), []);
  let attempt = 0;
  const recovered = createVoiceTranslator(async () => {
    if (++attempt === 1) throw new Error("일시 오류");
    return JSON.stringify([{ id: "0", name: "차분함" }]);
  });
  assert.deepEqual(await recovered([{ id: "a", name: "Calm" }]), [{ id: "a", nameKo: "차분함" }]);
});
