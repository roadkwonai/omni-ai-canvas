import { listTripoTasks, recordTripoTask } from "@/lib/tripo-history";
import { getProject } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { parseTripoRequest, tripoPayload, tripoRequest } from "@/lib/tripo-tasks";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const task = new URL(request.url).searchParams.get("task");
    if (!uuid(id) || (task !== null && !uuid(task))) return bad("프로젝트와 작업 번호를 확인해 주세요.");
    if (!(await getProject(id))) return bad("프로젝트를 찾을 수 없습니다.", 404);
    if (!task) return Response.json({ tasks: await listTripoTasks(id) });
    try { return Response.json(await tripoRequest(`tasks/${task}`, "GET")); }
    catch (error) { return bad(error instanceof Error ? error.message : "작업을 확인하지 못했습니다.", 422); }
  });
}
export async function POST(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const body = await jsonObject(request);
    const task = parseTripoRequest(body);
    if (!uuid(id) || !task) return bad("작업 종류와 서비스 작업 번호를 확인해 주세요.");
    if (!(await getProject(id))) return bad("프로젝트를 찾을 수 없습니다.", 404);
    try {
      const result = await tripoRequest(`animations/${task.action}`, "POST", tripoPayload(task));
      const data = result as { data?: { task_id?: unknown } };
      if (uuid(data.data?.task_id)) {
        try { await recordTripoTask(id, data.data.task_id, task.action, task.input); }
        catch { return Response.json({ ...data, warning: "작업은 제출됐지만 로컬 이력에 저장하지 못했습니다. 작업 번호를 보관하세요." }); }
      }
      return Response.json(result);
    }
    catch (error) { return bad(error instanceof Error ? error.message : "작업을 제출하지 못했습니다.", 422); }
  });
}
