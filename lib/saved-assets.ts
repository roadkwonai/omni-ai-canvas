import { link, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { isAsset } from "./asset-shape";
import type { Asset, CanvasNode } from "./types";

export type SavedAsset = { id: string; title: string; body: string; asset?: Asset };
const directory = path.join(process.cwd(), ".scene-room", "saved-assets");

export async function listSavedAssets(): Promise<SavedAsset[]> {
  const names = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const entries = await Promise.all(names.filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).map(async (name) => {
    const value: unknown = JSON.parse(await readFile(path.join(directory, name), "utf8"));
    if (!value || typeof value !== "object") throw new Error("저장된 자산을 읽을 수 없습니다.");
    const item = value as SavedAsset;
    if (item.id !== name.slice(0, -5) || typeof item.title !== "string" || item.title.length > 160 ||
        typeof item.body !== "string" || item.body.length > 24000 || (item.asset !== undefined && !isAsset(item.asset)))
      throw new Error("저장된 자산 형식이 잘못되었습니다.");
    return item;
  }));
  return entries.sort((a, b) => a.title.localeCompare(b.title, "ko"));
}

export async function saveAsset(projectId: string, node: CanvasNode): Promise<SavedAsset> {
  if (!node.asset && !node.body.trim()) throw new Error("저장할 미디어나 내용이 없습니다.");
  if (node.asset && !isAsset(node.asset)) throw new Error("자산을 확인해 주세요.");
  const id = createHash("sha256").update(JSON.stringify([projectId, node.id, node.title, node.body, node.asset ?? null])).digest("hex");
  const item: SavedAsset = { id, title: node.title, body: node.body, ...(node.asset ? { asset: node.asset } : {}) };
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(item), { flag: "wx", mode: 0o600 });
  try {
    await link(temporary, path.join(directory, `${id}.json`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  } finally {
    await unlink(temporary).catch(() => {});
  }
  return item;
}
