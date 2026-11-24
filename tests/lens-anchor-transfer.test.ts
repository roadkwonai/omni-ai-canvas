import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { transferLensAnchor } from "../lib/lens-anchor-transfer";
import { localAssetPath, storeMedia } from "../lib/media";
import { isLensMask, type LensPoint, type LensTransitionRecipe } from "../lib/lens-transition-spec";
import type { Asset } from "../lib/types";

const outline: LensPoint[] = [
  { x: .32, y: .30 }, { x: .48, y: .25 }, { x: .62, y: .30 },
  { x: .66, y: .50 }, { x: .57, y: .70 }, { x: .40, y: .72 }, { x: .30, y: .50 },
];

test("저장한 렌즈 윤곽을 앞뒤 프레임으로 옮기고 보정의 원본 프레임을 유지한다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "lens-anchor-test-"));
  let asset: Asset | undefined;
  let plainAsset: Asset | undefined;
  try {
    const video = path.join(directory, "texture.mp4");
    await promisify(execFile)("ffmpeg", ["-v", "error", "-nostdin", "-f", "lavfi", "-i",
      "testsrc2=s=320x180:r=30:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", video]);
    asset = await storeMedia(await readFile(video), "테스트 원본", "video");
    const source = { nodeId: "take", asset, startFrame: 8 };
    const correction = outline.map((point, index) => index === 0 ? { ...point, x: point.x + .01 } : { ...point });
    const recipe: LensTransitionRecipe = {
      version: 1, aspect: "16:9", frames: 24, outgoing: source,
      incoming: { ...source, nodeId: "next", startFrame: 0 },
      mask: { x: .3, y: .25, width: .36, height: .47, outline },
      corrections: [{ frame: 4, outline: correction }],
      anchorCheckpoints: [{ sourceFrame: 12, outline }],
    };
    const signal = new AbortController().signal;
    const exact = await transferLensAnchor(recipe, 12, signal);
    assert.deepEqual(exact.mask.outline, correction);
    assert.deepEqual(exact.corrections, []);
    const forward = await transferLensAnchor(recipe, 10, signal);
    assert.ok(isLensMask(forward.mask));
    assert.equal(forward.mask.outline?.length, outline.length);
    assert.equal(forward.corrections[0]?.frame, 2);
    assert.deepEqual(forward.corrections[0]?.outline, correction);
    const backward = await transferLensAnchor(recipe, 7, signal);
    assert.ok(isLensMask(backward.mask));
    assert.equal(backward.corrections[0]?.frame, 5);
    assert.equal(backward.mask.outline?.length, outline.length);
    await assert.rejects(transferLensAnchor(recipe, 30, signal), /끝/);
    await assert.rejects(transferLensAnchor(recipe, -1, signal), /범위/);
    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(transferLensAnchor(recipe, 7, aborted.signal), /abort/i);

    const plain = path.join(directory, "plain.mp4");
    await promisify(execFile)("ffmpeg", ["-v", "error", "-nostdin", "-f", "lavfi", "-i",
      "color=c=gray:s=320x180:r=30:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", plain]);
    plainAsset = await storeMedia(await readFile(plain), "무늬 없는 원본", "video");
    const uncertain = await transferLensAnchor({ ...recipe, outgoing: { ...source, asset: plainAsset },
      mask: { x: .3, y: .25, width: .36, height: .47, angle: 15 }, corrections: [] }, 7, signal);
    assert.equal(uncertain.needsAdjustment, true);
    assert.ok(isLensMask(uncertain.mask));
    assert.equal(uncertain.mask.outline?.length, 32);
  } finally {
    await Promise.all([rm(directory, { recursive: true, force: true }), asset && rm(localAssetPath(asset), { force: true }),
      plainAsset && rm(localAssetPath(plainAsset), { force: true })]);
  }
});

