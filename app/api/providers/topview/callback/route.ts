import { finishTopviewAuth } from "@/lib/topview-auth";
import { providerCache } from "@/lib/provider-cache";
import { localOrigin } from "@/lib/http";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = localOrigin(request);
  if (!origin) return new Response("로컬 연결이 필요합니다.", { status: 403 });
  const state = url.searchParams.get("state") ?? "";
  const cookie = (request.headers.get("cookie") ?? "").split(";").map((value) => value.trim()).find((value) => value.startsWith("topview_oauth="))?.slice("topview_oauth=".length);
  if (!state || cookie !== state) return new Response("인증 요청을 확인할 수 없습니다.", { status: 403 });
  try {
    await finishTopviewAuth(state, url.searchParams.get("code") ?? "", origin);
    await providerCache.invalidate();
    return new Response(null, { status: 303, headers: { Location: "/studio?topview=connected", "Set-Cookie": "topview_oauth=; Path=/api/providers/topview/callback; HttpOnly; SameSite=Lax; Max-Age=0", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return new Response("Topview 인증을 완료하지 못했습니다. 연결을 다시 시도해 주세요.", { status: 400, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
}
