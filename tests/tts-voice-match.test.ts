import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesVoiceTarget, readExplicitVoiceTarget, shortlistVoices } from "../lib/tts-voice-match";
import type { TtsVoice } from "../lib/tts-types";

test("명시된 인물의 나이, 성별, 언어와 말투만 추출한다", () => {
  assert.deepEqual(readExplicitVoiceTarget("24세 여성. 한국어를 차분하고 따뜻하게 말한다."), {
    gender: "female", age: "young", language: "ko", traits: ["calm", "warm"],
  });
  assert.equal(readExplicitVoiceTarget("20대 초반 여자").age, "young");
  assert.equal(readExplicitVoiceTarget("카메라 35mm, 5초 장면").age, undefined);
  assert.equal(readExplicitVoiceTarget("남녀가 함께 등장").gender, undefined);
  assert.deepEqual(readExplicitVoiceTarget("24세 여성. 한국어를 쓴다. 71세 아버지는 영어로 말한다."), {
    gender: "female", age: "young", language: "ko", traits: [],
  });
  assert.equal(readExplicitVoiceTarget("24세 여성으로 70세 아버지와 함께 산다.").age, "young");
  assert.equal(readExplicitVoiceTarget("24세 여성의 아버지는 70세다.").age, undefined);
  assert.equal(readExplicitVoiceTarget("20대 또는 60대").age, undefined);
});

test("명시된 외형 조건과 충돌하거나 메타데이터가 없는 목소리는 제외한다", () => {
  const target = readExplicitVoiceTarget("24세 여성, 한국어");
  const voice: TtsVoice = { id: "a", name: "a", gender: "female", tags: ["young"], languages: ["ko"] };
  assert.equal(matchesVoiceTarget(voice, target), true);
  assert.equal(matchesVoiceTarget({ ...voice, gender: "male" }, target), false);
  assert.equal(matchesVoiceTarget({ ...voice, tags: ["old"] }, target), false);
  assert.equal(matchesVoiceTarget({ ...voice, description: "An elderly woman with a calm voice." }, target), false);
  assert.equal(matchesVoiceTarget({ ...voice, languages: [] }, target), false);
  assert.equal(matchesVoiceTarget({ ...voice, gender: undefined }, target), false);
});

test("조건이 없는 인기 목록에서 성별과 연령이 한쪽으로 쏠리지 않는다", () => {
  const voices: TtsVoice[] = [
    ...Array.from({ length: 120 }, (_, i) => ({ id: `old${i}`, name: "old", gender: "male" as const, tags: ["old"] })),
    { id: "young", name: "young", gender: "female", tags: ["young"] },
  ];
  assert.ok(shortlistVoices(voices, { traits: [] }, 5).some((voice) => voice.id === "young"));
  assert.deepEqual(shortlistVoices(voices, readExplicitVoiceTarget("20대 여성")).map((voice) => voice.id), ["young"]);
  assert.deepEqual(shortlistVoices(voices, readExplicitVoiceTarget("20대 여성, 한국어")), []);
});
