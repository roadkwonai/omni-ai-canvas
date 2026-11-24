import { database } from "./db";
import { listTtsVoices } from "./tts-provider";
import { isTtsLanguageCode, ttsFilterValues, type TtsCatalog, type TtsFilters, type TtsVoice } from "./tts-types";
import type { VoiceTarget } from "./tts-voice-match";
import { randomUUID } from "node:crypto";

export type CachedFishVoice = TtsVoice & { nameKo?: string; descriptionKo?: string };
export type FishCatalogStatus = { count: number; lastSyncedAt: string | null; complete: boolean; syncing: boolean; nextPage: number; scopeIndex: number; scopeCount: number; nextLanguage: string | null; windowLimited: boolean };
export type FishCachePage = TtsCatalog & {
  voices: CachedFishVoice[];
  cache?: FishCatalogStatus;
};
type FishFacets = Required<Pick<TtsCatalog, "tags" | "tagLabels" | "languages">>;
const fishPageSize = 100;
export const fishCatalogScopes = ["", "ko", "en", "ja", "zh", "ru", "es", "fr", "de", "ar", "pt",
  "hi", "id", "it", "th", "vi", "tr", "nl", "pl", "sv", "ro", "uk", "cy", "el", "ky", "lv", "rw", "sw", "tl"] as const;

export function fishCatalogueOffset(cursor: string): number | undefined {
  if (!cursor) return 0;
  if (/^db:[1-9]\d{0,6}$/.test(cursor)) return Number(cursor.slice(3));
  // Previously opened Fish Audio lists still use one-based pages of 30.
  if (/^[1-9]\d{0,5}$/.test(cursor) && Number(cursor) <= 100000) return (Number(cursor) - 1) * 30;
}

function parseStatus(row: Record<string, unknown> | undefined): FishCatalogStatus {
  return { count: Number(row?.count ?? 0),
    lastSyncedAt: row?.last_synced_at ? new Date(row.last_synced_at as string).toISOString() : null,
    complete: row?.complete === true, syncing: row?.syncing === true, nextPage: Number(row?.next_page ?? 1),
    scopeIndex: Number(row?.next_scope ?? 0),
    scopeCount: Array.isArray(row?.scope_plan) ? row.scope_plan.length : fishCatalogScopes.length,
    nextLanguage: (Array.isArray(row?.scope_plan) ? row.scope_plan[Number(row?.next_scope ?? 0)]
      : fishCatalogScopes[Number(row?.next_scope ?? 0)]) || null,
    windowLimited: true };
}

export async function getFishCatalogStatus(): Promise<FishCatalogStatus> {
  const sql = database();
  const rows = await sql`SELECT count(*)::integer AS count, max(fetched_at) AS last_synced_at,
    COALESCE((SELECT complete FROM drama_canvas.fish_voice_sync WHERE singleton = true), false) AS complete,
    COALESCE((SELECT lease_until > now() FROM drama_canvas.fish_voice_sync WHERE singleton = true), false) AS syncing,
    COALESCE((SELECT next_page FROM drama_canvas.fish_voice_sync WHERE singleton = true), 1) AS next_page,
    COALESCE((SELECT next_scope FROM drama_canvas.fish_voice_sync WHERE singleton = true), 0) AS next_scope,
    (SELECT scope_plan FROM drama_canvas.fish_voice_sync WHERE singleton = true) AS scope_plan
    FROM drama_canvas.fish_voice_catalog`;
  return parseStatus(rows[0]);
}

type FishRowQuery = {
  filters: TtsFilters;
  search?: string;
  matchedTags?: string[];
  required?: { gender?: string; ages?: string[]; languages?: string[] };
  limit?: number;
  offset?: number;
};

