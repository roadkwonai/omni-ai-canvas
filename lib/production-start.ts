import { buildAiAdGraph } from "./ai-ad-board";
import type { ProductionWorkflow } from "./types";
import { duplicateGraph, selectedGraph } from "./board-edit";
import { validateGraph } from "./graph";
import { makeStyleDraft, productionProfiles } from "./style-preset-core";
import { makeStyleGraph } from "./style-preset";
import { isSceneCount, kindLabels, type Graph, type SceneCount } from "./types";
import { remapTimeline } from "./timeline-spec";
import { productionGuides, type ProductionGuideId } from "./higgsfield-guidance-kit";
import { imageEditKinds, imageEditTemplateInstruction, presetImageEditSettings } from "./image-edit";

type StartTool = "higgs-workflow" | "director" | "portrait" | "blender" | "motion" | "timeline" | "contest";
const recommendations: Record<string, { seconds: number; guides: ProductionGuideId[]; tool: StartTool }> = {
  "short-drama": { seconds: 60, guides: ["story-hook", "drama-writing", "casting-continuity", "acting", "blocking"], tool: "director" },
  drama: { seconds: 180, guides: ["cinematic-engine", "drama-writing", "casting-continuity", "voice-performance", "blocking"], tool: "director" },
  film: { seconds: 300, guides: ["cinematic-engine", "shot-plan", "anamorphic", "blocking"], tool: "blender" },
  ad: { seconds: 30, guides: ["commercial-check", "product-photo", "commercial-prompt"], tool: "director" },
  "music-video": { seconds: 180, guides: ["shot-plan", "blocking", "casting-continuity"], tool: "timeline" },
  "motion-graphics": { seconds: 30, guides: ["shot-plan", "cinema-prompt"], tool: "motion" },
  shortform: { seconds: 30, guides: ["story-hook", "shot-plan"], tool: "director" },
  influencer: { seconds: 30, guides: ["casting-continuity", "acting", "voice-performance"], tool: "portrait" },
  "animated-short": { seconds: 60, guides: ["shot-plan", "blocking", "screen-action"], tool: "blender" },
  contest: { seconds: 60, guides: ["cinematic-engine", "shot-plan"], tool: "contest" },
};
export const productionToolLabels: Record<StartTool, string> = {
  "higgs-workflow": "Higgsfield 제작 워크플로우", director: "감독 도구", portrait: "캐릭터 연출 키트", blender: "Blender 3D 장면",
  motion: "모션그래픽 스튜디오", timeline: "타임라인", contest: "공모전 기획",
};

export function productionProfile(id: unknown) {
  return typeof id === "string" ? productionProfiles.find((profile) => profile.id === id) : undefined;
}

export function starterGraph(profileId: string, sceneCount?: SceneCount, aspect?: "16:9" | "9:16" | "1:1", workflow?: ProductionWorkflow): Graph {
  const profile = productionProfile(profileId);
  if (!profile) throw new Error("제작 형식을 확인해 주세요.");
  const defaults = productionDefaults(profile.id, workflow);
  const count = sceneCount ?? defaults.sceneCount;
  if (!isSceneCount(count)) throw new Error("씬 수는 1~12개 또는 자동으로 선택해 주세요.");
  const graph = profile.id === "ad" && workflow === "fashion-ad"
    ? buildAiAdGraph({ sceneCount: count, aspect: aspect ?? defaults.aspect })
    : makeStyleGraph(makeStyleDraft(profile.id), count);
  return { ...graph, nodes: graph.nodes.map((node) => {
    const skillIds = defaults.guides.filter((id) => productionGuides.find((guide) => guide.id === id)?.kinds.includes(node.kind));
    return {
      ...node,
      productionRole: node.id,
      ...(skillIds.length ? { guidance: { ...node.guidance, skillIds } } : {}),
      ...(node.timeline ? { timeline: { ...node.timeline, aspect: aspect ?? defaults.aspect } } : {}),
    };
  }) };
}

