import { finishHiggsfieldMcpAuth } from "@/lib/higgsfield-mcp-auth";
import { providerCache } from "@/lib/provider-cache";
import { localOrigin } from "@/lib/http";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = localOrigin(request);
  if (!origin) return new Response("로컬 연결이 필요합니다.", { status: 403 });
  const state = url.searchParams.get("state") ?? "";
  const cookie = (request.headers.get("cookie") ?? "").split(";").map((value) => value.trim()).find((value) => value.startsWith("higgsfield_mcp_oauth="))?.slice("higgsfield_mcp_oauth=".length);
  if (!state || cookie !== state) return new Response("인증 요청을 확인할 수 없습니다.", { status: 403 });
  try {
    await finishHiggsfieldMcpAuth(state, url.searchParams.get("code") ?? "", origin);
    await providerCache.invalidate();
    return new Response(null, { status: 303, headers: { Location: "/studio?higgsfield-mcp=connected", "Set-Cookie": "higgsfield_mcp_oauth=; Path=/api/providers/higgsfield-mcp/callback; HttpOnly; SameSite=Lax; Max-Age=0", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return new Response("Higgsfield MCP 인증을 완료하지 못했습니다. 연결을 다시 시도해 주세요.", { status: 400, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
}
