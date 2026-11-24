import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { renderLensTransition, reviewLensTransition } from "../lib/lens-transition-render";
import { localAssetPath, storeMedia } from "../lib/media";
import type { Asset } from "../lib/types";

const exec = promisify(execFile);

test("소리가 있는 세로 원본과 무음 가로 원본을 렌즈 전환 MP4로 렌더한다", { timeout: 60000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "lens-render-test-"));
  const assets: Asset[] = [];
  try {
    const first = path.join(directory, "first.mp4"), second = path.join(directory, "second.mp4");
    // 멈춘 무늬라 추적이 안정적이고, 원본마다 화면비가 달라 크기 조정과 여백 필터를 함께 지난다.
    await exec("ffmpeg", ["-v", "error", "-nostdin", "-f", "lavfi", "-i", "testsrc2=s=180x320:r=30:d=1", "-f", "lavfi", "-i", "sine=d=1",
      "-vf", "select=eq(n\\,0),loop=loop=29:size=1:start=0,setpts=N/(30*TB)", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-y", first]);
    await exec("ffmpeg", ["-v", "error", "-nostdin", "-f", "lavfi", "-i", "color=c=red:s=320x180:r=24:d=1",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", second]);
    const outgoing = await storeMedia(await readFile(first), "앞 원본", "video");
    assets.push(outgoing);
    const incoming = await storeMedia(await readFile(second), "뒤 원본", "video");
    assets.push(incoming);
    const options = { outgoing, aspect: "9:16" as const, outgoingStart: 2, frames: 24, mask: {
      x: .3, y: .25, width: .36, height: .47, outline: [
        { x: .32, y: .30 }, { x: .48, y: .25 }, { x: .62, y: .30 },
        { x: .66, y: .50 }, { x: .57, y: .70 }, { x: .40, y: .72 }, { x: .30, y: .50 },
      ] } };
    const review = await reviewLensTransition(options);
    assert.equal(review.frames.length, 12);
    const { asset, tracking } = await renderLensTransition({ ...options, incoming, incomingStart: 0 });
    assets.push(asset);
    assert.equal(tracking.trackedFrames, 12);
    const { stdout } = await exec("ffprobe", ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,nb_read_frames", "-of", "json", localAssetPath(asset)]);
    const { streams } = JSON.parse(stdout) as { streams: { codec_type: string; width?: number; height?: number; nb_read_frames: string }[] };
    const video = streams.find((stream) => stream.codec_type === "video");
    assert.deepEqual([video?.width, video?.height, video?.nb_read_frames], [720, 1280, "24"]);
    assert.ok(streams.some((stream) => stream.codec_type === "audio"));
  } finally {
    await Promise.all([rm(directory, { recursive: true, force: true }), ...assets.map((asset) => rm(localAssetPath(asset), { force: true }))]);
  }
});
