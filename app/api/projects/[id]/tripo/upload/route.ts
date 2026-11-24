import { readFile } from "node:fs/promises";
import { getBlenderAsset, MAX_GLB_BYTES } from "@/lib/blender-assets";
import { getProject } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { tripoFileToken, tripoRequest } from "@/lib/tripo-tasks";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const { assetId, confirmed } = await jsonObject(request);
    if (!uuid(id) || !uuid(assetId) || confirmed !== true)
      return bad("Tripo에 보낼 GLB 자산을 확인해 주세요.");
    if (!(await getProject(id)))
      return bad("프로젝트를 찾을 수 없습니다.", 404);
    try {
      const { file, asset } = await getBlenderAsset(id, assetId);
      const data = await readFile(/* turbopackIgnore: true */ file);
      if (!data.length || data.length > MAX_GLB_BYTES)
        return bad("GLB는 64 MiB 이하여야 합니다.", 413);
      const form = new FormData();
      form.set(
        "file",
        new Blob([new Uint8Array(data)], { type: "model/gltf-binary" }),
        asset.name,
      );
      const token = tripoFileToken(await tripoRequest("files", "POST", form));
      if (!token) return bad("Tripo 파일 번호를 읽지 못했습니다.", 422);
      return Response.json(
        { token },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      return bad(
        error instanceof Error
          ? error.message
          : "Tripo에 GLB를 등록하지 못했습니다.",
        422,
      );
    }
  });
}
