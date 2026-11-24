import { createBoardPreset, listBoardPresets } from "@/lib/board-preset-store";
import { getProject } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { boardTemplate } from "@/lib/production-start";

export async function GET(request: Request) {
  return localApi(request, async () => Response.json({ presets: await listBoardPresets() }, { headers: { "Cache-Control": "no-store" } }));
}

export async function POST(request: Request) {
  return localApi(request, async () => {
    const input = await jsonObject(request);
    if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 100 ||
        !uuid(input.projectId) || !Number.isSafeInteger(input.version) || Number(input.version) < 1 ||
        (input.nodeIds !== undefined && (!Array.isArray(input.nodeIds) || !input.nodeIds.length || input.nodeIds.some((id) => typeof id !== "string"))))
      return bad("프리셋 이름과 노드 선택을 확인해 주세요.");
    const project = await getProject(input.projectId);
    if (!project || project.version !== input.version || project.deletedAt) return bad("프로젝트가 변경되었습니다. 다시 저장해 주세요.", 409);
    const ids = input.nodeIds as string[] | undefined;
    if (ids && (new Set(ids).size !== ids.length || ids.some((id) => !project.graph.nodes.some((node) => node.id === id))))
      return bad("선택한 노드를 확인해 주세요.");
    let graph;
    try { graph = boardTemplate(project.graph, ids); }
    catch (error) { return bad(error instanceof Error ? error.message : "프리셋을 만들 수 없습니다."); }
    const preset = await createBoardPreset(input.name.trim(), graph, project.id, project.version);
    return preset ? Response.json({ preset }, { status: 201 }) : bad("프로젝트가 변경되었습니다. 다시 저장해 주세요.", 409);
  });
}
