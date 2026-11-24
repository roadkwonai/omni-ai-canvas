import type { TtsCatalogCache, TtsVoice } from "./tts-types";

export type CatalogSnapshot = {
  voices: TtsVoice[]; cursor?: string; providerSearch: string;
  tags: string[]; tagLabels: Record<string, string>; languages: string[]; cache?: TtsCatalogCache;
};

/** 공개 Fish DB 목록을 검색 조건별로 짧게 보관한다. 계정별 공급사 목록은 넣지 않는다. */
export function createCatalogCache({ maxAge = 5 * 60_000, limit = 8, now = Date.now } = {}) {
  const entries = new Map<string, { at: number; value: CatalogSnapshot }>();
  return {
    get(key: string): CatalogSnapshot | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      entries.delete(key);
      if (now() - entry.at > maxAge) return undefined;
      entries.set(key, entry);
      return entry.value;
    },
    // 이어 읽은 페이지를 더해도 첫 조회 시각을 유지한다. 그사이 무효화됐으면 다시 넣지 않는다.
    set(key: string, value: CatalogSnapshot, append = false) {
      const previous = entries.get(key);
      if (!value.voices.length || (append && !previous)) return;
      entries.delete(key);
      entries.set(key, { at: append && previous ? previous.at : now(), value });
      if (entries.size > limit) entries.delete(entries.keys().next().value!);
    },
    clear() { entries.clear(); },
  };
}