function fishVoiceRows(sql: ReturnType<typeof database>, { filters, search = "", matchedTags = [], required = {}, limit, offset = 0 }: FishRowQuery) {
  const query = search.trim().replace(/[\\%_]/g, "\\$&");
  const pattern = `%${query}%`;
  const genders = [...ttsFilterValues(filters.gender)];
  const overlaps = (column: "tags" | "languages", values: readonly string[] | undefined) => values
    ? sql`AND ${sql.unsafe(column)} && ${[...values]}::text[]` : sql``;
  const chosen = (values: readonly string[]) => values.length ? values : undefined;
  return sql`
    SELECT id, name, description, name_ko, description_ko, preview_url, gender, tags, languages
    FROM drama_canvas.fish_voice_catalog
    WHERE (${query} = '' OR name ILIKE ${pattern} ESCAPE '\\' OR description ILIKE ${pattern} ESCAPE '\\'
      OR name_ko ILIKE ${pattern} ESCAPE '\\' OR description_ko ILIKE ${pattern} ESCAPE '\\'
      OR tags && ${matchedTags}::text[])
      ${genders.length ? sql`AND gender = ANY(${genders}::text[])` : sql``}
      ${required.gender ? sql`AND gender = ${required.gender}` : sql``}
      ${overlaps("tags", chosen(ttsFilterValues(filters.age)))}
      ${overlaps("tags", required.ages)}
      ${overlaps("languages", chosen(ttsFilterValues(filters.language)))}
      ${overlaps("languages", required.languages)}
      ${overlaps("tags", chosen(ttsFilterValues(filters.tag)))}
    ORDER BY ${filters.sort === "recent" ? sql`created_at DESC NULLS LAST` : sql`task_count DESC`}, popularity_rank, id
    LIMIT ${limit ?? null} OFFSET ${offset}`;
}

function cachedFishVoice(row: Record<string, unknown>): CachedFishVoice {
  return {
    id: String(row.id), name: String(row.name),
    ...(row.description ? { description: String(row.description) } : {}),
    ...(row.name_ko ? { nameKo: String(row.name_ko) } : {}),
    ...(row.description_ko ? { descriptionKo: String(row.description_ko) } : {}),
    ...(row.preview_url ? { previewUrl: String(row.preview_url) } : {}),
    ...(row.gender === "male" || row.gender === "female" ? { gender: row.gender } : {}),
    ...(Array.isArray(row.tags) ? { tags: row.tags as string[] } : {}),
    ...(Array.isArray(row.languages) ? { languages: row.languages as string[] } : {}),
  };
}

const facetMaxAge = 60_000;
let facetCache: { at: number; value: Promise<FishFacets> } | undefined;

async function queryFishFacets(): Promise<FishFacets> {
  const sql = database();
  const rows = await sql`SELECT 'tag' AS kind, raw.tag AS value, labels.label_ko
    FROM (SELECT DISTINCT unnest(tags) AS tag FROM drama_canvas.fish_voice_catalog) AS raw
    LEFT JOIN drama_canvas.fish_voice_tag_translations AS labels ON labels.tag = raw.tag
    UNION ALL
    SELECT 'language', value, NULL FROM
      (SELECT DISTINCT unnest(languages) AS value FROM drama_canvas.fish_voice_catalog) AS raw
    ORDER BY kind, value`;
  const tagRows = rows.filter((row) => row.kind === "tag");
  return {
    tags: tagRows.map((row) => String(row.value)),
    tagLabels: Object.fromEntries(tagRows.flatMap((row) =>
      typeof row.label_ko === "string" ? [[String(row.value), row.label_ko]] : [])),
    languages: rows.filter((row) => row.kind === "language").map((row) => String(row.value)),
  };
}

function readFishFacets(): Promise<FishFacets> {
  if (!facetCache || Date.now() - facetCache.at > facetMaxAge) {
    const value = queryFishFacets();
    const entry = { at: Date.now(), value };
    facetCache = entry;
    value.catch(() => { if (facetCache === entry) facetCache = undefined; });
  }
  return facetCache.value;
}

export function matchingTags({ tags, tagLabels }: Pick<FishFacets, "tags" | "tagLabels">, search: string): string[] {
  const query = search.trim().toLocaleLowerCase();
  return query ? tags.filter((tag) => [tag, Object.hasOwn(tagLabels, tag) ? tagLabels[tag] : ""]
    .some((value) => value.toLocaleLowerCase().includes(query))) : [];
}

