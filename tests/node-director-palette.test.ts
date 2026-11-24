import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { directorPaletteSheet, directorPresets } from "../lib/node-director-presets";

// CIELAB 평균색으로 카드 이름과 예제 색이 맞는지 확인한다.
function lab([red, green, blue]: number[]) {
  const [r, g, b] = [red, green, blue].map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  const a = 500 * (x - y), bAxis = 200 * (y - z);
  return { l: 116 * y - 16, a, b: bAxis, chroma: Math.hypot(a, bAxis), hue: (Math.atan2(bAxis, a) * 180 / Math.PI + 360) % 360 };
}

async function paletteColors() {
  const { file, columns, rows } = directorPaletteSheet;
  const image = sharp(`public${file}`);
  const { width, height } = await image.metadata();
  assert.equal(columns * rows, directorPresets.palette.length);
  const size = { width: Math.floor(width / columns), height: Math.floor(height / rows) };
  const entries = await Promise.all(directorPresets.palette.map(async ({ name }, index) => {
    // stats()는 원본 전체를 읽으므로 잘라낸 칸을 먼저 버퍼로 만든다.
    const tile = await image.clone().extract({
      ...size, left: index % columns * size.width, top: Math.floor(index / columns) * size.height,
    }).png().toBuffer();
    const { channels } = await sharp(tile).stats();
    return [name, lab(channels.slice(0, 3).map(({ mean }) => mean))] as const;
  }));
  return new Map<string, ReturnType<typeof lab>>(entries);
}

test("색감 예제는 카드 이름에 해당하는 색상 범위를 보여준다", async () => {
  const colors = await paletteColors();
  // [최소 색상각, 최대 색상각, 최소 채도]. 0도는 분홍·자홍, 90도는 노랑, 180도는 녹색, 270도는 파랑이다.
  const expected: Record<string, [number, number, number]> = {
    "차가운 청색": [235, 285, 8], "따뜻한 황금색": [55, 90, 12], "흙빛": [45, 85, 7],
    "황혼의 보라색": [300, 340, 10], "차분한 녹색": [125, 175, 7],
    "차분한 회녹색": [120, 185, 3], "옅은 분홍빛": [340, 385, 9], "따뜻한 복숭아빛": [30, 60, 12],
    "어두운 남색": [255, 295, 10], "주황빛 석양": [45, 72, 25], "선명한 자홍색": [320, 360, 28],
  };
  for (const [name, [from, to, chroma]] of Object.entries(expected)) {
    const color = colors.get(name)!;
    const hue = color.hue < from && color.hue + 360 <= to ? color.hue + 360 : color.hue;
    assert.ok(hue >= from && hue <= to && color.chroma >= chroma, `${name}: 색상각 ${hue.toFixed(0)}, 채도 ${color.chroma.toFixed(1)}`);
  }
  assert.ok(colors.get("흑백")!.chroma < 1);
  assert.ok(colors.get("차분한 회녹색")!.chroma < colors.get("차분한 녹색")!.chroma);
  assert.ok(colors.get("어두운 남색")!.l < 25);
});

test("색감 예제는 서로 구별된다", async () => {
  const colors = [...await paletteColors()];
  colors.forEach(([name, one], index) => colors.slice(index + 1).forEach(([other, two]) => {
    const distance = Math.hypot(one.l - two.l, one.a - two.a, one.b - two.b);
    assert.ok(distance >= 3, `${name} / ${other}: ${distance.toFixed(1)}`);
  }));
});
