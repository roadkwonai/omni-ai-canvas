export const imageAspects = ["1:1", "16:9", "9:16", "4:3", "3:4"] as const;
export const imageResolutions = ["1K", "2K", "4K"] as const;
export const imageQualities = ["standard", "high"] as const;

export type ImageOutput = {
  aspect?: (typeof imageAspects)[number];
  resolution?: (typeof imageResolutions)[number];
  quality?: (typeof imageQualities)[number];
};

export function parseImageOutput(value: unknown): ImageOutput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const output = value as Record<string, unknown>;
  if (Object.keys(output).some((key) => !["aspect", "resolution", "quality"].includes(key))) return null;
  const aspect = imageAspects.find((item) => item === output.aspect);
  const resolution = imageResolutions.find((item) => item === output.resolution);
  const quality = imageQualities.find((item) => item === output.quality);
  if (output.aspect !== undefined && !aspect || output.resolution !== undefined && !resolution ||
      output.quality !== undefined && !quality) return null;
  return { ...(aspect ? { aspect } : {}), ...(resolution ? { resolution } : {}), ...(quality ? { quality } : {}) };
}
