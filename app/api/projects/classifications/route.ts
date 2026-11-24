import { createProjectClassification, deleteProjectClassification, listProjectClassifications, renameProjectClassification } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { validClassificationName } from "@/lib/project-classifications";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return localApi(request, async () => Response.json(
    { classifications: await listProjectClassifications() },
    { headers: { "Cache-Control": "no-store" } },
  ));
}

export async function POST(request: Request) {
  return localApi(request, async () => {
    const input = await jsonObject(request);
    if ((input.kind !== "category" && input.kind !== "tag") ||
        !validClassificationName(input.kind, input.name)) return bad("분류 종류와 이름을 확인해 주세요.");
    if (!await createProjectClassification(input.kind, input.name.trim())) return bad("이미 등록된 이름입니다.", 409);
    return Response.json({ classifications: await listProjectClassifications() }, { status: 201 });
  });
}

export async function PATCH(request: Request) {
  return localApi(request, async () => {
    const input = await jsonObject(request);
    if (!uuid(input.id)) return bad("분류와 이름을 확인해 주세요.");
    const entry = (await listProjectClassifications()).find((item) => item.id === input.id);
    if (!entry) return bad("분류를 찾을 수 없습니다.", 404);
    if ((input.kind !== undefined && input.kind !== entry.kind) ||
        !validClassificationName(entry.kind, input.name)) return bad("분류와 이름을 확인해 주세요.");
    try {
      const result = await renameProjectClassification(input.id, input.name.trim());
      return result ? Response.json({ ...result, classifications: await listProjectClassifications() }) : bad("이미 등록된 이름이거나 분류가 변경됐습니다.", 409);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return bad("이미 등록된 이름입니다.", 409);
      throw error;
    }
  });
}

export async function DELETE(request: Request) {
  return localApi(request, async () => {
    const input = await jsonObject(request);
    if (!uuid(input.id)) return bad("분류를 확인해 주세요.");
    const result = await deleteProjectClassification(input.id);
    return result ? Response.json({ ...result, classifications: await listProjectClassifications() }) : bad("분류를 찾을 수 없습니다.", 404);
  });
}
