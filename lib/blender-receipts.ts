import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { parseBlenderScene, type BlenderSceneSpec } from "./blender-scene-spec";
import { uuid } from "./http";
import { isAsset, localAssetPath } from "./media";
import type { Asset, Graph } from "./types";

const root = path.join(process.cwd(), ".scene-room", "blender-receipts");
const scenePattern = /^[A-Za-z0-9_-]{1,80}$/;
const receiptPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/i;
const maxReceipts = 5000;
export type BlenderReceipt = {
  asset: Asset;
  sceneId: string;
  spec: BlenderSceneSpec;
  quality: "preview" | "final";
  createdAt: string;
};

function projectDirectory(projectId: string) {
  if (!uuid(projectId)) throw new Error("프로젝트 주소를 확인해 주세요.");
  return path.join(root, projectId.toLowerCase());
}
function receiptName(asset: Asset) {
  const name = path.basename(asset.url);
  if (
    asset.type !== "video" ||
    !isAsset(asset) ||
    !name.endsWith(".mp4") ||
    !asset.url.startsWith("/api/assets/")
  )
    throw new Error("렌더 영상 주소를 확인해 주세요.");
  const receipt = name.slice(0, -4) + ".json";
  if (!receiptPattern.test(receipt))
    throw new Error("렌더 영상 주소를 확인해 주세요.");
  return receipt;
}
function isReceipt(value: unknown): value is BlenderReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    isAsset(item.asset) &&
    item.asset.type === "video" &&
    typeof item.sceneId === "string" &&
    scenePattern.test(item.sceneId) &&
    parseBlenderScene(item.spec) !== null &&
    (item.quality === "preview" || item.quality === "final") &&
    typeof item.createdAt === "string" &&
    Number.isFinite(Date.parse(item.createdAt))
  );
}

export async function saveBlenderReceipt(
  projectId: string,
  receipt: BlenderReceipt,
) {
  if (!isReceipt(receipt)) throw new Error("3D 렌더 기록을 확인해 주세요.");
  const directory = projectDirectory(projectId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const files = await readdir(directory);
  if (files.filter((file) => receiptPattern.test(file)).length >= maxReceipts)
    throw new Error("렌더 기록 저장 한도에 도달했습니다.");
  const location = path.join(directory, receiptName(receipt.asset));
  const handle = await open(location, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(receipt));
  } catch (error) {
    await unlink(location).catch(() => {});
    throw error;
  } finally {
    await handle.close();
  }
}

export async function listBlenderReceipts(
  projectId: string,
  sceneId: string,
  graph: Graph,
): Promise<BlenderReceipt[]> {
  if (!scenePattern.test(sceneId)) throw new Error("샷 주소를 확인해 주세요.");
  const directory = projectDirectory(projectId);
  const files = await readdir(directory).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  const linked = new Set(
    graph.nodes.flatMap((node) => (node.asset ? [node.asset.url] : [])),
  );
  const receipts = await Promise.all(
    files
      .filter((file) => receiptPattern.test(file))
      .slice(0, maxReceipts)
      .map(async (file) => {
        try {
          const metadata = await lstat(path.join(directory, file));
          if (
            !metadata.isFile() ||
            metadata.isSymbolicLink() ||
            metadata.size > 64 * 1024
          )
            return null;
          const data: unknown = JSON.parse(
            await readFile(path.join(directory, file), "utf8"),
          );
          if (
            !isReceipt(data) ||
            data.sceneId !== sceneId ||
            linked.has(data.asset.url) ||
            receiptName(data.asset) !== file
          )
            return null;
          const assetInfo = await lstat(localAssetPath(data.asset));
          if (
            !assetInfo.isFile() ||
            assetInfo.isSymbolicLink() ||
            assetInfo.size < 1
          )
            return null;
          return data;
        } catch {
          return null;
        }
      }),
  );
  return receipts
    .filter((item): item is BlenderReceipt => item !== null)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 50);
}
