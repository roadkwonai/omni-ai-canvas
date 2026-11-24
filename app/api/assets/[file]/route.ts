import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { bad, localRequest } from "../../../../lib/http";
import { isAsset, localAssetPath } from "../../../../lib/media";

export const runtime = "nodejs";
const mime: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  wav: "audio/wav",
  mp3: "audio/mpeg",
};

export async function GET(
  request: Request,
  context: { params: Promise<{ file: string }> },
) {
  const denied = localRequest(request);
  if (denied) return denied;
  const { file } = await context.params;
  const extension = file.split(".").pop() || "";
  const type =
    extension === "mp4" || extension === "webm"
      ? "video"
      : extension === "wav" || extension === "mp3"
        ? "audio"
        : "image";
  const asset = { url: `/api/assets/${file}`, type, name: file };
  if (!isAsset(asset)) return bad("자산을 찾을 수 없습니다.", 404);
  try {
    const filePath = localAssetPath(asset);
    const { size } = await stat(filePath);
    const headers = new Headers({
      "Content-Type": mime[extension],
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    });
    let start = 0;
    let end = size - 1;
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]))
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      if (!match[1]) {
        const suffix = Number(match[2]);
        start = Math.max(size - suffix, 0);
      } else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(Number(match[2]), end);
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= size
      )
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    }
    headers.set("Content-Length", String(end - start + 1));
    const stream = Readable.toWeb(
      createReadStream(filePath, { start, end }),
    ) as ReadableStream;
    return new Response(stream, { status: range ? 206 : 200, headers });
  } catch {
    return bad("자산을 찾을 수 없습니다.", 404);
  }
}
