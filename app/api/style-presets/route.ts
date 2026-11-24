import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { parseStyleDraft } from "@/lib/style-preset-core";
import {
  createStylePreset,
  listStylePresets,
  saveStylePreset,
} from "@/lib/style-preset-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return localApi(request, async () =>
    Response.json(
      { presets: await listStylePresets() },
      { headers: { "Cache-Control": "no-store" } },
    ),
  );
}

export async function POST(request: Request) {
  return localApi(request, async () => {
    const data = await jsonObject(request);
    const draft = parseStyleDraft(data.draft);
    if (!draft) return bad("프리셋 이름과 제작 설정을 확인해 주세요.");
    return Response.json(
      { preset: await createStylePreset(draft) },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  });
}

export async function PUT(request: Request) {
  return localApi(request, async () => {
    const data = await jsonObject(request);
    const draft = parseStyleDraft(data.draft);
    if (
      !uuid(data.id) ||
      typeof data.version !== "number" ||
      !Number.isSafeInteger(data.version) ||
      data.version < 1 ||
      !draft
    )
      return bad("프리셋과 버전을 확인해 주세요.");
    const preset = await saveStylePreset(data.id, data.version, draft);
    return preset
      ? Response.json({ preset }, { headers: { "Cache-Control": "no-store" } })
      : bad(
          "다른 창에서 프리셋이 변경되었거나 삭제되었습니다. 최신 프리셋을 다시 불러와 주세요.",
          409,
        );
  });
}
