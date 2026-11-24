import { getProject } from "@/lib/db";
import { readFishRecommendationCandidates } from "@/lib/fish-catalog-cache";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { parseTtsFilters } from "@/lib/tts-filters";
import { recommendVoices } from "@/lib/tts-recommendation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    if (!uuid(id)) return bad("프로젝트 주소를 확인해 주세요.");
    const body = await jsonObject(request);
    const project = await getProject(id);
    if (!project) return bad("프로젝트를 찾을 수 없습니다.", 404);
    const character = project.graph.nodes.find((node) => node.id === body.characterId && node.kind === "character");
    if (!character) return bad("저장된 캐릭터 시트를 확인해 주세요.", 404);
    const filters = parseTtsFilters(body.filters);
    if (!filters) return bad("목소리 필터를 확인해 주세요.");
    try {
      const result = await recommendVoices(character, (target) => readFishRecommendationCandidates(filters, target));
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return bad(error instanceof Error ? error.message : "목소리 추천을 완료하지 못했습니다.", 422);
    }
  });
}
