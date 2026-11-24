import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { localAssetPath, MAX_MEDIA_BYTES, storeMedia } from "./media";
import type { Asset } from "./types";

const run = promisify(execFile);

export async function splitForeground(asset: Asset): Promise<{ label: string; asset: Asset }[]> {
  if (process.platform !== "darwin") throw new Error("자동 분리는 macOS에서 사용할 수 있습니다. 직접 영역을 선택해 주세요.");
  const bytes = await readFile(localAssetPath(asset));
  if (bytes.length > MAX_MEDIA_BYTES) throw new Error("이미지 용량이 너무 큽니다.");
  const normalized = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().png().toBuffer();
  const directory = await mkdtemp(path.join(os.tmpdir(), "canvas-layers-"));
  try {
    const input = path.join(directory, "input.png");
    const foreground = path.join(directory, "foreground.png");
    const background = path.join(directory, "background.png");
    await writeFile(input, normalized);
    try {
      await run("/usr/bin/swift", [path.join(process.cwd(), "scripts/image-layer-mask.swift"), input, foreground, background], {
        timeout: 120_000,
        maxBuffer: 128_000,
      });
    } catch (error) {
      const message = (error as { stderr?: string }).stderr?.trim();
      throw new Error(message || "자동 분리에 실패했습니다. 직접 영역을 선택해 주세요.");
    }
    const layers = [];
    for (const [label, filename] of [["전경", foreground], ["배경", background]]) {
      const result = await readFile(filename);
      if (result.length > MAX_MEDIA_BYTES) throw new Error("분리된 이미지가 허용 용량을 초과했습니다.");
      layers.push({ label, asset: await storeMedia(result, `${label}.png`, "image") });
    }
    return layers;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
