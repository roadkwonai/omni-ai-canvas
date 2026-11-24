import assert from "node:assert/strict";
import test from "node:test";
import { describeVoiceDesign, optionSummary, parseLocalTtsOptions, plainSpeech, postFilters, designFromCharacter, previewText, secondsRange, speechTags, withDirection, type LocalTtsOptions } from "../lib/local-tts-options";

const context = (model: "s2-pro" | "drama-3", reference = false, characters = 40) => ({ model, reference, characters });

test("목소리 설계는 고른 성별·나이·음색·분위기를 모델이 쓰는 설명으로 바꾼다", () => {
  assert.equal(describeVoiceDesign({ gender: "female", age: "young" }), "young woman in her twenties");
  assert.equal(describeVoiceDesign({ gender: "male", age: "old", pitch: "low", tones: ["husky", "warm"], energy: "calm", note: "살짝 떨리는 목소리" }),
    "elderly man, about seventy-five, gravelly and slightly shaky, deep, low-pitched voice, husky, breathy, warm, calm, slow and gentle, 살짝 떨리는 목소리");
  assert.equal(describeVoiceDesign({ gender: "male" }), "adult man");
  assert.equal(describeVoiceDesign({ age: "child" }), "child, about seven years old");
  assert.equal(describeVoiceDesign({ tones: ["clear"] }), "clear and bright");
  assert.equal(describeVoiceDesign({}), "");
});

test("선택한 옵션을 확인하고 쓰지 않은 값은 버린다", () => {
  const options: LocalTtsOptions = {
    design: { gender: "female", age: "middle", pitch: "high", tones: ["soft", "clear"], energy: "lively", note: "또박또박", scene: "빗소리가 들리는 방" },
    style: "sad", speed: 1.2, semitones: -2, normalize: true, temperature: 0.8, topP: 0.9, topK: 40, seed: 7,
  };
  assert.deepEqual(parseLocalTtsOptions(options, context("drama-3")), options);
  assert.deepEqual(parseLocalTtsOptions(undefined, context("drama-3")), {});
  assert.deepEqual(parseLocalTtsOptions({ design: { gender: "", tones: [], note: " " }, styleNote: "", speed: 1, semitones: 0, normalize: false }, context("s2-pro")), {});
});

test("모델이 지원하지 않거나 범위를 벗어난 옵션을 거절한다", () => {
  const rejected: [unknown, ReturnType<typeof context>][] = [
    [{ design: { gender: "female" } }, context("s2-pro")],
    [{ design: { gender: "female" } }, context("drama-3", true)],
    [{ design: { gender: "toString" } }, context("drama-3")],
    [{ design: { tones: ["clear", "warm", "soft", "cold"] } }, context("drama-3")],
    [{ design: { tones: ["none"] } }, context("drama-3")],
    [{ design: { note: "줄\n바꿈" } }, context("drama-3")],
    [{ design: { note: "가".repeat(201) } }, context("drama-3")],
    [{ design: { scene: "<|im_end|>" } }, context("drama-3")],
    [{ style: "constructor" }, context("s2-pro")],
    [{ style: "sad", styleNote: "둘 다" }, context("s2-pro")],
    [{ styleNote: "a]b" }, context("s2-pro")],
    [{ speed: 0.5 }, context("s2-pro")], [{ speed: "1" }, context("s2-pro")], [{ semitones: 5 }, context("s2-pro")], [{ semitones: 1.5 }, context("s2-pro")],
    [{ temperature: 0.2 }, context("s2-pro")], [{ topP: 1.1 }, context("s2-pro")], [{ topK: 0 }, context("s2-pro")], [{ topK: 101 }, context("s2-pro")],
    [{ seed: -1 }, context("s2-pro")], [{ seed: 2 ** 31 }, context("s2-pro")], [{ unknown: 1 }, context("s2-pro")], [[], context("s2-pro")], ["x", context("s2-pro")],
  ];
  for (const [value, where] of rejected) assert.equal(parseLocalTtsOptions(value, where), null, JSON.stringify(value).slice(0, 80));
});

