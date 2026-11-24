import { BlenderAssetError, getBlenderAsset } from "@/lib/blender-assets";
import { BlenderRenderError, renderBlenderScene } from "@/lib/blender-render";
import { parseBlenderScene } from "@/lib/blender-scene-spec";
import { getProject } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import {
  listBlenderReceipts,
  saveBlenderReceipt,
} from "@/lib/blender-receipts";
import { localAssetPath } from "@/lib/media";
import { unlink } from "node:fs/promises";

export const runtime = "nodejs";
export const maxDuration = 900;
const rendering = new Set<string>();

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const sceneId = new URL(request.url).searchParams.get("sceneId");
    if (!uuid(id) || !sceneId || !/^[A-Za-z0-9_-]{1,80}$/.test(sceneId))
      return bad("프로젝트와 샷을 확인해 주세요.");
    const project = await getProject(id);
    if (!project) return bad("프로젝트를 찾을 수 없습니다.", 404);
    if (
      !project.graph.nodes.some(
        (node) => node.id === sceneId && node.kind === "shot",
      )
    )
      return bad("샷을 찾을 수 없습니다.", 404);
    return Response.json(
      { renders: await listBlenderReceipts(id, sceneId, project.graph) },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const data = await jsonObject(request);
    const spec = parseBlenderScene(data.spec);
    if (
      !uuid(id) ||
      !Number.isSafeInteger(data.version) ||
      !spec ||
      (data.quality !== "preview" && data.quality !== "final")
    )
      return bad("장면 설정과 프로젝트 버전을 확인해 주세요.");
    const project = await getProject(id);
    if (!project) return bad("프로젝트를 찾을 수 없습니다.", 404);
    if (project.version !== data.version)
      return bad("프로젝트가 변경되었습니다. 저장 후 다시 시도해 주세요.", 409);
    if (data.sceneId !== undefined) {
      const shot = project.graph.nodes.find(
        (node) => node.id === data.sceneId && node.kind === "shot",
      );
      if (
        !shot ||
        JSON.stringify(parseBlenderScene(shot.blenderScene)) !==
          JSON.stringify(spec)
      )
        return bad(
          "샷에 저장된 3D 설정과 렌더 요청이 다릅니다. 장면을 다시 열어 주세요.",
          409,
        );
    }
    if (rendering.has(id))
      return bad("이 프로젝트의 3D 장면을 렌더하고 있습니다.", 409);
    rendering.add(id);
    try {
      const [character, environment] = await Promise.all([
        getBlenderAsset(id, spec.characterId),
        getBlenderAsset(id, spec.environmentId),
      ]);
      if (spec.action && !character.asset.animations.includes(spec.action))
        return bad("캐릭터에 포함된 애니메이션을 선택해 주세요.");
      if (spec.bone && !character.asset.bones.includes(spec.bone))
        return bad("캐릭터에 포함된 뼈를 선택해 주세요.");
      if (
        spec.poses?.some((pose) => !character.asset.bones.includes(pose.bone))
      )
        return bad("캐릭터에 포함된 뼈를 선택해 주세요.");
      const actors = await Promise.all((spec.actors ?? []).map((actor) => getBlenderAsset(id, actor.characterId)));
      for (let index = 0; index < actors.length; index++) {
        const actor = spec.actors![index], model = actors[index].asset;
        if ((actor.action && !model.animations.includes(actor.action)) ||
            actor.poses.some((pose) => !model.bones.includes(pose.bone)) ||
            [...actor.expressions, ...actor.lipCues].some((item) => !model.shapeKeys?.includes(item.key)))
          return bad("배역의 동작과 뼈를 확인해 주세요.");
      }
      const asset = await renderBlenderScene(
        spec,
        { characterPath: character.file, environmentPath: environment.file, ...(actors.length ? { actorPaths: actors.map((actor) => actor.file) } : {}) },
        data.quality,
        request.signal,
      );
      if (typeof data.sceneId === "string") {
        try {
          await saveBlenderReceipt(id, {
            asset,
            sceneId: data.sceneId,
            spec,
            quality: data.quality,
            createdAt: new Date().toISOString(),
          });
        } catch {
          // 이 요청이 생성한 결과만 정리한다. 이전 원본과 테이크는 보존한다.
          await unlink(localAssetPath(asset)).catch(() => {});
          return bad(
            "렌더 결과를 복구 기록에 저장하지 못했습니다. 저장 공간을 확인해 주세요.",
            503,
          );
        }
      }
      return Response.json(
        { asset },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      if (
        error instanceof BlenderAssetError ||
        error instanceof BlenderRenderError
      )
        return bad(error.message, 422);
      return bad(
        "3D 장면을 렌더하지 못했습니다. Blender와 자산을 확인해 주세요.",
        422,
      );
    } finally {
      rendering.delete(id);
    }
  });
}
