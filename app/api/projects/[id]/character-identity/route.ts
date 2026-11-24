import { RegistrationConflict } from "@/lib/character-registration-receipt";
import { createSoulOnce, getSoul, listSouls, listVoices, parseRegistration } from "@/lib/character-registration";
import { getProject } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    if (!uuid(id)) return bad("프로젝트 주소를 확인해 주세요.");
    const project = await getProject(id);
    if (!project) return bad("프로젝트를 찾을 수 없습니다.", 404);
    const query = new URL(request.url).searchParams;
    try {
      const kind = query.get("kind");
      if (kind === "souls") return Response.json({ souls: await listSouls() }, { headers: { "Cache-Control": "no-store" } });
      if (kind === "voices") return Response.json({ voices: await listVoices() }, { headers: { "Cache-Control": "no-store" } });
      if (kind === "soul" && uuid(query.get("id"))) return Response.json({ soul: await getSoul(query.get("id")!) }, { headers: { "Cache-Control": "no-store" } });
      return bad("조회할 캐릭터 또는 목소리를 확인해 주세요.");
    } catch (error) { return bad(error instanceof Error ? error.message : "Higgsfield 조회에 실패했습니다.", 422); }
  });
}

export async function POST(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    if (!uuid(id)) return bad("프로젝트 주소를 확인해 주세요.");
    const project = await getProject(id);
    if (!project) return bad("프로젝트를 찾을 수 없습니다.", 404);
    const registration = parseRegistration(await jsonObject(request));
    if (!registration) return bad("이름과 서로 다른 이미지 5~20장, 등록 확인을 입력해 주세요.");
    if (!project.graph.nodes.some((node) => node.id === registration.nodeId && node.kind === "character"))
      return bad("저장된 캐릭터 시트를 찾을 수 없습니다. 프로젝트를 저장한 뒤 다시 시도해 주세요.", 404);
    try { return Response.json({ soul: await createSoulOnce(id, registration) }, { status: 201, headers: { "Cache-Control": "no-store" } }); }
    catch (error) {
      if (error instanceof RegistrationConflict) return Response.json({ error: error.message, code: error.code }, { status: 409, headers: { "Cache-Control": "no-store" } });
      return bad(error instanceof Error ? error.message : "Higgsfield 등록에 실패했습니다.", 422);
    }
  });
}
