import { getProject } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { translateFishSearchQuery } from "@/lib/node-preview-translation";
import { saveFishTranslations } from "@/lib/fish-catalog-cache";
import { parseVoiceTranslationInput, translateFishTtsVoices, translateTtsVoices } from "@/lib/tts-translation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    if (!uuid(id) || !await getProject(id)) return bad("프로젝트를 찾을 수 없습니다.", 404);
    const body = await jsonObject(request);
    if (body.query !== undefined) {
      if (typeof body.query !== "string" || !body.query.trim() || body.query.length > 120) return bad("번역할 검색어를 확인해 주세요.");
      try {
        const queryEn = (await translateFishSearchQuery(body.query, "en")).trim();
        if (!queryEn || queryEn.length > 120 || /[\r\n]/.test(queryEn)) return bad("영문 검색어를 만들지 못했습니다.", 422);
        return Response.json({ queryEn }, { headers: { "Cache-Control": "no-store" } });
      } catch {
        return bad("검색어를 번역하지 못했습니다.", 503);
      }
    }
    const items = parseVoiceTranslationInput(body.items);
    if (!items) return bad("번역할 목소리 목록을 확인해 주세요.");
    try {
      const translate = body.provider === "fish-audio" ? translateFishTtsVoices : translateTtsVoices;
      const translated = await translate(items);
      if (body.provider === "fish-audio" && translated.length) {
        const originals = new Map(items.map((item) => [item.id, item]));
        await saveFishTranslations(translated.map((item) => ({ ...originals.get(item.id)!, ...item })));
      }
      return Response.json({ items: translated }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return bad("목소리 번역을 완료하지 못했습니다. 작업실 텍스트 에이전트 연결을 확인해 주세요.", 503);
    }
  });
}
