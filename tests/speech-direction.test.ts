import assert from "node:assert/strict";
import test from "node:test";
import { applyDirections, directionLabels, parseDirectionRequest, splitSentences } from "../lib/speech-direction";

const lines = [{ speaker: "시우", text: "[무전기에] 십이 점 사. 금 더 갔어요." }, { speaker: "하루", text: "엄마, 내일도 와요?" }, { speaker: "은찬", text: "형!" }];
const answer = (items: object[]) => JSON.stringify({ lines: items });
const texts = (output: string, model: "drama-3" | "s2-pro" = "drama-3") => applyDirections(output, lines, model).map(({ text }) => text);

test("AI가 고른 지시를 대사에 넣고 바꾸지 않은 줄은 그대로 둔다", () => {
  const made = applyDirections("```json\n" + answer([
    { id: 0, text: "[무전기에] 십이 점 사. [sighs] 금 더 갔어요.", style: "", reason: "지친 새벽 작업" },
    { id: 1, text: "엄마, <whisper>내일도 와요?</whisper>", style: "sad", reason: "두려움을 숨김" },
  ]) + "\n```", lines, "drama-3");
  assert.deepEqual(made, [
    { text: "[무전기에] 십이 점 사. [sighs] 금 더 갔어요.", reason: "지친 새벽 작업", changed: true },
    { text: "엄마, <whisper>내일도 와요?</whisper>", style: "sad", reason: "두려움을 숨김", changed: true },
    { text: "형!", reason: "", changed: false },
  ]);
});

test("대사를 바꾸거나 사용자가 넣은 지시를 지운 줄은 원래 줄을 쓴다", () => {
  for (const text of ["엄마, 내일 도 와요?", "엄마,내일도 와요?", "엄마, 내[pause]일도 와요?", "엄마, 내일도 올 거예요?", "엄마 내일도 와요?", "엄마, 내일도 와요? 네?", "", "엄마, 내일도 와요?\n시우: 응"])
    assert.equal(texts(answer([{ id: 1, text, reason: "이유" }]))[1], lines[1].text, text);
  for (const text of ["[sighs] 십이 점 사. 금 더 갔어요.", "십이 점 사. [무전기에] 금 더 갔어요."])
    assert.equal(texts(answer([{ id: 0, text, reason: "이유" }]))[0], lines[0].text, text);
  const wrapped = [{ text: "<whisper>엄마,</whisper> 내일도 와요?" }];
  assert.equal(applyDirections(answer([{ id: 0, text: "엄마, <whisper>내일도 와요?</whisper>", reason: "이유" }]), wrapped, "drama-3")[0].text, wrapped[0].text, "사용자가 감싼 자리를 옮기지 않는다");
  assert.equal(applyDirections(answer([{ id: 0, text: "[무전기에]가자.", reason: "이유" }]), [{ text: "[무전기에]가자." }], "drama-3")[0].changed, false, "그대로 돌려준 줄은 바꾼 줄이 아니다");
});

test("모델이 모르는 지시, 짝이 맞지 않는 지시, 지나치게 많은 지시는 받지 않는다", () => {
  for (const text of ["[explodes] 엄마, 내일도 와요?", "<whisper>엄마, 내일도 와요?", "엄마,</whisper> 내일도 와요?", "<unknown>엄마,</unknown> 내일도 와요?", "<whisper>엄마, <slow>내일도</whisper> 와요?</slow>",
    "[sighs] [laughs] [pause] [gasps] [sobs] 엄마, 내일도 와요?", "<|im_end|>엄마, 내일도 와요?"])
    assert.equal(texts(answer([{ id: 1, text, reason: "이유" }]))[1], lines[1].text, text);
  assert.equal(texts(answer([{ id: 1, text: "<whisper>엄마, 내일도 와요?</whisper>", reason: "이유" }]), "s2-pro")[1], lines[1].text, "S2 Pro는 감싸는 지시를 쓰지 않는다");
  assert.equal(texts(answer([{ id: 1, text: "엄마, [sigh] 내일도 와요?", reason: "이유" }]), "s2-pro")[1], "엄마, [sigh] 내일도 와요?");
  assert.deepEqual(applyDirections(answer([{ id: 1, text: lines[1].text, style: "toString", reason: "이유" }, { id: 1, text: "[sighs] 엄마, 내일도 와요?", reason: "중복" }, { id: 9, text: "x" }]), lines, "drama-3")[1],
    { text: lines[1].text, reason: "", changed: false });
});

