import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { neon } from "@neondatabase/serverless";
import { claimRun, createProject, enqueueRun, expireRuns, getProjectRun, recoverRunOutcome } from "../lib/db";
import { replayRunOutcomes } from "../lib/run-outbox";

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("Neon 테스트 연결이 필요합니다.");
process.env.DATABASE_URL = url;
const sql = neon(url);
const exec = promisify(execFile);
const projectId = crypto.randomUUID();
const title = `실행 복구 QA ${projectId}`;

async function main() {
  const directory = await mkdtemp(path.join(tmpdir(), "scene-recovery-neon-"));
  try {
    await createProject(projectId, title, { nodes: [], edges: [] });
    const input = { projectId, requestId: crypto.randomUUID(), nodeId: null, operation: "text" as const,
      provider: "claude" as const, prompt: "모의 완료 테스트", references: [] };
    const run = await enqueueRun(input);
    assert.equal((await claimRun(projectId))?.id, run.id);
    await exec(process.execPath, ["--import", "tsx", "-e", `
      const fs = require("node:fs/promises");
      const path = require("node:path");
      const {completeRun} = require("./lib/run-completion");
      const {writeRunOutcome} = require("./lib/run-outbox");
      const [root,projectId,runId] = process.argv.slice(1);
      completeRun(async () => {
        await fs.appendFile(path.join(root,"execute-count"),"once");
        return {text:"완료 응답"};
      }, async () => { throw new Error("모의 DB 쓰기 장애"); },
      {projectId,runId,write: (record)=>writeRunOutcome(record,root)})
      .then(()=>process.exitCode=1, ()=>process.exitCode=17);
      `, directory, projectId, run.id]).then(
      () => assert.fail("저장 장애가 발생해야 한다"),
      (error) => assert.equal(error.code, 17),
    );
    assert.equal((await getProjectRun(projectId, run.id))?.status, "running");

    await sql`UPDATE drama_canvas.runs SET updated_at=now() - interval '2 hours' WHERE id=${run.id}`;
    await expireRuns(projectId);
    assert.equal((await getProjectRun(projectId, run.id))?.status, "failed");

    const recovery = `
      const {recoverRunOutcome} = require("./lib/db");
      const {replayRunOutcomes} = require("./lib/run-outbox");
      const [root,projectId] = process.argv.slice(1);
      replayRunOutcomes(recoverRunOutcome,projectId,root).catch(()=>process.exitCode=1);
    `;
    await Promise.all(Array.from({ length: 3 }, () => exec(process.execPath,
      ["--import", "tsx", "-e", recovery, directory, projectId])));
    const done = await getProjectRun(projectId, run.id);
    assert.equal(done?.status, "succeeded");
    assert.deepEqual(done?.result, { text: "완료 응답" });
    assert.equal(await readFile(path.join(directory, "execute-count"), "utf8"), "once");
    assert.equal(await replayRunOutcomes(recoverRunOutcome, projectId, directory), 0);
    await assert.rejects(recoverRunOutcome({ projectId, runId: run.id, result: { text: "다른 응답" }, error: null }));
    assert.deepEqual((await getProjectRun(projectId, run.id))?.result, { text: "완료 응답" });
    console.log("별도 프로세스 DB 장애·장기 만료·동시 재시작과 원본 실행 1회 확인");
  } finally {
    await sql`DELETE FROM drama_canvas.projects WHERE id=${projectId} AND title=${title}`;
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
