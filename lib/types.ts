import type { LensTransitionRecipe } from "./lens-transition-spec";
import type { ImageOperationDraft } from "./image-operation";
import type { AgentEffort } from "./agent-effort";
import type { ImageEditSpec } from "./image-edit";
import type { GridCellProvenance, PortraitGridConfig } from "./portrait-grid";
import type { AttachmentSummary } from "./attachments-types";
import type { VideoOptions } from "./video-options";
import type { ImageOutput } from "./image-output";
import type { ContestBrief } from "./contest";
import type { TimelineSpec } from "./timeline-spec";
import type { StagingSpec } from "./staging";
import type { MediaSelection } from "./media-model-types";
import { validProductionGuideIds, type ProductionGuideId } from "./higgsfield-guidance-kit";
import type { MotionShortSpec } from "./motion-short-spec";
import type { BlenderSceneSpec } from "./blender-scene-spec";
import type { CharacterIdentity, CharacterSoul, CharacterVoice } from "./character-identity";
import { parseStyleDraft, type StylePresetDraft } from "./style-preset-core";
export const kinds = [
  "brief",
  "script",
  "character",
  "keyframe",
  "video",
  "scenario",
  "scene",
  "shot",
  "referenceImage",
  "referenceVideo",
  "audioCue",
  "previs",
  "note",
  "switch",
] as const;
export type Kind = (typeof kinds)[number];
export const kindLabels: Record<Kind, string> = {
  brief: "기획 문서",
  script: "대본",
  character: "캐릭터 시트",
  keyframe: "키프레임",
  video: "AI 영상",
  scenario: "시나리오 개요",
  scene: "씬 구성",
  shot: "샷 설계",
  referenceImage: "레퍼런스 이미지",
  referenceVideo: "레퍼런스 영상",
  audioCue: "음향 큐",
  previs: "타임라인",
  note: "작업 메모",
  switch: "테이크 스위치",
};
export type Asset = {
  url: string;
  type: "image" | "video" | "audio";
  name: string;
};
export type CanvasNode = {
  id: string;
  kind: Kind;
  title: string;
  body: string;
  promptKorean?: { text: string };
  x: number;
  y: number;
  asset?: Asset;
  lensTransition?: LensTransitionRecipe;
  imageEdit?: ImageEditSpec;
  imageOperation?: ImageOperationDraft;
  portraitGrid?: PortraitGridConfig;
  gridCell?: GridCellProvenance;
  rating?: number;
  group?: string;
  productionRole?: string;
  timeline?: TimelineSpec;
  staging?: StagingSpec;
  guidance?: { recipeId?: string; text?: string; skillIds?: ProductionGuideId[] };
  directorNote?: string;
  motionShort?: MotionShortSpec;
  blenderScene?: BlenderSceneSpec;
  blenderTake?: { quality: "preview" | "final"; scene: BlenderSceneSpec };
  characterIdentity?: CharacterIdentity;
};
export function isCutSource(node: CanvasNode) {
  return (
    (node.kind === "video" ||
      node.kind === "switch" ||
      node.kind === "previs") &&
    node.asset?.type === "video"
  );
}
export const roles = [
  "context",
  "identity",
  "location",
  "prop",
  "motion",
  "start",
  "end",
  "look",
] as const;
export type EdgeRole = (typeof roles)[number];
export const roleLabels: Record<EdgeRole, string> = {
  context: "내용 참고",
  identity: "인물 외형",
  location: "장소",
  prop: "소품 상태",
  motion: "동작",
  start: "시작 프레임",
  end: "끝 프레임",
  look: "색감·질감",
};
export type GraphEdge = {
  source: string;
  target: string;
  role?: EdgeRole;
  usage?: "input" | "guide";
};
export type Graph = {
  nodes: CanvasNode[];
  edges: GraphEdge[];
};
export type ProductionWorkflow = "fashion-ad";
export type Project = {
  id: string;
  title: string;
  productionProfileId?: string | null;
  productionSettings?: { sceneCount: SceneCount; aspect: "16:9" | "9:16" | "1:1"; workflow?: ProductionWorkflow } | null;
  graph: Graph;
  version: number;
  updatedAt: string;
  category?: string | null;
  tags?: string[];
  archivedAt?: string | null;
  deletedAt?: string | null;
  lastOpenedAt?: string | null;
};
export type ProjectSummary = Omit<Project, "graph">;
export type Provider =
  | "codex"
  | "claude"
  | "agy"
  | "higgsfield"
  | "topview"
  | "kling"
  | "openai-image"
  | "gemini-image"
  | "seedream"
  | "road-music";
