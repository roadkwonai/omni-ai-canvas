import { providerCache } from "@/lib/provider-cache";
import { bad, jsonObject, localApi } from "@/lib/http";
import { saveSecret, settingsStatus } from "@/lib/service-settings";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return localApi(request, async () => Response.json(await settingsStatus(), { headers: { "Cache-Control": "no-store" } }));
}
export async function PUT(request: Request) {
  return localApi(request, async () => {
    const input = await jsonObject(request);
    try {
      if (typeof input.key === "string" && (typeof input.value === "string" || input.value === null)) await saveSecret(input.key, input.value);
      else return bad("설정 값을 확인해 주세요.");
      await providerCache.invalidate();
      return Response.json(await settingsStatus(), { headers: { "Cache-Control": "no-store" } });
    } catch { return bad("설정을 저장하지 못했습니다. 입력과 저장 권한을 확인해 주세요."); }
  });
}
