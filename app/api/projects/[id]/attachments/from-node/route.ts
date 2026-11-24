import { stat, unlink } from "node:fs/promises";
import { inspectAttachmentFile } from "@/lib/attachment-files";
import { createAttachment } from "@/lib/attachment-store";
import { getProject } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { localAssetPath } from "@/lib/media";
import { MAX_REFERENCE_VIDEO_BYTES } from "@/lib/reference-limits";
import type { AttachmentContent } from "@/lib/attachments-types";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const data = await jsonObject(request);
    if (!uuid(id) || typeof data.nodeId !== "string" || typeof data.version !== "number")
      return bad("프로젝트와 영상 노드를 확인해 주세요.");
    const project = await getProject(id);
    if (!project) return bad("프로젝트를 찾을 수 없습니다.", 404);
    if (project.version !== data.version) return bad("프로젝트를 저장하고 다시 선택해 주세요.", 409);
    const node = project.graph.nodes.find((item) => item.id === data.nodeId);
    if (!node?.asset || node.asset.type !== "video") return bad("프로젝트의 영상 노드를 선택해 주세요.");
    const file = localAssetPath(node.asset);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile() || info.size > MAX_REFERENCE_VIDEO_BYTES) return bad("영상 원본을 확인해 주세요.");
    let content: AttachmentContent | undefined;
    try {
      const ext = node.asset.url.endsWith(".webm") ? ".webm" : ".mp4";
      content = await inspectAttachmentFile(file, node.title.slice(0, 100) + ext, { referenceVideo: true, existingAsset: node.asset });
      if (content.asset && content.asset.url !== node.asset.url) await unlink(localAssetPath(content.asset));
      const current = await getProject(id);
      if (!current || current.version !== project.version || current.graph.nodes.find((item) => item.id === node.id)?.asset?.url !== node.asset.url) {
        throw new Error("분석 중 원본 노드가 변경됐습니다. 다시 선택해 주세요.");
      }
      return Response.json({ attachment: await createAttachment(id, { ...content, asset: node.asset }) }, { status: 201 });
    } catch (error) {
      if (content) await Promise.all([...(content.frames ?? []), ...(content.analysisSheets ?? []), ...(content.asset && content.asset.url !== node.asset.url ? [content.asset] : [])].map((asset) => unlink(localAssetPath(asset)).catch(() => {})));
      return bad(error instanceof Error ? error.message : "영상을 분석하지 못했습니다.", 422);
    }
  });
}
