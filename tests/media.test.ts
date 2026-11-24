import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import test from "node:test";
import {
  isAsset,
  localAssetPath,
  MAX_MEDIA_BYTES,
  storeMedia,
} from "../lib/media";

test("실제 이미지와 영상을 올바른 형식으로 저장하고 경로를 제한한다", async () => {
  for (const [file, type] of [
    ["portrait.webp", "image"],
    ["frame.webp", "image"],
    ["preview.mp4", "video"],
  ] as const) {
    const bytes = await readFile(`public/sample/${file}`);
    const asset = await storeMedia(bytes, `예제 ${file}`);
    try {
      assert.equal(asset.type, type);
      assert.ok(isAsset(asset));
      assert.deepEqual(await readFile(localAssetPath(asset)), bytes);
      assert.ok(
        !isAsset({ ...asset, type: type === "image" ? "video" : "image" }),
      );
    } finally {
      await rm(localAssetPath(asset));
    }
  }
  assert.ok(!isAsset({ url: "/sample/../.env", type: "image", name: "x" }));
  assert.ok(
    !isAsset({ url: "/api/assets/../../.env", type: "image", name: "x" }),
  );
  await assert.rejects(storeMedia(new Uint8Array([1, 2, 3]), "fake.png"));
  const invalidWav = Buffer.alloc(64);
  invalidWav.write("RIFF", 0);
  invalidWav.write("WAVE", 8);
  await assert.rejects(storeMedia(invalidWav, "broken.wav"), /음원 파일/);
  await assert.rejects(
    storeMedia(new Uint8Array(MAX_MEDIA_BYTES + 1), "large.png"),
  );
});
