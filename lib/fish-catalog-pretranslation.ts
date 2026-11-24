import { randomUUID } from "node:crypto";
import { database } from "./db";
import { fishTranslationBatchDefaults, planFishTranslationBatches, runLanes } from "./fish-translation-batches";
import { translateFishTtsVoices, type VoiceTranslation, type VoiceTranslationInput } from "./tts-translation";

type Candidate = VoiceTranslationInput & { sourceHash: string; attempts: number };
// 혼자 보내도 거듭 실패한 원문은 바뀔 때까지 다시 보내지 않는다.
const maxAttempts = 5;
type TranslationOptions = { concurrency?: 1 | 2 | 3 };
export type FishTranslationStatus = {
  total: number;
  ready: number;
  pending: number;
  retrying: number;
  running: boolean;
};

export async function getFishTranslationStatus(): Promise<FishTranslationStatus> {
  const sql = database();
  const [row] = await sql`SELECT count(*)::integer AS total,
    count(*) FILTER (WHERE name_ko IS NOT NULL AND
      (NULLIF(btrim(description), '') IS NULL OR description_ko IS NOT NULL))::integer AS translated,
    (SELECT count(*)::integer FROM drama_canvas.fish_translation_retry r
      JOIN drama_canvas.fish_voice_catalog v ON v.id = r.id
      WHERE r.retry_after > now() AND r.source_hash = md5(v.name || chr(1) || COALESCE(v.description, ''))
        AND (v.name_ko IS NULL OR (NULLIF(btrim(v.description), '') IS NOT NULL AND v.description_ko IS NULL))) AS retrying,
    COALESCE((SELECT lease_until > now() FROM drama_canvas.fish_translation_job WHERE singleton), false) AS running
    FROM drama_canvas.fish_voice_catalog`;
  const total = Number(row?.total ?? 0);
  const translated = Number(row?.translated ?? 0);
  return { total, ready: translated, pending: total - translated, retrying: Number(row?.retrying ?? 0), running: row?.running === true };
}

