export const ttsProviderIds = ["fish-audio", "elevenlabs", "typecast", "gemini-tts", "local"] as const;
export type TtsProvider = (typeof ttsProviderIds)[number];
export type TtsApiProvider = Exclude<TtsProvider, "local">;
export const ttsProviderLabels: Record<TtsProvider, string> = {
  "fish-audio": "Fish Audio",
  elevenlabs: "ElevenLabs",
  typecast: "Typecast",
  "gemini-tts": "Gemini TTS",
  local: "내 음성 · 로컬 무료",
};
export const localTtsModels = {
  "s2-pro": { label: "Fish S2 Pro 8bit", license: "연구·비상업 용도로만 쓸 수 있고, 결과물로 생성형 기반 모델을 만들거나 개선할 수 없습니다." },
  "drama-3": { label: "Fish Drama 3 4bit", license: "연 매출 50만 달러 미만이면 상업 이용이 가능하고, 결과물로 다른 음성 모델을 학습시킬 수 없습니다." },
} as const;
export type LocalTtsModel = keyof typeof localTtsModels;
export const isLocalTtsModel = (value: unknown): value is LocalTtsModel =>
  typeof value === "string" && Object.hasOwn(localTtsModels, value);
/** 저장한 음성의 파일 이름에서 확장자를 뺀 ID. */
export const assetId = ({ url }: { url: string }) => url.split("/").at(-1)!.replace(/\.\w+$/, "");
export const voiceIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
export const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;
export const localDefaultVoiceId = "default";
export const ttsTextLimit = 2000;
export const fishVoiceAgeLabels = { Child: "어린이", Teenage: "청소년", young: "젊은 층", "middle-aged": "중년", old: "노년" } as const;
export type TtsGender = "male" | "female";
type FilterValue<T extends string> = T | T[];
export type TtsFilters = {
  sort?: "popular" | "recent";
  gender?: FilterValue<TtsGender>;
  age?: FilterValue<keyof typeof fishVoiceAgeLabels>;
  language?: FilterValue<string>;
  tag?: FilterValue<string>;
};
export function ttsFilterValues<T extends string>(value: FilterValue<T> | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
export function isTtsLanguageCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/i.test(value);
}
export type TtsVoice = {
  id: string;
  name: string;
  nameKo?: string;
  previewUrl?: string;
  description?: string;
  descriptionKo?: string;
  language?: string;
  gender?: TtsGender;
  languages?: string[];
  tags?: string[];
  taskCount?: number;
  createdAt?: string;
};
export type TtsCatalogCache = {
  count: number;
  lastSyncedAt: string | null;
  complete: boolean;
  syncing: boolean;
  nextPage: number;
  scopeIndex?: number;
  scopeCount?: number;
  nextLanguage?: string | null;
  windowLimited?: boolean;
};
export type FishTranslationStatus = { total: number; ready: number; pending: number; retrying: number; running: boolean };
export type TtsCatalog = {
  voices: TtsVoice[];
  nextCursor?: string;
  pageSize?: number;
  tags?: string[];
  tagLabels?: Record<string, string>;
  languages?: string[];
  cache?: TtsCatalogCache;
};
export type TtsSynthesis = { provider: TtsApiProvider; voiceId: string; text: string };
export type LocalTtsPhase = "queued" | "preparing" | "loading" | "generating" | "finishing";
export type LocalTtsProgress = {
  phase: LocalTtsPhase;
  percent: number;
  /** 지금까지 만든 음성의 길이(초). */
  seconds: number;
  elapsed: number;
  ahead: number;
  part?: number;
  parts?: number;
  remaining?: number;
};
