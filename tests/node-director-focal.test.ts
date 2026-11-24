import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { directorFocalLayers, directorFocalOriginY, directorFocalRange } from "../lib/node-director-direction";

const base = "public/director/focal-platform.webp";
const width = 418, height = 235, block = 32, reach = 5;

// 바로 아래에 깔리는 이미지에서 같은 화각의 영역을 잘라 같은 크기로 맞춘다.
async function reference(file: string, from: number, mm: number) {
  const { width: w, height: h } = await sharp(file).metadata();
  const ratio = from / mm;
  const area = { left: Math.round(w * (1 - ratio) / 2), top: Math.round(h * (1 - ratio) * directorFocalOriginY),
    width: Math.round(w * ratio), height: Math.round(h * ratio) };
  const crop = await sharp(file).removeAlpha().extract(area).png().toBuffer();
  return sharp(crop).resize(width, height, { fit: "fill" }).blur(1).removeAlpha().raw().toBuffer();
}

test("초점 거리 세부 이미지는 아래 이미지와 같은 위치와 색을 유지한다", async () => {
  assert.ok(directorFocalLayers.length >= 2);
  for (const [index, { mm, file }] of directorFocalLayers.entries()) {
    const below = index ? directorFocalLayers[index - 1] : null;
    const layer = sharp(`public${file}`);
    const meta = await layer.metadata();
    assert.ok(meta.width >= 1600 && meta.hasAlpha, file);
    const alpha = await sharp(`public${file}`).extractChannel("alpha").raw().toBuffer();
    assert.ok(alpha[0] < 8 && alpha[Math.floor(meta.height / 2) * meta.width + Math.floor(meta.width / 2)] > 250, "가장자리는 투명하고 가운데는 불투명하다");
    const a = await reference(below ? `public${below.file}` : base, below?.mm ?? directorFocalRange.min, mm);
    const b = await sharp(`public${file}`).resize(width, height, { fit: "fill" }).removeAlpha().blur(1).raw().toBuffer();
    const luma = (data: Buffer, i: number) => 0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2];
    const inset = Math.ceil(width * 0.12);
    const shifts: number[] = [];
    let difference = 0, samples = 0;
    for (let y = inset; y + block + reach < height - inset / 2; y += 24) for (let x = inset; x + block + reach < width - inset; x += 24) {
      let mean = 0, variance = 0;
      const n = block * block;
      for (let j = 0; j < block; j++) for (let i = 0; i < block; i++) mean += luma(a, (y + j) * width + x + i) / n;
      for (let j = 0; j < block; j++) for (let i = 0; i < block; i++) variance += (luma(a, (y + j) * width + x + i) - mean) ** 2;
      let other = 0;
      for (let j = 0; j < block; j++) for (let i = 0; i < block; i++) other += luma(b, (y + j) * width + x + i) / n;
      difference += Math.abs(mean - other);
      samples++;
      if (variance / n < 80) continue;
      let best = -2, shift = 0;
      for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
        let m = 0, ab = 0, bb = 0;
        for (let j = 0; j < block; j += 2) for (let i = 0; i < block; i += 2) m += luma(b, (y + j + dy) * width + x + i + dx) / (n / 4);
        for (let j = 0; j < block; j += 2) for (let i = 0; i < block; i += 2) {
          const p = luma(a, (y + j) * width + x + i) - mean, q = luma(b, (y + j + dy) * width + x + i + dx) - m;
          ab += p * q; bb += q * q;
        }
        const score = ab / Math.sqrt(variance / 4 * bb + 1);
        if (score > best) { best = score; shift = Math.hypot(dx, dy); }
      }
      shifts.push(shift);
    }
    shifts.sort((p, q) => p - q);
    assert.ok(shifts.length >= 20, `${file}: 비교할 무늬 ${shifts.length}곳`);
    assert.ok(shifts[Math.floor(shifts.length * 0.9)] <= 1.5, `${file}: 90% 어긋남 ${shifts[Math.floor(shifts.length * 0.9)].toFixed(1)}px`);
    assert.ok(difference / samples < 4, `${file}: 평균 밝기 차 ${(difference / samples).toFixed(1)}`);
  }
});
