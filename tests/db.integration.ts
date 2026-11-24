import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import {
  claimRun,
  createProject,
  enqueueRun,
  expireRuns,
  finishRun,
  getProject,
  listProjects,
  listRuns,
  recordExternalId,
  saveProject,
  touchRunningRun,
} from "../lib/db";
import type { Graph, RunInput } from "../lib/types";
import * as runsRoute from "../app/api/projects/[id]/runs/route";

const testUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!testUrl)
  throw new Error("마이그레이션을 적용한 Neon DB 연결 정보가 필요합니다.");
process.env.DATABASE_URL = testUrl;
const sql = neon(testUrl);
const projectId = crypto.randomUUID();
const graph: Graph = { nodes: [], edges: [] };
const input: RunInput = {
  projectId,
  requestId: crypto.randomUUID(),
  nodeId: null,
  provider: "topview",
  operation: "video",
  prompt: "test",
  references: [],
};

async function main() {
  try {
    const created = await createProject(projectId, "테스트", graph);
    assert.equal(created.version, 1);
    assert.equal(
      (await createProject(projectId, "중복", graph)).title,
      "테스트",
    );
    assert.ok((await listProjects()).some((item) => item.id === projectId));
    assert.equal((await saveProject(projectId, "수정", graph, 1))?.version, 2);
    assert.equal(await saveProject(projectId, "이전 버전", graph, 1), null);
    assert.equal((await getProject(projectId))?.title, "수정");

    const duplicates = await Promise.all([
      enqueueRun(input),
      enqueueRun(input),
    ]);
    assert.equal(duplicates[0].id, duplicates[1].id);
    const second = await enqueueRun({
      ...input,
      requestId: crypto.randomUUID(),
    });
    const runsAddress = `http://127.0.0.1:3000/api/projects/${projectId}/runs`;
    const context = { params: Promise.resolve({ id: projectId }) };
    const fetchRuns = (tag?: string) =>
      runsRoute.GET(
        new Request(runsAddress, {
          headers: {
            host: "127.0.0.1:3000",
            ...(tag ? { "if-none-match": tag } : {}),
          },
        }),
        context,
      );
    const full = await fetchRuns();
    assert.equal(full.status, 200);
    const firstTag = full.headers.get("etag");
    assert.ok(firstTag, "실행 이력 응답은 조건부 조회에 쓸 ETag를 반환한다");
    const unchanged = await fetchRuns(firstTag);
    assert.equal(unchanged.status, 304);
    assert.equal(await unchanged.text(), "");
    const claimed = await Promise.all([
      claimRun(projectId),
      claimRun(projectId),
    ]);
    const changed = await fetchRuns(firstTag);
    assert.equal(changed.status, 200);
    assert.notEqual(changed.headers.get("etag"), firstTag);
    assert.equal(
      (await changed.json()).runs.filter(
        (item: { status: string }) => item.status === "running",
      ).length,
      2,
    );
    await sql`UPDATE drama_canvas.runs SET updated_at = now() - interval '2 hours' WHERE id = ${duplicates[0].id}`;
    await touchRunningRun(duplicates[0].id);
    assert.equal((await fetchRuns(changed.headers.get("etag")!)).status, 304);
    assert.deepEqual(
      new Set(claimed.map((item) => item?.id)),
      new Set([duplicates[0].id, second.id]),
    );
    await recordExternalId(second.id, "provider-job-123");
    await recordExternalId(second.id, "provider-job-123");
    await assert.rejects(recordExternalId(second.id, "different-job"));
    await finishRun(duplicates[0].id, { text: "완료" }, null);
    const patch = (runsRoute as Record<string, unknown>).PATCH as
      typeof runsRoute.GET | undefined;
    assert.ok(patch, "대기 큐를 다시 깨울 수 있는 API가 있다");
    const resume = (runId: string) =>
      patch(
        new Request(runsAddress, {
          method: "PATCH",
          headers: {
            host: "127.0.0.1:3000",
            "content-type": "application/json",
          },
          body: JSON.stringify({ runId }),
        }),
        context,
      );
    assert.equal((await resume(crypto.randomUUID())).status, 404);
    assert.equal(
      (await resume(duplicates[0].id)).status,
      409,
      "이미 끝난 작업은 재제출하지 않는다",
    );
    await sql`UPDATE drama_canvas.runs SET updated_at = now() - interval '2 hours' WHERE id = ${second.id}`;
    await expireRuns(projectId);
    const runs = await listRuns(projectId);
    assert.equal(
      runs.find((item) => item.id === duplicates[0].id)?.status,
      "succeeded",
    );
    assert.match(
      runs.find((item) => item.id === second.id)?.error ?? "",
      /결과를 확인/,
    );
    assert.equal(
      runs.find((item) => item.id === second.id)?.externalId,
      "provider-job-123",
    );
    await finishRun(second.id, { text: "늦은 결과" }, null);
    assert.equal(
      (await listRuns(projectId)).find((item) => item.id === second.id)?.status,
      "failed",
    );
    console.log("Neon 저장, 충돌, 중복 요청 및 실행 점유 검증 통과");
  } finally {
    await sql`DELETE FROM drama_canvas.projects WHERE id = ${projectId}`;
  }
}

main().catch((error) => {
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : "Neon 통합 테스트를 완료하지 못했습니다.",
  );
  process.exitCode = 1;
});
