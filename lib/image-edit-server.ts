import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { localAssetPath } from "./media";
import type { RunInput } from "./types";

async function hashSource(input: RunInput): Promise<string> {
  const source = input.imageEditSource;
  if (!source || !input.references.some((reference) => reference.asset?.url === source.asset.url))
    throw new Error("편집 원본을 찾을 수 없습니다.");
  const file = localAssetPath(source.asset);
  const info = await stat(file).catch(() => null);
  if (!info?.isFile() || info.size < 1 || info.size > 10 * 1024 * 1024)
    throw new Error("편집 원본 이미지는 10 MiB 이하여야 합니다.");
  const bytes = await readFile(file);
  if (bytes.length !== info.size) throw new Error("편집 원본 이미지가 변경됐습니다.");
  return createHash("sha256").update(bytes).digest("hex");
}

export async function bindImageEditSource(input: RunInput): Promise<RunInput> {
  if (!input.imageEditSource) return input;
  const sha256 = await hashSource(input);
  return { ...input, imageEditSource: { ...input.imageEditSource, sha256 } };
}

export async function verifyImageEditSource(input: RunInput): Promise<void> {
  if (!input.imageEditSource) return;
  if (!input.imageEditSource.sha256 || await hashSource(input) !== input.imageEditSource.sha256)
    throw new Error("편집 원본 파일이 변경됐습니다. 원본을 확인하고 다시 요청해 주세요.");
}
