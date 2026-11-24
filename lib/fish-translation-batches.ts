import type { VoiceTranslationInput } from "./tts-translation";

export const fishTranslationBatchDefaults = {
  concurrency: 3,
  groups: 12,
  rowsPerGroup: 20,
  maxCharacters: 7500,
} as const;

/** Keep a contiguous prefix of the input for the next bounded translation wave. */
export function planFishTranslationBatches<T extends VoiceTranslationInput & { attempts?: number }>(
  items: readonly T[],
  options: { groups?: number; rowsPerGroup?: number; maxCharacters?: number } = {},
): T[][] {
  const bounded = (value: number | undefined, fallback: number, maximum: number) =>
    value !== undefined && Number.isFinite(value) ? Math.max(1, Math.min(maximum, Math.floor(value))) : fallback;
  const groups = bounded(options.groups, fishTranslationBatchDefaults.groups, 12);
  const rowsPerGroup = bounded(options.rowsPerGroup, fishTranslationBatchDefaults.rowsPerGroup, 30);
  const maxCharacters = bounded(options.maxCharacters, fishTranslationBatchDefaults.maxCharacters, 7500);
  const capacity = ({ attempts = 0 }: T) => attempts > 1 ? 1 : attempts ? Math.min(4, rowsPerGroup) : rowsPerGroup;
  const result: T[][] = [];
  let group: T[] = [];
  let size = 2;
  for (const item of items) {
    // The translator serializes only these three fields and a generated row ID.
    const length = JSON.stringify({ id: String(rowsPerGroup - 1), name: item.name,
      ...(item.description ? { description: item.description } : {}) }).length;
    const separator = group.length ? 1 : 0;
    if (group.length && (group.length >= capacity(group[0]) || capacity(item) !== capacity(group[0]) || size + separator + length > maxCharacters)) {
      result.push(group);
      if (result.length >= groups) return result;
      group = [];
      size = 2;
    }
    // An individually oversized row is returned alone so the caller can handle it.
    group.push(item);
    size += (group.length > 1 ? 1 : 0) + length;
  }
  if (group.length && result.length < groups) result.push(group);
  return result;
}

/** take를 한 번에 하나씩 불러 정해진 수의 작업을 계속 채운다. take가 undefined를 주면 끝난다. */
export async function runLanes<T>(limit: number, take: () => Promise<T | undefined>, run: (item: T) => Promise<void>): Promise<void> {
  let turn: Promise<unknown> = Promise.resolve();
  let failed = false;
  const next = () => {
    const item = turn.then(() => failed ? undefined : take());
    turn = item.catch(() => {});
    return item;
  };
  const lanes = await Promise.allSettled(Array.from({ length: limit }, async () => {
    try {
      for (let item = await next(); item !== undefined; item = await next()) await run(item);
    } catch (error) {
      failed = true;
      throw error;
    }
  }));
  const rejected = lanes.find((lane) => lane.status === "rejected");
  if (rejected) throw rejected.reason;
}
