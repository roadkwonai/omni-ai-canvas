import { bad, jsonObject, localApi, localOrigin } from "@/lib/http";
import { parseElementRequest, resultData, useHiggsfieldMcp, validateElementToolSchema } from "@/lib/higgsfield-elements";

export const runtime = "nodejs";
async function invoke(request: Request, create: boolean) {
  return localApi(request, async () => {
    const origin = localOrigin(request);
    if (!origin) return bad("로컬 연결이 필요합니다.", 403);
    const payload = create ? parseElementRequest(await jsonObject(request)) : undefined;
    if (create && !payload) return bad("확인된 이미지 ID와 Higgsfield HTTPS 주소를 확인해 주세요.");
    try {
      const output = await useHiggsfieldMcp(origin, async (client) => {
        const { tools } = await client.listTools();
        const name = create ? "create_reference_element" : "show_reference_elements";
        const tool = tools.find((item) => item.name === name);
        if (!tool || !validateElementToolSchema(tool, create)) throw new Error("연결된 MCP가 이 참조 작업의 호환 스키마를 제공하지 않습니다.");
        const response = await client.callTool({ name, arguments: create ? payload! : {} });
        if (!("content" in response) || !Array.isArray(response.content)) throw new Error("비동기 응답은 이 화면에서 지원하지 않습니다. Higgsfield에서 상태를 확인하세요.");
        return resultData({ content: response.content, structuredContent: response.structuredContent, isError: response.isError === true });
      });
      return Response.json(output, { headers: { "Cache-Control": "no-store" } });
    } catch (error) { return bad(error instanceof Error ? error.message : "MCP 작업에 실패했습니다.", 422); }
  });
}
export async function GET(request: Request) { return invoke(request, false); }
export async function POST(request: Request) { return invoke(request, true); }
