import type { ClassificationKind, ClassificationSelection, ProjectClassification } from "./project-classifications";
import type { RunCursor } from "./run-cursor";
import { neon } from "@neondatabase/serverless";
import type {
  Graph,
  Project,
  ProjectSummary,
  Run,
  RunInput,
  RunResult,
} from "./types";

export function database() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL이 설정되지 않았습니다.");
  return neon(process.env.DATABASE_URL);
}

function project(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    title: row.title as string,
    productionProfileId: (row.production_profile_id as string | null) ?? null,
    productionSettings: (row.production_settings as Project["productionSettings"]) ?? null,
    graph: row.graph as Graph,
    version: row.version as number,
    updatedAt: new Date(row.updated_at as string).toISOString(),
    category: row.category as string | null,
    tags: row.tags as string[],
    archivedAt: row.archived_at ? new Date(row.archived_at as string).toISOString() : null,
    deletedAt: row.deleted_at ? new Date(row.deleted_at as string).toISOString() : null,
    lastOpenedAt: row.last_opened_at ? new Date(row.last_opened_at as string).toISOString() : null,
  };
}

function run(row: Record<string, unknown>): Run {
  return {
    id: row.id as string,
    input: row.input as RunInput,
    status: row.status as Run["status"],
    result: row.result as RunResult | null,
    error: row.error as string | null,
    externalId: row.external_id as string | null,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const sql = database();
  const rows =
    await sql`SELECT id, title, version, updated_at, category, tags, archived_at, deleted_at, last_opened_at, production_profile_id, production_settings FROM drama_canvas.projects ORDER BY GREATEST(updated_at, last_opened_at) DESC, id DESC`;
  return rows.map((row) => {
    const item = project(row);
    return { id: item.id, title: item.title, version: item.version, updatedAt: item.updatedAt,
      category: item.category, tags: item.tags, archivedAt: item.archivedAt,
      deletedAt: item.deletedAt, lastOpenedAt: item.lastOpenedAt, productionProfileId: item.productionProfileId, productionSettings: item.productionSettings };
  });
}

export async function getProject(id: string): Promise<Project | null> {
  const sql = database();
  const rows =
    await sql`SELECT id, title, graph, version, updated_at, category, tags, archived_at, deleted_at, last_opened_at, production_profile_id, production_settings FROM drama_canvas.projects WHERE id = ${id}`;
  return rows[0] ? project(rows[0]) : null;
}

export async function projectExists(id: string): Promise<boolean> {
  const sql = database();
  const [row] = await sql`SELECT EXISTS (
    SELECT 1 FROM drama_canvas.projects WHERE id = ${id} AND deleted_at IS NULL
  ) AS found`;
  return row?.found === true;
}

export async function createProject(
  id: string,
  title: string,
  graph: Graph,
  profileId: string | null = null,
  settings: Project["productionSettings"] = null,
): Promise<Project> {
  const sql = database();
  const rows = await sql`INSERT INTO drama_canvas.projects (id, title, graph, production_profile_id, production_settings)
    VALUES (${id}, ${title}, ${JSON.stringify(graph)}::jsonb, ${profileId}, ${settings ? JSON.stringify(settings) : null}::jsonb)
    ON CONFLICT (id) DO NOTHING RETURNING *`;
  const existing = rows[0] ? project(rows[0]) : await getProject(id);
  if (!existing) throw new Error("프로젝트를 불러오지 못했습니다.");
  return existing;
}

export async function saveProject(
  id: string,
  title: string,
  graph: Graph,
  expectedVersion: number,
): Promise<Project | null> {
  const sql = database();
  const rows =
    await sql`UPDATE drama_canvas.projects SET title = ${title}, graph = ${JSON.stringify(graph)}::jsonb, version = version + 1, updated_at = now() WHERE id = ${id} AND version = ${expectedVersion} RETURNING id, title, graph, version, updated_at, category, tags, archived_at, deleted_at, last_opened_at, production_profile_id, production_settings`;
  return rows[0] ? project(rows[0]) : null;
}

export async function updateProjectDetails(
  id: string, version: number, title: string, category: string | null, tags: string[],
  selection?: ClassificationSelection,
): Promise<Project | null> {
  const sql = database();
  const categoryId = selection?.categoryId ?? null;
  const tagIds = selection?.tagIds ?? tags.map(() => null);
  const selectionJson = JSON.stringify(tags.map((name, index) => ({ name, id: tagIds[index] })));
  const [, rows] = await sql.transaction([sql`SELECT pg_advisory_xact_lock(1946112206)`, sql`
    WITH tag_input AS (
      SELECT name, NULLIF(id, '')::uuid AS id
      FROM jsonb_to_recordset(${selectionJson}::jsonb) AS entry(name text, id text)
    ), selected AS MATERIALIZED (
      SELECT c.id, c.kind, c.name FROM drama_canvas.project_classifications c
      WHERE c.id = ${categoryId}::uuid OR c.id IN (SELECT id FROM tag_input WHERE id IS NOT NULL)
      ORDER BY c.id FOR UPDATE
    ), eligible AS MATERIALIZED (
      SELECT id FROM drama_canvas.projects
      WHERE id = ${id} AND version = ${version} AND deleted_at IS NULL
        AND (${categoryId}::uuid IS NULL OR EXISTS (
          SELECT 1 FROM selected
          WHERE id = ${categoryId}::uuid AND kind = 'category' AND name = ${category}
        ))
        AND NOT EXISTS (
          SELECT 1 FROM tag_input t WHERE t.id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM selected c
            WHERE c.id = t.id AND c.kind = 'tag' AND c.name = t.name
          )
        )
      FOR UPDATE
    ), added AS (
      INSERT INTO drama_canvas.project_classifications(kind, name)
      SELECT 'category', ${category}::text FROM eligible
      WHERE ${category}::text IS NOT NULL AND ${categoryId}::uuid IS NULL
      UNION
      SELECT 'tag', name FROM tag_input WHERE id IS NULL AND EXISTS (SELECT 1 FROM eligible)
      ON CONFLICT (kind, name) DO UPDATE SET name = EXCLUDED.name RETURNING id
    )
    UPDATE drama_canvas.projects SET title = ${title}, category = ${category},
      tags = ${tags}::text[], version = version + 1, updated_at = now()
    WHERE id IN (SELECT id FROM eligible) AND version = ${version} AND deleted_at IS NULL
      AND (SELECT count(*) FROM added) >= 0
    RETURNING id, title, graph, version, updated_at, category, tags, archived_at, deleted_at, last_opened_at, production_profile_id, production_settings`]);
  return rows[0] ? project(rows[0]) : null;
}

export async function listProjectClassifications(): Promise<ProjectClassification[]> {
  const sql = database();
  const rows = await sql`
    SELECT c.id, c.kind, c.name,
      count(p.id)::integer AS project_count
    FROM drama_canvas.project_classifications c
    LEFT JOIN drama_canvas.projects p ON
      (c.kind = 'category' AND p.category = c.name) OR
      (c.kind = 'tag' AND c.name = ANY(p.tags))
    GROUP BY c.id, c.kind, c.name ORDER BY c.kind, c.name, c.id`;
  return rows.map((row) => ({ id: row.id as string, kind: row.kind as ClassificationKind,
    name: row.name as string, projectCount: row.project_count as number }));
}

export async function createProjectClassification(kind: ClassificationKind, name: string) {
  const sql = database();
  const [, rows] = await sql.transaction([sql`SELECT pg_advisory_xact_lock(1946112206)`, sql`
    INSERT INTO drama_canvas.project_classifications(kind, name)
    VALUES (${kind}, ${name})
    ON CONFLICT (kind, name) DO NOTHING RETURNING id`]);
  return rows.length > 0;
}

export async function renameProjectClassification(id: string, name: string) {
  const sql = database();
  const [, rows] = await sql.transaction([sql`SELECT pg_advisory_xact_lock(1946112206)`, sql`
    WITH source AS MATERIALIZED (
      SELECT id, kind, name FROM drama_canvas.project_classifications WHERE id = ${id}::uuid FOR UPDATE
    ), changed AS (
      UPDATE drama_canvas.project_classifications c SET name = ${name}
      FROM source WHERE c.id = source.id
        AND NOT EXISTS (SELECT 1 FROM drama_canvas.project_classifications other
          WHERE other.kind = source.kind AND other.name = ${name} AND other.id <> source.id)
      RETURNING c.id, source.kind, source.name AS old_name
    ), updated_projects AS (
      UPDATE drama_canvas.projects p SET
        category = CASE WHEN changed.kind = 'category' AND p.category = changed.old_name THEN ${name} ELSE p.category END,
        tags = CASE WHEN changed.kind = 'tag' THEN array_replace(p.tags, changed.old_name, ${name}) ELSE p.tags END,
        version = p.version + 1, updated_at = now()
      FROM changed
      WHERE (changed.kind = 'category' AND p.category = changed.old_name)
        OR (changed.kind = 'tag' AND changed.old_name = ANY(p.tags))
      RETURNING p.id
    )
    SELECT changed.id, (SELECT count(*) FROM updated_projects)::integer AS changed_count FROM changed`]);
  return rows[0] ? { changedCount: rows[0].changed_count as number } : null;
}

export async function deleteProjectClassification(id: string) {
  const sql = database();
  const [, rows] = await sql.transaction([sql`SELECT pg_advisory_xact_lock(1946112206)`, sql`
    WITH removed AS (
      DELETE FROM drama_canvas.project_classifications WHERE id = ${id}::uuid RETURNING id, kind, name
    ), updated_projects AS (
      UPDATE drama_canvas.projects p SET
        category = CASE WHEN removed.kind = 'category' AND p.category = removed.name THEN NULL ELSE p.category END,
        tags = CASE WHEN removed.kind = 'tag' THEN array_remove(p.tags, removed.name) ELSE p.tags END,
        version = p.version + 1, updated_at = now()
      FROM removed
      WHERE (removed.kind = 'category' AND p.category = removed.name)
        OR (removed.kind = 'tag' AND removed.name = ANY(p.tags))
      RETURNING p.id
    )
    SELECT removed.id, (SELECT count(*) FROM updated_projects)::integer AS changed_count FROM removed`]);
  return rows[0] ? { changedCount: rows[0].changed_count as number } : null;
}

export async function setProjectState(id: string, version: number, action: "archive" | "restore" | "trash"): Promise<Project | null> {
  const sql = database();
  const rows = await sql`UPDATE drama_canvas.projects SET
    archived_at = CASE WHEN ${action} = 'archive' THEN COALESCE(archived_at, now()) WHEN ${action} = 'restore' AND deleted_at IS NULL THEN NULL ELSE archived_at END,
    deleted_at = CASE WHEN ${action} = 'trash' THEN COALESCE(deleted_at, now()) WHEN ${action} = 'restore' THEN NULL ELSE deleted_at END,
    version = version + 1, updated_at = now()
    WHERE id = ${id} AND version = ${version} AND (${action} <> 'archive' OR deleted_at IS NULL)
    RETURNING id, title, graph, version, updated_at, category, tags, archived_at, deleted_at, last_opened_at, production_profile_id, production_settings`;
  return rows[0] ? project(rows[0]) : null;
}

export async function openProject(id: string): Promise<Project | null> {
  const sql = database();
  const rows = await sql`UPDATE drama_canvas.projects SET last_opened_at = now() WHERE id = ${id} AND deleted_at IS NULL RETURNING id, title, graph, version, updated_at, category, tags, archived_at, deleted_at, last_opened_at, production_profile_id, production_settings`;
  return rows[0] ? project(rows[0]) : null;
}

export async function duplicateProject(id: string, newId: string, version: number, title: string): Promise<Project | null> {
  const sql = database();
  const [, rows] = await sql.transaction([sql`SELECT pg_advisory_xact_lock(1946112206)`, sql`INSERT INTO drama_canvas.projects (id, title, graph, category, tags, production_profile_id, production_settings)
    SELECT ${newId}::uuid, ${title}, graph, category, tags, production_profile_id, production_settings FROM drama_canvas.projects
    WHERE id = ${id} AND version = ${version} AND deleted_at IS NULL
    RETURNING id, title, graph, version, updated_at, category, tags, archived_at, deleted_at, last_opened_at, production_profile_id, production_settings`]);
  return rows[0] ? project(rows[0]) : null;
}

export async function enqueueRun(input: RunInput): Promise<Run> {
  const sql = database();
  const rows =
    await sql`INSERT INTO drama_canvas.runs (id, project_id, request_id, input, status) VALUES (${crypto.randomUUID()}, ${input.projectId}, ${input.requestId}, ${JSON.stringify(input)}::jsonb, 'queued') ON CONFLICT (project_id, request_id) DO UPDATE SET request_id = EXCLUDED.request_id RETURNING id, input, status, result, error, external_id, created_at`;
  return run(rows[0]);
}

const leaseMinutes = 60;
const audioLeaseMinutes = 180;
// 저장된 실행을 찾을 때 그대로 비교하므로 문구를 바꾸지 않는다.
const expiredRunError = "실행기 응답이 만료되어 결과를 확인할 수 없습니다. 제공자에서 결과를 확인한 뒤 다시 실행하세요.";

export async function readRunPage(
  projectId: string,
  limit: number,
  cursor: RunCursor | null,
  tracked: string[],
  previousTag?: string,
) {
  const sql = database();
  const first = cursor === null;
  const rows = await sql`
    WITH candidates AS MATERIALIZED (
      SELECT id, created_at FROM drama_canvas.runs
      WHERE project_id = ${projectId}
        AND (${first}::boolean OR (created_at, id) < (${cursor?.timestamp ?? null}::timestamptz, ${cursor?.id ?? null}::uuid))
      ORDER BY created_at DESC, id DESC LIMIT ${limit + 1}::integer
    ), active AS (
      SELECT id FROM drama_canvas.runs
      WHERE ${first}::boolean AND project_id = ${projectId} AND status IN ('queued', 'running')
      ORDER BY created_at DESC, id DESC LIMIT 30
    ), entries AS MATERIALIZED (
      SELECT id, bool_or(is_page) AS is_page, bool_or(is_active) AS is_active
      FROM (
        (SELECT id, true AS is_page, false AS is_active FROM candidates
          ORDER BY created_at DESC, id DESC LIMIT ${limit}::integer)
        UNION ALL SELECT id, false, true FROM active
        UNION ALL SELECT id, false, true FROM drama_canvas.runs
          WHERE ${first}::boolean AND project_id = ${projectId} AND id = ANY(string_to_array(${tracked.join(",")}, ',')::uuid[])
      ) AS selected GROUP BY id
    ), snapshot AS (
      SELECT
        md5(concat(
          (SELECT count(*) FROM candidates), ':',
          coalesce(string_agg(e.id::text || ':' || r.status || ':' || coalesce(md5(r.external_id), '') || ':' || coalesce(md5(r.error), '') ||
            ':' || e.is_page::text || ':' || e.is_active::text, ',' ORDER BY e.id), '')
        )) AS tag,
        (SELECT count(*) FROM candidates) > ${limit}::integer AS more,
        EXISTS (
          SELECT 1 FROM drama_canvas.runs WHERE ${first}::boolean AND project_id = ${projectId}
            AND status = 'running' AND updated_at < now() - make_interval(
              mins => CASE WHEN input->>'provider' = 'road-music' THEN ${audioLeaseMinutes}::integer ELSE ${leaseMinutes}::integer END
            )
        ) AS expired
      FROM entries e JOIN drama_canvas.runs r ON r.id = e.id
    )
    SELECT snapshot.*, payload.*
    FROM snapshot LEFT JOIN LATERAL (
      SELECT r.id, r.input, r.status, r.result, r.error, r.external_id, r.created_at,
        e.is_page, e.is_active, to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
      FROM entries e JOIN drama_canvas.runs r ON r.id = e.id
      WHERE snapshot.tag IS DISTINCT FROM ${previousTag ?? null}
      OFFSET 0
    ) payload ON true
    ORDER BY payload.created_at DESC, payload.id DESC
  `;
  const tag = rows[0].tag as string;
  const page = rows.filter((row) => row.is_page);
  const last = page.at(-1);
  return {
    tag,
    expired: rows[0].expired as boolean,
    runs: tag === previousTag ? null : page.map(run),
    activeRuns: rows.filter((row) => row.is_active).map(run),
    next: rows[0].more && last ? { projectId, id: last.id as string, timestamp: last.cursor_time as string } : null,
  };
}

export async function getProjectRun(projectId: string, runId: string): Promise<Run | null> {
  const sql = database();
  const rows = await sql`SELECT id, input, status, result, error, external_id, created_at FROM drama_canvas.runs WHERE project_id = ${projectId} AND id = ${runId}`;
  return rows[0] ? run(rows[0]) : null;
}

export async function listRuns(projectId: string): Promise<Run[]> {
  const sql = database();
  const rows = await sql`SELECT id, input, status, result, error, external_id, created_at FROM drama_canvas.runs WHERE project_id = ${projectId} ORDER BY created_at DESC, id DESC`;
  return rows.map(run);
}

export async function listRecentChatRuns(projectId: string, threadId: string, requestId: string): Promise<Run[]> {
  const sql = database();
  const rows = await sql`
    (SELECT id, input, status, result, error, external_id, created_at FROM drama_canvas.runs
      WHERE project_id = ${projectId} AND request_id <> ${requestId}
        AND status = 'succeeded' AND input#>>'{chat,threadId}' = ${threadId}
        AND jsonb_typeof(result->'text') = 'string'
      ORDER BY created_at DESC, id DESC LIMIT 8)
    UNION ALL
    SELECT id, input, status, result, error, external_id, created_at FROM drama_canvas.runs
      WHERE project_id = ${projectId} AND request_id = ${requestId}
    ORDER BY created_at DESC, id DESC
  `;
  return rows.map(run);
}

export async function getRunStatus(
  projectId: string,
  runId: string,
): Promise<Run["status"] | null> {
  const sql = database();
  const rows =
    await sql`SELECT status FROM drama_canvas.runs WHERE project_id = ${projectId} AND id = ${runId}`;
  return (rows[0]?.status ?? null) as Run["status"] | null;
}

export async function claimRun(projectId?: string): Promise<Run | null> {
  const sql = database();
  const rows =
    await sql`UPDATE drama_canvas.runs SET status = 'running', updated_at = now() WHERE id = (SELECT id FROM drama_canvas.runs WHERE status = 'queued' AND (${projectId ?? null}::uuid IS NULL OR project_id = ${projectId ?? null}::uuid) ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id, input, status, result, error, external_id, created_at`;
  return rows[0] ? run(rows[0]) : null;
}

export async function recordExternalId(
  id: string,
  externalId: string,
): Promise<void> {
  const sql = database();
  const rows =
    await sql`UPDATE drama_canvas.runs SET external_id = ${externalId}, updated_at = now() WHERE id = ${id} AND (external_id IS NULL OR external_id = ${externalId}) RETURNING id`;
  if (!rows.length) throw new Error("작업 번호를 저장하지 못했습니다.");
}

export async function finishRun(
  id: string,
  result: RunResult | null,
  error: string | null,
): Promise<void> {
  const sql = database();
  await sql`UPDATE drama_canvas.runs SET status = ${error ? "failed" : "succeeded"}, result = ${result ? JSON.stringify(result) : null}::jsonb, error = ${error}, updated_at = now() WHERE id = ${id} AND status = 'running'`;
}

export async function touchRunningRun(id: string): Promise<void> {
  const sql = database();
  await sql`UPDATE drama_canvas.runs SET updated_at = now() WHERE id = ${id} AND status = 'running'`;
}

export async function expireRuns(projectId?: string): Promise<void> {
  const sql = database();
  await sql`UPDATE drama_canvas.runs SET status = 'failed', error = ${expiredRunError}, updated_at = now() WHERE status = 'running' AND updated_at < now() - make_interval(mins => CASE WHEN input->>'provider' = 'road-music' THEN ${audioLeaseMinutes}::integer ELSE ${leaseMinutes}::integer END) AND (${projectId ?? null}::uuid IS NULL OR project_id = ${projectId ?? null}::uuid)`;
}

export async function recoverRunOutcome(record: {
  projectId: string;
  runId: string;
  result: RunResult | null;
  error: string | null;
}): Promise<void> {
  const sql = database();
  const result = record.result === null ? null : JSON.stringify(record.result);
  const status = record.error === null ? "succeeded" : "failed";
  const written = await sql`UPDATE drama_canvas.runs SET status = ${status}, result = ${result}::jsonb,
    error = ${record.error}, updated_at = now()
    WHERE project_id = ${record.projectId} AND id = ${record.runId}
      AND (status = 'running' OR (status = 'failed' AND error = ${expiredRunError})) RETURNING id`;
  if (written.length) return;
  const rows = await sql`SELECT (status = ${status} AND result IS NOT DISTINCT FROM ${result}::jsonb
      AND error IS NOT DISTINCT FROM ${record.error}) AS matches
    FROM drama_canvas.runs WHERE project_id = ${record.projectId} AND id = ${record.runId}`;
  if (!rows[0]?.matches) throw new Error("로컬 완료 결과와 저장된 실행 상태를 확인해 주세요.");
}

export async function updateProjectProduction(id: string, version: number, profileId: string | null, settings: Project["productionSettings"], graph?: Graph): Promise<Project | null> {
  const sql = database();
  const rows = await sql`UPDATE drama_canvas.projects SET production_profile_id = ${profileId}, production_settings = ${settings ? JSON.stringify(settings) : null}::jsonb, graph = COALESCE(${graph ? JSON.stringify(graph) : null}::jsonb, graph),
    version = version + 1, updated_at = now()
    WHERE id = ${id} AND version = ${version} AND deleted_at IS NULL
    RETURNING id, title, graph, version, updated_at, category, tags, archived_at, deleted_at, last_opened_at, production_profile_id, production_settings`;
  return rows[0] ? project(rows[0]) : null;
}
