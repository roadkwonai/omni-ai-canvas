import { translateFishVoicePreview, translateVoicePreview } from "./node-preview-translation";

export type VoiceTranslationInput = { id: string; name: string; description?: string };
export type VoiceTranslation = { id: string; nameKo: string; descriptionKo?: string };

// 글자가 없거나 로마자가 낱개로만 있는 원문(A1, B&G)에는 옮길 말이 없다. 한자나 가나가 남은 결과는 덜 번역된 것으로 본다.
const needsHangul = (original: string) => /\p{L}[\p{L}\p{M}]|(?!\p{Script=Latin})\p{L}/u.test(original);
const isTranslated = (value: string, original: string) => (/\p{Script=Hangul}/u.test(value) || !needsHangul(original)) &&
  !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value);
const keyOf = (item: VoiceTranslationInput) => JSON.stringify([item.name, item.description ?? ""]);

export function parseVoiceTranslationInput(value: unknown): VoiceTranslationInput[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) return null;
  const result: VoiceTranslationInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || row.id.length < 1 || row.id.length > 128 ||
        typeof row.name !== "string" || !row.name.trim() || row.name.length > 300 ||
        (row.description !== undefined && (typeof row.description !== "string" || row.description.length > 500))) return null;
    result.push({ id: row.id, name: row.name, ...(row.description ? { description: row.description } : {}) });
  }
  if (new Set(result.map((item) => item.id)).size !== result.length) return null;
  return result;
}

export function createVoiceTranslator(translate: (text: string) => Promise<string>) {
  const cache = new Map<string, Omit<VoiceTranslation, "id">>();
  const pending = new Map<string, Promise<VoiceTranslation[]>>();
  return async function translateVoices(items: VoiceTranslationInput[]): Promise<VoiceTranslation[]> {
    const uncached = [...new Map(items.filter((item) => !cache.has(keyOf(item))).map((item) => [keyOf(item), item])).values()];
    if (uncached.length) {
      const batchKey = JSON.stringify(uncached.map(keyOf));
      let task = pending.get(batchKey);
      if (!task) {
        if (pending.size >= 3) throw new Error("목소리 번역이 진행 중입니다. 잠시 후 다시 시도해 주세요.");
        task = (async () => {
          const input = uncached.map(({ name, description }, index) => ({ id: String(index), name, ...(description ? { description } : {}) }));
          let missing = input;
          const translated = new Map<string, { nameKo: string; descriptionKo?: string }>();
          for (let attempt = 0; attempt < 2 && missing.length; attempt++) {
            let output: string;
            try {
              output = await translate(JSON.stringify(missing));
            } catch (error) {
              if (attempt === 0) continue;
              if (translated.size) break;
              throw error;
            }
            let value: unknown;
            try {
              value = JSON.parse(output.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60$/, ""));
            } catch {
              continue;
            }
            if (!Array.isArray(value)) continue;
            for (const row of value) {
              if (!row || typeof row !== "object" || Array.isArray(row)) continue;
              const candidate = row as Record<string, unknown>;
              const original = missing.find((item) => item.id === candidate.id);
              if (!original || typeof candidate.name !== "string" || !candidate.name.trim() || candidate.name.length > 500 ||
                  !isTranslated(candidate.name, original.name) ||
                  (original.description && (typeof candidate.description !== "string" ||
                    !candidate.description.trim() || candidate.description.length > 1000 ||
                    !isTranslated(candidate.description, original.description)))) continue;
              translated.set(original.id, { nameKo: candidate.name.trim(),
                ...(original.description ? { descriptionKo: String(candidate.description).trim() } : {}) });
            }
            missing = missing.filter((row) => !translated.has(row.id));
          }
          for (let i = 0; i < uncached.length; i++) {
            const result = translated.get(String(i));
            if (result) cache.set(keyOf(uncached[i]), result);
          }
          while (cache.size > 600) cache.delete(cache.keys().next().value!);
          return [...translated.entries()].map(([id, value]) => ({ id, ...value }));
        })().finally(() => pending.delete(batchKey));
        pending.set(batchKey, task);
      }
      await task;
    }
    return items.flatMap((item) => {
      const result = cache.get(keyOf(item));
      return result ? [{ id: item.id, ...result }] : [];
    });
  };
}

export const translateTtsVoices = createVoiceTranslator((text) => translateVoicePreview(text, "ko"));
export const translateFishTtsVoices = createVoiceTranslator((text) => translateFishVoicePreview(text, "ko"));
