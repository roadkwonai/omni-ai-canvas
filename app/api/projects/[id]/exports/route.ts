import { CutExportError, exportCuts } from "@/lib/cut-export";
import { getProject } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const { version, nodeIds } = await jsonObject(request);
    if (
      !uuid(id) ||
      !Number.isSafeInteger(version) ||
      !Array.isArray(nodeIds) ||
      nodeIds.length < 1 ||
      nodeIds.length > 10 ||
      nodeIds.some((value) => typeof value !== "string")
    )
      return bad("프로젝트와 영상 선택을 확인해 주세요.");
    const project = await getProject(id);
    if (!project) return bad("프로젝트를 찾을 수 없습니다.", 404);
    if (project.version !== version)
      return bad(
        "프로젝트가 변경되었습니다. 저장된 최신 버전을 확인해 주세요.",
        409,
      );
    try {
      return Response.json(
        { asset: await exportCuts(project.graph, nodeIds) },
        { status: 201 },
      );
    } catch (error) {
      const message =
        error instanceof CutExportError
          ? error.message
          : "영상 합성에 실패했습니다. 파일과 FFmpeg 설치 상태를 확인해 주세요.";
      return bad(message);
    }
  });
}
