import { getProject } from "@/lib/db";
import {
  BlenderAssetError,
  createBlenderAsset,
  listBlenderAssets,
  MAX_GLB_BYTES,
} from "@/lib/blender-assets";
import { bad, localApi, uuid } from "@/lib/http";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    if (!uuid(id)) return bad("프로젝트 주소를 확인해 주세요.");
    if (!(await getProject(id)))
      return bad("프로젝트를 찾을 수 없습니다.", 404);
    return Response.json(
      { assets: await listBlenderAssets(id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}

export async function POST(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    if (!uuid(id)) return bad("프로젝트 주소를 확인해 주세요.");
    if (!(await getProject(id)))
      return bad("프로젝트를 찾을 수 없습니다.", 404);
    const type = request.headers.get("content-type") || "";
    if (!type.startsWith("multipart/form-data;"))
      return bad("GLB 파일을 선택해 주세요.");
    const limit = MAX_GLB_BYTES + 1024 * 1024,
      length = request.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > limit))
      return bad("3D 자산은 64 MiB 이하여야 합니다.", 413);
    const reader = request.body?.getReader();
    if (!reader) return bad("GLB 파일을 선택해 주세요.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return bad("3D 자산은 64 MiB 이하여야 합니다.", 413);
      }
      chunks.push(value);
    }
    try {
      const form = await new Response(new Blob(chunks as BlobPart[]), {
        headers: { "Content-Type": type },
      }).formData();
      const files = form.getAll("file"),
        source = form.get("source"),
        credit = form.get("credit");
      if (
        files.length !== 1 ||
        !(files[0] instanceof File) ||
        !/\.glb$/i.test(files[0].name) ||
        files[0].size > MAX_GLB_BYTES ||
        (source !== null && typeof source !== "string") ||
        (credit !== null && typeof credit !== "string")
      )
        return bad("GLB 파일과 출처를 확인해 주세요.");
      const asset = await createBlenderAsset(
        id,
        new Uint8Array(await files[0].arrayBuffer()),
        files[0].name,
        source || "",
        credit || "",
      );
      return Response.json(
        { asset },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      return bad(
        error instanceof BlenderAssetError
          ? error.message
          : "GLB 파일을 읽지 못했습니다.",
      );
    }
  });
}
