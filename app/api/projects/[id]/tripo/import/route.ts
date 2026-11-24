import { createBlenderAsset, MAX_GLB_BYTES } from "@/lib/blender-assets";
import { getProject } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { tripoRequest } from "@/lib/tripo-tasks";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const { task } = await jsonObject(request);
    if (!uuid(id) || !uuid(task)) return bad("프로젝트와 작업 번호를 확인해 주세요.");
    if (!(await getProject(id))) return bad("프로젝트를 찾을 수 없습니다.", 404);
    try {
      const status = await tripoRequest(`tasks/${task}`, "GET") as { data?: { status?: string; output?: { model_url?: string } } };
      if (status.data?.status !== "success" || !status.data.output?.model_url)
        return bad("완료된 모델 파일이 없습니다.", 422);
      let url = new URL(status.data.output.model_url);
      let response: Response | undefined;
      for (let i = 0; i < 4; i++) {
        if (url.protocol !== "https:" || url.username || url.password || url.port ||
            !(url.hostname === "cdn.tripo3d.ai" || url.hostname.endsWith(".tripo3d.ai")))
          return bad("Tripo의 공식 다운로드 주소를 확인해 주세요.", 422);
        response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30000), cache: "no-store" });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get("location");
        if (!location) return bad("다운로드 주소가 올바르지 않습니다.", 422);
        url = new URL(location, url);
      }
      if (!response?.ok || !response.body) return bad("모델을 내려받지 못했습니다.", 422);
      const length = Number(response.headers.get("content-length"));
      if (length > MAX_GLB_BYTES) return bad("모델은 64 MiB 이하여야 합니다.", 413);
      const reader = response.body.getReader(), chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > MAX_GLB_BYTES) { await reader.cancel(); return bad("모델은 64 MiB 이하여야 합니다.", 413); }
        chunks.push(part.value);
      }
      const asset = await createBlenderAsset(id, Buffer.concat(chunks), `Tripo-${task}.glb`, "https://www.tripo3d.ai/", `Tripo 작업 ${task}`);
      return Response.json({ asset }, { status: 201 });
    } catch (error) {
      return bad(error instanceof Error ? error.message : "모델을 가져오지 못했습니다.", 422);
    }
  });
}