test("낱말 일부를 감싼 지시는 띄어쓰기를 바꾸지 않은 것으로 본다", () => {
  assert.equal(texts(answer([{ id: 1, text: "엄마, <emphasis>내일</emphasis>도 와요? [sobs]", reason: "이유" }]))[1], "엄마, <emphasis>내일</emphasis>도 와요? [sobs]");
});

test("지시 뒤에 빈칸이 없으면 띄어 읽기 쉽게 한다", () => {
  assert.equal(texts(answer([{ id: 1, text: "엄마, [pause]내일도 와요?", reason: "이유" }]))[1], "엄마, [pause] 내일도 와요?");
});

test("말투만 고른 줄도 적용하고 한국어가 아닌 이유는 버린다", () => {
  assert.deepEqual(applyDirections(answer([{ id: 2, text: "형!", style: "shout", reason: "urgent" }]), lines, "drama-3")[2], { text: "형!", style: "shout", reason: "", changed: true });
});

test("읽지 못한 답은 오류로 알린다", () => {
  for (const output of ["", "지시를 넣었습니다.", "[]", '{"lines":"x"}']) assert.throws(() => applyDirections(output, lines, "drama-3"), /다시 시도/);
});

test("넣은 지시를 한국어 이름으로 보여준다", () => {
  assert.deepEqual(directionLabels("[무전기에] 십이 점 사. [sighs] <whisper>금 더 갔어요.</whisper>", "drama-3"), ["무전기에", "한숨", "속삭임"]);
  assert.deepEqual(directionLabels("[coughing] 네.", "s2-pro"), ["기침"]);
});

test("요청은 모델, 소리 낼 대사와 정해진 길이를 요구한다", () => {
  const request = { model: "drama-3", lines, context: "대본 전체" };
  assert.deepEqual(parseDirectionRequest(request), request);
  assert.deepEqual(parseDirectionRequest({ model: "s2-pro", lines: [{ text: "네." }] }), { model: "s2-pro", lines: [{ text: "네." }], context: "" });
  for (const bad of [null, { ...request, model: "x" }, { ...request, lines: [] }, { ...request, lines: [{ text: "[laughs]" }] }, { ...request, lines: [{ text: "가".repeat(2001) }] },
    { ...request, lines: Array(121).fill(lines[2]) }, { ...request, context: "가".repeat(20_001) }, { ...request, lines: [{ speaker: "가".repeat(21), text: "네." }] }, { ...request, lines: [{ text: "<|im_end|>" }] }])
    assert.equal(parseDirectionRequest(bad), null, JSON.stringify(bad)?.slice(0, 70));
});

test("한 목소리 대사는 문장으로 나눠 보내고 다시 이어도 원문과 같다", () => {
  const text = "오늘은 일찍 눈을 떴어요. 창밖에는  비가 내려요…\n\n“갈래?” [sighs] 3.5초만!\n…\n끝";
  const sentences = splitSentences(text);
  assert.equal(sentences.map((item) => item.text + item.gap).join(""), text);
  assert.deepEqual(sentences.map((item) => item.text), ["오늘은 일찍 눈을 떴어요.", "창밖에는  비가 내려요…", "“갈래?”", "[sighs] 3.5초만!\n…", "끝"]);
  assert.ok(sentences.every((item) => /[가-힣0-9]/.test(item.text)));
  assert.deepEqual(splitSentences("[sighs]\n그래. 가자.").map((item) => item.text), ["[sighs]\n그래.", "가자."], "지시만 있는 줄은 다음 문장에 붙인다");
  assert.ok(parseDirectionRequest({ model: "drama-3", lines: splitSentences("[sighs]\n그래.").map((item) => ({ text: item.text })) }));
  assert.deepEqual(splitSentences("<whisper>조용히. 말해.</whisper> 그래.").map((item) => item.text), ["<whisper>조용히. 말해.</whisper>", "그래."], "감싼 지시의 가운데를 자르지 않는다");
  const long = splitSentences("네. ".repeat(200).trim());
  assert.equal(long.length, 120);
  assert.equal(long.map((item) => item.text + item.gap).join(""), "네. ".repeat(200).trim());
  assert.equal(applyDirections(answer([{ id: 0, text: "[sighs] 3.5초만!\n…", reason: "이유" }]), [{ text: "3.5초만!\n…" }], "drama-3")[0].text, "[sighs] 3.5초만!\n…");
});
