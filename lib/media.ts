import { randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, open, unlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { Asset } from "./types";
import { isAsset } from "./asset-shape";
import { MAX_REFERENCE_VIDEO_BYTES } from "./reference-limits";

export { isAsset } from "./asset-shape";
export const MAX_MEDIA_BYTES = 64 * 1024 * 1024;

function mediaFormat(
  bytes: Uint8Array,
): { extension: string; type: Asset["type"] } | null {
  const header = Buffer.from(bytes.subarray(0, 4096));
  if (
    header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return { extension: "png", type: "image" };
  if (
    header.length >= 3 &&
    header[0] === 0xff &&
    header[1] === 0xd8 &&
    header[2] === 0xff
  )
    return { extension: "jpg", type: "image" };
  if (
    header.toString("ascii", 0, 4) === "RIFF" &&
    header.toString("ascii", 8, 12) === "WEBP"
  )
    return { extension: "webp", type: "image" };
  if (
    header.length >= 44 &&
    header.toString("ascii", 0, 4) === "RIFF" &&
    header.toString("ascii", 8, 12) === "WAVE"
  )
    return { extension: "wav", type: "audio" };
  if (
    (header.length >= 10 && header.toString("ascii", 0, 3) === "ID3") ||
    (header.length >= 4 &&
      header[0] === 0xff &&
      (header[1] & 0xe0) === 0xe0 &&
      (header[1] & 0x18) !== 0x08 &&
      (header[1] & 0x06) !== 0)
  )
    return { extension: "mp3", type: "audio" };
  if (header.length >= 16 && header.toString("ascii", 4, 8) === "ftyp") {
    const boxSize = header.readUInt32BE(0);
    const brands = [header.toString("ascii", 8, 12)];
    for (
      let offset = 16;
      offset + 4 <= Math.min(boxSize, header.length);
      offset += 4
    )
      brands.push(header.toString("ascii", offset, offset + 4));
    if (
      brands.some((brand) =>
        /^(isom|iso[2-9]|mp4[12]|avc1|M4V |dash|MSNV)$/.test(brand),
      )
    )
      return { extension: "mp4", type: "video" };
  }
  if (
    header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) &&
    header.includes(Buffer.from("webm"))
  )
    return { extension: "webm", type: "video" };
  return null;
}

export function localAssetPath(asset: Asset): string {
  if (!isAsset(asset)) throw new Error("유효하지 않은 자산입니다.");
  return asset.url.startsWith("/sample/")
    ? path.join(process.cwd(), "public", asset.url.slice(1))
    : path.join(
        process.cwd(),
        ".scene-room",
        "media",
        path.basename(asset.url),
      );
}

export async function storeMedia(
  bytes: Uint8Array,
  name: string,
  expectedType?: Asset["type"],
): Promise<Asset> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_MEDIA_BYTES)
    throw new Error("파일 크기는 64 MiB 이하여야 합니다.");
  const format = mediaFormat(bytes);
  if (!format)
    throw new Error("PNG, JPEG, WebP, MP4, WebM, WAV, MP3 파일만 지원합니다.");
  if (expectedType && format.type !== expectedType)
    throw new Error("요청한 미디어 종류와 파일 형식이 다릅니다.");
  const cleanName =
    name
      .replace(/[\x00-\x1f\x7f]/g, "")
      .trim()
      .slice(0, 255) || `asset.${format.extension}`;
  const asset: Asset = {
    url: `/api/assets/${randomUUID()}.${format.extension}`,
    type: format.type,
    name: cleanName,
  };
  const filePath = localAssetPath(asset);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes, { flag: "wx" });
  if (format.type === "audio") {
    try {
      await promisify(execFile)(
        "ffmpeg",
        [
          "-v",
          "error",
          "-protocol_whitelist",
          "file,pipe",
          "-i",
          filePath,
          "-map",
          "0:a:0",
          "-f",
          "null",
          "-",
        ],
        { timeout: 120_000, maxBuffer: 1_000_000 },
      );
    } catch {
      await unlink(filePath).catch(() => {});
      throw new Error(
        "음원 파일을 읽을 수 없습니다. WAV 또는 MP3를 확인하세요.",
      );
    }
  }
  return asset;
}


export async function storeReferenceVideoFile(file: string, name: string): Promise<Asset> {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > MAX_REFERENCE_VIDEO_BYTES)
    throw new Error("레퍼런스 영상은 1 GiB 이하여야 합니다.");
  const handle = await open(file, "r");
  let format;
  try {
    const header = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    format = mediaFormat(header.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
  if (!format || format.type !== "video")
    throw new Error("유효한 MP4 또는 WebM 영상을 선택해 주세요.");
  const asset: Asset = {
    url: `/api/assets/${randomUUID()}.${format.extension}`,
    type: "video",
    name: name.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 255) || `asset.${format.extension}`,
  };
  const target = localAssetPath(asset);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(file, target, constants.COPYFILE_EXCL);
  return asset;
}
