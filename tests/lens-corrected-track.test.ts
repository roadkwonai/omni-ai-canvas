import { test } from "node:test";
import assert from "node:assert/strict";
import { trackCorrectedLensOutline } from "../lib/lens-corrected-track";

test("중간 프레임 윤곽을 정확히 고정하고 전후의 추적을 이어간다", () => {
  const width = 160, height = 100;
  const texture = (x: number, y: number) => Math.sin(x * .31 + y * .18) * 35 +
    Math.sin(x * .73 - y * .39) * 34 + Math.sin(x * .17 + y * .83) * 30 +
    Math.cos(x * .52 + y * .47) * 25 + 128;
  const images = Array.from({ length: 8 }, (_, n) => {
    const pixels = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
      pixels[y * width + x] = texture(x - n * .4, y - n * .2);
    return pixels;
  });
  const outline = [{x:.32,y:.3},{x:.48,y:.25},{x:.62,y:.3},{x:.66,y:.5},{x:.57,y:.7},{x:.4,y:.72},{x:.3,y:.5}];
  const uncorrected = trackCorrectedLensOutline(images, width, height, outline);
  const corrected = uncorrected.frames[3].outline.map((p, i) => i === 0 ? { ...p, x: p.x + .01 } : p);
  const result = trackCorrectedLensOutline(images, width, height, outline, [{ frame: 3, outline: corrected }]);
  assert.equal(result.frames.length, images.length);
  assert.deepEqual(result.frames[3].outline, corrected);
  assert.ok(result.frames[2].outline[0].x > uncorrected.frames[2].outline[0].x);
  assert.ok(result.frames[4].outline[0].x > uncorrected.frames[4].outline[0].x);
  assert.deepEqual(result.frames[0].outline, outline);
  assert.throws(() => trackCorrectedLensOutline(images, width, height, outline, [{ frame: 8, outline: corrected }]), /보정/);
});
