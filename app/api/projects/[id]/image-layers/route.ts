import { getProject } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { splitForeground } from "@/lib/image-layers";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const data = await jsonObject(request);
    if (!uuid(id) || typeof data.sourceId !== "string" ||
        (data.sourceUrl !== undefined && typeof data.sourceUrl !== "string") ||
        (data.description !== undefined && (typeof data.description !== "string" || data.description.length > 1000)))
      return bad("원본 이미지와 분리 설정을 확인해 주세요.");
    const project = await getProject(id);
    if (!project) return bad("프로젝트를 찾을 수 없습니다.", 404);
    const source = project.graph.nodes.find((node) => node.id === data.sourceId);
    if (!source?.asset || source.asset.type !== "image") return bad("원본 이미지 노드를 확인해 주세요.");
    if (data.sourceUrl !== undefined && source.asset.url !== data.sourceUrl)
      return bad("원본 이미지가 변경되었습니다. 다시 선택해 주세요.", 409);
    try {
      return Response.json({ layers: await splitForeground(source.asset) });
    } catch (error) {
      return bad(error instanceof Error ? error.message : "이미지를 분리하지 못했습니다.", 422);
    }
  });
}
