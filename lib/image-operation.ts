import { isAsset } from "./asset-shape";
import type { Asset } from "./types";

export const imageOperationLabels = {
  layers: "레이어 편집",
  upscale: "업스케일",
  annotate: "주석",
  rotate: "회전",
  download: "다운로드",
  preview: "미리보기",
} as const;
export type ImageOperation = keyof typeof imageOperationLabels;
export type RotationOptions = { angle: number; flipX: boolean; flipY: boolean };
export type UpscaleSettings = { scale: 2 | 4 | 6; style: "natural" | "detail" };

type Source = { sourceId: string; sourceAsset: Asset };
export type ImageOperationDraft = Source & (
  { kind: "rotate"; settings?: RotationOptions } |
  { kind: "upscale"; settings?: UpscaleSettings }
);

export function isImageOperationDraft(value: unknown): value is ImageOperationDraft {
  if (!value || typeof value !== "object") return false;
  const { kind, sourceId, sourceAsset, settings } = value as Partial<ImageOperationDraft>;
  if ((kind !== "rotate" && kind !== "upscale") || typeof sourceId !== "string" ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(sourceId) || !isAsset(sourceAsset) || sourceAsset.type !== "image") return false;
  if (settings === undefined) return true;
  if (!settings || typeof settings !== "object") return false;
  if (kind === "upscale") return "scale" in settings && [2, 4, 6].includes(settings.scale) &&
    (settings.style === "natural" || settings.style === "detail");
  return "angle" in settings && Number.isInteger(settings.angle) && settings.angle >= 0 &&
    settings.angle <= 360 && typeof settings.flipX === "boolean" && typeof settings.flipY === "boolean";
}
