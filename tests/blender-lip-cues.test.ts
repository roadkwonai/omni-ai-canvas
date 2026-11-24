import assert from "node:assert/strict";
import test from "node:test";
import { lipCuesFromWords, parseTimedWords } from "../lib/blender-lip-cues";

test("단어의 30fps 시각을 샷 시작에 맞추고 시작·중간·끝 입 모양으로 변환한다", () => {
  const words = parseTimedWords('[{"text":"안녕","startFrame":60,"endFrame":90}]');
  assert.deepEqual(lipCuesFromWords(words, "MouthOpen", 3, 1), [
    {key:"MouthOpen",time:1,value:0}, {key:"MouthOpen",time:1.5,value:1}, {key:"MouthOpen",time:2,value:0},
  ]);
  assert.throws(() => parseTimedWords('[{"text":"x","startFrame":5,"endFrame":3}]'));
  assert.equal(lipCuesFromWords(words, "MouthOpen", 1, 0).length, 0);
  assert.throws(() => lipCuesFromWords(words, "", 2));
});
