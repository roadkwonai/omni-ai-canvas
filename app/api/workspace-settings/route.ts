import { bad, jsonObject, localApi } from "@/lib/http";
import { parseWorkspaceSettings } from "@/lib/workspace-settings";
import { getWorkspaceSettings, saveWorkspaceSettings } from "@/lib/workspace-settings-store";

export async function GET(request: Request) {
  return localApi(request, async () =>
    Response.json({ settings: await getWorkspaceSettings() }, {
      headers: { "Cache-Control": "no-store" },
    }),
  );
}

export async function PUT(request: Request) {
  return localApi(request, async () => {
    const settings = parseWorkspaceSettings(await jsonObject(request));
    if (!settings) return bad("작업실 설정을 확인해 주세요.");
    const saved = await saveWorkspaceSettings(settings);
    return saved
      ? Response.json({ settings: saved }, { headers: { "Cache-Control": "no-store" } })
      : bad("다른 창에서 설정을 변경했습니다. 최신 설정을 다시 불러와 주세요.", 409);
  });
}
