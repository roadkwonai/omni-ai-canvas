import { getProject } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import {
  renderTimeline,
  TimelineError,
  timelineWarnings,
} from "@/lib/timeline";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const { timelineId, version, mode = "preview" } = await jsonObject(request);
    if (
      !uuid(id) ||
      typeof timelineId !== "string" ||
      timelineId.length > 80 ||
      !Number.isSafeInteger(version) ||
      (mode !== "preview" && mode !== "final")
    )
      return bad("프로젝트와 타임라인을 확인해 주세요.");
    const project = await getProject(id);
    if (!project) return bad("프로젝트를 찾을 수 없습니다.", 404);
    if (project.version !== version)
      return bad(
        "프로젝트가 변경됐습니다. 저장된 최신 버전을 확인해 주세요.",
        409,
      );
    const timeline = project.graph.nodes.find(
      (node) => node.id === timelineId && node.kind === "previs",
    );
    if (!timeline?.timeline)
      return bad("저장된 타임라인을 찾을 수 없습니다.", 404);
    try {
      return Response.json(
        {
          asset: await renderTimeline(project.graph, timeline.timeline, mode),
          mode,
          warnings:
            mode === "preview"
              ? timelineWarnings(project.graph, timeline.timeline)
              : [],
        },
        { status: 201 },
      );
    } catch (error) {
      return bad(
        error instanceof TimelineError
          ? error.message
          : "타임라인을 만들지 못했습니다. 원본 파일과 FFmpeg 상태를 확인해 주세요.",
      );
    }
  });
}
