import { fishVoiceAgeLabels, isTtsLanguageCode, type TtsFilters } from "./tts-types";

const rules = {
  gender: { limit: 128, valid: (value: string) => value === "male" || value === "female" },
  age: { limit: 128, valid: (value: string) => Object.hasOwn(fishVoiceAgeLabels, value) },
  language: { limit: 128, valid: isTtsLanguageCode },
  tag: { limit: 500, valid: (value: string) => value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value) },
} as const;

export function parseTtsFilters(value: unknown): TtsFilters | null {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { sort, ...rest } = value as Record<string, unknown>;
  if (sort !== undefined && sort !== "popular" && sort !== "recent") return null;
  const filters: TtsFilters = sort ? { sort } : {};
  for (const [key, field] of Object.entries(rest)) {
    if (!Object.hasOwn(rules, key)) return null;
    const { limit, valid } = rules[key as keyof typeof rules];
    const values: unknown[] = (Array.isArray(field) ? field : [field]).filter((item) => item !== undefined && item !== "");
    if (values.length > limit || !values.every((item): item is string => typeof item === "string" && valid(item))) return null;
    if (values.length) Object.assign(filters, { [key]: [...new Set(key === "language" ? values.map((item) => item.toLowerCase()) : values)] });
  }
  return filters;
}
