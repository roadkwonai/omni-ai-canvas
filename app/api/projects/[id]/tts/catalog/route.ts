import { spawn } from "node:child_process";
import path from "node:path";
import { projectExists } from "@/lib/db";
import { getFishCatalogStatus } from "@/lib/fish-catalog-cache";
import { getFishTranslationStatus } from "@/lib/fish-catalog-pretranslation";
import { bad, localApi, uuid } from "@/lib/http";
import { providerKey } from "@/lib/tts-provider";

type Context = { params: Promise<{ id: string }> };

async function catalogStatus() {
  const [cache, translation] = await Promise.all([getFishCatalogStatus(), getFishTranslationStatus()]);
  return { ...cache, translation };
}

export async function GET(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    if (!uuid(id) || !await projectExists(id)) return bad("프로젝트를 찾을 수 없습니다.", 404);
    return Response.json(await catalogStatus(), { headers: { "Cache-Control": "no-store" } });
  });
}

export async function POST(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    if (!uuid(id) || !await projectExists(id)) return bad("프로젝트를 찾을 수 없습니다.", 404);
    const translationOnly = new URL(request.url).searchParams.get("task") === "translate";
    if (!translationOnly && !providerKey("fish-audio")) return bad("Fish Audio API 키를 연결해 주세요.", 422);
    const cache = await catalogStatus();
    const needsWorker = translationOnly
      ? !cache.translation.running && cache.translation.pending > cache.translation.retrying
      : !cache.syncing;
    if (needsWorker) {
      const script = translationOnly ? "fish-catalog-pretranslate.ts" : "fish-catalog-sync.ts";
      const worker = spawn(process.execPath, [
        "--env-file-if-exists=.env", "--import", "tsx", path.join(process.cwd(), "scripts", script),
      ], { cwd: process.cwd(), detached: true, stdio: "ignore" });
      await new Promise<void>((resolve, reject) => {
        worker.once("spawn", resolve);
        worker.once("error", reject);
      });
      worker.unref();
    }
    return Response.json(cache, { status: 202, headers: { "Cache-Control": "no-store" } });
  });
}
