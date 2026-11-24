import { test } from "node:test";
import assert from "node:assert/strict";
import { trackLensAffine } from "../lib/lens-affine-track";

test("비등방 크기와 회전, 위치 변화를 누적 추적한다", () => {
  const width = 160, height = 100, frames: Uint8Array[] = [];
  const texture = (x: number, y: number) => (Math.sin(x * 0.31 + y * 0.18) * 35 + Math.sin(x * 0.73 - y * 0.39) * 34 + Math.sin(x * 0.17 + y * 0.83) * 30 + Math.cos(x * 0.52 + y * 0.47) * 25 + 128);
  for (let n = 0; n < 8; n++) {
    const frame = new Uint8Array(width * height);
    const angle = n * 0.013, sx = 1 + n * 0.008, sy = 1 - n * 0.006;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const dx = x - 80 - n * 0.4, dy = y - 50 - n * 0.2;
      const xx = (Math.cos(angle) * dx + Math.sin(angle) * dy) / sx + 80;
      const yy = (-Math.sin(angle) * dx + Math.cos(angle) * dy) / sy + 50;
      frame[y * width + x] = Math.max(0, Math.min(255, texture(xx, yy)));
    }
    frames.push(frame);
  }
  const result = trackLensAffine(frames, width, height, { x: 0.32, y: 0.25, width: 0.36, height: 0.5 });
  const end = result.frames.at(-1)!;
  assert.ok(Math.abs(end.centerX - 82.8) < 3);
  assert.ok(Math.abs(end.centerY - 51.4) < 3);
  assert.ok(end.b > 0.025, JSON.stringify(end));
  assert.ok(end.a > 1.01, JSON.stringify(end));
  assert.ok(end.d < 1.01, JSON.stringify(end));
});

test("평면 텍스처는 추적 실패로 안내한다", () => {
  assert.throws(() => trackLensAffine([new Uint8Array(16000)], 160, 100, { x: 0.3, y: 0.3, width: 0.3, height: 0.3 }), /무늬/);
});
