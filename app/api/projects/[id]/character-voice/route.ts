import { RegistrationConflict } from "@/lib/character-registration-receipt";
import { getReadyVoice } from "@/lib/character-registration";
import { getProject } from "@/lib/db";
import { useHiggsfieldMcp as withHiggsfieldMcp } from "@/lib/higgsfield-elements";
import { createProviderVoice, createVoiceOnce, findProviderVoice, hasVoiceRegistrationTools, parseVoiceRegistration } from "@/lib/higgsfield-voice-registration";
import { bad, jsonObject, localApi, localOrigin, uuid } from "@/lib/http";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    if (!uuid(id)) return bad("프로젝트 주소를 확인해 주세요.");
    if (!(await getProject(id))) return bad("프로젝트를 찾을 수 없습니다.", 404);
    const origin = localOrigin(request);
    if (!origin) return bad("로컬 연결이 필요합니다.", 403);
    const voiceId = new URL(request.url).searchParams.get("id");
    if (voiceId && !uuid(voiceId)) return bad("목소리 ID를 확인해 주세요.");
    const ready = voiceId ? await getReadyVoice(voiceId) : null;
    if (ready?.type === "element") return Response.json({ available: true, voice: { id: ready.id, type: ready.type, status: "ready" } },
      { headers: { "Cache-Control": "no-store" } });
    try {
      const result = await withHiggsfieldMcp(origin, async (client) => {
        if (voiceId) return { available: true, voice: await findProviderVoice(client, voiceId) };
        return await hasVoiceRegistrationTools(client) ? { available: true }
          : { available: false, reason: "연결된 Higgsfield MCP가 목소리 등록을 지원하지 않습니다." };
      });
      return Response.json({ ...result, account: "higgsfield-mcp" }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return Response.json({ available: false, account: "higgsfield-mcp", reason: "Higgsfield MCP 계정 연결을 확인해 주세요." }, { headers: { "Cache-Control": "no-store" } });
    }
  });
}

export async function POST(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    if (!uuid(id)) return bad("프로젝트 주소를 확인해 주세요.");
    const project = await getProject(id);
    if (!project) return bad("프로젝트를 찾을 수 없습니다.", 404);
    const origin = localOrigin(request);
    if (!origin) return bad("로컬 연결이 필요합니다.", 403);
    const registration = parseVoiceRegistration(await jsonObject(request));
    if (!registration) return bad("목소리 이름, 음성 파일과 사용 동의를 확인해 주세요.");
    if (!project.graph.nodes.some((node) => node.id === registration.nodeId && node.kind === "character"))
      return bad("저장된 캐릭터 시트를 찾을 수 없습니다. 프로젝트를 저장한 뒤 다시 시도해 주세요.", 404);
    try {
      const voice = await withHiggsfieldMcp(origin, async (client) => {
        return createVoiceOnce(id, registration, () => createProviderVoice(client, registration));
      });
      return Response.json({ voice, account: "higgsfield-mcp" }, { status: 201, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (error instanceof RegistrationConflict) return Response.json({ error: error.message, code: error.code }, { status: 409, headers: { "Cache-Control": "no-store" } });
      return bad(error instanceof Error ? error.message : "Higgsfield 목소리 등록에 실패했습니다.", 422);
    }
  });
}