export async function readFishCatalog(search = "", cursor = "", filters: TtsFilters = {}): Promise<FishCachePage> {
  const sql = database();
  const offset = fishCatalogueOffset(cursor);
  if (offset === undefined) throw new Error("목소리 페이지를 확인해 주세요.");
  // 이어 읽는 페이지는 행만 조회한다. 전체 수량과 필터 목록은 첫 페이지에서만 바뀐다.
  const continued = cursor.startsWith("db:");
  const facets = continued && !search.trim() ? undefined : readFishFacets();
  const [rows, cache, shownFacets] = await Promise.all([
    Promise.resolve(search.trim() ? facets : undefined).then((value) =>
      fishVoiceRows(sql, { filters, search, matchedTags: value ? matchingTags(value, search) : [], limit: fishPageSize + 1, offset })),
    continued ? undefined : getFishCatalogStatus(),
    continued ? undefined : facets,
  ]);
  return { voices: rows.slice(0, fishPageSize).map(cachedFishVoice), pageSize: fishPageSize,
    ...(rows.length > fishPageSize ? { nextCursor: `db:${offset + fishPageSize}` } : {}),
    ...shownFacets, ...(cache ? { cache } : {}) };
}

/** 명시된 성별·연령대·언어가 다른 목소리는 추천에서 제외되므로 DB에서 먼저 뺀다. 나머지 판단은 shortlistVoices가 한다. */
export async function readFishRecommendationCandidates(filters: TtsFilters, target: Pick<VoiceTarget, "gender" | "age" | "language">): Promise<CachedFishVoice[]> {
  const facets = target.age || target.language ? await readFishFacets() : undefined;
  const rows = await fishVoiceRows(database(), { filters, required: {
    gender: target.gender,
    ...(target.age ? { ages: facets?.tags.filter((tag) => tag.toLowerCase() === target.age!.toLowerCase()) } : {}),
    ...(target.language ? { languages: facets?.languages.filter((code) => code.toLowerCase().split("-")[0] === target.language) } : {}),
  } });
  return rows.map(cachedFishVoice);
}

export function extendFishCatalogScopes(plan: string[], observed: unknown[]): string[] {
  const result = [...plan];
  const seen = new Set(result.map((value) => value.toLowerCase()));
  const additions = observed.filter(isTtsLanguageCode).map((value) => value.toLowerCase()).sort();
  for (const language of additions) if (!seen.has(language)) {
    seen.add(language);
    result.push(language);
  }
  return result;
}

