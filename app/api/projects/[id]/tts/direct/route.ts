import { projectExists } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { executeSpeechDirection } from "@/lib/runner";
import { applyDirections, directionSource, parseDirectionRequest } from "@/lib/speech-direction";
import { textAgentInput } from "@/lib/text-agent";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const asked = parseDirectionRequest(await jsonObject(request));
    if (!asked) return bad("연기 지시를 넣을 대사를 확인해 주세요.");
    if (!uuid(id) || !await projectExists(id)) return bad("프로젝트를 찾을 수 없습니다.", 404);
    try {
      const result = await executeSpeechDirection(await textAgentInput(), directionSource(asked));
      return Response.json({ lines: applyDirections(result.text ?? "", asked.lines, asked.model) }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return bad(error instanceof Error ? error.message : "연기 지시를 고르지 못했습니다.", 422);
    }
  });
}