test("추적이 끊긴 실제 프레임에서 보정해 양방향으로 이어간다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "lens-interrupted-test-"));
  let asset: Asset | undefined;
  try {
    const video = path.join(directory, "cut.mp4");
    await promisify(execFile)("ffmpeg", ["-v", "error", "-nostdin", "-f", "lavfi", "-i",
      "testsrc2=s=320x180:r=30:d=1", "-vf",
      "select=eq(n\\,0),loop=loop=29:size=1:start=0,setpts=N/(30*TB),drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='eq(n,15)'",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-fps_mode", "passthrough", "-y", video]);
    asset = await storeMedia(await readFile(video), "불연속 테스트", "video");
    const recipe: LensTransitionRecipe = {
      version: 1, aspect: "16:9", frames: 24,
      outgoing: { nodeId: "take", asset, startFrame: 5 },
      incoming: { nodeId: "next", asset, startFrame: 0 },
      mask: { x: .3, y: .25, width: .36, height: .47, outline }, corrections: [],
    };
    const signal = new AbortController().signal;
    const stopped = await transferLensAnchor(recipe, 20, signal);
    assert.equal(stopped.needsAdjustment, true);
    assert.equal(stopped.interruptedFrame, 15);
    assert.ok(isLensMask(stopped.mask));
    const checkpoint = { sourceFrame: stopped.interruptedFrame, outline };
    const blocked = await transferLensAnchor(recipe, 20, signal, [checkpoint]);
    assert.equal(blocked.interruptedFrame, 15);
    const resumed = await transferLensAnchor(recipe, 20, signal, [{ sourceFrame: 16, outline }]);
    assert.equal(resumed.interruptedFrame, undefined);
    assert.ok(isLensMask(resumed.mask));
    const backwards = await transferLensAnchor(recipe, 3, signal, [{ sourceFrame: 16, outline }]);
    assert.equal(backwards.needsAdjustment, true);
    assert.equal(backwards.interruptedFrame, 15);

    const moved = await transferLensAnchor(recipe, 12, signal, [{ sourceFrame: 16, outline }]);
    assert.equal(moved.interruptedFrame, 15);
    assert.equal(moved.corrections[0]?.frame, 4);
    assert.deepEqual(moved.corrections[0]?.outline, outline);
    await assert.rejects(transferLensAnchor(recipe, 20, signal, [{ sourceFrame: -1, outline }]), /보정/);
  } finally {
    await Promise.all([rm(directory, { recursive: true, force: true }), asset && rm(localAssetPath(asset), { force: true })]);
  }
});

test("긴 이동도 프레임을 건너뛰지 않고 첫 중단 위치를 찾는다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "lens-long-track-test-"));
  let asset: Asset | undefined;
  try {
    const video = path.join(directory, "long-cut.mp4");
    await promisify(execFile)("ffmpeg", ["-v", "error", "-nostdin", "-f", "lavfi", "-i",
      "testsrc2=s=320x180:r=30:d=4", "-vf",
      "select=eq(n\\,0),loop=loop=119:size=1:start=0,setpts=N/(30*TB),drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='eq(n,95)'",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-fps_mode", "passthrough", "-y", video]);
    asset = await storeMedia(await readFile(video), "긴 추적 테스트", "video");
    const recipe: LensTransitionRecipe = {
      version: 1, aspect: "16:9", frames: 24,
      outgoing: { nodeId: "take", asset, startFrame: 3 },
      incoming: { nodeId: "next", asset, startFrame: 0 },
      mask: { x: .3, y: .25, width: .36, height: .47, outline }, corrections: [],
    };
    const stopped = await transferLensAnchor(recipe, 110, new AbortController().signal);
    assert.equal(stopped.needsAdjustment, true);
    assert.equal(stopped.interruptedFrame, 95);
  } finally {
    await Promise.all([rm(directory, { recursive: true, force: true }), asset && rm(localAssetPath(asset), { force: true })]);
  }
});
