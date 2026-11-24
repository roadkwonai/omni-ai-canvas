import type { Asset, EdgeRole, Provider } from "./types";

export const mediaProviders = ["higgsfield", "kling", "topview"] as const;
export type MediaProvider = (typeof mediaProviders)[number];
export type MediaOperation = "image" | "video";
export type MediaValue = string | number | boolean;
export type MediaOption = {
  id: string;
  label: string;
  type: "string" | "number" | "integer" | "boolean";
  values?: MediaValue[];
  default?: MediaValue;
  min?: number;
  max?: number;
  required?: boolean;
};
export type MediaSlot = {
  id: string;
  label: string;
  type: Asset["type"];
  max: number;
  min?: number;
  roles?: EdgeRole[];
};
export type MediaProfile = {
  model: string;
  mode: string;
  label: string;
  operation: MediaOperation;
  options: MediaOption[];
  slots: MediaSlot[];
  requiresMedia?: boolean;
  supportsSoulId?: boolean;
};
export type MediaSelection = {
  mode: string;
  options: Record<string, MediaValue>;
  assignments?: Record<string, string>;
};
export type ResolvedMedia = {
  options: Record<string, MediaValue>;
  media: Record<string, Asset[]>;
};

export const mediaKey = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
export function providerModelId(provider: Provider, value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (provider !== "topview") return mediaKey.test(value);
  // Topview's submitModel is display-like text. The server checks it against
  // the authenticated catalog and sends the exact value as JSON.
  return value.length > 0 && value.length <= 128 && value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value);
}
export function mediaModelProvider(value: Provider | string | undefined): value is MediaProvider {
  return mediaProviders.some((provider) => provider === value);
}
export function mediaOperation(value: unknown): value is MediaOperation {
  return value === "image" || value === "video";
}

export function mediaOptionValid(option: MediaOption, value: MediaValue): boolean {
  const typeMatches =
    option.type === "integer" ? Number.isInteger(value) : typeof value === option.type;
  if (!typeMatches) return false;
  if (option.values && !option.values.includes(value)) return false;
  if (typeof value === "number")
    return Number.isFinite(value) && value >= (option.min ?? -Infinity) && value <= (option.max ?? Infinity);
  return typeof value !== "string" || value.trim().length > 0;
}
