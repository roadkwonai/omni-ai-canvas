import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { GET } from "../app/api/projects/[id]/runs/route";
import { createProject } from "../lib/db";

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("Neon 테스트 연결이 필요합니다.");
process.env.DATABASE_URL = url;
const sql = neon(url);
const projectId = crypto.randomUUID();
const title = `실행 이력 QA ${projectId}`;
const context = { params: Promise.resolve({ id: projectId }) };
const base = `http://127.0.0.1:3000/api/projects/${projectId}/runs`;
const runIds = Array.from({ length: 7 }, () => crypto.randomUUID()).sort();
const fetchPage = (query: string, tag?: string) => GET(new Request(base + query, {
  headers: { host: "127.0.0.1:3000", ...(tag ? { "if-none-match": tag } : {}) },
}), context);
async function seed(i: number, time: string, status: string) {
  const id = runIds[i];
  await sql`INSERT INTO drama_canvas.runs (id, project_id, request_id, input, status, created_at)
    VALUES (${id}, ${projectId}, ${crypto.randomUUID()}, ${JSON.stringify({ projectId, provider: "claude" })}::jsonb, ${status}, ${time}::timestamptz)`;
}
async function main() {
  await createProject(projectId, title, { nodes: [], edges: [] });
  try {
    for (let i = 0; i < 5; i++) {
      await seed(i, i < 3 ? "2026-01-01T00:00:00.000001Z" : "2026-01-01T00:00:00.000002Z", i === 0 ? "running" : "succeeded");
    }
    const first = await fetchPage("?limit=2");
    assert.equal(first.status, 200);
    const page = await first.json();
    assert.deepEqual(page.runs.map((run: { id: string }) => run.id), [runIds[4], runIds[3]]);
    assert.deepEqual(page.activeRuns.map((run: { id: string }) => run.id), [runIds[0]]);
    assert.ok(page.nextCursor);
    assert.equal((await fetchPage("?limit=2", first.headers.get("etag")!)).status, 304);

    await seed(5, "2026-01-02T00:00:00.000000Z", "succeeded");
    const continuation = `?limit=2&cursor=${encodeURIComponent(page.nextCursor)}`;
    const [next, newest] = await Promise.all([fetchPage(continuation), fetchPage("?limit=2")]);
    assert.equal(next.status, 200);
    assert.equal(newest.status, 200);
    const tail = await next.json();
    assert.deepEqual(tail.runs.map((run: { id: string }) => run.id), [runIds[2], runIds[1]]);
    assert.deepEqual((await newest.json()).runs.map((run: { id: string }) => run.id), [runIds[5], runIds[4]]);
    const last = await (await fetchPage(`?limit=2&cursor=${encodeURIComponent(tail.nextCursor)}`)).json();
    assert.deepEqual(last.runs.map((run: { id: string }) => run.id), [runIds[0]]);
    assert.equal(last.nextCursor, null);

    await sql`UPDATE drama_canvas.runs SET status = 'succeeded' WHERE id = ${runIds[0]}`;
    const tracked = await (await fetchPage(`?limit=2&track=${runIds[0]}`)).json();
    assert.deepEqual(tracked.activeRuns.map((run: { status: string }) => run.status), ["succeeded"]);
    assert.equal((await (await fetchPage(`?runId=${runIds[0]}`)).json()).run.id, runIds[0]);
    assert.equal((await fetchPage("?cursor=broken")).status, 400);
    assert.equal((await fetchPage("?limit=30000")).status, 400);
    console.log("실행 이력 페이지 동시 조회·시간 정밀도·활성 추적 통과");
  } finally {
    await sql`DELETE FROM drama_canvas.projects WHERE id = ${projectId} AND title = ${title}`;
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
