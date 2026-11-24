import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { uuid } from "./http";

export const MAX_GLB_BYTES = 64 * 1024 * 1024;
const root = path.join(process.cwd(), ".scene-room", "blender-assets");
export type BlenderAsset = {
  id: string;
  name: string;
  source: string;
  credit: string;
  meshes: string[];
  bones: string[];
  animations: string[];
  shapeKeys?: string[];
};
export class BlenderAssetError extends Error {}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const clean = (value: string, max: number) =>
  value
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim()
    .slice(0, max);
function directory(projectId: string) {
  if (!uuid(projectId))
    throw new BlenderAssetError("프로젝트 주소를 확인해 주세요.");
  return path.join(root, projectId.toLowerCase());
}
function paths(projectId: string, assetId: string) {
  if (!uuid(assetId))
    throw new BlenderAssetError("3D 자산 주소를 확인해 주세요.");
  const base = path.join(directory(projectId), assetId.toLowerCase());
  return { data: `${base}.glb`, meta: `${base}.json` };
}
function stringName(value: unknown, fallback: string) {
  return typeof value === "string" && clean(value, 120)
    ? clean(value, 120)
    : fallback;
}
function safeDocument(value: unknown, depth = 0): void {
  if (depth > 128) throw new BlenderAssetError("GLB 구조가 너무 깊습니다.");
  if (Array.isArray(value)) {
    for (const item of value) safeDocument(item, depth + 1);
    return;
  }
  if (!object(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (key.toLowerCase() === "uri")
      throw new BlenderAssetError(
        "외부 파일이나 링크를 참조하는 GLB는 지원하지 않습니다. 모든 리소스를 GLB에 포함해 주세요.",
      );
    safeDocument(item, depth + 1);
  }
}
function items(value: unknown): Record<string, unknown>[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > 10000 ||
    value.some((entry) => !object(entry))
  )
    throw new BlenderAssetError("GLB 구조를 확인해 주세요.");
  return value as Record<string, unknown>[];
}
export function inspectGlb(bytes: Uint8Array) {
  const data = Buffer.from(bytes);
  if (
    data.length < 20 ||
    data.length > MAX_GLB_BYTES ||
    data.toString("ascii", 0, 4) !== "glTF" ||
    data.readUInt32LE(4) !== 2 ||
    data.readUInt32LE(8) !== data.length
  )
    throw new BlenderAssetError(
      "64 MiB 이하의 유효한 GLB 2.0 파일을 선택해 주세요.",
    );
  const jsonLength = data.readUInt32LE(12);
  if (
    jsonLength < 4 ||
    jsonLength > 8 * 1024 * 1024 ||
    jsonLength % 4 ||
    data.toString("ascii", 16, 20) !== "JSON" ||
    20 + jsonLength > data.length
  )
    throw new BlenderAssetError("GLB JSON 영역이 올바르지 않습니다.");
  let doc: Record<string, unknown>;
  try {
    const parsed = JSON.parse(
      data
        .subarray(20, 20 + jsonLength)
        .toString("utf8")
        .trim(),
    );
    if (!object(parsed)) throw new Error();
    doc = parsed;
  } catch {
    throw new BlenderAssetError("GLB JSON을 읽지 못했습니다.");
  }
  if (!object(doc.asset) || doc.asset.version !== "2.0")
    throw new BlenderAssetError("GLB 2.0 자산 정보가 필요합니다.");
  safeDocument(doc);
  let offset = 20 + jsonLength,
    binLength = 0,
    chunks = 0;
  while (offset < data.length) {
    if (offset + 8 > data.length)
      throw new BlenderAssetError("GLB 데이터 영역이 잘렸습니다.");
    const size = data.readUInt32LE(offset),
      type = data.toString("ascii", offset + 4, offset + 8);
    offset += 8;
    if (
      size % 4 ||
      offset + size > data.length ||
      type !== "BIN\0" ||
      ++chunks > 1
    )
      throw new BlenderAssetError("GLB 데이터 영역을 확인해 주세요.");
    binLength = size;
    offset += size;
  }
  const buffers = items(doc.buffers),
    views = items(doc.bufferViews),
    accessors = items(doc.accessors),
    meshes = items(doc.meshes),
    nodes = items(doc.nodes),
    skins = items(doc.skins),
    animations = items(doc.animations);
  if (
    buffers.length > 1 ||
    (buffers.length &&
      (!Number.isSafeInteger(buffers[0].byteLength) ||
        Number(buffers[0].byteLength) < 0 ||
        Number(buffers[0].byteLength) > binLength))
  )
    throw new BlenderAssetError("GLB 내부 버퍼를 확인해 주세요.");
  for (const view of views) {
    const start = view.byteOffset ?? 0,
      length = view.byteLength;
    if (
      view.buffer !== 0 ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(length) ||
      Number(start) < 0 ||
      Number(length) < 0 ||
      Number(start) + Number(length) > binLength
    )
      throw new BlenderAssetError("GLB 내부 데이터 범위가 올바르지 않습니다.");
  }
  let vertexCount = 0;
  for (const accessor of accessors) {
    if (
      !Number.isSafeInteger(accessor.count) ||
      Number(accessor.count) < 0 ||
      Number(accessor.count) > 2_000_000
    )
      throw new BlenderAssetError("GLB 메시 크기 한도를 초과했습니다.");
    vertexCount += Number(accessor.count);
    if (vertexCount > 12_000_000)
      throw new BlenderAssetError("GLB 메시 크기 한도를 초과했습니다.");
  }
  const boneIds = new Set<number>();
  for (const skin of skins) {
    if (
      !Array.isArray(skin.joints) ||
      skin.joints.length > 1000 ||
      skin.joints.some(
        (id) => !Number.isInteger(id) || id < 0 || id >= nodes.length,
      )
    )
      throw new BlenderAssetError("GLB 스킨의 뼈 정보를 확인해 주세요.");
    for (const id of skin.joints as number[]) boneIds.add(id);
  }
  // 이름 없는 glTF 항목에 임의 이름을 붙이면 Blender의 실제 이름과 달라질 수 있다.
  return {
    meshes: meshes.map((m, i) => stringName(m.name, `메시 ${i + 1}`)),
    bones: [...boneIds].flatMap((id) =>
      typeof nodes[id].name === "string" && nodes[id].name
        ? [nodes[id].name as string]
        : [],
    ),
    shapeKeys: [
      ...new Set(
        meshes.flatMap((mesh) => {
          const extras = object(mesh.extras) ? mesh.extras : {};
          return Array.isArray(extras.targetNames)
            ? extras.targetNames.filter(
                (name): name is string =>
                  typeof name === "string" &&
                  name.length > 0 &&
                  name.length <= 120,
              )
            : [];
        }),
      ),
    ],
    animations: animations.flatMap((a) =>
      typeof a.name === "string" && a.name ? [a.name] : [],
    ),
  };
}
export async function createBlenderAsset(
  projectId: string,
  bytes: Uint8Array,
  name: string,
  source: string,
  credit: string,
): Promise<BlenderAsset> {
  const info = inspectGlb(bytes),
    id = randomUUID(),
    location = paths(projectId, id);
  const asset: BlenderAsset = {
    id,
    name: clean(path.basename(name), 200) || "3D 자산.glb",
    source: clean(source, 500),
    credit: clean(credit, 500),
    ...info,
  };
  await mkdir(directory(projectId), { recursive: true, mode: 0o700 });
  try {
    await writeFile(location.data, bytes, { flag: "wx", mode: 0o600 });
    await writeFile(location.meta, JSON.stringify(asset), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    await unlink(location.data).catch(() => {});
    throw error;
  }
  return asset;
}
export async function getBlenderAsset(
  projectId: string,
  id: string,
): Promise<{ asset: BlenderAsset; file: string }> {
  const location = paths(projectId, id);
  try {
    const [raw, info] = await Promise.all([
      readFile(/* turbopackIgnore: true */ location.meta, "utf8"),
      lstat(location.data),
    ]);
    const asset = JSON.parse(raw) as BlenderAsset;
    if (
      asset.id !== id ||
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size < 1 ||
      info.size > MAX_GLB_BYTES ||
      typeof asset.name !== "string" ||
      ![asset.meshes, asset.bones, asset.animations].every(
        (a) => Array.isArray(a) && a.every((v) => typeof v === "string"),
      )
    )
      throw new Error();
    if (asset.shapeKeys === undefined)
      asset.shapeKeys = inspectGlb(await readFile(/* turbopackIgnore: true */ location.data)).shapeKeys;
    return { asset, file: location.data };
  } catch {
    throw new BlenderAssetError(
      "현재 프로젝트에서 3D 자산을 찾을 수 없습니다.",
    );
  }
}
export async function listBlenderAssets(
  projectId: string,
): Promise<BlenderAsset[]> {
  const names = await readdir(directory(projectId)).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  const entries = await Promise.all(
    names
      .filter((name) => /^[0-9a-f-]{36}\.json$/i.test(name))
      .map(async (name) => {
        try {
          return (await getBlenderAsset(projectId, name.slice(0, -5))).asset;
        } catch {
          return null;
        }
      }),
  );
  return entries.filter((entry): entry is BlenderAsset => entry !== null);
}
