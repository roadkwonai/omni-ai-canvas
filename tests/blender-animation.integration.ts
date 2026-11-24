import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { unlink } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import sharp from "sharp";
import { defaultBlenderScene } from "../lib/blender-scene-spec";
import { renderBlenderScene } from "../lib/blender-render";
import { localAssetPath } from "../lib/media";

const exec = promisify(execFile);
const characterPath = process.env.SCENE_ROOM_BLENDER_CHARACTER;
const environmentPath = process.env.SCENE_ROOM_BLENDER_ENVIRONMENT;
const available = Boolean(characterPath && environmentPath);
const uuid = "00000000-0000-4000-8000-000000000001";

async function frame(video: string, seconds: number) {
  const { stdout } = await exec("ffmpeg", ["-v", "error", "-ss", String(seconds), "-i", video, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"], { encoding: "buffer", maxBuffer: 4_000_000 });
  return sharp(stdout).resize(160, 90).removeAlpha().raw().toBuffer();
}

function averageDifference(a: Buffer, b: Buffer) {
  assert.equal(a.length, b.length);
  return a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0) / a.length;
}

test("Fox의 기본 액션을 끈 정지 포즈와 사용자가 선택한 Walk가 다르게 재생된다", { skip: !available, timeout: 180_000 }, async () => {
  const scene = defaultBlenderScene(uuid, uuid);
  scene.seconds = 1;
  scene.camera.endPosition = [...scene.camera.position];
  scene.bone = "b_Head_05";
  scene.boneRotation = [0, 0, 12];
  const paths = { characterPath: path.resolve(characterPath!), environmentPath: path.resolve(environmentPath!) };
  const created = [];
  try {
    const still = await renderBlenderScene(scene, paths, "preview");
    created.push(localAssetPath(still));
    const walking = await renderBlenderScene({ ...scene, action: "Walk", loop: true }, paths, "preview");
    created.push(localAssetPath(walking));
    const [stillStart, stillEnd, walkStart, walkEnd] = await Promise.all([
      frame(created[0], 0.1), frame(created[0], 0.7), frame(created[1], 0.1), frame(created[1], 0.7),
    ]);
    const stillDiff = averageDifference(stillStart, stillEnd);
    const walkDiff = averageDifference(walkStart, walkEnd);
    assert.ok(stillDiff < 0.8, `정지 장면 차이 ${stillDiff}`);
    assert.ok(walkDiff > stillDiff + 0.8, `Walk 차이 ${walkDiff}, 정지 ${stillDiff}`);
  } finally {
    await Promise.all(created.map((filename) => unlink(filename).catch(() => {})));
  }
});