export async function runFishPretranslation(options: TranslationOptions & {
  translate?: (items: VoiceTranslationInput[]) => Promise<VoiceTranslation[]>;
  maxBatches?: number;
} = {}): Promise<{ acquired: boolean; batches: number }> {
  const translate = options.translate ?? translateFishTtsVoices;
  const maxBatches = Math.max(1, options.maxBatches ?? 1000);
  const { groups, rowsPerGroup } = fishTranslationBatchDefaults;
  const concurrency = options.concurrency ?? fishTranslationBatchDefaults.concurrency;
  const sql = database();
  const token = randomUUID();
  const claimed = await sql`INSERT INTO drama_canvas.fish_translation_job (singleton, lease_token, lease_until)
    VALUES (true, ${token}::uuid, now() + interval '10 minutes')
    ON CONFLICT (singleton) DO UPDATE SET lease_token = ${token}::uuid, lease_until = now() + interval '10 minutes', updated_at = now()
    WHERE fish_translation_job.lease_until IS NULL OR fish_translation_job.lease_until < now()
    RETURNING lease_token`;
  if (!claimed.length) return { acquired: false, batches: 0 };
  let batches = 0;
  let emptyBatches = 0;
  let failedCalls = 0;
  let queued: Candidate[][] = [];
  const inFlight = new Set<string>();

  async function take(): Promise<Candidate[] | undefined> {
    if (batches >= maxBatches || Math.max(emptyBatches, failedCalls) >= concurrency * 2) return undefined;
    const heartbeat = await sql`UPDATE drama_canvas.fish_translation_job SET lease_until = now() + interval '10 minutes', updated_at = now()
      WHERE singleton AND lease_token = ${token}::uuid RETURNING lease_token`;
    if (!heartbeat.length) return undefined;
    if (!queued.length) {
      const rows = await sql`SELECT v.id, v.name, v.description, md5(v.name || chr(1) || COALESCE(v.description, '')) AS source_hash,
          COALESCE(r.attempts, 0) AS attempts
        FROM drama_canvas.fish_voice_catalog v LEFT JOIN drama_canvas.fish_translation_retry r ON r.id = v.id
        WHERE (v.name_ko IS NULL OR (NULLIF(btrim(v.description), '') IS NOT NULL AND v.description_ko IS NULL))
          AND (r.id IS NULL OR r.retry_after <= now() OR r.source_hash <> md5(v.name || chr(1) || COALESCE(v.description, '')))
          AND v.id <> ALL(${[...inFlight]}::text[])
        ORDER BY v.popularity_rank, v.id LIMIT ${groups * rowsPerGroup}`;
      queued = planFishTranslationBatches(rows.map((row): Candidate => ({
        id: String(row.id), name: String(row.name), sourceHash: String(row.source_hash), attempts: Number(row.attempts),
        ...(row.description ? { description: String(row.description) } : {}),
      })));
    }
    const group = queued.shift();
    if (group) {
      batches++;
      for (const candidate of group) inFlight.add(candidate.id);
    }
    return group;
  }

  async function translateGroup(group: Candidate[]) {
    const inputs = group.map(({ id, name, description }) => ({ id, name, ...(description ? { description } : {}) }));
    const output = await translate(inputs).catch(() => undefined);
    if (!output) {
      // 사용량 한도나 실행 오류는 원문 탓이 아니므로 재시도 횟수에 넣지 않는다.
      for (const candidate of group) inFlight.delete(candidate.id);
      failedCalls++;
      return;
    }
    failedCalls = 0;
    const translated = new Map(output.map((item) => [item.id, item]));
    const statements = group.map((candidate) => {
      const value = translated.get(candidate.id);
      if (value) return sql`UPDATE drama_canvas.fish_voice_catalog SET name_ko = ${value.nameKo}, description_ko = ${value.descriptionKo ?? null}
        WHERE id = ${candidate.id} AND md5(name || chr(1) || COALESCE(description, '')) = ${candidate.sourceHash}`;
      return sql`INSERT INTO drama_canvas.fish_translation_retry (id, source_hash, retry_after, attempts)
        VALUES (${candidate.id}, ${candidate.sourceHash}, now() + interval '30 minutes', 1)
        ON CONFLICT (id) DO UPDATE SET source_hash = EXCLUDED.source_hash,
          attempts = CASE WHEN fish_translation_retry.source_hash = EXCLUDED.source_hash THEN fish_translation_retry.attempts + 1 ELSE 1 END,
          retry_after = CASE WHEN fish_translation_retry.source_hash = EXCLUDED.source_hash AND fish_translation_retry.attempts >= ${maxAttempts - 1}
            THEN 'infinity'::timestamptz ELSE EXCLUDED.retry_after END`;
    });
    statements.push(...group.filter((candidate) => translated.has(candidate.id)).map((candidate) => sql`DELETE FROM drama_canvas.fish_translation_retry
      WHERE id = ${candidate.id} AND source_hash = ${candidate.sourceHash}`));
    await sql.transaction(statements);
    for (const candidate of group) inFlight.delete(candidate.id);
    if (translated.size) emptyBatches = 0;
    else if (!group[0].attempts) emptyBatches++;
  }

  try {
    await runLanes(concurrency, take, translateGroup);
  } finally {
    await sql`UPDATE drama_canvas.fish_translation_job SET lease_token = NULL, lease_until = NULL, updated_at = now()
      WHERE singleton AND lease_token = ${token}::uuid`;
  }
  return { acquired: true, batches };
}

export async function drainFishPretranslation(options: TranslationOptions = {}): Promise<FishTranslationStatus> {
  let status = await getFishTranslationStatus();
  while (status.pending > status.retrying) {
    const before = status.ready;
    const result = await runFishPretranslation({ ...options, maxBatches: 150 });
    status = await getFishTranslationStatus();
    if (!result.acquired || !result.batches || status.ready <= before) break;
  }
  return status;
}
