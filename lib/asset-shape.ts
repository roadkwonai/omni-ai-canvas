import type { Asset } from "./types";

const sampleTypes: Record<string, Asset["type"]> = {
  "/sample/portrait.webp": "image",
  "/sample/frame.webp": "image",
  "/sample/preview.mp4": "video",
};

export function isAsset(value: unknown): value is Asset {
  if (!value || typeof value !== "object") return false;
  const asset = value as Record<string, unknown>;
  if (
    typeof asset.url !== "string" ||
    typeof asset.name !== "string" ||
    asset.name.length < 1 ||
    asset.name.length > 255
  )
    return false;
  if (Object.hasOwn(sampleTypes, asset.url))
    return asset.type === sampleTypes[asset.url];
  const match =
    /^\/api\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp|mp4|webm|wav|mp3)$/.exec(
      asset.url,
    );
  if (!match) return false;
  return (
    asset.type ===
    (match[1] === "mp4" || match[1] === "webm"
      ? "video"
      : match[1] === "wav" || match[1] === "mp3"
        ? "audio"
        : "image")
  );
}
