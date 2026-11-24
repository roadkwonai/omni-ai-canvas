import { localApi } from "@/lib/http";
import { providerCache } from "@/lib/provider-cache";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return localApi(request, async () => {
    if (new URL(request.url).searchParams.get("refresh") === "1") {
      await providerCache.refresh();
    }
    return Response.json(await providerCache.read(), { headers: { "Cache-Control": "no-store" } });
  });
}
