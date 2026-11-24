import { z } from "zod";

const id = z.string().uuid();
const vector = z.tuple([
  z.number().finite().min(-100).max(100),
  z.number().finite().min(-100).max(100),
  z.number().finite().min(-100).max(100),
]);
const angle = z.number().finite().min(-180).max(180);
const name = z.string().trim().min(1).max(120).nullable();
export const blenderSceneSchema = z
  .object({
    actors: z
      .array(
        z
          .object({
            characterId: id,
            action: name,
            loop: z.boolean(),
            poses: z
              .array(
                z
                  .object({
                    bone: z.string().min(1).max(120),
                    rotation: z.tuple([angle, angle, angle]),
                  })
                  .strict(),
              )
              .max(32),
            position: vector,
            rotation: angle,
            expressions: z
              .array(
                z
                  .object({
                    key: z.string().min(1).max(120),
                    value: z.number().min(0).max(1),
                  })
                  .strict(),
              )
              .max(32),
            lipCues: z
              .array(
                z
                  .object({
                    key: z.string().min(1).max(120),
                    time: z.number().min(0).max(30),
                    value: z.number().min(0).max(1),
                  })
                  .strict(),
              )
              .max(120),
          })
          .strict(),
      )
      .max(4)
      .optional(),
    characterId: id,
    environmentId: id,
    action: name,
    loop: z.boolean(),
    bone: name,
    boneRotation: z.tuple([angle, angle, angle]),
    poses: z
      .array(
        z
          .object({
            bone: z.string().trim().min(1).max(120),
            rotation: z.tuple([angle, angle, angle]),
          })
          .strict(),
      )
      .max(32)
      .optional(),
    characterPosition: vector,
    characterRotation: angle,
    environmentPosition: vector,
    environmentScale: z.number().finite().min(0.01).max(100),
    camera: z
      .object({
        position: vector,
        target: vector,
        endPosition: vector,
        lens: z.number().finite().min(10).max(150),
      })
      .strict(),
    light: z
      .object({
        position: vector,
        power: z.number().finite().min(0).max(10000),
        color: z.string().regex(/^#[0-9a-f]{6}$/i),
        ambient: z.number().finite().min(0).max(3),
      })
      .strict(),
    aspect: z.enum(["16:9", "9:16", "1:1"]),
    seconds: z.number().finite().min(1).max(30),
    fps: z.union([z.literal(24), z.literal(30)]),
  })
  .strict()
  .superRefine((scene, context) => {
    if (
      scene.camera.position.every(
        (value, index) => value === scene.camera.target[index],
      ) ||
      scene.camera.endPosition.every(
        (value, index) => value === scene.camera.target[index],
      )
    )
      context.addIssue({
        code: "custom",
        path: ["camera"],
        message: "카메라 위치와 목표를 다르게 설정하세요.",
      });
    if (
      scene.actors?.some((actor) =>
        actor.lipCues.some((cue) => cue.time > scene.seconds),
      )
    )
      context.addIssue({
        code: "custom",
        path: ["actors"],
        message: "입 모양 큐가 장면 길이를 벗어났습니다.",
      });
    if (
      scene.poses &&
      new Set(scene.poses.map((pose) => pose.bone)).size !== scene.poses.length
    )
      context.addIssue({
        code: "custom",
        path: ["poses"],
        message: "같은 본은 한 번만 선택하세요.",
      });
  });

export type BlenderSceneSpec = z.infer<typeof blenderSceneSchema>;

export function parseBlenderScene(value: unknown): BlenderSceneSpec | null {
  const result = blenderSceneSchema.safeParse(value);
  if (!result.success) return null;
  return result.data;
}

export function defaultBlenderScene(
  characterId: string,
  environmentId: string,
): BlenderSceneSpec {
  return {
    characterId,
    environmentId,
    action: null,
    loop: true,
    bone: null,
    boneRotation: [0, 0, 0],
    characterPosition: [0, 0, 0],
    characterRotation: 0,
    environmentPosition: [0, 0, 0],
    environmentScale: 1,
    camera: {
      position: [4, -6, 3],
      target: [0, 0, 1],
      endPosition: [3.5, -5.5, 2.8],
      lens: 40,
    },
    light: {
      position: [3, -4, 6],
      power: 650,
      color: "#fff4df",
      ambient: 0.45,
    },
    aspect: "16:9",
    seconds: 3,
    fps: 24,
  };
}
