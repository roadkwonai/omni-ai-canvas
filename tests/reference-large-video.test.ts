import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, open, rm, stat, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { inspectAttachmentFile } from "../lib/attachment-files";
import { localAssetPath, MAX_MEDIA_BYTES, storeReferenceVideoFile } from "../lib/media";
import { MAX_REFERENCE_VIDEO_BYTES } from "../lib/reference-limits";

const exec = promisify(execFile);

test("10분과 64 MiB를 넘는 레퍼런스를 파일 경로로 분석하고 재분석은 원본을 공유한다", { timeout: 180_000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "large-reference-test-"));
  const input = path.join(root, "long.mp4");
  const assets: string[] = [];
  try {
    await exec("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=64x64:r=1:d=601", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", input], { timeout: 60_000 });
    const file = await open(input, "r+");
    await file.truncate(MAX_MEDIA_BYTES + 1);
    await file.close();
    const result = await inspectAttachmentFile(input, "long.mp4", { referenceVideo: true });
    assert.ok(result.asset);
    assets.push(...[result.asset, ...(result.frames ?? []), ...(result.analysisSheets ?? [])].map(localAssetPath));
    assert.ok(result.referenceTiming && result.referenceTiming.durationSeconds > 600);
    assert.equal((await stat(localAssetPath(result.asset))).size, MAX_MEDIA_BYTES + 1);
    const selected = await inspectAttachmentFile(localAssetPath(result.asset), "long.mp4", { referenceVideo: true, existingAsset: result.asset, cutRange: { first: 1, last: 1 } });
    assert.equal(selected.asset?.url, result.asset.url);
    assets.push(...[...(selected.frames ?? []), ...(selected.analysisSheets ?? [])].map(localAssetPath));
    assert.ok((await stat(localAssetPath(result.asset))).isFile());
    const invalid = path.join(root, "invalid.mp4");
    const bad = await open(invalid, "w");
    await bad.truncate(MAX_REFERENCE_VIDEO_BYTES + 1);
    await bad.close();
    await assert.rejects(storeReferenceVideoFile(invalid, "invalid.mp4"), /1 GiB/);
    const tooLong = path.join(root, "too-long.mp4");
    await exec("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=16x16:r=1:d=3601", "-c:v", "libx264", "-y", tooLong], { timeout: 60_000 });
    await assert.rejects(inspectAttachmentFile(tooLong, "too-long.mp4", { referenceVideo: true }), /60분/);
  } finally {
    await Promise.all(assets.map((file) => unlink(file).catch(() => {})));
    await rm(root, { recursive: true, force: true });
  }
});
