export type VideoOptions = {
  mode: "auto" | "remake" | "extend";
  aspect?: "16:9" | "9:16" | "1:1";
  duration?: 5 | 8 | 10;
  resolution?: "480p" | "720p" | "1080p";
  direction?: "forward" | "backward";
};

export function parseVideoOptions(value: unknown): VideoOptions | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (
    Object.keys(obj).some(
      (key) =>
        !["mode", "aspect", "duration", "resolution", "direction"].includes(
          key,
        ),
    )
  )
    return null;
  if (obj.mode !== "auto" && obj.mode !== "remake" && obj.mode !== "extend")
    return null;
  if (
    obj.aspect !== undefined &&
    obj.aspect !== "16:9" &&
    obj.aspect !== "9:16" &&
    obj.aspect !== "1:1"
  )
    return null;
  if (
    obj.duration !== undefined &&
    obj.duration !== 5 &&
    obj.duration !== 8 &&
    obj.duration !== 10
  )
    return null;
  if (
    obj.resolution !== undefined &&
    obj.resolution !== "480p" &&
    obj.resolution !== "720p" &&
    obj.resolution !== "1080p"
  )
    return null;
  if (
    obj.direction !== undefined &&
    obj.direction !== "forward" &&
    obj.direction !== "backward"
  )
    return null;
  if (obj.mode !== "extend" && obj.direction !== undefined) return null;
  if (obj.mode !== "auto" && obj.aspect !== undefined) return null;
  if (obj.mode === "remake" && obj.duration !== undefined) return null;
  return {
    mode: obj.mode,
    ...(obj.aspect !== undefined ? { aspect: obj.aspect } : {}),
    ...(obj.duration !== undefined ? { duration: obj.duration } : {}),
    ...(obj.resolution !== undefined ? { resolution: obj.resolution } : {}),
    ...(obj.direction !== undefined ? { direction: obj.direction } : {}),
  } as VideoOptions;
}
