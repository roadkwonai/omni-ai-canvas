import { bad, localApi } from "@/lib/http";
import { mediaModelProvider, mediaOperation, providerModelId } from "@/lib/media-model-types";
import { getMediaProfiles } from "@/lib/provider-media";
import { getProvider } from "@/lib/runner";

export async function GET(request: Request) {
  return localApi(request, async () => {
    const query = new URL(request.url).searchParams;
    const provider = query.get("provider") ?? undefined;
    const model = query.get("model");
    const operation = query.get("operation");
    if (!mediaModelProvider(provider) || !providerModelId(provider, model) || !mediaOperation(operation))
      return bad("서비스와 이미지·영상 모델을 선택해 주세요.");
    const account = await getProvider(provider);
    if (!account?.available)
      return bad("서비스 계정 연결을 먼저 완료해 주세요.", 422);
    if (!account.models?.some((item) => item.id === model && item.operations.includes(operation)))
      return bad("이 작업에서 선택할 수 없는 모델입니다.", 422);
    const profiles = await getMediaProfiles(provider, model, operation).catch(() => []);
    if (!profiles.length)
      return bad("이 모델의 사양을 불러오지 못했거나, 로컬 이미지·영상 노드에서 지원하지 않는 모델입니다.", 422);
    return Response.json({ profiles }, { headers: { "Cache-Control": "no-store" } });
  });
}
