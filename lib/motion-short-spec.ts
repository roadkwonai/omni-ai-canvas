import { isAsset } from "./asset-shape";
import type { Asset } from "./types";

export const motionRecipes = {
  type: "키네틱 타이포",
  number: "숫자와 진행 차트",
  steps: "단계 설명",
  cards: "카드 스토리",
  parallax: "이미지 깊이 연출",
  character: "캐릭터 컷아웃",
} as const;
export type MotionRecipe = keyof typeof motionRecipes;
export type MotionShortScene = {
  text: string;
  seconds: number;
  recipe?: MotionRecipe;
  detail?: string;
  value?: number;
  image?: Asset;
  character?: Asset;
};
export type MotionShortSpec = {
  scenes: MotionShortScene[];
  aspect: "9:16" | "16:9";
  background: string;
  foreground: string;
  layout: "center" | "left";
  motion: "fade" | "zoom" | "rise";
  accent?: string;
  easing?: "smooth" | "snappy";
};

export function scenesFromBeats(
  beats: { endPercent: number }[],
  selected: number[],
): MotionShortScene[] {
  if (
    selected.length < 1 ||
    selected.length > 24 ||
    new Set(selected).size !== selected.length ||
    selected.some(
      (index) => !Number.isInteger(index) || index < 0 || index >= beats.length,
    ) ||
    beats.some(
      (beat, index) =>
        !Number.isFinite(beat.endPercent) ||
        beat.endPercent <= (beats[index - 1]?.endPercent ?? 0) ||
        beat.endPercent > 100,
    )
  )
    return [];
  const intervals = [...selected]
    .sort((a, b) => a - b)
    .map(
      (index) => beats[index].endPercent - (beats[index - 1]?.endPercent ?? 0),
    );
  const total = intervals.reduce((sum, interval) => sum + interval, 0);
  return intervals.map((interval) => ({
    text: "",
    seconds: Math.max(
      1,
      Math.min(8, Math.round((interval / total) * 24 * 2) / 2),
    ),
  }));
}

export function parseMotionShort(value: unknown): MotionShortSpec | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const spec = value as Record<string, unknown>;
  if (
    !Array.isArray(spec.scenes) ||
    spec.scenes.length < 1 ||
    spec.scenes.length > 48 ||
    !["9:16", "16:9"].includes(spec.aspect as string) ||
    !["center", "left"].includes(spec.layout as string) ||
    !["fade", "zoom", "rise"].includes(spec.motion as string) ||
    typeof spec.background !== "string" ||
    !/^#[0-9a-f]{6}$/i.test(spec.background) ||
    typeof spec.foreground !== "string" ||
    !/^#[0-9a-f]{6}$/i.test(spec.foreground) ||
    (spec.accent !== undefined &&
      (typeof spec.accent !== "string" ||
        !/^#[0-9a-f]{6}$/i.test(spec.accent))) ||
    (spec.easing !== undefined &&
      !["smooth", "snappy"].includes(spec.easing as string))
  )
    return null;
  const scenes: MotionShortScene[] = [];
  for (const entry of spec.scenes) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      return null;
    const scene = entry as Record<string, unknown>;
    if (
      typeof scene.text !== "string" ||
      !scene.text.trim() ||
      scene.text.length > 100 ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(scene.text) ||
      typeof scene.seconds !== "number" ||
      !Number.isFinite(scene.seconds) ||
      scene.seconds < 1 ||
      scene.seconds > 30 ||
      (scene.recipe !== undefined &&
        (typeof scene.recipe !== "string" ||
          !Object.hasOwn(motionRecipes, scene.recipe))) ||
      (scene.detail !== undefined &&
        (typeof scene.detail !== "string" ||
          scene.detail.length > 120 ||
          /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(scene.detail))) ||
      (scene.value !== undefined &&
        (typeof scene.value !== "number" ||
          !Number.isFinite(scene.value) ||
          scene.value < 0 ||
          scene.value > 100)) ||
      (scene.image !== undefined &&
        (!isAsset(scene.image) || scene.image.type !== "image")) ||
      (scene.recipe === "parallax" && !scene.image) ||
      (scene.character !== undefined &&
        (!isAsset(scene.character) || scene.character.type !== "image")) ||
      (scene.recipe === "character" && !scene.character)
    )
      return null;
    scenes.push({
      text: scene.text.trim(),
      seconds: scene.seconds,
      ...(scene.recipe !== undefined
        ? { recipe: scene.recipe as MotionRecipe }
        : {}),
      ...(scene.detail !== undefined
        ? { detail: (scene.detail as string).trim() }
        : {}),
      ...(scene.value !== undefined ? { value: scene.value as number } : {}),
      ...(scene.image !== undefined ? { image: scene.image as Asset } : {}),
      ...(scene.character !== undefined
        ? { character: scene.character as Asset }
        : {}),
    });
  }
  if (scenes.reduce((sum, scene) => sum + scene.seconds, 0) > 600) return null;
  return {
    scenes,
    aspect: spec.aspect as MotionShortSpec["aspect"],
    background: spec.background,
    foreground: spec.foreground,
    layout: spec.layout as MotionShortSpec["layout"],
    motion: spec.motion as MotionShortSpec["motion"],
    ...(spec.accent !== undefined ? { accent: spec.accent as string } : {}),
    ...(spec.easing !== undefined
      ? { easing: spec.easing as MotionShortSpec["easing"] }
      : {}),
  };
}
