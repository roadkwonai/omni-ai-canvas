import { beginTopviewAuth } from "@/lib/topview-auth";
import { localOrigin, localRequest } from "@/lib/http";

export async function GET(request: Request) {
  const denied = localRequest(request);
  if (denied) return denied;
  const origin = localOrigin(request);
  if (!origin) return new Response("로컬 연결이 필요합니다.", { status: 403 });
  try {
    const { state, url } = await beginTopviewAuth(origin);
    return new Response(null, { status: 303, headers: { Location: url, "Set-Cookie": `topview_oauth=${state}; Path=/api/providers/topview/callback; HttpOnly; SameSite=Lax; Max-Age=600`, "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Topview 인증을 시작하지 못했습니다. 네트워크를 확인해 주세요." }, { status: 503 });
  }
}
