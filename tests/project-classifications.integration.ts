import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { createProject, createProjectClassification, deleteProjectClassification, getProject, listProjectClassifications, renameProjectClassification, saveProject, updateProjectDetails } from "../lib/db";

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("Neon 연결이 필요합니다.");
process.env.DATABASE_URL = url;
const sql = neon(url);
const first = crypto.randomUUID();
const second = crypto.randomUUID();
const label = `QA-${crypto.randomUUID().slice(0, 12)}`;
const category = `${label}-분류`;
const renamed = `${label}-변경`;
const tag = `${label}-태그`;
const renamedTag = `${label}-수정`;
async function main() {
  try {
    await createProject(first, "분류 통합 검증", { nodes: [], edges: [] });
    await createProject(second, "분류 통합 검증2", { nodes: [], edges: [] });
    assert.ok(await createProjectClassification("category", category));
    assert.ok(await createProjectClassification("tag", tag));
    assert.equal(await createProjectClassification("tag", tag), false);
    let catalog = await listProjectClassifications();
    const categoryId = catalog.find((item) => item.name === category && item.kind === "category")!.id;
    const tagId = catalog.find((item) => item.name === tag && item.kind === "tag")!.id;
    await Promise.all([
      updateProjectDetails(first, 1, "분류 통합 검증", category, [tag], { categoryId, tagIds: [tagId] }),
      updateProjectDetails(second, 1, "분류 통합 검증2", category, [tag], { categoryId, tagIds: [tagId] }),
    ]);
    catalog = await listProjectClassifications();
    assert.equal(catalog.find((item) => item.id === categoryId)?.projectCount, 2);
    assert.equal((await renameProjectClassification(categoryId, renamed))?.changedCount, 2);
    assert.equal((await renameProjectClassification(tagId, renamedTag))?.changedCount, 2);
    for (const id of [first, second]) {
      const project = await getProject(id);
      assert.equal(project?.category, renamed);
      assert.deepEqual(project?.tags, [renamedTag]);
      assert.equal(project?.version, 4);
    }
    assert.equal(await updateProjectDetails(first, 4, "오래된 분류", category, [tag],
      { categoryId, tagIds: [tagId] }), null);
    assert.equal((await deleteProjectClassification(categoryId))?.changedCount, 2);
    assert.equal((await deleteProjectClassification(tagId))?.changedCount, 2);
    for (const id of [first, second]) {
      const project = await getProject(id);
      assert.equal(project?.category, null);
      assert.deepEqual(project?.tags, []);
      assert.equal(project?.version, 6);
    }
    assert.equal(await updateProjectDetails(first, 6, "삭제된 분류", renamed, [],
      { categoryId, tagIds: [] }), null);
    const fresh = await updateProjectDetails(first, 6, "신규 분류", `${label}-새로움`, [`${label}-새태그`],
      { categoryId: null, tagIds: [null] });
    assert.ok(fresh);
    catalog = await listProjectClassifications();
    assert.ok(catalog.some((item) => item.name === `${label}-새로움`));
    assert.ok(catalog.some((item) => item.name === `${label}-새태그`));
    const freshId = catalog.find((item) => item.name === `${label}-새로움`)!.id;
    const [concurrentRename, concurrentSave] = await Promise.all([
      renameProjectClassification(freshId, `${label}-동시변경`),
      updateProjectDetails(first, 7, "동시 저장", `${label}-새로움`, [`${label}-새태그`],
        { categoryId: freshId, tagIds: [catalog.find((item) => item.name === `${label}-새태그`)!.id] }),
    ]);
    assert.ok(concurrentRename);
    const concurrentResult = await getProject(first);
    assert.equal(concurrentResult?.category, `${label}-동시변경`);
    assert.ok(concurrentSave === null || concurrentSave.category === `${label}-새로움`);
    const before = (await getProject(second))!;
    const [graphResult, metadataResult] = await Promise.all([
      saveProject(second, "그래프 동시 저장", { nodes: [], edges: [] }, before.version),
      updateProjectDetails(second, before.version, "메타 동시 저장", null, []),
    ]);
    assert.equal(Number(Boolean(graphResult)) + Number(Boolean(metadataResult)), 1);
    const raceName = `${label}-선행할당`;
    const raceRenamed = `${label}-후행변경`;
    await createProjectClassification("category", raceName);
    const raceId = (await listProjectClassifications()).find((item) => item.name === raceName)!.id;
    const assignment = sql.transaction([
      sql`SELECT pg_advisory_xact_lock(1946112206)`,
      sql`UPDATE drama_canvas.projects SET category = ${raceName}, version = version + 1 WHERE id = ${second}`,
      sql`SELECT pg_sleep(1)`,
    ]);
    let locked = false;
    for (let i = 0; i < 50; i++) {
      const [row] = await sql`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=1946112206 AND granted) AS locked`;
      if (row.locked) { locked = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(locked, "분류 할당 트랜잭션이 잠금을 획득해야 합니다.");
    const laterRename = renameProjectClassification(raceId, raceRenamed);
    await assignment;
    assert.equal((await laterRename)?.changedCount, 1);
    assert.equal((await getProject(second))?.category, raceRenamed);
    console.log("공유 분류 Neon 통합 검증 통과");
  } finally {
    await sql`DELETE FROM drama_canvas.projects WHERE id = ANY(${[first, second]}::uuid[])`;
    await sql`DELETE FROM drama_canvas.project_classifications WHERE left(name, ${label.length}) = ${label}`;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
