import assert from "node:assert/strict";
import test from "node:test";
import {
  blenderSceneSchema,
  defaultBlenderScene,
  parseBlenderScene,
} from "../lib/blender-scene-spec";

const character = "00000000-0000-4000-8000-000000000001";
const background = "00000000-0000-4000-8000-000000000002";

test("3D 장면은 저장된 카메라·본·애니메이션과 여러 본 포즈를 복원한다", () => {
  const scene = {
    ...defaultBlenderScene(character, background),
    action: "Walk",
    bone: "Head",
    boneRotation: [0, 0, 10],
    poses: [{ bone: "Arm", rotation: [10, -20, 30] }],
  };
  assert.deepEqual(parseBlenderScene(JSON.parse(JSON.stringify(scene))), scene);
  assert.equal(blenderSceneSchema.safeParse(scene).success, true);
});

test("손상된 자산·포즈와 카메라 범위는 렌더 전에 거부한다", () => {
  const scene = defaultBlenderScene(character, background);
  assert.equal(
    parseBlenderScene({ ...scene, characterId: "../secret.glb" }),
    null,
  );
  assert.equal(parseBlenderScene({ ...scene, seconds: 999 }), null);
  assert.equal(
    parseBlenderScene({ ...scene, light: { ...scene.light, color: "red" } }),
    null,
  );
  assert.equal(
    parseBlenderScene({
      ...scene,
      camera: { ...scene.camera, target: scene.camera.position },
    }),
    null,
  );
  assert.equal(
    parseBlenderScene({
      ...scene,
      poses: [
        { bone: "Head", rotation: [0, 0, 0] },
        { bone: "Head", rotation: [0, 1, 0] },
      ],
    }),
    null,
  );
  assert.equal(
    blenderSceneSchema.safeParse({
      ...scene,
      poses: [
        { bone: "Head", rotation: [0, 0, 0] },
        { bone: "Head", rotation: [0, 1, 0] },
      ],
    }).success,
    false,
  );
});
