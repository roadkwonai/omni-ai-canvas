import sharp from "sharp";
import { detectLensOutline } from "@/lib/lens-outline-detection";
import { getProject } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { transferLensAnchor } from "@/lib/lens-anchor-transfer";
import { lensSourceBounds } from "@/lib/lens-source-frame";
import { lensAnchorFrame, renderLensTransition, reviewLensTransition } from "@/lib/lens-transition-render";
import { isLensAnchorCheckpoints, isLensCorrections, isLensMask, isLensOutline, isLensPoint, isLensStartFrames, isLensTransitionRecipe, isManualLensSources, lensTransitionRecipe, LENS_MAX_ANCHOR_CHECKPOINTS, resolveLegacyLensTransition, resolveLensTransition, resolveManualLegacyLensTransition, withLensStartFrames } from "@/lib/lens-transition-spec";

export const runtime = "nodejs";

let processing = false;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const { action, timelineId, version, cutIndex, frames, mask, point, corrections = [], transitionId, manualSources, sourceStarts, anchorCheckpoints } = await jsonObject(request);
    if (!uuid(id) || (action !== "anchor" && action !== "reanchor" && action !== "detect" && action !== "review" && action !== "render") ||
        typeof timelineId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(timelineId) ||
        (transitionId !== undefined && (typeof transitionId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(transitionId))) ||
        (manualSources !== undefined && (!transitionId || !isManualLensSources(manualSources))) ||
        (sourceStarts !== undefined && (!transitionId || manualSources !== undefined || !isLensStartFrames(sourceStarts))) ||
        (anchorCheckpoints !== undefined && ((action !== "reanchor" && action !== "render") || !isLensAnchorCheckpoints(anchorCheckpoints))) ||
        !Number.isSafeInteger(version) || Number(version) < 1 ||
        !Number.isSafeInteger(cutIndex) || !Number.isSafeInteger(frames) ||
        ((action === "render" || action === "review") && (!isLensMask(mask) || !isLensCorrections(corrections, Number(frames), mask))) || (action === "detect" && !isLensPoint(point))) {
      return bad("타임라인과 렌즈 전환 설정을 확인해 주세요.");
    }
    const project = await getProject(id);
    if (!project || project.deletedAt) return bad("프로젝트를 찾을 수 없습니다.", 404);
    if (project.version !== version)
      return bad("프로젝트가 변경됐습니다. 저장된 최신 버전을 확인해 주세요.", 409);
    const node = project.graph.nodes.find((item) => item.id === timelineId && item.kind === "previs");
    if (!node?.timeline) return bad("저장된 타임라인을 찾을 수 없습니다.", 404);
    const edit = transitionId && project.graph.nodes.find((item) => item.id === transitionId && item.kind === "video");
    const recipe = edit && isLensTransitionRecipe(edit.lensTransition) ? edit.lensTransition : null;
    if (transitionId !== undefined && (!edit || node.timeline.clips[Number(cutIndex)]?.nodeId !== transitionId))
      return bad("이 타임라인에서 재편집할 수 있는 렌즈 전환을 찾지 못했습니다.", 404);
    if ((manualSources !== undefined && recipe) || (sourceStarts !== undefined && !recipe))
      return bad("렌즈 전환에 사용할 원본 범위와 시작 프레임을 확인해 주세요.");
    const sourceChange = isLensStartFrames(sourceStarts) ? sourceStarts : null;
    const draftCheckpoints = isLensAnchorCheckpoints(anchorCheckpoints) ? anchorCheckpoints : [];
    if ((action === "reanchor" || draftCheckpoints.length > 0) &&
        (!recipe || !sourceChange || recipe.outgoing.startFrame === sourceChange.outgoingStart))
      return bad("저장한 전환에서 새 앞 시작 프레임을 선택해 주세요.");
    const saved = recipe ? (sourceChange ? withLensStartFrames(recipe, sourceChange) : recipe) : edit
      ? (isManualLensSources(manualSources)
          ? resolveManualLegacyLensTransition(project.graph, node.timeline, Number(cutIndex), edit.id, manualSources)
          : resolveLegacyLensTransition(project.graph, node.timeline, Number(cutIndex), edit.id))
      : null;
    if (edit && !saved) return bad(manualSources === undefined
      ? "앞뒤 원본과 시작 프레임을 직접 지정해 주세요."
      : "선택한 테이크와 시작 프레임 또는 기존 전환 범위를 확인해 주세요.", 422);
    if (saved && saved.frames !== frames) return bad("저장한 전환의 길이를 사용해 주세요.");
    const pair = saved ? {
      outgoing: saved.outgoing.asset, incoming: saved.incoming.asset,
      outgoingStart: saved.outgoing.startFrame, incomingStart: saved.incoming.startFrame,
    } : resolveLensTransition(project.graph, node.timeline, Number(cutIndex), Number(frames));
    if (!pair) return bad("인접한 영상 테이크와 전환 길이를 확인해 주세요.");
    const aspect = saved ? saved.aspect : node.timeline.aspect;
    const tracking = action === "reanchor" || action === "review" || action === "render";
    if (tracking && processing) return bad("다른 렌즈 작업을 처리하고 있습니다. 완료 후 다시 시도해 주세요.", 409);
    if (tracking) processing = true;
    try {
      if ((action === "anchor" || action === "reanchor") && saved && (manualSources !== undefined || sourceChange)) {
        const [before, after] = await Promise.all([
          lensSourceBounds(saved.outgoing.asset, request.signal),
          lensSourceBounds(saved.incoming.asset, request.signal),
        ]);
        const outgoingLength = Math.ceil(saved.frames / 2);
        if (saved.outgoing.startFrame + outgoingLength - 1 > before.lastFrame ||
            saved.incoming.startFrame + saved.frames - outgoingLength - 1 > after.lastFrame)
          return bad("지정한 시작 프레임에서 전환에 쓸 구간이 원본 영상의 끝을 벗어났습니다.", 422);
      }
      if (action === "reanchor" && recipe && sourceChange) {
        const transfer = await transferLensAnchor(recipe, sourceChange.outgoingStart, request.signal, draftCheckpoints);
        request.signal.throwIfAborted();
        const bytes = await lensAnchorFrame(pair.outgoing, aspect, transfer.interruptedFrame ?? pair.outgoingStart);
        return Response.json({ image: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`, transfer }, {
          headers: { "Cache-Control": "no-store" },
        });
      }
      if (action === "anchor" || action === "detect") {
        const bytes = await lensAnchorFrame(pair.outgoing, aspect, pair.outgoingStart);
        if (action === "detect") {
          if (!isLensPoint(point)) return bad("렌즈 안쪽을 선택해 주세요.");
          const { data, info } = await sharp(bytes).resize(640, 640, { fit: "inside" })
            .toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true });
          const outline = detectLensOutline(data, info.width, info.height, point);
          if (!isLensOutline(outline)) return bad("닫힌 렌즈 윤곽을 찾지 못했습니다. 렌즈 안쪽을 다시 선택해 주세요.", 422);
          return Response.json({ outline }, { headers: { "Cache-Control": "no-store" } });
        }
        return new Response(new Uint8Array(bytes), {
          headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
        });
      }
      if (!isLensMask(mask) || !isLensCorrections(corrections, Number(frames), mask))
        return bad("렌즈 영역과 보정 프레임을 확인해 주세요.");
      const options = { ...pair, aspect, frames: Number(frames), mask, corrections };
      if (action === "review")
        return Response.json(await reviewLensTransition(options), { headers: { "Cache-Control": "no-store" } });
      const renderRecipe = saved ? { ...saved, mask, corrections }
        : lensTransitionRecipe(project.graph, node.timeline, Number(cutIndex), Number(frames), mask, corrections);
      if (!renderRecipe) return bad("렌즈 전환의 원본 범위를 확인해 주세요.");
      if (draftCheckpoints.length) {
        const { lastFrame } = await lensSourceBounds(pair.outgoing, request.signal);
        if (draftCheckpoints.some(({ sourceFrame }) => sourceFrame > lastFrame))
          return bad("중단 지점의 보정 프레임이 원본 영상의 끝을 벗어났습니다.", 422);
      }
      const checkpoints = new Map(recipe?.anchorCheckpoints?.map((checkpoint) => [checkpoint.sourceFrame, checkpoint]));
      for (const checkpoint of draftCheckpoints) {
        checkpoints.delete(checkpoint.sourceFrame);
        checkpoints.set(checkpoint.sourceFrame, checkpoint);
      }
      const savedRecipe = checkpoints.size
        ? { ...renderRecipe, anchorCheckpoints: [...checkpoints.values()].slice(-LENS_MAX_ANCHOR_CHECKPOINTS) }
        : renderRecipe;
      const result = await renderLensTransition(options);
      return Response.json({ ...result, cutIndex, frames, version, recipe: savedRecipe, ...(transitionId ? { transitionId } : {}) }, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      return bad(error instanceof Error ? error.message : "렌즈 전환을 만들지 못했습니다.", 422);
    } finally {
      if (tracking) processing = false;
    }
  });
}