export function boardTemplate(graph: Graph, nodeIds?: string[]): Graph {
  let source = nodeIds ? selectedGraph(graph, nodeIds) : graph;
  if (nodeIds) {
    const selected = new Set(nodeIds);
    const inbound = graph.edges.filter((edge) => !selected.has(edge.source) && selected.has(edge.target));
    const externalIds = new Set(inbound.map((edge) => edge.source));
    source = {
      nodes: [...source.nodes, ...graph.nodes.filter((node) => externalIds.has(node.id))],
      edges: [...source.edges, ...inbound],
    };
  }
  const selectedIds = new Set(source.nodes.map((node) => node.id));
  const nodes = source.nodes.map((node) => {
    const { id, kind, x, y, group, guidance } = node;
    const timeline = node.timeline && {
      aspect: node.timeline.aspect,
      clips: node.timeline.clips.map((clip) => clip.nodeId && !selectedIds.has(clip.nodeId) ? { ...clip, nodeId: null, inFrame: 0 } : clip),
      audio: node.timeline.audio.filter((track) => selectedIds.has(track.nodeId)),
    };
    const isInput = nodeIds !== undefined && !nodeIds.includes(id);
    const edit = !isInput && node.imageEdit;
    const imageEdit = edit && source.edges.some((edge) =>
      edge.source === edit.sourceNodeId && edge.target === id && edge.usage !== "guide")
      ? { kind: edit.kind, sourceNodeId: edit.sourceNodeId, instruction: imageEditTemplateInstruction(edit.kind),
        ...(edit.settings ? { version: 1 as const, settings: presetImageEditSettings(edit.settings) } : {}) }
      : undefined;
    return {
      id, kind, x, y,
      title: imageEdit ? imageEditKinds[imageEdit.kind] : `${kindLabels[kind]}${isInput ? " 입력" : ""}`,
      body: isInput ? "이 작업에 필요한 자료를 입력하세요." : imageEdit?.instruction ?? "",
      ...(group ? { group } : {}),
      ...(guidance ? { guidance: { ...(guidance.recipeId ? { recipeId: guidance.recipeId } : {}), ...(guidance.skillIds ? { skillIds: guidance.skillIds } : {}) } } : {}),
      ...(timeline ? { timeline } : {}),
      ...(imageEdit ? { imageEdit } : {}),
    };
  });
  const template = { nodes, edges: source.edges };
  if (!nodes.length || !validateGraph(template)) throw new Error("프리셋으로 저장할 노드를 확인해 주세요.");
  return template;
}

export function instantiateBoardTemplate(graph: Graph): Graph {
  if (!validateGraph(graph)) throw new Error("저장된 프리셋을 확인해 주세요.");
  return duplicateGraph(graph);
}

export function addMissingStarter(graph: Graph, profileId: string, sceneCount?: SceneCount, aspect?: "16:9" | "9:16" | "1:1", workflow?: ProductionWorkflow): Graph {
  const starter = starterGraph(profileId, sceneCount, aspect, workflow);
  const existing = new Map(graph.nodes.filter((node) => node.productionRole).map((node) => [`${node.productionRole}:${node.kind}`, node.id]));
  const mapping = new Map(starter.nodes.map((node) => [node.id, existing.get(`${node.id}:${node.kind}`) ?? crypto.randomUUID()]));
  const additions = starter.nodes.filter((node) => !existing.has(`${node.id}:${node.kind}`)).map((node) => ({
    ...node,
    id: mapping.get(node.id)!,
    ...(node.timeline ? { timeline: remapTimeline(node.timeline, mapping) } : {}),
  }));
  const keys = new Set(graph.edges.map((edge) => `${edge.source}:${edge.target}`));
  const edges = starter.edges.map((edge) => ({ ...edge, source: mapping.get(edge.source)!, target: mapping.get(edge.target)! }))
    .filter((edge) => !keys.has(`${edge.source}:${edge.target}`));
  let nodes = [...graph.nodes, ...additions];
  if (profileId === "ad" && workflow === "fashion-ad") {
    const templateTimeline = starter.nodes.find((node) => node.productionRole === "ai-ad-timeline");
    const timelineId = templateTimeline && existing.get(`${templateTimeline.productionRole}:previs`);
    const newIds = new Set(additions.filter((node) => node.kind === "video").map((node) => node.id));
    const additionalClips = templateTimeline?.timeline
      ? remapTimeline(templateTimeline.timeline, mapping).clips.filter((clip) => clip.nodeId && newIds.has(clip.nodeId))
      : [];
    if (timelineId && additionalClips.length) {
      nodes = nodes.map((node) => node.id === timelineId && node.timeline
        ? { ...node, timeline: { ...node.timeline, clips: [...node.timeline.clips, ...additionalClips] } }
        : node);
    }
  }
  const result = { nodes, edges: [...graph.edges, ...edges] };
  if (!validateGraph(result)) throw new Error("추가할 노드와 연결이 프로젝트 한도를 초과하거나 기존 연결과 충돌합니다.");
  return result;
}

export function productionDefaults(profileId: string, workflow?: ProductionWorkflow) {
  const profile = productionProfile(profileId);
  if (!profile) throw new Error("제작 형식을 확인해 주세요.");
  if (profile.id === "ad" && workflow === "fashion-ad") return { sceneCount: 9, aspect: "16:9" as const, seconds: 36, guides: ["fashion-ad-reference", "fashion-ad-shot-prompt", "fashion-ad-lens-transition"] as ProductionGuideId[], tool: "higgs-workflow" as const };
  const aspect = profile.id === "short-drama" || profile.format === "short" || profile.format === "ad" ? "9:16" : "16:9";
  return { sceneCount: profile.sceneCount, aspect, ...recommendations[profile.id] } as const;
}
