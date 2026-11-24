import { bad, jsonObject, localApi } from "@/lib/http";
import { translateNodePreview } from "@/lib/node-preview-translation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return localApi(request, async () => {
    const { text, target } = await jsonObject(request);
    if (typeof text !== "string" || !text.trim() || text.length > 24_000 ||
        (target !== "en" && target !== "ko")) {
      return bad("번역할 내용을 확인해 주세요.");
    }
    try {
      const translation = await translateNodePreview(text, target);
      return Response.json({ translation }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return bad(error instanceof Error ? error.message : "번역을 완료하지 못했습니다.", 503);
    }
  });
}
