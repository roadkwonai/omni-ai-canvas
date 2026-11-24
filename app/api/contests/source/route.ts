import { bad, jsonObject, localRequest } from "../../../../lib/http";
import { readContestSource } from "../../../../lib/contest-source";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = localRequest(request);
  if (denied) return denied;
  try {
    const body = await jsonObject(request);
    if (typeof body.url !== "string")
      return bad("공개 HTTPS 주소를 입력해 주세요.");
    const source = await readContestSource(body.url);
    return Response.json(
      { source },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return bad(
      error instanceof Error ? error.message : "주소를 확인할 수 없습니다.",
    );
  }
}
