import { bad, jsonObject, localApi } from "@/lib/http";
import { readSecret, secretNames, type SecretName } from "@/lib/service-settings";

export const runtime = "nodejs";

const targets = {
  OPENAI_API_KEY: ["https://api.openai.com/v1/models", "Authorization"],
  GEMINI_API_KEY: ["https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", "x-goog-api-key"],
  ARK_API_KEY: ["https://ark.ap-southeast.bytepluses.com/api/v3/models", "Authorization"],
  TRIPO_API_KEY: ["https://openapi.tripo3d.ai/v3/account/balance", "Authorization"],
  FISH_AUDIO_API_KEY: ["https://api.fish.audio/model?page_size=1", "Authorization"],
  ELEVENLABS_API_KEY: ["https://api.elevenlabs.io/v2/voices?page_size=1", "xi-api-key"],
  TYPECAST_API_KEY: ["https://api.typecast.ai/v3/voices?model=ssfm-v30", "X-API-KEY"],
  GEMINI_TTS_API_KEY: ["https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", "x-goog-api-key"],
} satisfies Record<SecretName, [string, string]>;

export async function POST(request: Request) {
  return localApi(request, async () => {
    const { key } = await jsonObject(request);
    const name = secretNames.find((item) => item === key);
    if (!name) return bad("검사할 API 키 종류를 확인해 주세요.");
    const secret = await readSecret(name) || (name === "GEMINI_TTS_API_KEY" ? await readSecret("GEMINI_API_KEY") : "");
    const result = (status: "missing" | "connected" | "denied" | "unavailable") =>
      Response.json({ status }, { headers: { "Cache-Control": "no-store" } });
    if (!secret) return result("missing");
    const [url, header] = targets[name];
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { [header]: header === "Authorization" ? `Bearer ${secret}` : secret },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok && name === "TRIPO_API_KEY") {
        const body = await response.json();
        return result(body?.code === 0 ? "connected" : "unavailable");
      }
      await response.body?.cancel().catch(() => {});
      if (response.status === 401 || response.status === 403) return result("denied");
      return result(response.ok ? "connected" : "unavailable");
    } catch {
      return result("unavailable");
    }
  });
}
