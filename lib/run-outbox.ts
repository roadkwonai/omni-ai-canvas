import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, link, unlink } from "node:fs/promises";
import path from "node:path";
import type { RunResult } from "./types";

export type RunOutcome = { projectId: string; runId: string; result: RunResult | null; error: string | null };
const rootPath = () => path.join(process.cwd(), ".scene-room", "run-outbox");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function directory(root: string, projectId: string) {
  if (!uuid.test(projectId)) throw new Error("프로젝트 번호를 확인해 주세요.");
  return path.join(root, projectId.toLowerCase());
}
function fileName(runId: string) {
  if (!uuid.test(runId)) throw new Error("실행 번호를 확인해 주세요.");
  return runId.toLowerCase() + ".json";
}
async function syncDirectory(dir: string) {
  const handle = await open(dir, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}
export async function writeRunOutcome(record: RunOutcome, root = rootPath()) {
  const dir = directory(root, record.projectId);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const target = path.join(dir, fileName(record.runId));
  const temporary = path.join(dir, `.${randomUUID()}.tmp`);
  const data = JSON.stringify(record);
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
  try {
    try { await link(temporary, target); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await readFile(/* turbopackIgnore: true */ target, "utf8") !== data) throw new Error("동일 작업의 결과가 일치하지 않습니다.");
    }
    await syncDirectory(dir);
  } finally { await unlink(temporary).catch(() => {}); }
}
export async function replayRunOutcomes(
  persist: (record: RunOutcome) => Promise<void>,
  projectId?: string,
  root = rootPath(),
) {
  const projects = projectId ? [projectId] : (await readdir(/* turbopackIgnore: true */ root).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [] as string[];
    throw error;
  })).filter((name) => uuid.test(name));
  let count = 0;
  for (const project of projects) {
    const dir = directory(root, project);
    const files = (await readdir(/* turbopackIgnore: true */ dir).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [] as string[];
      throw error;
    })).filter((name) => /^[0-9a-f-]{36}\.json$/i.test(name)).sort();
    for (const file of files) {
      const target = path.join(/* turbopackIgnore: true */ dir, file);
      let raw: string;
      try { raw = await readFile(/* turbopackIgnore: true */ target, "utf8"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
      const record = JSON.parse(raw) as RunOutcome;
      if (record.projectId !== project || fileName(record.runId) !== file ||
          (record.result === null) === (record.error === null)) throw new Error("완료 결과 기록을 확인해 주세요.");
      await persist(record);
      await unlink(/* turbopackIgnore: true */ target).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
      await syncDirectory(dir);
      count++;
    }
  }
  return count;
}
