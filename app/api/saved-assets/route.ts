import { getProject } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { listSavedAssets, saveAsset } from "@/lib/saved-assets";

export async function GET(request: Request) {
  return localApi(request, async () => Response.json({ items: await listSavedAssets() }, { headers: { "Cache-Control": "no-store" } }));
}

export async function POST(request: Request) {
  return localApi(request, async () => {
    const { projectId, nodeId } = await jsonObject(request);
    if (!uuid(projectId) || typeof nodeId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(nodeId))
      return bad("프로젝트와 노드를 확인해 주세요.");
    const project = await getProject(projectId);
    const node = project?.graph.nodes.find((entry) => entry.id === nodeId);
    if (!project || project.deletedAt || !node) return bad("저장할 노드를 찾을 수 없습니다.", 404);
    try {
      return Response.json({ item: await saveAsset(projectId, node) }, { status: 201 });
    } catch (error) {
      return bad(error instanceof Error ? error.message : "자산을 저장하지 못했습니다.", 422);
    }
  });
}
