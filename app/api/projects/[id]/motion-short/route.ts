import { getProject } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { MotionShortError, renderMotionShort } from "@/lib/motion-short";
import { parseMotionShort } from "@/lib/motion-short-spec";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const data = await jsonObject(request);
    const spec = parseMotionShort(data.spec);
    if (!uuid(id) || !Number.isSafeInteger(data.version) || !spec)
      return bad("장면과 영상 설정을 확인해 주세요.");
    const project = await getProject(id);
    if (!project) return bad("프로젝트를 찾을 수 없습니다.", 404);
    if (project.version !== data.version)
      return bad("프로젝트가 변경되었습니다. 최신 버전을 확인해 주세요.", 409);
    const imageUrls = new Set(
      project.graph.nodes
        .filter((node) => node.asset?.type === "image")
        .map((node) => node.asset!.url),
    );
    if (
      spec.scenes.some(
        (scene) =>
          (scene.image && !imageUrls.has(scene.image.url)) ||
          (scene.character && !imageUrls.has(scene.character.url)),
      )
    )
      return bad(
        "장면 이미지를 현재 프로젝트의 이미지 노드에서 선택해 주세요.",
      );
    try {
      let scenes = { reused: [] as number[], rendered: [] as number[] };
      const asset = await renderMotionShort(spec, { projectId: id, report: (result) => { scenes = result; } });
      return Response.json(
        { asset, scenes },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      return bad(
        error instanceof MotionShortError
          ? error.message
          : "모션 영상을 만들지 못했습니다.",
      );
    }
  });
}
