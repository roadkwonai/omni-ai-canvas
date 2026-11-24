import assert from "node:assert/strict";
import { test } from "node:test";
import { lensContourAlpha } from "../lib/lens-transition-render";
import { isLensMask } from "../lib/lens-transition-spec";

const outline = [
  { x: .15, y: .25 }, { x: .65, y: .2 }, { x: .8, y: .4 },
  { x: .6, y: .7 }, { x: .3, y: .75 },
];
test("윤곽 페더는 다각형 바깥으로 번지지 않는다", async () => {
  const width = 200, height = 120;
  const alpha = await lensContourAlpha(outline, width, height, 1);
  const at = (x: number, y: number) => alpha[y * width + x];
  assert.equal(alpha.length, width * height);
  assert.ok(at(95, 55) > 245);
  assert.equal(at(35, 85), 0);
  assert.equal(at(147, 87), 0);
  assert.equal(at(100, 21), 0);
});
test("윤곽 점이 교차하거나 겹치는 경우를 거절한다", () => {
  const bounds = { x: .15, y: .2, width: .65, height: .55 };
  assert.equal(isLensMask({ ...bounds, outline }), true);
  assert.equal(isLensMask({ ...bounds, outline: [outline[0], outline[3], outline[1], outline[2], outline[4]] }), false);
  assert.equal(isLensMask({ ...bounds, outline: [outline[0], outline[1], outline[1], outline[3], outline[4]] }), false);
  assert.equal(isLensMask({ ...bounds, outline: [{ x: -1, y: 0 }, ...outline] }), false);
});
