import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createProject, getProject, listProjects, updateProjectDetails, setProjectState, openProject, duplicateProject } from "../lib/db";
import { PATCH } from "../app/api/projects/[id]/route";

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("Neon 연결이 필요합니다.");
process.env.DATABASE_URL = url;
const sql = neon(url);
const first = crypto.randomUUID();
const second = crypto.randomUUID();
const copy = crypto.randomUUID();
let routeCopy: string | undefined;
const assetRoot = path.join(process.cwd(), ".scene-room", "blender-assets");
async function main() {
try {
  await createProject(first, "검색 테스트", { nodes: [], edges: [] });
  await createProject(second, "최근 테스트", { nodes: [], edges: [] });
  const details = await updateProjectDetails(first, 1, "편집한 작품", "드라마", ["서울", "야간"]);
  assert.equal(details?.version, 2);
  assert.deepEqual(details?.tags, ["서울", "야간"]);
  assert.equal(await updateProjectDetails(first, 1, "충돌", null, []), null);
  const archived = await setProjectState(first, 2, "archive");
  assert.ok(archived?.archivedAt);
  const trashed = await setProjectState(first, 3, "trash");
  assert.ok(trashed?.deletedAt);
  const restored = await setProjectState(first, 4, "restore");
  assert.equal(restored?.deletedAt, null);
  assert.ok(restored?.archivedAt);
  assert.equal((await setProjectState(first, 5, "restore"))?.archivedAt, null);
  const duplicated = await duplicateProject(first, copy, 6, "복제본");
  assert.deepEqual(duplicated?.graph, { nodes: [], edges: [] });
  assert.deepEqual(duplicated?.tags, ["서울", "야간"]);
  assert.equal(await duplicateProject(first, crypto.randomUUID(), 5, "오래된 복제"), null);
  await openProject(first);
  assert.equal((await listProjects())[0].id, first);
  assert.ok((await getProject(first))?.lastOpenedAt);
  const sourceAssets = path.join(assetRoot, first);
  await mkdir(sourceAssets, { recursive: true });
  await writeFile(path.join(sourceAssets, "fixture.glb"), "asset");
  const patch = (body: unknown) => PATCH(new Request(`http://127.0.0.1:3000/api/projects/${first}`, {
    method: "PATCH", headers: { host: "127.0.0.1:3000", "content-type": "application/json" }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: first }) });
  assert.equal((await patch({ action: "metadata", version: 6, title: "x", category: "", tags: [""] })).status, 400);
  const copiedResponse = await patch({ action: "duplicate", version: 6 });
  assert.equal(copiedResponse.status, 200);
  const copied = (await copiedResponse.json()).project;
  routeCopy = copied.id;
  assert.equal(await readFile(path.join(assetRoot, copied.id, "fixture.glb"), "utf8"), "asset");
  assert.equal((await patch({ action: "archive", version: 1 })).status, 409);
  console.log("프로젝트 관리 Neon 통합 검증 통과");
} finally {
  await sql`DELETE FROM drama_canvas.projects WHERE id = ANY(${[first, second, copy, ...(routeCopy ? [routeCopy] : [])]}::uuid[])`;
  await rm(path.join(assetRoot, first), { recursive: true, force: true });
  if (routeCopy) await rm(path.join(assetRoot, routeCopy), { recursive: true, force: true });
}
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
