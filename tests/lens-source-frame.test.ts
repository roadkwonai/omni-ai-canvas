import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import sharp from "sharp";
import { lensAnchorFrame } from "../lib/lens-transition-render";
import { previewLensSourceFrame } from "../lib/lens-source-frame";
import { localAssetPath, storeMedia } from "../lib/media";
import type { Asset } from "../lib/types";

test("원본 미리보기는 가변 프레임률 영상에서 렌즈 렌더의 30fps 프레임을 사용한다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "lens-source-frame-"));
  let asset: Asset | undefined;
  try {
    const file = path.join(directory, "variable.mp4");
    await promisify(execFile)("ffmpeg", ["-v", "error", "-nostdin", "-f", "lavfi", "-i", "testsrc2=s=160x90:r=24:d=2",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-vf", "select=not(mod(n\\,3))+not(mod(n\\,5))",
      "-fps_mode", "vfr", "-c:v", "libx264", "-c:a", "aac", file]);
    asset = await storeMedia(await readFile(file), "가변 프레임률 테스트", "video");
    const signal = new AbortController().signal;
    const original = await lensAnchorFrame(asset, "16:9", 16);
    const preview = await previewLensSourceFrame(asset, "16:9", 16, signal);
    assert.equal(preview.frame, 16);
    const pixels = (image: Buffer) => sharp(image).resize(160, 90).toColourspace("srgb").removeAlpha().raw().toBuffer();
    const [expected, actual] = await Promise.all([pixels(Buffer.from(original)), pixels(preview.image)]);
    const error = expected.reduce((sum, value, index) => sum + Math.abs(value - actual[index]), 0) / expected.length;
    assert.ok(error < 4, `미리보기와 기준 프레임의 픽셀 오차 ${error}`);

    const end = await previewLensSourceFrame(asset, "16:9", 12_600, signal);
    assert.equal(end.frame, end.lastFrame);
    assert.equal(end.lastFrame, 59);
    await assert.rejects(lensAnchorFrame(asset, "16:9", end.lastFrame + 1));
  } finally {
    await Promise.all([rm(directory, { recursive: true, force: true }), asset && rm(localAssetPath(asset), { force: true })]);
  }
});
