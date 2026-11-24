import { getProject } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import {
  ClipToolError,
  runClipTool,
  type ClipToolRequest,
} from "@/lib/clip-tools";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const data = await jsonObject(request);
    if (
      !uuid(id) ||
      !Number.isSafeInteger(data.version) ||
      typeof data.nodeId !== "string" ||
      typeof data.sourceUrl !== "string" ||
      typeof data.action !== "string"
    )
      return bad("프로젝트와 작업을 확인해 주세요.");
    const project = await getProject(id);
    if (!project) return bad("프로젝트를 찾을 수 없습니다.", 404);
    if (project.version !== data.version)
      return bad(
        "프로젝트가 변경되었습니다. 저장된 최신 상태를 확인해 주세요.",
        409,
      );
    if (
      project.graph.nodes.find((node) => node.id === data.nodeId)?.asset
        ?.url !== data.sourceUrl
    )
      return bad(
        "선택한 원본이 저장된 버전과 다릅니다. 프로젝트를 저장한 뒤 다시 시도하세요.",
        409,
      );
    try {
      return Response.json(
        await runClipTool(project.graph, data as ClipToolRequest),
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      return bad(
        error instanceof ClipToolError
          ? error.message
          : "미디어 작업에 실패했습니다. FFmpeg와 파일을 확인해 주세요.",
      );
    }
  });
}
