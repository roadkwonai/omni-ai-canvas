import { isAsset } from "@/lib/asset-shape";
import { getProject } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { previewLensSourceFrame } from "@/lib/lens-source-frame";
import { isLensTransitionRecipe } from "@/lib/lens-transition-spec";
import { TIMELINE_MAX_FRAMES } from "@/lib/timeline-spec";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const { takeId, aspect, frame, version, transitionId, side } = await jsonObject(request);
    if (!uuid(id) || typeof takeId !== "string" || !/^[\w-]{1,80}$/.test(takeId) ||
        (aspect !== "16:9" && aspect !== "9:16" && aspect !== "1:1") ||
        typeof frame !== "number" || !Number.isSafeInteger(frame) || frame < 0 || frame > TIMELINE_MAX_FRAMES ||
        typeof version !== "number" || !Number.isSafeInteger(version) || version < 1 ||
        (transitionId === undefined ? side !== undefined :
          typeof transitionId !== "string" || !/^[\w-]{1,80}$/.test(transitionId) || (side !== "outgoing" && side !== "incoming"))) {
      return bad("원본 테이크와 프레임 번호를 확인해 주세요.");
    }
    const project = await getProject(id);
    if (!project || project.deletedAt) return bad("프로젝트를 찾을 수 없습니다.", 404);
    if (project.version !== version) return bad("프로젝트가 변경됐습니다. 저장된 최신 버전을 확인해 주세요.", 409);
    const recipe = project.graph.nodes.find((node) => node.id === transitionId && node.kind === "video")?.lensTransition;
    const savedSource = isLensTransitionRecipe(recipe) && (side === "outgoing" || side === "incoming") ? recipe[side] : null;
    if (transitionId !== undefined && savedSource?.nodeId !== takeId) return bad("전환에 저장한 원본 테이크를 찾을 수 없습니다.", 404);
    const asset = savedSource?.asset ?? project.graph.nodes.find((node) => node.id === takeId)?.asset;
    if (asset?.type !== "video" || !isAsset(asset)) return bad("프로젝트에 저장된 영상 테이크를 선택해 주세요.", 404);
    try {
      const preview = await previewLensSourceFrame(asset, savedSource && recipe ? recipe.aspect : aspect, frame, request.signal);
      return new Response(new Uint8Array(preview.image), { headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
        "X-Lens-Frame": String(preview.frame),
        "X-Lens-Last-Frame": String(preview.lastFrame),
      } });
    } catch {
      return bad("원본 프레임을 불러오지 못했습니다. 다른 프레임을 선택해 주세요.", 422);
    }
  });
}
