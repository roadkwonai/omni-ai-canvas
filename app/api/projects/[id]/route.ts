import { cp, rm, stat } from "node:fs/promises";
import path from "node:path";
import { duplicateProject, getProject, openProject, saveProject, setProjectState, updateProjectDetails, updateProjectProduction } from "@/lib/db";
import type { ClassificationSelection } from "@/lib/project-classifications";
import { addMissingStarter, productionDefaults, productionProfile } from "@/lib/production-start";
import { isSceneCount } from "@/lib/types";
import { validateGraph } from "@/lib/graph";
import type { Graph } from "@/lib/types";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const project = uuid(id) && (await getProject(id));
    return project
      ? Response.json({ project })
      : bad("프로젝트를 찾을 수 없습니다.", 404);
  });
}

export async function PUT(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const { graph, title, version } = await jsonObject(request);
    if (
      !uuid(id) ||
      typeof title !== "string" ||
      !title.trim() ||
      title.length > 120 ||
      !Number.isSafeInteger(version) ||
      !validateGraph(graph)
    )
      return bad(
        "노드의 제목·본문 길이, 연결 방향 및 프로젝트 형식을 확인해 주세요.",
      );
    const project = await saveProject(
      id,
      title.trim(),
      graph,
      version as number,
    );
    return project
      ? Response.json({ project })
      : bad(
          "다른 창에서 프로젝트를 수정했습니다. 현재 작업을 내보낸 뒤 최신 버전을 열어 주세요.",
          409,
        );
  });
}

export async function PATCH(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const input = await jsonObject(request);
    if (!uuid(id) || typeof input.action !== "string") return bad("프로젝트 작업을 확인해 주세요.");
    if (input.action === "open") {
      const opened = await openProject(id);
      return opened ? Response.json({ project: opened }) : bad("프로젝트를 찾을 수 없습니다.", 404);
    }
    if (!Number.isSafeInteger(input.version) || Number(input.version) < 1) return bad("프로젝트 버전을 확인해 주세요.");
    const version = input.version as number;
    let updated;
    if (input.action === "production") {
      if (!(input.profileId === null || productionProfile(input.profileId)) ||
          (input.sceneCount !== undefined && !isSceneCount(input.sceneCount)) ||
          (input.workflow !== undefined && (input.workflow !== "fashion-ad" || input.profileId !== "ad")) ||
          (input.aspect !== undefined && !["16:9", "9:16", "1:1"].includes(String(input.aspect))) ||
          (input.addMissing !== undefined && typeof input.addMissing !== "boolean") ||
          (input.addMissing && !input.profileId))
        return bad("제작 형식과 추가할 구성을 확인해 주세요.");
      const defaults = typeof input.profileId === "string" ? productionDefaults(input.profileId, input.workflow === "fashion-ad" ? input.workflow : undefined) : null;
      const settings = defaults ? { sceneCount: isSceneCount(input.sceneCount) ? input.sceneCount : defaults.sceneCount, aspect: (input.aspect ?? defaults.aspect) as "16:9" | "9:16" | "1:1", ...(input.workflow === "fashion-ad" ? { workflow: "fashion-ad" as const } : {}) } : null;
      let graph: Graph | undefined;
      if (input.addMissing && typeof input.profileId === "string") {
        const source = await getProject(id);
        if (!source || source.version !== version || source.deletedAt) return bad("프로젝트가 변경되었습니다. 다시 불러와 주세요.", 409);
        try { graph = addMissingStarter(source.graph, input.profileId, settings?.sceneCount, settings?.aspect, settings?.workflow); }
        catch (error) { return bad(error instanceof Error ? error.message : "제작 구성을 추가하지 못했습니다."); }
      }
      updated = await updateProjectProduction(id, version, input.profileId as string | null, settings, graph);
    } else if (input.action === "metadata") {
      if (typeof input.title !== "string" || !input.title.trim() || input.title.trim().length > 120 ||
          !(input.category === null || typeof input.category === "string") ||
          (typeof input.category === "string" && input.category.trim().length > 60) ||
          !Array.isArray(input.tags) || input.tags.length > 20 ||
          input.tags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.trim().length > 40))
        return bad("제목, 카테고리와 태그를 확인해 주세요.");
      const names = (input.tags as string[]).map((tag) => tag.trim());
      if (new Set(names).size !== names.length) return bad("같은 태그를 중복해서 선택할 수 없습니다.");
      let selection: ClassificationSelection | undefined;
      if (input.categoryId !== undefined || input.tagIds !== undefined) {
        if (!(input.categoryId === null || uuid(input.categoryId)) ||
            (input.categoryId && !input.category) ||
            !Array.isArray(input.tagIds) || input.tagIds.length !== names.length ||
            input.tagIds.some((item) => item !== null && !uuid(item)))
          return bad("선택한 카테고리와 태그를 확인해 주세요.");
        selection = { categoryId: input.categoryId as string | null, tagIds: input.tagIds as (string | null)[] };
      }
      updated = await updateProjectDetails(id, version, input.title.trim(), input.category?.trim() || null, names, selection);
    } else if (input.action === "archive" || input.action === "restore" || input.action === "trash") {
      updated = await setProjectState(id, version, input.action);
    } else if (input.action === "duplicate") {
      const source = await getProject(id);
      if (!source || source.version !== version || source.deletedAt) return bad("프로젝트가 변경되었습니다. 목록을 새로고침해 주세요.", 409);
      const title = typeof input.title === "string" ? input.title.trim() : `${source.title.slice(0, 114)} 복사본`;
      if (!title || title.length > 120) return bad("복제할 프로젝트 이름을 확인해 주세요.");
      const newId = crypto.randomUUID();
      const assetRoot = path.join(process.cwd(), ".scene-room", "blender-assets");
      const target = path.join(assetRoot, newId);
      const sourceDirectory = path.join(assetRoot, id.toLowerCase());
      const hasAssets = await stat(sourceDirectory).then(() => true, (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return false;
        throw error;
      });
      if (hasAssets) {
        try { await cp(sourceDirectory, target, { recursive: true, force: false, errorOnExist: true }); }
        catch (error) { await rm(target, { recursive: true, force: true }); throw error; }
      }
      updated = await duplicateProject(id, newId, version, title);
      if (!updated) await rm(target, { recursive: true, force: true });
    } else return bad("지원하지 않는 프로젝트 작업입니다.");
    return updated ? Response.json({ project: updated }) : bad("프로젝트가 변경되었습니다. 목록을 새로고침해 주세요.", 409);
  });
}
