import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";
import sharp from "sharp";
import { directorPresets, type DirectorPreset } from "../lib/node-director-presets";

test("예제가 있는 항목은 이미지 파일을, 움직임 항목은 영상 파일까지 갖춘다", async () => {
  const root = "public/director/examples/";
  for (const [key, list] of Object.entries(directorPresets) as [string, readonly DirectorPreset[]][]) {
    for (const { id, video } of list) {
      if (id) assert.ok((await stat(`${root}${id}.webp`)).size > 2000, id);
      if (id && (video || ["movement", "tempo"].includes(key))) assert.ok((await stat(`${root}${id}.mp4`)).size > 2000, id);
    }
  }
  assert.ok((await stat(`${root}optics-base.webp`)).size > 2000);
});

test("재생하는 예제 영상은 카드 사진과 같은 장면이다", async () => {
  const root = "public/director/examples/";
  const run = promisify(execFile);
  const thumb = (input: Buffer | string) => sharp(input).resize(24, 24, { fit: "cover" }).removeAlpha().blur(1).raw().toBuffer();
  const list = Object.values(directorPresets).flat() as readonly DirectorPreset[];
  const videos = list.filter(({ id, video }) => id && video);
  assert.ok(videos.length);
  for (const { id } of videos) {
    const { stdout } = await run("ffmpeg", ["-v", "error", "-i", `${root}${id}.mp4`, "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "-"],
      { encoding: "buffer", maxBuffer: 20_000_000 });
    const [still, frame] = await Promise.all([thumb(`${root}${id}.webp`), thumb(stdout)]);
    const difference = still.reduce((sum, value, index) => sum + Math.abs(value - frame[index]), 0) / still.length;
    assert.ok(difference < 14, `${id}: ${difference.toFixed(1)}`);
  }
});

test("조리개 예제는 값이 커질수록 배경이 선명해진다", async () => {
  const width = 512;
  const sharpness = async (id: string) => {
    const data = await sharp(`public/director/examples/${id}.webp`).resize(width, width).greyscale().raw().toBuffer();
    let sum = 0, count = 0;
    for (let y = Math.round(width * 0.2); y < width * 0.62; y++) for (let x = 2; x < width - 2; x++) {
      if (x > width * 0.27 && x < width * 0.73) continue;
      sum += Math.abs(4 * data[y * width + x] - data[y * width + x - 1] - data[y * width + x + 1] - data[(y - 1) * width + x] - data[(y + 1) * width + x]);
      count++;
    }
    return sum / count;
  };
  const [f14, f2, f28, f4, f56, f8, f11] = await Promise.all(directorPresets.aperture.map(({ id }) => sharpness(id)));
  const values = [Math.max(f14, f2), f28, f4, f56, Math.min(f8, f11)];
  values.slice(1).forEach((value, index) => assert.ok(value > values[index], values.map((item) => item.toFixed(1)).join(" < ")));
});

test("카메라·렌즈 예제는 기준 사진과 구별된다", async () => {
  const small = (id: string) => sharp(`public/director/examples/${id}.webp`).resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const base = await small("optics-base");
  for (const { id } of [...directorPresets.camera, ...directorPresets.lens]) {
    const data = await small(id);
    const difference = data.reduce((sum, value, index) => sum + Math.abs(value - base[index]), 0) / data.length;
    assert.ok(difference >= 4, `${id}: ${difference.toFixed(1)}`);
  }
});
