import { unlink } from "node:fs/promises";
import { inspectAttachmentFile } from "@/lib/attachment-files";
import {
  AttachmentError,
  createAttachment,
  getAttachment,
} from "@/lib/attachment-store";
import { readContestSource } from "@/lib/contest-source";
import { getProject } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { localAssetPath, MAX_MEDIA_BYTES } from "@/lib/media";
import { inspectYouTubeReference } from "@/lib/reference-video";
import type { AttachmentContent } from "@/lib/attachments-types";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const attachmentId = new URL(request.url).searchParams.get("id");
    if (!uuid(id) || !uuid(attachmentId))
      return bad("첨부 주소를 확인해 주세요.");
    if (!(await getProject(id)))
      return bad("프로젝트를 찾을 수 없습니다.", 404);
    try {
      return Response.json(
        { attachment: await getAttachment(id, attachmentId) },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      if (error instanceof AttachmentError) return bad(error.message, 404);
      throw error;
    }
  });
}

export async function POST(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    if (!uuid(id)) return bad("프로젝트 주소를 확인해 주세요.");
    if (!(await getProject(id)))
      return bad("프로젝트를 찾을 수 없습니다.", 404);
    const type = request.headers.get("content-type") || "";
    let content: AttachmentContent;
    if (type.split(";")[0].trim() === "application/json") {
      const data = await jsonObject(request);
      if (typeof data.url !== "string" || data.url.length > 2048)
        return bad("공개 HTTPS 주소를 입력해 주세요.");
      if (data.referenceVideo === true) {
        try {
          content = await inspectYouTubeReference(data.url);
        } catch (error) {
          return bad(error instanceof Error ? error.message : "공개 영상을 읽지 못했습니다.", 422);
        }
      } else {
      try {
        const source = await readContestSource(data.url);
        if (source.kind === "manual" || !source.text.trim())
          return Response.json(
            {
              error:
                source.reason ||
                "공개 본문을 읽지 못했습니다. 내용을 직접 입력해 주세요.",
              manual: true,
            },
            { status: 422 },
          );
        content = {
          kind: "link",
          name: source.title,
          text: source.text,
          url: source.url,
          detail: "공개 페이지 본문을 추출했습니다.",
        };
      } catch {
        return bad(
          "공개 HTTPS 페이지를 읽지 못했습니다. 주소를 확인해 주세요.",
        );
      }
      }
    } else if (type.startsWith("multipart/form-data;")) {
      const maxBody = MAX_MEDIA_BYTES + 1024 * 1024;
      const length = request.headers.get("content-length");
      if (length && (!/^\d+$/.test(length) || Number(length) > maxBody))
        return bad("첨부 파일 크기는 64 MiB 이하여야 합니다.", 413);
      const reader = request.body?.getReader();
      if (!reader) return bad("첨부 파일을 선택해 주세요.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBody) {
          await reader.cancel();
          return bad("첨부 파일 크기는 64 MiB 이하여야 합니다.", 413);
        }
        chunks.push(value);
      }
      try {
        const form = await new Response(new Blob(chunks as BlobPart[]), {
          headers: { "Content-Type": type },
        }).formData();
        const files = form.getAll("file");
        if (files.length !== 1 || !(files[0] instanceof File))
          return bad("첨부 파일을 하나 선택해 주세요.");
        if (files[0].size > MAX_MEDIA_BYTES)
          return bad("첨부 파일 크기는 64 MiB 이하여야 합니다.", 413);
        if (form.get("referenceVideo") === "true" && !/\.(mp4|webm)$/i.test(files[0].name))
          return bad("레퍼런스 분석에 MP4 또는 WebM 영상을 첨부해 주세요.");
        content = await inspectAttachmentFile(
          new Uint8Array(await files[0].arrayBuffer()),
          files[0].name,
          { referenceVideo: form.get("referenceVideo") === "true" },
        );
      } catch (error) {
        return bad(
          error instanceof Error && !("cmd" in error)
            ? error.message
            : "첨부 파일을 읽지 못했습니다.",
        );
      }
    } else return bad("파일 또는 공개 링크를 첨부해 주세요.");
    try {
      return Response.json(
        { attachment: await createAttachment(id, content) },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      const files = [content.asset, ...(content.frames ?? []), ...(content.analysisSheets ?? [])].filter(
        (asset) => asset !== undefined,
      );
      await Promise.all(
        files.map((asset) => unlink(localAssetPath(asset)).catch(() => {})),
      );
      if (error instanceof AttachmentError) return bad(error.message);
      throw error;
    }
  });
}
