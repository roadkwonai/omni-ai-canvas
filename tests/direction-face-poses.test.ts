import assert from "node:assert/strict";
import { test } from "node:test";
import { directionEmotionIndex, directionEmotionNames, directionFaceWeights } from "../lib/direction-face-poses";

test("emotion presets move distinct combinations of lips, cheeks, eyebrows and eyelids", () => {
  const settings = { kind: "emotion", intensity: 0.5 } as const;
  const neutral = directionFaceWeights({ ...settings, warmth: 0, arousal: 0 });
  const joy = directionFaceWeights({ ...settings, warmth: 1, arousal: 1 });
  const surprise = directionFaceWeights({ ...settings, warmth: -0.5, arousal: 1 });
  const anger = directionFaceWeights({ ...settings, warmth: -1, arousal: 1 });

  assert.ok(Object.values(neutral).every((value) => value === 0));
  assert.ok(joy.smile > 0 && joy.cheekRaise > 0 && joy.mouth === 0 && joy.eyelidLeft > 0);
  assert.ok(surprise.mouth > joy.mouth && surprise.eyelidOpenLeft > 0 && surprise.browLeft > joy.browLeft);
  assert.ok(anger.browLowerLeft > 0 && anger.browLowerRight > 0 && anger.frown > 0 && anger.smile === 0);
});

test("all 25 emotion coordinates have their own named expression", () => {
  const axes = [1, 0.5, 0, -0.5, -1];
  const coordinates = axes.flatMap((arousal) => axes.map((warmth) => ({ warmth, arousal })));
  const weights = coordinates.map((point) => directionFaceWeights({ kind: "emotion", intensity: 1, ...point }));
  assert.deepEqual(coordinates.map(({ warmth, arousal }) => directionEmotionIndex(warmth, arousal)), [...weights.keys()]);
  assert.equal(new Set(directionEmotionNames).size, 25);
  assert.equal(new Set(weights.map((pose) => JSON.stringify(pose))).size, 25);
  const midpoint = directionFaceWeights({ kind: "emotion", intensity: 1, warmth: 1, arousal: 0.75 });
  assert.ok(midpoint.smile < weights[0].smile && midpoint.smile > weights[5].smile);
});

test("emotion strength and left/right overrides preserve the neutral endpoint", () => {
  const settings = { kind: "emotion", warmth: 0, arousal: 0.5, intensity: 0.5 } as const;
  const weights = directionFaceWeights({
    ...settings,
    channels: { eyelidLeft: -1, eyelidRight: 0, browLeft: 0, browRight: 0, mouth: 0, gazeX: 0, gazeY: 0 },
  });
  assert.ok(weights.eyelidLeft > 0);
  assert.equal(weights.eyelidOpenLeft, 0);
  assert.ok(weights.eyelidOpenRight > 0);
  assert.ok(Object.values(directionFaceWeights({ ...settings, intensity: 0 })).every((value) => value === 0));
});

test("드래그 좌표와 정확한 기준점은 같은 사진과 Newtake 표기를 선택한다", () => {
  assert.equal(directionEmotionNames[directionEmotionIndex(-0.48, -0.99)], "애도의 억눌림");
  assert.equal(directionEmotionNames[directionEmotionIndex(0.52, -0.49)], "어쩔 수 없음");
  assert.equal(directionEmotionNames[directionEmotionIndex(0.49, -0.98)], "말없이 흐르는 눈물");
  assert.equal(directionEmotionNames[directionEmotionIndex(0, 0)], "담담한 태연");
});
