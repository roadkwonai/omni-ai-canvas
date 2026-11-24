import { createWriteStream } from "node:fs";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { inspectAttachmentFile } from "@/lib/attachment-files";
import { createAttachment } from "@/lib/attachment-store";
import { getProject } from "@/lib/db";
import { bad, localApi, uuid } from "@/lib/http";
import { localAssetPath } from "@/lib/media";
import { MAX_REFERENCE_VIDEO_BYTES } from "@/lib/reference-limits";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return localApi(request, async () => {
    const { id } = await context.params;
    if (!uuid(id) || !(await getProject(id))) return bad("프로젝트를 찾을 수 없습니다.", 404);
    if (request.headers.get("content-type")?.split(";")[0] !== "application/octet-stream")
      return bad("MP4 또는 WebM 파일을 선택해 주세요.");
    let name: string;
    try { name = decodeURIComponent(request.headers.get("x-file-name") ?? ""); }
    catch { return bad("파일 이름을 확인해 주세요."); }
    if (!name || name.length > 1000 || !/\.(mp4|webm)$/i.test(name))
      return bad("MP4 또는 WebM 파일을 선택해 주세요.");
    const length = request.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_REFERENCE_VIDEO_BYTES))
      return bad("레퍼런스 영상은 1 GiB 이하여야 합니다.", 413);
    if (!request.body) return bad("영상을 선택해 주세요.");
    const directory = await mkdtemp(path.join(os.tmpdir(), "scene-reference-upload-"));
    const input = path.join(directory, "source" + path.extname(name).toLowerCase());
    let size = 0;
    try {
      const limit = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          size += chunk.length;
          callback(size > MAX_REFERENCE_VIDEO_BYTES ? new Error("reference_size") : null, chunk);
        },
      });
      await pipeline(Readable.fromWeb(request.body as import("node:stream/web").ReadableStream), limit,
        createWriteStream(input, { flags: "wx", mode: 0o600 }), { signal: request.signal });
      if (!size) return bad("영상 파일이 비어 있습니다.");
      const content = await inspectAttachmentFile(input, name, { referenceVideo: true });
      try {
        const attachment = await createAttachment(id, content);
        return Response.json({ attachment }, { status: 201, headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        await Promise.all([content.asset, ...(content.frames ?? []), ...(content.analysisSheets ?? [])]
          .filter((asset) => asset !== undefined)
          .map((asset) => unlink(localAssetPath(asset)).catch(() => {})));
        throw error;
      }
    } catch (error) {
      if (size > MAX_REFERENCE_VIDEO_BYTES) return bad("레퍼런스 영상은 1 GiB 이하여야 합니다.", 413);
      return bad(error instanceof Error ? error.message : "영상 분석을 준비하지 못했습니다.", 422);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
