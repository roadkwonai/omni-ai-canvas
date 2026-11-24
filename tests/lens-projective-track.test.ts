import assert from "node:assert/strict";
import { test } from "node:test";
import { trackLensOutline } from "../lib/lens-projective-track";

test("렌즈 윤곽의 이동과 원근 변화를 추적한다", () => {
  const width = 200, height = 120;
  const pattern = (x: number, y: number) => Math.max(0, Math.min(255,
    128 + 36 * Math.sin(x * 0.31 + y * 0.18) + 34 * Math.cos(x * 0.62 - y * 0.37) + 30 * Math.sin(x * 0.19 + y * 0.71)));
  const frames: Uint8Array[] = [];
  for (let n = 0; n < 9; n++) {
    const frame = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const dx = x - 100 - n * 0.35, dy = y - 60 - n * 0.12;
      const denominator = 1 + n * 0.0005 * dx;
      frame[y * width + x] = pattern(dx / denominator + 100, dy / denominator + 60);
    }
    frames.push(frame);
  }
  const outline = [{x:.35,y:.3},{x:.46,y:.24},{x:.60,y:.28},{x:.65,y:.42},
    {x:.62,y:.62},{x:.5,y:.72},{x:.37,y:.65},{x:.32,y:.48}];
  const result = trackLensOutline(frames, width, height, outline);
  assert.equal(result.frames.length, 9);
  assert.ok(result.frames.at(-1)!.centerX > result.frames[0].centerX + 0.3);
  assert.ok(result.minimumConfidence > 0.8);
  assert.notDeepEqual(result.frames.at(-1)!.outline, outline);
});

test("특징점이 없는 렌즈는 추적하지 않는다", () => {
  assert.throws(() => trackLensOutline([new Uint8Array(200 * 120)], 200, 120,
    [{x:.3,y:.3},{x:.6,y:.3},{x:.6,y:.7},{x:.3,y:.7}]), /무늬/);
});
