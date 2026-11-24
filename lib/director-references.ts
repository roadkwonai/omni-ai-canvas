import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

// 제3자 예제는 공개 소스와 빌드에서 빠지는 로컬 보관함에만 둔다.
export const directorReferenceRoot = () =>
  path.join(/* turbopackIgnore: true */ process.cwd(), ".scene-room/research/cineguide");

type ReferenceFile = { file: string; sha256: string };
export type DirectorReference = { id: string; still: ReferenceFile; video?: ReferenceFile; source: string };

const validFile = (value: unknown, id: string, extension: string): value is ReferenceFile => {
  const item = value as ReferenceFile | null;
  return item?.file === `${id}.${extension}` && typeof item.sha256 === "string" && /^[0-9a-f]{64}$/.test(item.sha256);
};

export async function readDirectorReferences(root = directorReferenceRoot()): Promise<DirectorReference[]> {
  let items: unknown;
  try {
    items = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")).items;
  } catch {
    return [];
  }
  return Array.isArray(items) ? items.filter((item): item is DirectorReference =>
    typeof item?.id === "string" && /^[a-z0-9-]+$/.test(item.id) &&
    typeof item.source === "string" && item.source.startsWith("https://materials.ainspire.co.kr/cineguide/") &&
    validFile(item.still, item.id, "webp") && (item.video === undefined || validFile(item.video, item.id, "mp4"))) : [];
}

// 목록에 있는 파일만 읽고, 기록한 해시와 다르면 없는 것으로 다룬다.
export async function readDirectorReferenceFile(file: string, root = directorReferenceRoot()) {
  const entry = (await readDirectorReferences(root)).flatMap(({ still, video }) => video ? [still, video] : [still])
    .find((item) => item.file === file);
  if (!entry) return null;
  const content = await readFile(path.join(root, entry.file)).catch(() => null);
  return content && createHash("sha256").update(content).digest("hex") === entry.sha256 ? content : null;
}

export function directorReferenceMap(items: DirectorReference[]) {
  const url = ({ file, sha256 }: ReferenceFile) => `/api/director-references/${file}?v=${sha256.slice(0, 12)}`;
  return Object.fromEntries(items.map(({ id, still, video, source }) =>
    [id, { still: url(still), ...(video ? { video: url(video) } : {}), source }]));
}
