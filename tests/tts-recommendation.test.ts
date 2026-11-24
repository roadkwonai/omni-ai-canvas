import assert from "node:assert/strict";
import test from "node:test";
import { parseVoiceRecommendations } from "../lib/tts-recommendation";

test("추천은 실제 목록의 고유 ID와 한국어 사유만 적용한다", () => {
  const candidates = [{ id: "a", name: "A", previewUrl: "https://example.test/a.mp3" }, { id: "b", name: "B" }];
  const result = parseVoiceRecommendations(JSON.stringify({ items: [
    { id: "unknown", reason: "목록 밖" }, { id: "a", reason: "차분한 인물의 말투에 어울립니다." },
    { id: "a", reason: "중복" }, { id: "b", reason: "English only" },
  ] }), candidates);
  assert.deepEqual(result, [{ ...candidates[0], reason: "차분한 인물의 말투에 어울립니다." }]);
  assert.throws(() => parseVoiceRecommendations('{"items":[{"id":"missing","reason":"없음"}]}', candidates), /추천할 목소리/);
});
