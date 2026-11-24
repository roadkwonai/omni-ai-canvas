import { createProject, listProjects } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { getBoardPreset } from "@/lib/board-preset-store";
import { instantiateBoardTemplate, productionDefaults, productionProfile, starterGraph } from "@/lib/production-start";
import { sampleProject } from "@/lib/sample";
import { isSceneCount } from "@/lib/types";

export async function GET(request: Request) {
  return localApi(request, async () => {
    let projects = await listProjects();
    if (!projects.some((p) => p.id === sampleProject.id)) {
      await createProject(
        sampleProject.id,
        sampleProject.title,
        sampleProject.graph,
      );
      projects = await listProjects();
    }
    return Response.json({ projects, defaultId: sampleProject.id });
  });
}

export async function POST(request: Request) {
  return localApi(request, async () => {
    const { title, profileId, presetId, sceneCount, aspect, workflow } = await jsonObject(request);
    if (typeof title !== "string" || !title.trim() || title.length > 120 ||
        !(profileId === undefined || profileId === null || productionProfile(profileId)) ||
        (presetId !== undefined && !uuid(presetId)) ||
        (presetId && profileId) ||
        (workflow !== undefined && (workflow !== "fashion-ad" || profileId !== "ad" || presetId !== undefined)) ||
        (sceneCount !== undefined && !isSceneCount(sceneCount)) ||
        (aspect !== undefined && !["16:9", "9:16", "1:1"].includes(String(aspect))))
      return bad("프로젝트 이름과 제작 형식을 확인해 주세요.");
    const preset = typeof presetId === "string" ? await getBoardPreset(presetId) : null;
    if (presetId && !preset) return bad("프리셋을 찾을 수 없습니다.", 404);
    const defaults = typeof profileId === "string" ? productionDefaults(profileId, workflow === "fashion-ad" ? workflow : undefined) : null;
    const settings = defaults ? { sceneCount: isSceneCount(sceneCount) ? sceneCount : defaults.sceneCount, aspect: (aspect ?? defaults.aspect) as "16:9" | "9:16" | "1:1", ...(workflow === "fashion-ad" ? { workflow: "fashion-ad" as const } : {}) } : preset?.productionSettings ?? null;
    const graph = preset ? instantiateBoardTemplate(preset.graph) : typeof profileId === "string" ? starterGraph(profileId, settings?.sceneCount, settings?.aspect, settings?.workflow) : { nodes: [], edges: [] };
    return Response.json(
      { project: await createProject(crypto.randomUUID(), title.trim(), graph, preset?.profileId ?? (typeof profileId === "string" ? profileId : null), settings) },
      { status: 201 },
    );
  });
}