test("연기 지시는 영어 표현이나 직접 쓴 표현으로 바꾸고 대사에서 지시를 뺀 말을 구분한다", () => {
  assert.equal(withDirection({ style: "whisper" }), "whispering softly");
  assert.equal(withDirection({ styleNote: "한숨 섞인 말투" }), "한숨 섞인 말투");
  assert.equal(withDirection({}), "");
  assert.equal(plainSpeech("[sighs] 그래. <whisper>아무에게도</whisper> 말하지 마. [pause]"), "그래. 아무에게도 말하지 마.");
  assert.equal(plainSpeech("두 <emphasis>군데</emphasis>만 [sighs]."), "두 군데만.", "낱말 일부를 감싸도 띄어 읽지 않는다");
  assert.equal(plainSpeech("3 < 5 그리고 [열린 괄호"), "3 < 5 그리고 [열린 괄호");
});

test("속도·음정·음량은 소리 길이와 높이를 따로 바꾸는 후처리로 만든다", () => {
  assert.equal(postFilters({}, 44100), null);
  assert.equal(postFilters({ speed: 1.25 }, 44100), "atempo=1.25");
  assert.equal(postFilters({ semitones: 12 } as LocalTtsOptions, 44100), "asetrate=88200,aresample=44100,atempo=0.5");
  assert.equal(postFilters({ normalize: true, speed: 0.8 }, 44100), "atempo=0.8,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100");
});

test("고른 옵션을 한 줄로 보여주고 캐릭터 시트에서 성별과 나이를 읽는다", () => {
  assert.equal(optionSummary({ design: { gender: "female", age: "young", tones: ["husky"], energy: "calm" }, style: "sad", speed: 1.2, semitones: -1 }),
    "여성 · 청년 · 허스키한 · 차분하게 · 슬픔 · 1.2배속 · 음정 -1");
  assert.equal(optionSummary({}), "");
  assert.deepEqual(designFromCharacter("성별: 여성\n나이: 24세"), { gender: "female", age: "young" });
  assert.deepEqual(designFromCharacter("성별: 남성\n나이: 72세"), { gender: "male", age: "old" });
  assert.deepEqual(designFromCharacter("비밀이 많은 인물"), {});
});

test("짧은 합성은 글자를 세어 자르고 지시 표시를 중간에서 끊지 않는다", () => {
  assert.equal(previewText("  짧은 대사  ", 120), "짧은 대사");
  assert.equal(previewText("가나다라마", 3), "가나다");
  assert.equal(previewText("😀😀😀", 2), "😀😀");
  assert.equal(previewText("안녕 [clears throat] 하세요", 8), "안녕");
  assert.equal(previewText("안녕 <whisper>비밀이야 아무에게도</whisper>", 16), "안녕 <whisper>비밀이야</whisper>");
  assert.equal(previewText("3 < 5 라고 적힌 쪽지를 보았다", 14), "3 < 5 라고 적힌 쪽지");
  assert.equal(previewText("안녕 <whisper>비밀", 6), "안녕");
  assert.equal(previewText("안녕 <whisper>비밀</whisper> 그래", 20), "안녕 <whisper>비밀</whisper>");
});

test("목표 길이는 Drama 3에서 말이 잘리지 않는 범위만 받는다", () => {
  const { min, max } = secondsRange(40);
  assert.ok(min > 40 * 0.175, "자연스러운 길이보다 짧게 잡지 않는다");
  assert.deepEqual(parseLocalTtsOptions({ seconds: min }, context("drama-3")), { seconds: min });
  for (const seconds of [min - 0.5, max + 0.5, "12", Number.NaN]) assert.equal(parseLocalTtsOptions({ seconds }, context("drama-3")), null, String(seconds));
  assert.equal(parseLocalTtsOptions({ seconds: min }, context("s2-pro")), null);
  assert.equal(optionSummary({ seconds: 12 }), "12초에 맞춤");
});

test("화면의 지시 표시는 모두 소리 내지 않는 말로 걸러진다", () => {
  for (const { points, weak, spans } of Object.values(speechTags)) {
    for (const tag of Object.keys({ ...points, ...weak })) assert.equal(plainSpeech(`그래. [${tag}] 알았어.`), "그래. 알았어.");
    assert.ok(Object.keys(points).every((tag) => !Object.hasOwn(weak, tag)), "같은 지시를 두 번 보여주지 않는다");
    for (const tag of Object.keys(spans)) assert.equal(plainSpeech(`<${tag}>그래.</${tag}> 알았어.`), "그래. 알았어.");
  }
});