export async function refreshFishCatalog(maxPages = 10, resumeNewScopes = false): Promise<{ pages: number; complete: boolean }> {
  const sql = database();
  const token = randomUUID();
  const state = await sql`INSERT INTO drama_canvas.fish_voice_sync (singleton, lease_token, lease_until)
    VALUES (true, ${token}::uuid, now() + interval '25 minutes')
    ON CONFLICT (singleton) DO UPDATE SET lease_token = ${token}::uuid, lease_until = now() + interval '25 minutes'
    WHERE fish_voice_sync.lease_until IS NULL OR fish_voice_sync.lease_until < now()
    RETURNING next_page, next_scope, complete, scope_plan`;
  if (!state.length) return { pages: 0, complete: false };
  try {
  const savedPlan = Array.isArray(state[0]?.scope_plan) ? state[0].scope_plan as string[] : [...fishCatalogScopes];
  const observed = await sql`SELECT DISTINCT unnest(languages) AS code FROM drama_canvas.fish_voice_catalog`;
  const scopes = extendFishCatalogScopes(savedPlan, observed.map((row) => row.code));
  const completed = state[0]?.complete === true;
  let page = completed ? 1 : Number(state[0]?.next_page ?? 1);
  let scope = completed ? (resumeNewScopes ? savedPlan.length : 0) : Number(state[0]?.next_scope ?? 0);
  let complete = false;
  let pages = 0;
  if (scope >= scopes.length) return { pages: 0, complete: true };
  while (pages < Math.max(1, Math.min(maxPages, 10))) {
    const language = scopes[scope];
    const result = await listTtsVoices("fish-audio", "", String(page), { sort: "popular", ...(language ? { language } : {}) }, 100);
    if (!result.voices.length && result.nextCursor) throw new Error("Fish Audio가 빈 페이지를 반환했습니다.");
    const statements = result.voices.map((voice, index) => sql`
      INSERT INTO drama_canvas.fish_voice_catalog (id, name, description, preview_url, gender, tags, languages, popularity_rank, task_count, created_at, fetched_at)
      VALUES (${voice.id}, ${voice.name}, ${voice.description?.trim() || null}, ${voice.previewUrl ?? null}, ${voice.gender ?? null},
        ${voice.tags ?? []}, ${voice.languages ?? []}, ${scope * 1000 + (page - 1) * 100 + index}, ${voice.taskCount ?? 0}, ${voice.createdAt ?? null}, now())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description, preview_url = EXCLUDED.preview_url,
        gender = EXCLUDED.gender, tags = EXCLUDED.tags, languages = EXCLUDED.languages, popularity_rank = EXCLUDED.popularity_rank,
        task_count = EXCLUDED.task_count, created_at = EXCLUDED.created_at, fetched_at = now(),
        name_ko = CASE WHEN fish_voice_catalog.name = EXCLUDED.name THEN fish_voice_catalog.name_ko ELSE NULL END,
        description_ko = CASE WHEN fish_voice_catalog.description IS NOT DISTINCT FROM EXCLUDED.description
          THEN fish_voice_catalog.description_ko ELSE NULL END`);
    const expanded = extendFishCatalogScopes(scopes, result.voices.flatMap((voice) => voice.languages ?? []));
    scopes.splice(scopes.length, 0, ...expanded.slice(scopes.length));
    const scopeComplete = !result.nextCursor;
    const nextScope = scopeComplete ? scope + 1 : scope;
    complete = nextScope >= scopes.length;
    const next = scopeComplete ? 1 : Number(result.nextCursor);
    statements.push(sql`UPDATE drama_canvas.fish_voice_sync SET next_page = ${next}, next_scope = ${complete ? 0 : nextScope}, scope_plan = ${scopes}::text[], complete = ${complete}, updated_at = now()
      WHERE singleton = true AND lease_token = ${token}::uuid`);
    await sql.transaction(statements);
    pages++;
    if (complete) break;
    page = next;
    scope = nextScope;
  }
  return { pages, complete };
  } finally {
    await sql`UPDATE drama_canvas.fish_voice_sync SET lease_token = NULL, lease_until = NULL
      WHERE singleton = true AND lease_token = ${token}::uuid`;
  }
}

export async function saveFishTranslations(items: { id: string; nameKo: string; descriptionKo?: string; name: string; description?: string }[]) {
  if (!items.length) return;
  const sql = database();
  await sql.transaction(items.map((item) => sql`UPDATE drama_canvas.fish_voice_catalog
    SET name_ko = ${item.nameKo}, description_ko = ${item.descriptionKo ?? null}
    WHERE id = ${item.id} AND name = ${item.name}
      AND NULLIF(btrim(description), '') IS NOT DISTINCT FROM NULLIF(btrim(${item.description ?? null}::text), '')`));
}

export async function nextUntranslatedFish(limit = 8): Promise<CachedFishVoice[]> {
  const sql = database();
  const rows = await sql`SELECT id, name, description FROM drama_canvas.fish_voice_catalog
    WHERE name_ko IS NULL OR (NULLIF(btrim(description), '') IS NOT NULL AND description_ko IS NULL)
    ORDER BY popularity_rank, id LIMIT ${Math.max(1, Math.min(limit, 30))}`;
  return rows.map((row) => ({ id: String(row.id), name: String(row.name),
    ...(row.description ? { description: String(row.description) } : {}) }));
}