export type Operation = "plan" | "text" | "image" | "video" | "audio";
export type AudioOptions = {
  engine: "ace" | "yue-mlx" | "yue";
  purpose: "music" | "sfx" | "ambience";
  seconds: number;
};
export const DIRECTOR_FORMATS = [
  "short",
  "film",
  "series",
  "drama",
  "ad",
  "musicVideo",
] as const;
export type DirectorFormat = (typeof DIRECTOR_FORMATS)[number];
export const MAX_SCENE_COUNT = 12;
export type SceneCount = number | "auto";
export function isSceneCount(value: unknown): value is SceneCount {
  return value === "auto" || (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_SCENE_COUNT);
}
export const directorFormatLabels: Record<DirectorFormat, string> = {
  short: "숏폼",
  film: "영화 · 3막",
  series: "시리즈",
  drama: "드라마",
  ad: "광고",
  musicVideo: "뮤직비디오",
};
export function expectedAssetType(kind: Kind): Asset["type"] {
  if (kind === "audioCue") return "audio";
  if (
    kind === "video" ||
    kind === "referenceVideo" ||
    kind === "previs" ||
    kind === "switch"
  )
    return "video";
  return "image";
}

export function nodeOperations(kind: Kind): Operation[] {
  if (kind === "audioCue") return ["audio", "text"];
  if (kind === "video" || kind === "referenceVideo") return ["video", "text"];
  if (kind === "keyframe" || kind === "referenceImage")
    return ["image", "text"];
  if (kind === "character") return ["text", "image"];
  return ["text"];
}

export type DirectorOptions = {
  format: DirectorFormat;
  sceneCount: SceneCount;
  stylePreset?: StylePresetDraft;
  skillIds?: ProductionGuideId[];
  guideSnapshot?: string;
};
export function parseDirectorOptions(value: unknown): DirectorOptions | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("format" in value) ||
    !("sceneCount" in value)
  )
    return null;
  const { format, sceneCount } = value;
  const knownFormat = DIRECTOR_FORMATS.find((item) => item === format);
  if (!knownFormat) return null;
  if (
    !isSceneCount(sceneCount)
  )
    return null;
  const preset = "stylePreset" in value ? parseStyleDraft(value.stylePreset) : undefined;
  if ("stylePreset" in value && !preset) return null;
  const skillIds = "skillIds" in value ? value.skillIds : undefined;
  if (skillIds !== undefined && !validProductionGuideIds(skillIds)) return null;
  return { format: knownFormat, sceneCount, ...(preset ? { stylePreset: preset } : {}),
    ...(skillIds ? { skillIds: [...skillIds] } : {}) };
}

export type ProviderModel = {
  efforts?: AgentEffort[];
  id: string;
  label: string;
  operations: Operation[];
};
export type ProviderInfo = {
  efforts?: AgentEffort[];
  models?: ProviderModel[];
  account?: { plan: string | null; credits: number | null };
  id: Provider;
  label: string;
  operations: Operation[];
  available: boolean;
  detail: string;
  billing: string;
  website: string;
};
export type RunInput = {
  imageEdit?: ImageEditSpec;
  imageEditSource?: { asset: Asset; sha256?: string };
  effort?: AgentEffort;
  motionDesign?: { aspect: "16:9" | "9:16"; seconds: number; style?: StylePresetDraft };
  presetDesign?: { mode: "analyze" | "recommend"; draft: StylePresetDraft; analyzedCuts?: number[] };
  attachments?: AttachmentSummary[];
  target?: Pick<CanvasNode, "title" | "body" | "asset"> & {
    kind?: Kind;
    guidance?: { recipeId: string; text: string; skillIds?: ProductionGuideId[]; guideSnapshot?: string };
  };
  guidanceEdit?: true;
  chat?: {
    stylePreset?: StylePresetDraft;
    threadId: string;
    nodeIds: string[];
    recipeIds: string[];
    history?: { role: "user" | "assistant"; content: string }[];
  };
  model?: string;
  media?: MediaSelection;
  audio?: AudioOptions;
  characterSoul?: Pick<CharacterSoul, "id" | "variant">;
  characterVoice?: Pick<CharacterVoice, "id" | "type">;
  videoOptions?: VideoOptions;
  imageOutput?: ImageOutput;
  contest?: ContestBrief;
  director?: DirectorOptions;
  review?: true;
  projectId: string;
  requestId: string;
  nodeId: string | null;
  provider: Provider;
  operation: Operation;
  prompt: string;
  references: {
    title: string;
    body: string;
    asset?: Asset;
    role?: EdgeRole;
    kind?: Kind;
    nodeId?: string;
    attachmentId?: string;
    characterSoul?: Pick<CharacterSoul, "id" | "variant">;
  }[];
};
export type DirectorReviewNote = {
  nodeId: string;
  reason: string;
  body: string;
};
export type DirectorReview = { summary: string; notes: DirectorReviewNote[] };
export type RunResult = {
  motionSpec?: MotionShortSpec;
  cutReview?: { cut: number; composition: string; caption: string; change: string }[];
  stylePreset?: StylePresetDraft;
  text?: string;
  promptKorean?: { text: string };
  asset?: Asset;
  plan?: Graph;
  review?: DirectorReview;
};
export type Run = {
  id: string;
  input: RunInput;
  status: "queued" | "running" | "succeeded" | "failed";
  result: RunResult | null;
  error: string | null;
  externalId?: string | null;
  createdAt: string;
};
