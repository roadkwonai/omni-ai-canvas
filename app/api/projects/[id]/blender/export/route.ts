import { execFile } from "node:child_process";
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getProject } from "@/lib/db";
import { getBlenderAsset } from "@/lib/blender-assets";
import { findBlender, runBlender } from "@/lib/blender-render";
import { parseBlenderScene } from "@/lib/blender-scene-spec";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;
const exec = promisify(execFile);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const data = await jsonObject(request);
    if (!uuid(id) || typeof data.sceneId !== "string" || !Number.isSafeInteger(data.version))
      return bad("프로젝트와 샷을 확인해 주세요.");
    const project = await getProject(id);
    if (!project) return bad("프로젝트를 찾을 수 없습니다.", 404);
    if (project.version !== data.version) return bad("프로젝트가 변경되었습니다. 저장 후 다시 시도하세요.", 409);
    const node = project.graph.nodes.find((item) => item.id === data.sceneId && item.kind === "shot");
    const spec = parseBlenderScene(node?.blenderScene);
    if (!spec) return bad("저장된 3D 장면을 확인해 주세요.");
    const directory = await mkdtemp(path.join(os.tmpdir(), "scene-handoff-"));
    try {
      const ids = [...new Set([spec.characterId, spec.environmentId, ...(spec.actors ?? []).map((actor) => actor.characterId)])];
      const records = await Promise.all(ids.map(async (assetId) => getBlenderAsset(id, assetId)));
      const assets = path.join(directory, "assets");
      await mkdir(assets);
      await Promise.all(records.map((record) => copyFile(record.file, path.join(assets, record.asset.id + ".glb"))));
      const fileFor = (assetId: string) => path.join(assets, assetId + ".glb");
      const config = path.join(directory, "scene.json");
      await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ title: node?.title, spec, assets: records.map((record) => ({ ...record.asset, file: "assets/" + record.asset.id + ".glb" })) }, null, 2));
      await writeFile(path.join(directory, "README.txt"), "scene.blend는 재질과 이미지를 포함합니다. assets 폴더와 manifest.json은 원본 자산 및 출처·라이선스 기록입니다.\n", "utf8");
      await writeFile(config, JSON.stringify({ spec, paths: { characterPath: fileFor(spec.characterId), environmentPath: fileFor(spec.environmentId), ...(spec.actors?.length ? { actorPaths: spec.actors.map((actor) => fileFor(actor.characterId)) } : {}) }, quality: "preview", frames: path.join(directory, "frame-"), blendFile: path.join(directory, "scene.blend"), exportOnly: true }));
      const blender = await findBlender();
      await runBlender(blender, ["--background", "--factory-startup", "--disable-autoexec", "--python-exit-code", "1", "--python", path.join(process.cwd(), "scripts/blender_scene.py"), "--", config], 240000, request.signal);
      const output = path.join(directory, "handoff.zip");
      await exec("zip", ["-q", "-r", output, "scene.blend", "manifest.json", "README.txt", "assets"], { cwd: directory, timeout: 120000 });
      const bytes = await readFile(output);
      return new Response(bytes, { headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="scene-room-blender.zip"', "Cache-Control": "no-store" } });
    } catch {
      return bad("Blender 인계 파일을 만들지 못했습니다. 장면과 자산을 확인해 주세요.", 422);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
