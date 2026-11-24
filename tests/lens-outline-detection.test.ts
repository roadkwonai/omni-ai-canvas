import assert from "node:assert/strict";
import { test } from "node:test";
import { detectLensOutline } from "../lib/lens-outline-detection";
import { isLensMask } from "../lib/lens-transition-spec";

test("한 점에서 비원형 안경테 안쪽 윤곽을 찾는다", () => {
  const width = 320, height = 180, rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const distance = ((x - 155) / 45) ** 2 + ((y - 85) / 35) ** 2;
    const gray = distance > 0.88 && distance < 1.16 ? 18 : 195;
    rgb.fill(gray, (y * width + x) * 3, (y * width + x) * 3 + 3);
  }
  const outline = detectLensOutline(rgb, width, height, { x: 155 / width, y: 85 / height });
  const xs = outline.map(p => p.x), ys = outline.map(p => p.y);
  const mask = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), outline };
  assert.equal(isLensMask(mask), true);
  assert.ok(Math.abs(mask.width * width - 90) < 20);
  assert.ok(Math.abs(mask.height * height - 70) < 20);
});
test("테두리가 없는 화면은 명시적으로 실패한다", () => {
  assert.throws(() => detectLensOutline(new Uint8Array(320 * 180 * 3).fill(100), 320, 180, { x: .5, y: .5 }), /찾지 못했습니다/);
});
