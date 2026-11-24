import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { uuid } from "./http";
const root = path.join(process.cwd(), ".scene-room", "tripo-tasks");
export async function recordTripoTask(
  projectId: string,
  id: string,
  action: string,
  input: string,
) {
  if (!uuid(projectId) || !uuid(id))
    throw new Error("작업 번호를 확인해 주세요.");
  const directory = path.join(root, projectId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(
    path.join(directory, `${id}.json`),
    JSON.stringify({
      id,
      action,
      input: uuid(input) ? input : "GLB 파일",
      createdAt: new Date().toISOString(),
    }),
    { flag: "wx", mode: 0o600 },
  );
}
export async function listTripoTasks(projectId: string) {
  if (!uuid(projectId)) throw new Error("프로젝트 번호를 확인해 주세요.");
  const directory = path.join(root, projectId);
  const names = await readdir(directory).catch(() => [] as string[]);
  const records = await Promise.all(
    names
      .filter((name) => /^[0-9a-f-]{36}\.json$/i.test(name))
      .slice(-500)
      .map(async (name) => {
        try {
          return JSON.parse(await readFile(path.join(directory, name), "utf8"));
        } catch {
          return null;
        }
      }),
  );
  return records
    .filter(Boolean)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
