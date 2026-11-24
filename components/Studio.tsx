"use client";

import { remapTimeline } from "../lib/timeline-spec";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { BrandMark, Mascot } from "./Brand";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpRight,
  Check,
  Clapperboard,
  BookOpen,
  BookmarkPlus,
  Camera,
  Images,
  ListVideo,
  GitCompare,
  StickyNote,
  AudioLines,
  FileText,
  Film,
  Image as ImageIcon,
  LayoutDashboard,
  LoaderCircle,
  Maximize2,
  Menu,
  Minimize2,
  PanelsTopLeft,
  Plus,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import "./node-editor.css";
import CanvasBoard, { type BoardMenuController } from "./CanvasBoard";
import { addStoryboardVideo, canStartVideo, prepareProductionVideo, sceneShots, type BoardPoint, removeBoardItems } from "@/lib/board-edit";
import { imageOperationLabels, type ImageOperation, type RotationOptions, type UpscaleSettings } from "@/lib/image-operation";
import ImageAssetTools from "./ImageAssetTools";
import ImagePreviewDialog from "./ImagePreviewDialog";
import { isDocumentNode, type NodeDocument } from "@/lib/node-document";
import { clearStalePromptVersions, isPromptNode, type PromptVersions } from "@/lib/node-prompt";
import ImageLayerStudio from "./ImageLayerStudio";
import ImageUpscaleStudio from "./ImageUpscaleStudio";
import NodeConnectionDialog, { type NodePort } from "./NodeConnectionDialog";
import { createImageEditNode, imageEditKinds, imageEditSheetLayout, imageEditTemplateInstruction, isImageEditProvider, type ImageEditKind, type ImageEditSettings } from "@/lib/image-edit";
import { productionProfile, productionDefaults, productionToolLabels } from "@/lib/production-start";
import { gridLayouts, type GridLayout, type PortraitGridConfig } from "@/lib/portrait-grid";
import type { ProductionChange, ProductionStartInput } from "./ProjectStartDialog";
import AssetLibrary, { type LibraryItem } from "./AssetLibrary";
import AgentAttachments from "./AgentAttachments";
import type { AttachmentRecord } from "../lib/attachments-types";
import TimelineStudio from "./TimelineStudio";
import DirectorStudio from "./DirectorStudio";
import { mergeRunPages, reconcileHead } from "../lib/run-feed";
import { saveBlenderShot, addBlenderTake, linkBlenderTimeline, addBlockingReference } from "../lib/blender-board";
import MotionDirectorPanel, { type MotionPlanRequest } from "./MotionDirectorPanel";
import dynamic from "next/dynamic";
import { makeStyleGraph, productionProfiles, type StylePresetDraft } from "../lib/style-preset";
import ClipLab from "./ClipLab";
import ContestStudio from "./ContestStudio";
import { contestRequirements, parseContestPrompt, type ContestBrief } from "../lib/contest";
import { useGraphHistory } from "../lib/graph-history";
import {
  addProductionGraph,
  appendProductionTemplate,
} from "../lib/production-template";
import type { MediaProfile } from "../lib/media-model-types";
import { imageAspects, imageResolutions, imageQualities, type ImageOutput } from "../lib/image-output";
import { isFrameOrMotion, parseMediaSelection, resolveMedia } from "../lib/media-request";
import MediaModelOptions, { type MediaSelection } from "./MediaModelOptions";
import UserGuide from "./UserGuide";
import HelpTooltips from "./HelpTooltips";
import WorkroomGuide, { type WorkroomGuideTopic } from "./WorkroomGuide";
import { workroomGuideTabs, type WorkroomTab } from "./workroom-guide-content";
import AgentSettings from "./AgentSettings";
import ProjectLibrary, { type ProjectAction } from "./ProjectLibrary";
import ProjectClassificationsDialog, { type ClassificationAction, type ClassificationTarget } from "./ProjectClassificationsDialog";
import type { ProjectClassification } from "@/lib/project-classifications";
import WorkspaceSidebar from "./WorkspaceSidebar";
import WorkspaceAgent from "./WorkspaceAgent";
import NodeGuidancePanel from "./NodeGuidancePanel";
import {
  defaultWorkspacePreferences, parseWorkspacePreferences, workspacePreferencesKey,
} from "../lib/workspace-preferences";
import { allowsPaidImageProvider, defaultWorkspaceSettings, type WorkspaceSettings } from "../lib/workspace-settings";
import {
  agentDefaultsKey,
  parseAgentDefaults,
  selectedAgent,
  supportsOperation,
  type AgentChoice,
} from "../lib/agent-preferences";
import { effortLabels, effortOptions, isAgentEffort, type AgentEffort } from "../lib/agent-effort";
import ExportMenu from "./ExportMenu";
import DirectorControls from "./DirectorControls";
import DirectorPlanPreview from "./DirectorPlanPreview";
import DirectorReview from "./DirectorReview";
import { applyReviewEdit } from "../lib/director-review-apply";
import { reviewReferences, snapshotReferences } from "../lib/run-input";
import { canConnect, nodeLimit, validateGraph } from "../lib/graph";
import { characterInputs, defaultCharacterReference, readyCharacterSoul, readyCharacterVoice, soulModels, voiceoverLine, type CharacterIdentity } from "../lib/character-identity";
import {
  kindLabels,
  isSceneCount,
  parseDirectorOptions,
  nodeOperations,
  expectedAssetType,
  type AudioOptions,
  roles,
  roleLabels,
  type DirectorOptions,
  type Asset,
  type CanvasNode,
  type Graph,
  type GraphEdge,
  type Kind,
  type Operation,
  type Project,
  type ProjectSummary,
  type Provider,
  type ProviderInfo,
  type Run,
  type RunResult,
} from "../lib/types";

const icons: Record<Kind, typeof FileText> = {
  brief: FileText,
  scenario: BookOpen,
  script: Clapperboard,
  scene: ListVideo,
  shot: Camera,
  character: UserRound,
  keyframe: ImageIcon,
  video: Film,
  referenceImage: Images,
  referenceVideo: Film,
  audioCue: AudioLines,
  previs: ListVideo,
  note: StickyNote,
  switch: GitCompare,
};
type SaveState = "saved" | "pending" | "saving" | "error" | "conflict";
type ProviderSnapshot = { providers: ProviderInfo[]; snapshotAt: string | null; refreshing: boolean };
type ProductionDialog =
  | { mode: "create" }
  | { mode: "format"; target: Project }
  | { mode: "save"; nodeIds?: string[] };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data.error || "요청을 처리하지 못했습니다.",
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return data as T;
}
const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const StylePresetStudio = dynamic(() => import("./StylePresetStudio"));
const MotionShortStudio = dynamic(() => import("./MotionShortStudio"));
const CharacterVoiceRecorder = dynamic(() => import("./CharacterVoiceRecorder"));
const CharacterIdentityPanel = dynamic(() => import("./CharacterIdentityPanel"));
const TtsDialog = dynamic(() => import("./TtsDialog"));
const TtsSampleDialog = dynamic(() => import("./TtsSampleDialog"));
const BlenderSceneStudio = dynamic(() => import("./BlenderSceneStudio"));
const TripoStudio = dynamic(() => import("./TripoStudio"));
const PortraitGridStudio = dynamic(() => import("./PortraitGridStudio"));
const ImageEditStudio = dynamic(() => import("./ImageEditStudio"));
const NodeDocumentDialog = dynamic(() => import("./NodeDocumentDialog"));
const NodePreviewDialog = dynamic(() => import("./NodePreviewDialog"));
const ImageEditResults = dynamic(() => import("./ImageEditResults"));
const ProjectStartDialog = dynamic(() => import("./ProjectStartDialog"));
const BoardPresetSaveDialog = dynamic(() => import("./BoardPresetSaveDialog"));
const NodeElementPanel = dynamic(() => import("./NodeElementPanel"));
const HiggsfieldWorkflowStudio = dynamic(() => import("./HiggsfieldWorkflowStudio"));
const PortraitKitStudio = dynamic(() => import("./PortraitKitStudio"));
const NodeDirectorStudio = dynamic(() => import("./NodeDirectorStudio"));
const baseDirector: DirectorOptions = { format: "short", sceneCount: 3 };
const emptyMediaSelection: MediaSelection = { mode: "", options: {}, assignments: {} };

function ImageOutputOptions({ value, onChange }: { value: ImageOutput; onChange: (value: ImageOutput) => void }) {
  return <fieldset className="image-output-options">
    <legend>이미지 출력</legend>
    <label>화면비<select value={value.aspect ?? ""} onChange={(event) => onChange({ ...value, aspect: imageAspects.find((item) => item === event.target.value) })}>
      <option value="">자동</option>{imageAspects.map((item) => <option key={item}>{item}</option>)}
    </select></label>
    <label>목표 해상도<select value={value.resolution ?? ""} onChange={(event) => onChange({ ...value, resolution: imageResolutions.find((item) => item === event.target.value) })}>
      <option value="">자동</option>{imageResolutions.map((item) => <option key={item}>{item}</option>)}
    </select></label>
    <label>품질<select value={value.quality ?? ""} onChange={(event) => onChange({ ...value, quality: imageQualities.find((item) => item === event.target.value) })}>
      <option value="">자동</option><option value="standard">표준</option><option value="high">고품질</option>
    </select></label>
    <p>ChatGPT에 출력 규격을 요청합니다. 실제 픽셀 크기는 결과에서 확인하세요.</p>
  </fieldset>;
}

function restoreDirector(project: Project): DirectorOptions {
  const profile = productionProfile(project.productionProfileId);
  const defaults = profile ? {
    format: profile.format,
    sceneCount: project.productionSettings?.sceneCount ?? profile.sceneCount,
    skillIds: productionDefaults(profile.id, project.productionSettings?.workflow).guides,
  } : baseDirector;
  try {
    const saved = JSON.parse(window.localStorage.getItem(`scene-room-direction:${project.id}`) ?? "null");
    return parseDirectorOptions(saved) ?? defaults;
  } catch { /* 브라우저 보관함에 접근할 수 없으면 기본 선택으로 시작한다. */ }
  return defaults;
}

type SelectedImageAction = {
  kind: ImageOperation;
  projectId: string;
  sourceId: string;
  asset: Asset;
  title: string;
  targetId: string;
};

function localImageTitle(original: string, operation: string) {
  return `${original.slice(0, 100)} · ${operation}`.slice(0, 160);
}

function positionBeside(graph: Graph, anchor: CanvasNode, direction: NodePort["direction"]) {
  const shift = direction === "input" ? -340 : 340;
  const x = Math.abs(anchor.x + shift) <= 100_000 ? anchor.x + shift : anchor.x - shift;
  let y = anchor.y;
  while (graph.nodes.some((item) => Math.abs(item.x - x) < 275 && Math.abs(item.y - y) < 240))
    y += anchor.y > 60_000 ? -300 : 300;
  return { x, y };
}

function updateProjectLink(id?: string) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("project", id);
  else url.searchParams.delete("project");
  url.searchParams.delete("analysis");
  window.history.replaceState(window.history.state, "", url);
}

function updateProjectList(list: ProjectSummary[], project: Project) {
  const { id, title, version, updatedAt, category, tags, archivedAt, deletedAt, lastOpenedAt, productionProfileId, productionSettings } = project;
  return [{ id, title, version, updatedAt, category, tags, archivedAt, deletedAt, lastOpenedAt, productionProfileId, productionSettings },
    ...list.filter((item) => item.id !== id)];
}

export default function Studio() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [workspaceStatus, setWorkspaceStatus] = useState<"loading" | "unavailable" | "ready">("loading");
  const [workspaceRetry, setWorkspaceRetry] = useState(0);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [productionDialog, setProductionDialog] = useState<ProductionDialog | null>(null);
  const [port, setPort] = useState<NodePort | null>(null);
  const [imageAction, setImageAction] = useState<SelectedImageAction | null>(null);
  const [previewTarget, setPreviewTarget] = useState<{ id: string; trigger?: HTMLElement; editingPrompt?: boolean } | null>(null);
  const [ttsTarget, setTtsTarget] = useState<{ projectId: string; nodeId: string; trigger: HTMLButtonElement } | null>(null);
  const [ttsSampleTarget, setTtsSampleTarget] = useState<{ projectId: string; characterId?: string; trigger?: HTMLElement } | null>(null);
  const [imageEditTarget, setImageEditTarget] = useState<{ sourceId: string; editId?: string } | null>(null);
  const [directorTarget, setDirectorTarget] = useState<{ projectId: string; nodeId: string; trigger: HTMLButtonElement } | null>(null);
  const openPort = useCallback((id: string, direction: NodePort["direction"]) => setPort({ id, direction }), []);
  const [taxonomyTarget, setTaxonomyTarget] = useState<ClassificationTarget | null>(null);
  const [classifications, setClassifications] = useState<ProjectClassification[]>([]);
  const [classificationsLoading, setClassificationsLoading] = useState(true);
  const [classificationsError, setClassificationsError] = useState("");
  const classificationReadVersion = useRef(0);
  const [project, setProject] = useState<Project | null>(null);
  const projectRef = useRef<Project | null>(null);
  const {
    remember: rememberGraph,
    reset: resetHistory,
    undo: undoGraph,
    redo: redoGraph,
    canUndo,
    canRedo,
  } = useGraphHistory(project?.id);
  const revision = useRef(0);
  const savedRevision = useRef(0);
  const saving = useRef<Promise<boolean> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkroomTab>("workspace");
  const activeWorkroomTab = workroomGuideTabs.find(({ id }) => id === tab);
  const [workspaceSettings, setWorkspaceSettings] = useState(defaultWorkspaceSettings);
  const workspaceInitialization = useRef<Promise<WorkspaceSettings> | null>(null);
  const { defaults: agentDefaults, workspace: workspacePreferences, paidImageProviders } = workspaceSettings;
  const [sidebarOpen, setSidebarOpen] = useState(defaultWorkspacePreferences.sidebarOpen);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [focusNode, setFocusNode] = useState<Pick<CanvasNode, "id" | "x" | "y"> | null>(null);
  const [panelHidden, setPanelHidden] = useState(false);
  const [providerSnapshot, setProviderSnapshot] = useState<ProviderSnapshot>({ providers: [], snapshotAt: null, refreshing: true });
  const { providers } = providerSnapshot;
  const providerReadVersion = useRef(0);
  const [choices, setChoices] = useState<
    Record<string, AgentChoice>
  >({});
  const [workOperation, setWorkOperation] = useState<Operation>("text");
  const [planMode, setPlanMode] = useState<"director" | "free" | "review">(
    "director",
  );
  const [sceneReview, setSceneReview] = useState(false);
  const [director, setDirector] = useState<DirectorOptions>({
    format: "short",
    sceneCount: 3,
  });
  const [generalPrompt, setGeneralPrompt] = useState("");
  const [mediaPrompts, setMediaPrompts] = useState<Record<string, string>>({});
  const [imageOutputs, setImageOutputs] = useState<Record<string, ImageOutput>>({});
  const [attachmentsByScope, setAttachmentsByScope] = useState<
    Record<string, AttachmentRecord[]>
  >({});
  const [attachmentBusyByScope, setAttachmentBusyByScope] = useState<
    Record<string, boolean>
  >({});
  const attachmentBusyRef = useRef<Record<string, boolean>>({});
  const linkBusyRef = useRef<Record<string, boolean>>({});
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<{
    start: number;
    end: number;
    query: string;
  } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mediaSelections, setMediaSelections] = useState<Record<string, MediaSelection>>({});
  const [profileState, setProfileState] = useState<{
    key: string;
    profiles: MediaProfile[];
    error?: string;
  }>({ key: "", profiles: [] });
  const [providerRefreshing, setProviderRefreshing] = useState(false);
  const [profileRevision, setProfileRevision] = useState(0);
  const [audio, setAudio] = useState<AudioOptions>({
    engine: "ace",
    purpose: "music",
    seconds: 30,
  });
  const [tool, setTool] = useState<
    "assets" | "timeline" | "director" | "contest" | "clip" | "preset" | "motion" | "portrait" | "blender" | "higgs-workflow" | "tripo" | null
  >(null);
  const blenderDraftId = useRef<string | undefined>(undefined);
  const [blenderEditId, setBlenderEditId] = useState<string | undefined>();
  const [gridNodeId, setGridNodeId] = useState<string | null>(null);
  const gridSnapshot = useRef<{ project: Project; revision: number } | null>(null);
  const pendingTimeline = useRef<{ takeId: string; id: string } | undefined>(undefined);
  const [motionEditId, setMotionEditId] = useState<string | null>(null);
  const [linkedAnalysis, setLinkedAnalysis] = useState<string | undefined>();
  const [contest, setContest] = useState<ContestBrief | null>(null);
  const [contestPrefill, setContestPrefill] = useState<{
    url: string;
    idea: string;
  } | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const projectRuns = useMemo(() => runs.filter((run) => run.input.projectId === project?.id), [runs, project?.id]);
  const runsFeed = useRef<{ tag?: string; tagKey?: string; inFlight?: Promise<void>; cursor?: string | null; loading?: boolean; generation?: number; head?: string[] }>({});
  const runsRef = useRef<Run[]>([]);
  useEffect(() => { runsRef.current = runs; }, [runs]);
  const [runsCursor, setRunsCursor] = useState<string | null>(null);
  const [loadingMoreRuns, setLoadingMoreRuns] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const submitLock = useRef(false);
  const retryRequest = useRef<{ key: string; id: string } | null>(null);
  const panelRetry = useRef<{ key: string; id: string } | null>(null);
  const [runsError, setRunsError] = useState("");
  const [wakingRun, setWakingRun] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const panelDialog = useRef<HTMLDialogElement>(null);
  const workroomGuideDialog = useRef<HTMLDialogElement>(null);
  const workroomGuideOpener = useRef<HTMLButtonElement>(null);
  const workroomGuideButton = useRef<HTMLButtonElement>(null);
  const workroomHelpExit = useRef<HTMLButtonElement>(null);
  const [workroomGuideTopic, setWorkroomGuideTopic] = useState<WorkroomGuideTopic | null>(null);
  const [helpMode, setHelpMode] = useState<"global" | "workroom" | null>(null);
  const expandPanelButton = useRef<HTMLButtonElement>(null);
  const shrinkPanelButton = useRef<HTMLButtonElement>(null);
  function openWorkroomGuide(topic: WorkroomGuideTopic, opener: HTMLButtonElement) {
    workroomGuideOpener.current = opener;
    setWorkroomGuideTopic(topic);
    workroomGuideDialog.current?.showModal();
  }
  function exitHelpMode() {
    setHelpMode(null);
    if (helpMode === "workroom") workroomGuideButton.current?.focus();
  }
  function expandPanel() {
    const dialog = panelDialog.current;
    if (!dialog || panelExpanded) return;
    // The same dialog and its children stay mounted while switching presentation.
    dialog.removeAttribute("open");
    dialog.showModal();
    setPanelExpanded(true);
    requestAnimationFrame(() => shrinkPanelButton.current?.focus());
  }
  function restorePanel() {
    panelDialog.current?.setAttribute("open", "");
    setPanelExpanded(false);
    requestAnimationFrame(() => expandPanelButton.current?.focus({ preventScroll: true }));
  }
  function openPanel() {
    setPanelHidden(false);
    setPanelOpen(true);
    setMobileSidebar(false);
  }
  function closePanel() {
    if (helpMode === "workroom") setHelpMode(null);
    setPanelHidden(true);
    setPanelOpen(false);
  }
  function toggleSidebar() {
    if (window.matchMedia("(max-width: 1060px)").matches) {
      setMobileSidebar((open) => !open);
      setPanelOpen(false);
    } else {
      setSidebarOpen((open) => !open);
    }
  }
  const uploadRef = useRef<HTMLInputElement>(null);
  const boardMenuRef = useRef<BoardMenuController>(null);
  const libraryPoint = useRef<BoardPoint | undefined>(undefined);
  const [librarySource, setLibrarySource] = useState<"all" | "runs" | "saved">("all");
  const [savedAssets, setSavedAssets] = useState<LibraryItem[]>([]);
  useEffect(() => {
    if (tool !== "assets") return;
    const controller = new AbortController();
    void request<{ items: LibraryItem[] }>("/api/saved-assets", { signal: controller.signal })
      .then(({ items }) => { if (!controller.signal.aborted) setSavedAssets(items); })
      .catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [tool, setError]);
  const node =
    project?.graph.nodes.find((item) => item.id === selected) || null;
  const directorNode = project && directorTarget?.projectId === project.id
    ? project.graph.nodes.find((item) => item.id === directorTarget.nodeId) : undefined;
  const directorPreview = directorNode?.asset?.type === "image" ? directorNode.asset : (project && directorNode ? project.graph.nodes.find((item) =>
    item.asset?.type === "image" && project.graph.edges.some((edge) => edge.source === item.id && edge.target === directorNode.id && edge.usage !== "guide"))?.asset : undefined);
  const linkedShots = node?.kind === "scene" && project ? sceneShots(project.graph, node.id) : [];
  const workroomScenes = project?.graph.nodes.filter((item) => item.kind === "scene") ?? [];
  const portNode = port && project?.graph.nodes.find((item) => item.id === port.id);
  const editTarget = imageEditTarget?.editId
    ? project?.graph.nodes.find((item) => item.id === imageEditTarget.editId)
    : undefined;
  const editSource = imageEditTarget && (project?.graph.nodes.find((item) => item.id === imageEditTarget.sourceId) ??
    (editTarget && { ...editTarget, asset: editTarget.imageEdit?.sourceAsset }));
  const imageEditOriginal = node?.imageEdit?.sourceAsset;
  const imageEditSourceNode = node?.imageEdit && project?.graph.nodes.find((item) => item.id === node.imageEdit?.sourceNodeId);
  const hasImageEditInput = !!(node?.imageEdit && imageEditOriginal &&
    imageEditSourceNode?.asset?.url === imageEditOriginal.url &&
    project?.graph.edges.some((edge) =>
      edge.source === imageEditSourceNode.id && edge.target === node.id && edge.usage !== "guide"));
  const activeProductionProfile = productionProfile(project?.productionProfileId);
  const projectSceneSetting = project?.productionSettings?.sceneCount;
  const countLabel = projectSceneSetting === "auto"
    ? `씬 자동 · 보드 ${project?.graph.nodes.filter((item) => item.kind === "scene").length ?? 0}개`
    : projectSceneSetting ? `씬 ${projectSceneSetting}개` : "";
  const productionTool = activeProductionProfile && productionDefaults(activeProductionProfile.id, project?.productionSettings?.workflow).tool;
  const sheetLayout = node?.imageEdit && imageEditSheetLayout(node.imageEdit.kind);
  const initialGridLayout = sheetLayout && (Object.keys(gridLayouts) as GridLayout[]).find((key) =>
    gridLayouts[key].columns === sheetLayout.columns && gridLayouts[key].rows === sheetLayout.rows);
  const allowedOperations: Operation[] = node?.imageEdit ? ["image"] : node ? nodeOperations(node.kind) : [];
  const isReview = node
    ? node.kind === "scene" && sceneReview
    : planMode === "review";
  const operation: Operation = isReview
    ? "plan"
    : node
      ? allowedOperations.includes(workOperation)
        ? workOperation
        : allowedOperations[0]
      : "plan";
  const audioMinimum = audio.engine === "ace" ? 1 : 20;
  const audioMaximum =
    audio.engine === "ace" ? (audio.purpose === "music" ? 600 : 30) : 360;
  const audioValid =
    Number.isInteger(audio.seconds) &&
    audio.seconds >= audioMinimum &&
    audio.seconds <= audioMaximum &&
    (audio.engine === "ace" || audio.purpose === "music");
  const compatible = providers.filter(
    (item) => supportsOperation(item, operation) &&
      allowsPaidImageProvider(item.id, paidImageProviders) &&
      (!node?.imageEdit || operation !== "image" || isImageEditProvider(item.id)),
  );
  const choiceKey = `${project?.id || ""}:${node?.id || "project"}:${operation}:${isReview ? "review" : "work"}`;
  const videoWork = operation === "video";
  const imageWork = operation === "image";
  const mediaWork = imageWork || videoWork;
  const scopeRef = useRef(choiceKey);
  useEffect(() => {
    scopeRef.current = choiceKey;
  }, [choiceKey]);
  const explicitChoice = choices[choiceKey];
  const allowedChoice = explicitChoice && (!explicitChoice.provider || allowsPaidImageProvider(explicitChoice.provider, paidImageProviders))
    ? explicitChoice : undefined;
  const choice = selectedAgent(allowedChoice, agentDefaults, operation);
  const cueLine = node?.kind === "audioCue" ? voiceoverLine(node.body) : "";
  const voiceActors = project && node?.kind === "audioCue" ? characterInputs(project.graph, node.id) : [];
  const voiceActor = voiceActors.length === 1 ? voiceActors[0] : undefined;
  const voiceBinding = readyCharacterVoice(voiceActor);
  const activeProvider = compatible.find((item) => item.id === choice?.provider)
    ?? (operation === "audio" && !choice && (cueLine || voiceActor) ? compatible.find((item) => item.id === "higgsfield") : undefined)
    ?? (mediaWork && !choice ? compatible.find((item) => item.id === (videoWork ? "higgsfield" : "codex") && item.available)
      ?? compatible.find((item) => item.available) ?? compatible[0] : undefined);
  const voiceWork = operation === "audio" && activeProvider?.id === "higgsfield";
  const voiceInputError = voiceWork && !voiceBinding ? voiceActor?.characterIdentity?.voice?.status === "training"
    ? "캐릭터 시트에서 목소리 등록이 완료됐는지 확인해 주세요." : "사용할 목소리를 등록한 캐릭터 한 명을 화자로 연결해 주세요." : "";
  const prompt = mediaWork || voiceWork ? mediaPrompts[choiceKey] ?? (voiceWork ? cueLine : "") : generalPrompt;
  function setPrompt(value: string) {
    if (mediaWork || voiceWork) setMediaPrompts((current) => ({ ...current, [choiceKey]: value }));
    else setGeneralPrompt(value);
  }
  const contestFromPrompt = !node && planMode === "director" && !contest ? parseContestPrompt(prompt) : null;
  const attachments = voiceWork ? [] : attachmentsByScope[choiceKey] || [];
  const attachmentIds = attachments.map((item) => item.id);
  const attachmentBusy = !!attachmentBusyByScope[choiceKey];
  const useScenario = !node && planMode === "director" && director.sceneCount === "auto" &&
    project?.graph.nodes.some((item) => (item.kind === "script" || item.kind === "scenario") && item.body.trim());
  const invalidSceneCount = !node && planMode === "director" && !isSceneCount(director.sceneCount);
  const submittedPrompt =
    prompt.trim() ||
    (node?.imageEdit ? "편집 지시에 따라 원본 이미지를 수정해 주세요." : useScenario
      ? "캔버스의 시나리오와 대본에 따라 적절한 씬 수를 정하고 씬별 제작안을 작성해 주세요."
      : operation === "plan"
      ? isReview
        ? "첨부 자료를 참고해 대본과 연출을 검토해 주세요."
        : "첨부 자료를 참고해 제작안을 만들어 주세요."
      : operation === "text"
        ? "첨부 자료를 참고해 이 노드를 수정해 주세요."
        : operation === "audio"
          ? "첨부 자료를 참고해 음향을 만들어 주세요."
          : operation === "image"
            ? "첨부 자료를 참고해 이미지를 만들어 주세요."
            : "이 영상에 직접 연결된 씬이나 샷을 하나의 클립으로 만들어 주세요. 상위 대본은 인물, 장소와 상황을 이해하는 데 참고해 주세요.");
  const imageOutput = imageWork && activeProvider?.id === "codex" ? imageOutputs[choiceKey] : undefined;
  const setImageOutput = (value: ImageOutput) => setImageOutputs((current) => ({ ...current, [choiceKey]: value }));
  const availableModels =
    activeProvider?.models?.filter((item) =>
      item.operations.includes(operation),
    ) || [];
  const storedModel = voiceWork ? "seed_audio" : activeProvider
    ? choice?.models?.[activeProvider.id] || ""
    : "";
  const model = availableModels.some((item) => item.id === storedModel)
    ? storedModel
    : "";
  const modelUnavailable = !!storedModel && !model;
  const reasoningOptions = operation === "plan" || operation === "text" ? effortOptions(activeProvider, storedModel) : [];
  const effort = isAgentEffort(choice?.effort) && reasoningOptions.includes(choice.effort) ? choice.effort : undefined;
  const apiProvider = ["openai-image", "gemini-image", "seedream"].includes(
    activeProvider?.id || "",
  );
  const appImageHandoff = activeProvider?.id === "agy" && operation === "image";
  const mediaProvider =
    !!activeProvider &&
    ["higgsfield", "kling", "topview"].includes(activeProvider.id) &&
    (operation === "image" || operation === "video");
  const mediaKey = mediaProvider && model
    ? `${choiceKey}:${activeProvider!.id}:${operation}:${model}`
    : "";
  const profiles = profileState.key === mediaKey ? profileState.profiles : [];
  useEffect(() => {
    if (!mediaKey || !activeProvider?.available) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      provider: activeProvider.id,
      operation,
      model,
    });
    request<{ profiles: MediaProfile[] }>(
      `/api/providers/media-model?${query}`,
      { signal: controller.signal },
    )
      .then((result) =>
        setProfileState({ key: mediaKey, profiles: result.profiles }),
      )
      .catch((cause) => {
        if (!controller.signal.aborted)
          setProfileState({
            key: mediaKey,
            profiles: [],
            error: cause instanceof Error
              ? cause.message
              : "모델 설정을 불러오지 못했습니다.",
          });
      });
    return () => controller.abort();
  }, [mediaKey, activeProvider?.id, activeProvider?.available, model, operation, profileRevision]);
  async function refreshProviders() {
    const version = ++providerReadVersion.current;
    setProviderRefreshing(true);
    try {
      const result = await request<ProviderSnapshot>("/api/providers?refresh=1");
      if (providerReadVersion.current === version) setProviderSnapshot(result);
      setProfileRevision((revision) => revision + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "연결 상태를 불러오지 못했습니다.");
    } finally {
      setProviderRefreshing(false);
    }
  }
  const manualHandoff =
    !!activeProvider &&
    (!activeProvider.available || appImageHandoff) &&
    !apiProvider &&
    !mediaProvider &&
    !voiceWork &&
    activeProvider.id !== "road-music" &&
    !isReview;
  const requestReferences = project
    ? isReview
      ? reviewReferences(project.graph, node?.id || null)
      : snapshotReferences(
          project.graph,
          node?.id || null,
          operation,
          activeProvider?.id,
        )
    : [];
  const hasRequest = voiceWork ? Boolean(prompt.trim() && !voiceInputError) : node?.imageEdit ? hasImageEditInput : Boolean(prompt.trim() || attachments.length || useScenario ||
    mediaWork && requestReferences.some((reference) => reference.body.trim() || reference.asset));
  const automaticProfile = profiles.length === 1 ? profiles[0] : mediaWork &&
    !requestReferences.some((reference) => reference.asset) && !attachments.some((attachment) => attachment.asset)
      ? profiles.find((profile) => !profile.slots.length && !profile.requiresMedia) : undefined;
  const aspect = project?.productionSettings?.aspect;
  const aspectOption = automaticProfile?.options.find((option) => /^(aspect(?:_?ratio)?|ratio)$/i.test(option.id) && aspect && option.values?.includes(aspect));
  const mediaSelection = mediaSelections[mediaKey] ?? (automaticProfile
    ? { mode: automaticProfile.mode, options: aspectOption && aspect ? { [aspectOption.id]: aspect } : {}, assignments: {} }
    : emptyMediaSelection);
  const selectedProfile = profiles.find((profile) => profile.mode === mediaSelection.mode);
  const mediaReady = !mediaProvider || (!!model && !!selectedProfile);
  const currentMediaSources = new Set([
    ...requestReferences
      .filter((reference) => reference.nodeId && (reference.asset || videoWork && isFrameOrMotion(reference.role)))
      .map((reference) => `node:${reference.nodeId}`),
    ...attachments
      .filter((attachment) => attachment.asset &&
        (attachment.kind === "image" || attachment.kind === "video"))
      .map((attachment) => `attachment:${attachment.id}`),
  ]);
  const effectiveMediaSelection: MediaSelection = {
    ...mediaSelection,
    assignments: videoWork && selectedProfile && !selectedProfile.slots.length && !selectedProfile.requiresMedia
      ? Object.fromEntries([...currentMediaSources].filter((id) => id.startsWith("node:")).map((id) => [id, "$text"]))
      : Object.fromEntries(Object.entries(mediaSelection.assignments).filter(([id]) => currentMediaSources.has(id))),
  };
  let videoInputError = "";
  if (videoWork && selectedProfile) {
    try {
      resolveMedia(selectedProfile, { model, operation, media: parseMediaSelection(effectiveMediaSelection),
        references: [...requestReferences, ...attachments.flatMap((attachment) =>
          attachment.asset && (attachment.kind === "image" || attachment.kind === "video")
            ? [{ attachmentId: attachment.id, title: attachment.name, body: "", asset: attachment.asset,
              ...(attachment.kind === "video" ? { role: "motion" as const } : {}) }] : [])],
      });
    } catch (cause) {
      videoInputError = (cause as Error).message;
    }
  }
  const mentionCandidates =
    mention && project
      ? project.graph.nodes
          .filter((item) => {
            if (
              !node &&
              !requestReferences.some(
                (reference) => reference.nodeId === item.id,
              )
            )
              return false;
            return `${item.title} ${kindLabels[item.kind]}`
              .toLocaleLowerCase()
              .includes(mention.query.toLocaleLowerCase());
          })
          .slice(0, 8)
      : [];

  function updateMention(value: string, position: number) {
    const match = /@([^@\n]*)$/.exec(value.slice(0, position));
    if (!match) {
      setMention(null);
      return;
    }
    setMention({
      start: position - match[1].length - 1,
      end: position,
      query: match[1],
    });
    setMentionIndex(0);
  }
  function insertMention(source: CanvasNode) {
    if (!mention || !projectRef.current) return;
    const current = projectRef.current;
    if (current.id !== project?.id) {
      setError("프로젝트가 바뀌었습니다. 노드를 다시 선택해 주세요.");
      return;
    }
    const text = `@${source.title || kindLabels[source.kind]} `;
    const value =
      prompt.slice(0, mention.start) + text + prompt.slice(mention.end);
    if (value.length > 12000) {
      setError("요청 내용은 12,000자 이내여야 합니다.");
      return;
    }
    if (node) {
      if (source.id === node.id) {
        setError("현재 노드에는 자기 자신을 참조로 연결할 수 없습니다.");
        return;
      }
      const existing = current.graph.edges.find(
        (edge) => edge.source === source.id && edge.target === node.id,
      );
      if (existing) {
        setError(
          existing.usage === "guide"
            ? "이 연결은 연출 확인용입니다. 기존 사용 범위를 확인해 주세요."
            : "이미 연결된 참조입니다.",
        );
        return;
      }
      if (!canConnect(current.graph, source.id, node.id)) {
        setError("순환하거나 허용 범위를 벗어나는 연결입니다.");
        return;
      }
      edit((value) => ({
        ...value,
        graph: {
          ...value.graph,
          edges: [
            ...value.graph.edges,
            { source: source.id, target: node.id, usage: "input" },
          ],
        },
      }));
    } else if (
      !requestReferences.some((reference) => reference.nodeId === source.id)
    ) {
      setError("현재 기획 요청에 전송할 수 없는 노드입니다.");
      return;
    }
    const caret = mention.start + text.length;
    setPrompt(value);
    setMention(null);
    requestAnimationFrame(() => {
      promptRef.current?.focus();
      promptRef.current?.setSelectionRange(caret, caret);
    });
  }

  useEffect(() => {
    try {
      const saved = JSON.parse(
        window.localStorage.getItem("scene-room-provider-selections-v1") ||
          "{}",
      );
      if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        // Reading a persisted preference synchronizes the browser and this interface.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setChoices(saved);
      }
    } catch {
      /* Ignore unavailable or malformed browser storage. */
    }
    const controller = new AbortController();
    const signal = controller.signal;
    const initialize = (async () => {
      let { settings } = await request<{ settings: WorkspaceSettings }>("/api/workspace-settings", { signal });
      if (signal.aborted) return settings;
      if (settings.version === 0) {
        let defaults = settings.defaults;
        let workspace = settings.workspace;
        let canImport = false;
        for (const key of [agentDefaultsKey, workspacePreferencesKey]) {
          try {
            const raw = window.localStorage.getItem(key);
            if (!raw) continue;
            const legacy: unknown = JSON.parse(raw);
            if (!legacy || typeof legacy !== "object" || Array.isArray(legacy)) continue;
            if (key === agentDefaultsKey) defaults = { ...defaults, ...parseAgentDefaults(legacy) };
            else workspace = parseWorkspacePreferences(legacy);
            canImport = true;
          } catch {
            /* An unusable browser preference leaves the server default in place. */
          }
        }
        if (canImport) {
          try {
            ({ settings } = await request<{ settings: WorkspaceSettings }>("/api/workspace-settings", {
              ...json({ ...settings, defaults, workspace }), method: "PUT", signal,
            }));
          } catch (cause) {
            if ((cause as Error & { status?: number }).status !== 409) throw cause;
            ({ settings } = await request<{ settings: WorkspaceSettings }>("/api/workspace-settings", { signal }));
          }
        }
      }
      return settings;
    })();
    workspaceInitialization.current = initialize;
    void initialize.then((settings) => {
      if (signal.aborted) return;
      setWorkspaceSettings((current) => current.version > settings.version ? current : settings);
      setSidebarOpen(settings.workspace.sidebarOpen);
      setTab(settings.workspace.startPanel);
    }).catch((cause: Error) => { if (!signal.aborted) setError(cause.message); })
      .finally(() => {
        if (workspaceInitialization.current === initialize) workspaceInitialization.current = null;
      });
    return () => controller.abort();
  }, []);

  async function readWorkspaceSettings(): Promise<WorkspaceSettings> {
    const initial = await workspaceInitialization.current?.catch(() => undefined);
    const { settings } = initial ? { settings: initial } :
      await request<{ settings: WorkspaceSettings }>("/api/workspace-settings");
    setWorkspaceSettings(settings);
    return settings;
  }

  async function saveWorkspaceSettings(value: WorkspaceSettings): Promise<void> {
    const { settings } = await request<{ settings: WorkspaceSettings }>("/api/workspace-settings", { ...json(value), method: "PUT" });
    if (settings.workspace.sidebarOpen !== workspacePreferences.sidebarOpen) setSidebarOpen(settings.workspace.sidebarOpen);
    if (settings.workspace.startPanel !== workspacePreferences.startPanel) setTab(settings.workspace.startPanel);
    setWorkspaceSettings(settings);
  }
  function selectChoice(provider: Provider | "", modelId?: string, effortValue?: AgentEffort | "", forOperation = operation) {
    const key = forOperation === operation ? choiceKey : `${project?.id || ""}:${node?.id || "project"}:${forOperation}:work`;
    setChoices((current) => {
      const previous = selectedAgent(current[key], agentDefaults, forOperation);
      const next = {
        ...current,
        [key]: {
          provider,
          models: {
            ...previous?.models,
            ...(modelId !== undefined && provider
              ? { [provider]: modelId }
              : {}),
          },
          effort: effortValue === "" ? undefined : effortValue ??
            (provider === previous?.provider && (modelId === undefined || modelId === previous.models[provider]) ? previous.effort : undefined),
        },
      };
      try {
        window.localStorage.setItem(
          "scene-room-provider-selections-v1",
          JSON.stringify(next),
        );
      } catch {
        /* Selection remains available for this session. */
      }
      return next;
    });
  }
  function resetChoice() {
    setChoices((current) => {
      const next = { ...current };
      delete next[choiceKey];
      try {
        window.localStorage.setItem("scene-room-provider-selections-v1", JSON.stringify(next));
      } catch {
        /* Selection remains available for this session. */
      }
      return next;
    });
  }
  const replaceProject = useCallback((next: Project) => {
    if (projectRef.current?.id !== next.id) {
      runsFeed.current = {};
      setRunsCursor(null);
      setLoadingMoreRuns(false);
      setRuns([]);
      setRunsError("");
      setDirector(restoreDirector(next));
      setGeneralPrompt("");
      setTool(null);
    }
    projectRef.current = next;
    setProject(next);
  }, []);
  const edit = useCallback(
    (update: (current: Project) => Project, coalesceKey?: string, recordHistory = true) => {
      const current = projectRef.current;
      if (!current) return;
      const updated = update(current);
      const graph = clearStalePromptVersions(current.graph, updated.graph);
      const next = graph === updated.graph ? updated : { ...updated, graph };
      if (recordHistory && next.graph !== current.graph) {
        rememberGraph(current.graph, coalesceKey);
        boardMenuRef.current?.queueLayout(current.graph, next.graph);
      }
      revision.current += 1;
      replaceProject(next);
      setSaveState("pending");
    },
    [replaceProject, rememberGraph],
  );
  const commitAutoLayout = useCallback((previous: Graph, graph: Graph) => {
    if (projectRef.current?.graph === previous) {
      edit((current) => ({ ...current, graph }), undefined, false);
    }
  }, [edit]);
  const applyHistory = useCallback(
    (direction: "undo" | "redo") => {
      const current = projectRef.current;
      if (!current) return;
      const graph =
        direction === "undo"
          ? undoGraph(current.graph)
          : redoGraph(current.graph);
      if (!graph) return;
      revision.current += 1;
      replaceProject({ ...current, graph });
      setSaveState("pending");
    },
    [undoGraph, redoGraph, replaceProject],
  );
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.key.toLowerCase() !== "z"
      )
        return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], dialog[open]"))
        return;
      event.preventDefault();
      applyHistory(event.shiftKey ? "redo" : "undo");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyHistory]);
  const save = useCallback(async (): Promise<boolean> => {
    while (revision.current !== savedRevision.current) {
      if (saving.current) {
        if (!(await saving.current)) return false;
        continue;
      }
      const snapshot = projectRef.current;
      if (!snapshot) return true;
      const atRevision = revision.current;
      setSaveState("saving");
      const task = (async () => {
        try {
          const result = await request<{ project: Project }>(
            `/api/projects/${snapshot.id}`,
            {
              ...json({
                title: snapshot.title,
                graph: snapshot.graph,
                version: snapshot.version,
              }),
              method: "PUT",
            },
          );
          savedRevision.current = atRevision;
          if (projectRef.current?.id === snapshot.id) {
            const current = projectRef.current;
            replaceProject({
              ...current,
              version: result.project.version,
              updatedAt: result.project.updatedAt,
            });
            setProjects((list) =>
              list.map((item) =>
                item.id === snapshot.id
                  ? {
                      ...item,
                      title: current.title,
                      version: result.project.version,
                      updatedAt: result.project.updatedAt,
                    }
                  : item,
              ),
            );
            setSaveState(revision.current === atRevision ? "saved" : "pending");
          }
          return true;
        } catch (cause) {
          const failure = cause as Error & { status?: number };
          setSaveState(failure.status === 409 ? "conflict" : "error");
          setError(failure.message);
          return false;
        }
      })();
      saving.current = task;
      const success = await task;
      saving.current = null;
      if (!success) return false;
    }
    return true;
  }, [replaceProject]);

  const activateProject = useCallback((next: Project | null) => {
    revision.current = 0;
    savedRevision.current = 0;
    if (next) {
      replaceProject(next);
      setProjects((list) => updateProjectList(list, next));
      window.localStorage.setItem("scene-room-project", next.id);
      setSelected(window.localStorage.getItem(`scene-room-node-${next.id}`));
    } else {
      projectRef.current = null;
      setProject(null);
      setSelected(null);
      setTool(null);
      window.localStorage.removeItem("scene-room-project");
    }
    resetHistory();
    setFocusNode(null);
    setPreviewTarget(null);
    setPort(null);
    setImageEditTarget(null);
    setImageAction(null);
    setGridNodeId(null);
    setContest(null);
    setContestPrefill(null);
    setAttachmentsByScope({});
    setAttachmentBusyByScope({});
    attachmentBusyRef.current = {};
    linkBusyRef.current = {};
    setSaveState("saved");
    setWorkspaceStatus("ready");
    setError("");
  }, [replaceProject, resetHistory, setError]);

  const loadProject = useCallback(async (id: string) => {
    const { project: next } = await request<{ project: Project }>(
      `/api/projects/${id}`, { ...json({ action: "open" }), method: "PATCH" },
    );
    activateProject(next);
  }, [activateProject]);

  useEffect(() => {
    const controller = new AbortController();
    request<{ projects: ProjectSummary[] }>("/api/projects", { signal: controller.signal })
      .then(async (list) => {
        if (controller.signal.aborted || projectRef.current) return;
        setProjects(list.projects);
        const query = new URLSearchParams(window.location.search);
        const requested = query.get("project");
        const active = list.projects.filter((item) => !item.archivedAt && !item.deletedAt);
        const linked = active.some((item) => item.id === requested);
        const lastId = linked ? requested : window.localStorage.getItem("scene-room-project");
        const id = active.find((item) => item.id === lastId)?.id ?? active[0]?.id;
        if (!linked && requested) updateProjectLink(id);
        if (id) {
          const { project: next } = await request<{ project: Project }>(`/api/projects/${id}`, {
            ...json({ action: "open" }), method: "PATCH", signal: controller.signal,
          });
          if (controller.signal.aborted || projectRef.current) return;
          activateProject(next);
        }
        setWorkspaceStatus("ready");
        if (linked && query.get("analysis")) {
          setLinkedAnalysis(query.get("analysis")!);
          setTool("preset");
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setWorkspaceStatus("unavailable");
          setError((cause as Error).message);
        }
      });
    return () => controller.abort();
  }, [activateProject, workspaceRetry]);

  const readClassifications = useCallback((signal?: AbortSignal) => {
    const version = ++classificationReadVersion.current;
    const isCurrent = () => classificationReadVersion.current === version && !signal?.aborted;
    return request<{ classifications: ProjectClassification[] }>("/api/projects/classifications", { signal })
      .then(({ classifications }) => {
        if (!isCurrent()) return;
        setClassifications(classifications);
        setClassificationsError("");
      }).catch((cause: Error) => {
        if (isCurrent()) setClassificationsError(cause.message);
      }).finally(() => {
        if (isCurrent()) setClassificationsLoading(false);
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void readClassifications(controller.signal);
    return () => controller.abort();
  }, [readClassifications]);

  function refreshClassifications() {
    setClassificationsLoading(true);
    setClassificationsError("");
    void readClassifications();
  }

  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    async function readProviderSnapshot() {
      let nextDelay = 30_000;
      const version = providerReadVersion.current;
      try {
        if (!document.hidden) {
          const snapshot = await request<ProviderSnapshot>("/api/providers", { signal: controller.signal });
          if (!controller.signal.aborted && providerReadVersion.current === version) {
            setProviderSnapshot(snapshot);
            if (snapshot.refreshing) nextDelay = 2_000;
          }
        }
      } catch {
        if (!controller.signal.aborted && providerReadVersion.current === version)
          setProviderSnapshot((current) => ({ ...current, refreshing: false }));
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(readProviderSnapshot, nextDelay);
      }
    }
    void readProviderSnapshot();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, []);
  useEffect(() => {
    if (saveState !== "pending") return;
    const timer = window.setTimeout(() => {
      void save();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [project, saveState, save]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (revision.current !== savedRevision.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    // 다른 도구에서 MCP로 바꾼 프로젝트는 제작실로 돌아올 때 반영한다.
    const sync = async () => {
      const before = projectRef.current;
      if (!before || revision.current !== savedRevision.current) return;
      try {
        const { project: updated } = await request<{ project: Project }>(
          `/api/projects/${before.id}`,
        );
        if (projectRef.current !== before || updated.version <= before.version)
          return;
        replaceProject(updated);
        resetHistory();
        setProjects((list) =>
          list.map((item) => (item.id === updated.id ? updated : item)),
        );
        setSelected((id) =>
          updated.graph.nodes.some((item) => item.id === id) ? id : null,
        );
      } catch {
        // 열려 있는 편집본은 유지하고 다음 포커스 또는 저장에서 다시 확인한다.
      }
    };
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, [replaceProject, resetHistory]);
  const refreshRuns = useCallback(async (id: string) => {
    if (projectRef.current?.id !== id) return;
    const feed = runsFeed.current;
    feed.inFlight ??= (async () => {
      try {
        const track = runsRef.current.filter((run) => run.status === "queued" || run.status === "running").slice(0, 100).map((run) => run.id).sort();
        const params = new URLSearchParams();
        track.forEach((runId) => params.append("track", runId));
        const tagKey = params.toString();
        const response = await fetch(`/api/projects/${id}/runs?${tagKey}`, {
          cache: "no-store",
          headers: feed.tag && feed.tagKey === tagKey ? { "If-None-Match": feed.tag } : undefined,
        });
        if (response.status === 304) {
          if (runsFeed.current === feed) setRunsError("");
          return;
        }
        if (!response.ok) throw new Error();
        const result = (await response.json()) as { runs: Run[]; nextCursor: string | null; activeRuns: Run[] };
        if (runsFeed.current === feed) {
          feed.tag = response.headers.get("etag") ?? undefined;
          feed.tagKey = tagKey;
          const next = reconcileHead(feed.head, result.runs, feed.cursor, result.nextCursor);
          feed.head = result.runs.map((run) => run.id);
          if (next.gap) feed.generation = (feed.generation ?? 0) + 1;
          if (feed.cursor !== next.cursor) {
            feed.cursor = next.cursor;
            setRunsCursor(next.cursor);
          }
          setRuns((current) => mergeRunPages(current, result.runs, result.activeRuns ?? []));
          setRunsError("");
        }
      } catch {
        if (runsFeed.current === feed) setRunsError("실행 기록을 불러오지 못했습니다.");
      } finally {
        feed.inFlight = undefined;
      }
    })();
    await feed.inFlight;
  }, []);
  useEffect(() => {
    if (!project?.id) return;
    void refreshRuns(project.id);
  }, [project?.id, refreshRuns]);
  useEffect(() => {
    if (tab === "runs" && project?.id) void refreshRuns(project.id);
  }, [tab, project?.id, refreshRuns]);
  const hasActiveRuns = runs.some((run) => run.status === "queued" || run.status === "running");
  useEffect(() => {
    if (!project?.id || !hasActiveRuns) return;
    const timer = window.setInterval(() => {
      void refreshRuns(project.id);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [hasActiveRuns, project?.id, refreshRuns]);

  function rememberRun(run: Run, warning?: string) {
    runsFeed.current.tag = undefined;
    setRuns((list) => [run, ...list.filter((item) => item.id !== run.id)]);
    if (warning) setError(warning);
  }

  async function loadMoreRuns() {
    const id = projectRef.current?.id;
    const feed = runsFeed.current;
    const cursor = feed.cursor;
    if (!id || !cursor || feed.loading) return;
    feed.loading = true;
    const generation = feed.generation ?? 0;
    setLoadingMoreRuns(true);
    try {
      const page = await request<{ runs: Run[]; nextCursor: string | null }>(
        `/api/projects/${id}/runs?cursor=${encodeURIComponent(cursor)}`,
      );
      if (runsFeed.current !== feed || projectRef.current?.id !== id) return;
      if ((feed.generation ?? 0) === generation) {
        feed.cursor = page.nextCursor;
        setRunsCursor(page.nextCursor);
      }
      setRuns((current) => mergeRunPages(current, page.runs));
      setRunsError("");
    } catch {
      if (runsFeed.current === feed) setRunsError("이전 실행 기록을 불러오지 못했습니다.");
    } finally {
      feed.loading = false;
      if (runsFeed.current === feed) setLoadingMoreRuns(false);
    }
  }

  useEffect(() => {
    if (!project?.id || !linkedAnalysis) return;
    const id = project.id;
    const feed = runsFeed.current;
    const controller = new AbortController();
    void request<{ run: Run }>(`/api/projects/${id}/runs?runId=${encodeURIComponent(linkedAnalysis)}`, { signal: controller.signal })
      .then(({ run }) => {
        if (runsFeed.current === feed && projectRef.current?.id === id)
          setRuns((current) => mergeRunPages(current, [run]));
      })
      .catch(() => { if (!controller.signal.aborted && runsFeed.current === feed) setRunsError("연결한 실행 기록을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [project?.id, linkedAnalysis]);

  async function wakeRun(run: Run) {
    const id = projectRef.current?.id;
    if (wakingRun || id !== run.input.projectId) return;
    setWakingRun(run.id);
    setRunsError("");
    try {
      await request(`/api/projects/${id}/runs`, { ...json({ runId: run.id }), method: "PATCH" });
      await refreshRuns(id);
    } catch (error) {
      if (projectRef.current?.id === id)
        setRunsError(error instanceof Error ? error.message : "대기 작업을 시작하지 못했습니다.");
    } finally {
      setWakingRun(undefined);
    }
  }

  async function switchProject(id: string) {
    if (id === projectRef.current?.id) return;
    if (!(await save())) throw new Error("현재 작업을 저장한 뒤 프로젝트를 전환해 주세요.");
    const currentRevision = revision.current;
    const { project: next } = await request<{ project: Project }>(
      `/api/projects/${id}`, { ...json({ action: "open" }), method: "PATCH" },
    );
    if (revision.current !== currentRevision)
      throw new Error("전환 중 변경한 내용이 있습니다. 저장 후 다시 전환해 주세요.");
    activateProject(next);
    updateProjectLink(next.id);
  }

  async function createProject(input: ProductionStartInput) {
    if (!(await save())) throw new Error("현재 작업을 저장한 뒤 새 프로젝트를 만들어 주세요.");
    const currentRevision = revision.current;
    const { project: next } = await request<{ project: Project }>("/api/projects", json(input));
    if (revision.current !== currentRevision) {
      setProjects((list) => updateProjectList(list, next));
      throw new Error("새 프로젝트를 만들었습니다. 현재 작업을 저장한 뒤 목록에서 열어 주세요.");
    }
    activateProject(next);
    updateProjectLink(next.id);
  }

  async function openProductionSettings(id: string) {
    const current = projectRef.current;
    const target = current?.id === id
      ? current
      : (await request<{ project: Project }>(`/api/projects/${id}`)).project;
    setProductionDialog({ mode: "format", target });
  }

  async function changeProductionFormat(input: ProductionChange) {
    if (productionDialog?.mode !== "format") return;
    const { target } = productionDialog;
    if (projectRef.current?.id === target.id && !(await save()))
      throw new Error("현재 프로젝트를 저장한 뒤 형식을 변경해 주세요.");
    const current = projectRef.current?.id === target.id ? projectRef.current : target;
    const atRevision = revision.current;
    const { project: next } = await request<{ project: Project }>(`/api/projects/${current.id}`, {
      ...json({ action: "production", version: current.version, ...input }), method: "PATCH",
    });
    if (acceptProjectGraph(current, next, atRevision)) {
      const profile = productionProfile(next.productionProfileId);
      const defaults = profile && productionDefaults(profile.id, next.productionSettings?.workflow);
      changeDirector(profile && defaults ? {
        format: profile.format,
        sceneCount: next.productionSettings?.sceneCount ?? defaults.sceneCount,
        skillIds: defaults.guides,
      } : baseDirector);
    } else if (projectRef.current?.id !== next.id) {
      window.localStorage.removeItem(`scene-room-direction:${next.id}`);
    }
  }

  function acceptProjectGraph(snapshot: Project, next: Project, atRevision: number) {
    setProjects((list) => updateProjectList(list, next));
    const current = projectRef.current;
    if (current?.id !== next.id) return false;
    if (revision.current !== atRevision || current.version !== snapshot.version || current.title !== snapshot.title) {
      setSaveState("conflict");
      setError("서버 작업을 저장했습니다. 작업 중 바뀐 캔버스는 내보낸 뒤 프로젝트를 다시 열어 주세요.");
      return false;
    }
    if (next.graph.nodes.length !== current.graph.nodes.length || next.graph.edges.length !== current.graph.edges.length)
      rememberGraph(current.graph);
    boardMenuRef.current?.queueLayout(current.graph, next.graph);
    replaceProject(next);
    setSaveState("saved");
    return true;
  }

  async function changeClassification(action: ClassificationAction) {
    if (action.method !== "POST" && !(await save()))
      throw new Error("현재 프로젝트를 저장한 뒤 다시 시도해 주세요.");
    const current = projectRef.current;
    const atRevision = revision.current;
    const { method, ...body } = action;
    const { classifications: next } = await request<{ classifications: ProjectClassification[] }>(
      "/api/projects/classifications", { ...json(body), method },
    );
    classificationReadVersion.current += 1;
    setClassifications(next);
    setClassificationsError("");
    setClassificationsLoading(false);
    if (method === "POST") return;
    await Promise.all([
      request<{ projects: ProjectSummary[] }>("/api/projects").then((result) => setProjects(result.projects)),
      current ? request<{ project: Project }>(`/api/projects/${current.id}`).then(({ project: updated }) => {
        if (projectRef.current === current && revision.current === atRevision && updated.version > current.version)
          replaceProject(updated);
      }) : Promise.resolve(),
    ]).catch(() => setError("분류는 변경됐습니다. 프로젝트 목록을 다시 열어 최신 상태를 확인해 주세요."));
  }

  async function manageProject(summary: ProjectSummary, action: ProjectAction) {
    const current = projectRef.current;
    const isCurrent = current?.id === summary.id;
    const wasPending = revision.current !== savedRevision.current;
    if (isCurrent && !(await save())) throw new Error("현재 작업을 저장한 뒤 다시 시도해 주세요.");
    const version = isCurrent && wasPending ? projectRef.current?.version ?? summary.version : summary.version;
    try {
      const { project: next } = await request<{ project: Project }>(`/api/projects/${summary.id}`, {
        ...json({ action: action.action, version, ...(action.action === "metadata" ? action.settings : {}) }),
        method: "PATCH",
      });
      setProjects((list) => updateProjectList(list, next));
      if (action.action === "metadata" || action.action === "duplicate") void refreshClassifications();
      if (projectRef.current?.id === next.id) {
        if (next.archivedAt || next.deletedAt) {
          activateProject(null);
          updateProjectLink();
        } else {
          const local = projectRef.current;
          replaceProject(revision.current === savedRevision.current ? next : { ...next, graph: local.graph });
        }
      }
    } catch (cause) {
      if ((cause as { status?: number }).status === 409) {
        const refreshed = await request<{ projects: ProjectSummary[] }>("/api/projects");
        setProjects(refreshed.projects);
        void refreshClassifications();
        throw new Error("프로젝트나 분류가 변경됐습니다. 최신 목록에서 다시 선택해 주세요.");
      }
      throw cause;
    }
  }

  function addNode(kind: Kind, template?: { title: string; body: string; guidance?: CanvasNode["guidance"] }) {
    if (
      projectRef.current &&
      projectRef.current.graph.nodes.length >= nodeLimit
    ) {
      setError(`한 프로젝트에는 노드를 ${nodeLimit}개까지 추가할 수 있습니다.`);
      return;
    }
    const id = crypto.randomUUID();
    edit((current) => ({
      ...current,
      graph: {
        ...current.graph,
        nodes: [
          ...current.graph.nodes,
          {
            id,
            kind,
            title: template?.title ?? kindLabels[kind],
            body: template?.body ?? "",
            ...(template?.guidance ? { guidance: template.guidance } : {}),
            x: 120 + (current.graph.nodes.length % 3) * 320,
            y: 100 + Math.floor(current.graph.nodes.length / 3) * 220,
          },
        ],
      },
    }));
    if (projectRef.current)
      window.localStorage.setItem(
        `scene-room-node-${projectRef.current.id}`,
        id,
      );
    setSelected(id);
    setWorkOperation(nodeOperations(kind)[0]);
    setTab("node");
    openPanel();
  }
  function selectBoardNode(id: string | null, fromSidebar = false) {
    const current = projectRef.current;
    if (!current) return;
    const item = current.graph.nodes.find((entry) => entry.id === id);
    if (id && !item) return;
    if (id !== selected) {
      if (item) setWorkOperation(nodeOperations(item.kind)[0]);
      setSceneReview(false);
    }
    setSelected(id);
    const imageEdit = item?.imageEdit;
    const imageOperation = item?.imageOperation;
    if (imageOperation && item) {
      const original = current.graph.nodes.find((entry) => entry.id === imageOperation.sourceId);
      if (original?.asset?.url === imageOperation.sourceAsset.url) {
        setImageAction({
          kind: imageOperation.kind, projectId: current.id, sourceId: original.id,
          asset: imageOperation.sourceAsset, title: original.title, targetId: item.id,
        });
      } else {
        setImageAction(null);
      }
    } else {
      setImageAction((previous) => previous?.targetId === id ? previous : null);
    }
    setImageEditTarget((current) => imageEdit && item
      ? { sourceId: imageEdit.sourceNodeId, editId: item.id }
      : current?.sourceId === id && !current.editId ? current : null);
    const key = `scene-room-node-${current.id}`;
    if (id) window.localStorage.setItem(key, id);
    else window.localStorage.removeItem(key);
    if (!item) return;
    if (fromSidebar) setFocusNode({ id: item.id, x: item.x, y: item.y });
    setTab("node");
    if (imageEdit || imageOperation || (item.asset?.type === "image" && !fromSidebar && window.matchMedia("(max-width: 767px)").matches)) setPanelOpen(false);
    else openPanel();
  }

  function openVideo(sourceId: string) {
    const current = projectRef.current;
    const source = current?.graph.nodes.find((item) => item.id === sourceId);
    if (!current || !source) return;
    try {
      const { graph, id } = prepareProductionVideo(current.graph, source, {
        id: crypto.randomUUID(), position: positionBeside(current.graph, source, "output"),
      });
      if (graph !== current.graph) edit((value) => ({ ...value, graph }));
      selectBoardNode(id, true);
      setSceneReview(false);
      setWorkOperation("video");
      setMention(null);
      setTab("agent");
      openPanel();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  function openImageGeneration() {
    setWorkOperation("image");
    setMention(null);
    setTab("agent");
    openPanel();
  }
  function openNodeDirector(id: string, trigger: HTMLButtonElement) {
    if (projectRef.current) setDirectorTarget({ projectId: projectRef.current.id, nodeId: id, trigger });
  }

  function insertMentionMarker() {
    const field = promptRef.current;
    const start = field?.selectionStart ?? prompt.length;
    const end = field?.selectionEnd ?? start;
    const lead = `${prompt.slice(0, start)}${start > 0 && !/\s/.test(prompt[start - 1]) ? " " : ""}@`;
    const value = `${lead}${prompt.slice(end)}`;
    if (value.length > 12000) {
      setError("요청 내용은 12,000자 이내여야 합니다.");
      return;
    }
    setPrompt(value);
    updateMention(value, lead.length);
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(lead.length, lead.length);
    });
  }

  function connectPort(kind?: Kind, existingId?: string) {
    const current = projectRef.current;
    const anchor = current?.graph.nodes.find((item) => item.id === port?.id);
    if (!current || !port || !anchor) throw new Error("연결할 노드를 다시 선택해 주세요.");
    const id = kind ? crypto.randomUUID() : existingId;
    if (!id) throw new Error("추가하거나 연결할 노드를 선택해 주세요.");
    const position = positionBeside(current.graph, anchor, port.direction);
    const nodes = kind ? [...current.graph.nodes, { id, kind, title: kindLabels[kind], body: "", ...position }] : current.graph.nodes;
    const otherKind = kind ?? nodes.find((item) => item.id === id)?.kind;
    const edge: GraphEdge = port.direction === "input"
      ? { source: id, target: anchor.id, usage: "input", ...defaultCharacterReference(otherKind, anchor.kind) }
      : { source: anchor.id, target: id, usage: "input", ...defaultCharacterReference(anchor.kind, otherKind),
        ...(kind === "video" && anchor.asset?.type === "image" ? { role: "start" } : {}) };
    const graph = { nodes, edges: [...current.graph.edges, edge] };
    if (!validateGraph(graph)) throw new Error("중복·순환 연결 또는 노드·연결 한도를 확인해 주세요.");
    edit((value) => ({ ...value, graph }));
    setPort(null);
    if (kind) selectBoardNode(id, true);
  }

  function openImageEdit(source: CanvasNode, editId?: string) {
    setPort(null);
    selectBoardNode(editId ?? source.id);
    setImageEditTarget({ sourceId: (editId && node?.imageEdit?.sourceNodeId) || source.id, editId });
    if (!editId) openPanel();
  }

  const openNodePreview = useCallback((id: string, trigger?: HTMLElement, editingPrompt = false) => {
    setPreviewTarget({ id, trigger, editingPrompt });
  }, []);

  async function applyNodePrompt(id: string, versions: PromptVersions, baseline: PromptVersions) {
    const current = projectRef.current;
    const node = current?.id === project?.id ? current?.graph.nodes.find((item) => item.id === id) : undefined;
    if (!node || !isPromptNode(node)) throw new Error("편집할 프롬프트를 다시 열어 주세요.");
    if (node.body !== versions.body || node.promptKorean?.text !== versions.promptKorean?.text) {
      if (node.body !== baseline.body || node.promptKorean?.text !== baseline.promptKorean?.text) {
        throw new Error("다른 곳에서 프롬프트가 바뀌었습니다. 최신 버전을 다시 열어 주세요.");
      }
      edit((before) => ({ ...before, graph: {
        ...before.graph,
        nodes: before.graph.nodes.map((item) => item.id === id ? { ...item, ...versions } : item),
      } }));
    }
    if (!(await save())) throw new Error("캔버스에 두 버전을 반영했습니다. 저장하려면 다시 적용해 주세요.");
  }

  async function saveNodeDocument(id: string, draft: NodeDocument, baseline: NodeDocument) {
    const target = projectRef.current?.id === project?.id
      ? projectRef.current?.graph.nodes.find((node) => node.id === id) : undefined;
    if (!target || !isDocumentNode(target)) throw new Error("편집할 문서를 다시 열어 주세요.");
    if (target.title !== draft.title || target.body !== draft.body) {
      if (target.title !== baseline.title || target.body !== baseline.body) {
        throw new Error("캔버스에서 문서가 바뀌었습니다. 최신 문서를 열어 확인해 주세요.");
      }
      edit((current) => ({ ...current, graph: {
        ...current.graph,
        nodes: current.graph.nodes.map((node) => node.id === id ? { ...node, ...draft } : node),
      } }));
    }
    if (!(await save())) throw new Error("캔버스에 반영했습니다. 문서를 저장하려면 다시 시도해 주세요.");
  }

  function closeImageEditor() {
    setImageEditTarget(null);
    setImageAction(null);
    if (selected) requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`.canvas-board .react-flow__node[data-id="${CSS.escape(selected)}"]`)?.focus({ preventScroll: true });
    });
  }

  function imageActionSource(action: SelectedImageAction) {
    const current = projectRef.current;
    const original = current?.graph.nodes.find(({ id }) => id === action.sourceId);
    if (!current || current.id !== action.projectId || original?.asset?.url !== action.asset.url)
      throw new Error("원본 이미지 또는 프로젝트가 바뀌었습니다. 다시 열어 주세요.");
    return { current, original };
  }

  async function openImageAction(original: CanvasNode, kind: ImageOperation) {
    try {
      const current = projectRef.current;
      if (!current || original.asset?.type !== "image") return;
      if (kind === "download") {
        const link = document.createElement("a");
        link.href = original.asset.url;
        link.download = original.asset.name;
        link.click();
        return;
      }
      const targetId = crypto.randomUUID();
      const action = { kind, projectId: current.id, sourceId: original.id, asset: original.asset, title: original.title, targetId };
      if (kind === "upscale" || kind === "rotate") {
        const draft: CanvasNode = {
          id: targetId, kind: "keyframe", title: localImageTitle(original.title, imageOperationLabels[kind]), body: "",
          ...positionBeside(current.graph, original, "output"),
          imageOperation: { kind, sourceId: original.id, sourceAsset: original.asset },
        };
        const graph: Graph = {
          nodes: [...current.graph.nodes, draft],
          edges: [...current.graph.edges, { source: original.id, target: targetId, role: "identity" }],
        };
        if (!validateGraph(graph)) throw new Error("편집 노드를 추가할 수 없습니다. 보드 한도를 확인해 주세요.");
        edit((value) => ({ ...value, graph }));
        selectBoardNode(targetId, true);
      } else {
        if (kind === "layers" && !(await save())) return;
        imageActionSource(action);
        selectBoardNode(original.id);
      }
      setImageEditTarget(null);
      setImageAction(action);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function uploadImageOutput(file: File) {
    const body = new FormData();
    body.append("file", file);
    const { asset } = await request<{ asset: Asset }>("/api/assets", { method: "POST", body });
    if (asset.type !== "image") throw new Error("이미지 파일을 저장하지 못했습니다.");
    return asset;
  }

  async function saveImageOutput(action: SelectedImageAction, file: File, settings?: RotationOptions | UpscaleSettings) {
    imageActionSource(action);
    const asset = await uploadImageOutput(file);
    const { current, original } = imageActionSource(action);
    const existing = current.graph.nodes.find(({ id }) => id === action.targetId);
    if ((action.kind === "upscale" || action.kind === "rotate") &&
      existing?.imageOperation?.kind !== action.kind) throw new Error("편집 노드를 찾을 수 없습니다.");
    let output: CanvasNode;
    let edges = current.graph.edges;
    if (existing) {
      output = { ...existing, asset, portraitGrid: undefined, gridCell: undefined };
      if (output.imageOperation?.kind === "rotate" && settings && "angle" in settings)
        output.imageOperation = { ...output.imageOperation, settings };
      if (output.imageOperation?.kind === "upscale" && settings && "scale" in settings)
        output.imageOperation = { ...output.imageOperation, settings };
    } else {
      output = {
        id: action.targetId, kind: "keyframe", title: localImageTitle(original.title, "주석"), body: "", asset,
        ...positionBeside(current.graph, original, "output"),
      };
      edges = [...edges, { source: original.id, target: output.id, role: "identity" }];
    }
    const nodes = existing
      ? current.graph.nodes.map((item) => item.id === output.id ? output : item)
      : [...current.graph.nodes, output];
    const graph = { nodes, edges };
    if (!validateGraph(graph)) throw new Error("이미지 결과를 연결할 수 없습니다. 보드 한도를 확인해 주세요.");
    edit((value) => ({ ...value, graph }));
    if (!(await save()) || projectRef.current?.id !== current.id) return false;
    selectBoardNode(output.id, true);
    setImageAction(null);
    return true;
  }

  async function saveImageLayers(action: SelectedImageAction, layers: { label: string; file?: File; asset?: Asset }[], description: string) {
    const { current: before } = imageActionSource(action);
    const ids = layers.map((_, index) => `${action.targetId}-${index + 1}`);
    if (before.graph.nodes.filter(({ id }) => !ids.includes(id)).length + ids.length > nodeLimit)
      throw new Error("레이어를 연결할 공간이 부족합니다.");
    const outputs: Asset[] = [];
    for (const layer of layers) {
      const asset = layer.asset ?? (layer.file && await uploadImageOutput(layer.file));
      if (!asset || asset.type !== "image") throw new Error("레이어 파일을 저장하지 못했습니다.");
      outputs.push(asset);
    }
    const { current, original } = imageActionSource(action);
    const nodes = current.graph.nodes.filter(({ id }) => !ids.includes(id));
    const edges = current.graph.edges.filter(({ source, target }) => source !== original.id || !ids.includes(target));
    const group = action.targetId;
    layers.forEach((layer, index) => {
      nodes.push({
        id: ids[index], kind: "keyframe", title: localImageTitle(original.title, layer.label), body: description,
        asset: outputs[index], group, ...positionBeside({ nodes, edges }, original, "output"),
      });
      edges.push({ source: original.id, target: ids[index], role: "identity" });
    });
    const graph = { nodes, edges };
    if (!validateGraph(graph)) throw new Error("레이어를 연결할 수 없습니다. 보드 한도를 확인해 주세요.");
    edit((value) => ({ ...value, graph }));
    if (!(await save()) || projectRef.current?.id !== current.id) return false;
    selectBoardNode(ids[0], true);
    setImageAction(null);
    return true;
  }

  function addImageEdit(kind: ImageEditKind, basis?: CanvasNode, original?: CanvasNode) {
    const current = projectRef.current;
    const existing = basis?.imageEdit;
    const sourceId = existing?.sourceNodeId ?? original?.id ?? imageEditTarget?.sourceId;
    const source = current?.graph.nodes.find((item) => item.id === sourceId);
    const sourceAsset = existing ? existing.sourceAsset : original?.asset ?? editSource?.asset;
    if (!current || !source || !sourceAsset || source.asset?.url !== sourceAsset.url)
      throw new Error("원본 이미지가 바뀌었습니다. 다시 선택해 주세요.");
    const { node: next, edge } = createImageEditNode(source, kind, existing?.instruction ?? imageEditTemplateInstruction(kind), crypto.randomUUID());
    if (next.imageEdit && existing?.settings) next.imageEdit.settings = structuredClone(existing.settings);
    const graph = {
      nodes: [...current.graph.nodes, { ...next, ...positionBeside(current.graph, source, "output") }],
      edges: [...current.graph.edges, edge],
    };
    if (!validateGraph(graph)) throw new Error("편집 노드를 추가할 공간이 부족합니다.");
    edit((value) => ({ ...value, graph }));
    setImageEditTarget({ sourceId: source.id, editId: next.id });
    selectBoardNode(next.id, true);
    setWorkOperation("image");
  }
  async function saveImageDirection(instruction: string, settings: ImageEditSettings) {
    const current = projectRef.current?.graph.nodes.find((item) => item.id === imageEditTarget?.editId);
    if (!current?.imageEdit || current.id !== node?.id || current.imageEdit.kind !== settings.kind)
      throw new Error("설정할 연출 노드를 다시 선택해 주세요.");
    if (current.imageEdit.instruction !== instruction ||
      JSON.stringify(current.imageEdit.settings) !== JSON.stringify(settings)) {
      updateNode({ body: instruction, imageEdit: { ...current.imageEdit, version: 1, instruction, settings } });
    }
    return save();
  }
  function bindImageEditSourceAsset(asset: Asset) {
    if (!node?.imageEdit) return;
    const { settings } = node.imageEdit;
    updateNode({ imageEdit: { ...node.imageEdit, sourceAsset: asset,
      settings: settings?.kind === "emotion" ? { ...settings, face: undefined } : settings,
    } });
  }
  function addImageLookReference(source: string) {
    const current = projectRef.current;
    if (!current || !node?.imageEdit || !source) return;
    if (!canConnect(current.graph, source, node.id)) {
      setError("이미 연결됐거나 순환하는 참조 이미지입니다.");
      return;
    }
    edit((value) => ({ ...value, graph: { ...value.graph,
      edges: [...value.graph.edges, { source, target: node.id, role: "look", usage: "input" }],
    } }));
  }
  async function connectStoryboardVideo(sheetId: string, cutIds: string[], config: PortraitGridConfig) {
    const current = projectRef.current;
    const sheet = current?.graph.nodes.find((item) => item.id === sheetId);
    if (!current || !sheet) throw new Error("스토리보드 시트를 다시 선택해 주세요.");
    const id = crypto.randomUUID();
    const last = current.graph.nodes.filter((item) => cutIds.includes(item.id))
      .reduce((right, item) => item.x > right.x ? item : right, sheet);
    const graph = addStoryboardVideo(current.graph, sheetId, cutIds, config, {
      id, position: positionBeside(current.graph, last, "output"),
    });
    edit((value) => ({ ...value, graph }));
    if (!(await save()) || projectRef.current?.id !== current.id)
      throw new Error("영상 연결을 저장하지 못했습니다. 프로젝트 저장 상태를 확인해 주세요.");
    setGridNodeId(null);
    openVideo(id);
  }
  async function openTool(next: Exclude<typeof tool, null> | "tts-sample", trigger?: HTMLElement) {
    if (next === "tts-sample") {
      if (project) setTtsSampleTarget({ projectId: project.id,
        ...(node?.kind === "character" ? { characterId: node.id } : {}), trigger });
      return;
    }
    setLinkedAnalysis(undefined);
    const id = projectRef.current?.id;
    if ((next === "clip" || next === "motion" || next === "blender") && (!(await save()) || projectRef.current?.id !== id)) return;
    if (next === "blender") {
      const id = node?.kind === "shot" ? node.id : undefined;
      setBlenderEditId(id);
      blenderDraftId.current = id;
      pendingTimeline.current = undefined;
    }
    if (next === "motion") setMotionEditId(null);
    if (next === "contest") setContestPrefill(null);
    if (next === "assets") {
      setLibrarySource("all");
      libraryPoint.current = undefined;
    }
    setMobileSidebar(false);
    setTool(next);
  }

  async function saveBoardAsset(nodeId: string) {
    const owner = projectRef.current?.id;
    if (!owner || !(await save()) || projectRef.current?.id !== owner)
      throw new Error("현재 프로젝트를 저장한 뒤 자산을 다시 선택해 주세요.");
    await request<{ item: LibraryItem }>("/api/saved-assets", json({ projectId: owner, nodeId }));
  }
  function openDirector(prefill?: string) {
    setSelected(null);
    setSceneReview(false);
    setPlanMode("director");
    if (prefill !== undefined) setGeneralPrompt(prefill);
    setTab("agent");
    openPanel();
  }
  function changeDirector(next: DirectorOptions) {
    const id = projectRef.current?.id;
    setDirector(next);
    if (!id) return;
    try {
      if (next.stylePreset || next.skillIds !== undefined) window.localStorage.setItem(`scene-room-direction:${id}`, JSON.stringify(next));
      else window.localStorage.removeItem(`scene-room-direction:${id}`);
    } catch { /* 현재 창의 선택과 Neon 보관함은 계속 사용할 수 있다. */ }
  }
  function applyProductionStyle(draft: StylePresetDraft, count: number, mode: "board" | "director", reference?: AttachmentRecord, useContest = false) {
    const current = projectRef.current;
    const profile = productionProfiles.find((entry) => entry.id === draft.profileId);
    if (!current || current.id !== project?.id || !profile) return;
    if (mode === "board") {
      try {
        const addition = makeStyleGraph(draft, count);
        if (useContest && contest) {
          const requirements = addition.nodes.find((entry) => entry.kind === "brief");
          if (requirements) {
            addition.nodes.push({ id: "entry-rules", kind: "brief", title: "출품 요강 · " + contest.title.slice(0, 95),
              body: contestRequirements(contest), x: -720, y: 0 });
            addition.edges.push({ source: "entry-rules", target: requirements.id, role: "context", usage: "input" });
          }
        }
        const source = addition.nodes.find((item) => item.id === "style-reference");
        if (source && reference?.projectId === current.id && reference.asset?.type === "video") {
          source.asset = reference.asset;
          source.body = [reference.name, reference.url, reference.text].filter(Boolean).join("\n\n").slice(0, 24000);
        }
        const graph = addProductionGraph(current.graph, addition);
        edit((value) => ({ ...value, graph }));
        const first = graph.nodes.slice(current.graph.nodes.length).find((item) => item.kind === "brief");
        if (first) selectBoardNode(first.id, true);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "기본 노드를 추가하지 못했습니다.");
        return;
      }
    }
    changeDirector({ ...director, format: profile.format, sceneCount: count, stylePreset: draft });
    if (!useContest) setContest(null);
    setTool(null);
    if (mode === "director") openDirector(draft.concept);
  }
  function updateNode(patch: Partial<CanvasNode>) {
    if (!node) return;
    edit(
      (current) => ({
        ...current,
        graph: {
          ...current.graph,
          nodes: current.graph.nodes.map((item) =>
            item.id === node.id ? { ...item, ...patch } : item,
          ),
        },
      }),
      Object.keys(patch).length === 1 && ("body" in patch || "title" in patch)
        ? `${node.id}:${Object.keys(patch)[0]}`
        : undefined,
    );
  }
  function connectInput(source: string) {
    if (
      !node ||
      !project ||
      !source ||
      !canConnect(project.graph, source, node.id)
    )
      return;
    edit((current) => ({
      ...current,
      graph: {
        ...current.graph,
        edges: [...current.graph.edges, { source, target: node.id,
          ...defaultCharacterReference(current.graph.nodes.find((item) => item.id === source)?.kind, node.kind) }],
      },
    }));
  }
  function connectVoiceActor(source: string) {
    if (!node || node.kind !== "audioCue" || !projectRef.current) return;
    const graph = projectRef.current.graph;
    const previous = new Set(characterInputs(graph, node.id).map((actor) => actor.id));
    const edges = graph.edges.filter((edge) => edge.target !== node.id ||
      (edge.source !== source && !(edge.role === "identity" && edge.usage !== "guide" && previous.has(edge.source))));
    if (source) edges.push({ source, target: node.id, role: "identity", usage: "input" });
    const next = { ...graph, edges };
    if (!validateGraph(next)) {
      setError("이 캐릭터를 연결하면 순환이 생기거나 연결 한도를 넘습니다.");
      return;
    }
    edit((current) => ({ ...current, graph: next }));
  }
  async function prepareCharacterIdentity(projectId: string, nodeId: string) {
    if (projectRef.current?.id !== projectId || !(await save()) || projectRef.current?.id !== projectId ||
        !projectRef.current.graph.nodes.some((item) => item.id === nodeId && item.kind === "character"))
      throw new Error("현재 프로젝트에서 캐릭터 시트를 저장한 뒤 다시 시도해 주세요.");
  }
  async function saveCharacterIdentity(projectId: string, nodeId: string, characterIdentity: CharacterIdentity) {
    const current = projectRef.current;
    if (current?.id !== projectId || !current.graph.nodes.some((item) => item.id === nodeId && item.kind === "character"))
      throw new Error("설정을 적용할 캐릭터 시트를 다시 열어 주세요.");
    edit((value) => ({ ...value, graph: { ...value.graph, nodes: value.graph.nodes.map((item) =>
      item.id === nodeId ? { ...item, characterIdentity: Object.keys(characterIdentity).length ? characterIdentity : undefined } : item) } }));
    if (!(await save())) throw new Error("설정을 캔버스에 반영했습니다. 저장 상태를 확인해 주세요.");
  }
  async function applyTtsSample(projectId: string, nodeId: string, asset: Asset) {
    const current = projectRef.current;
    const character = current?.id === projectId
      ? current.graph.nodes.find((item) => item.id === nodeId && item.kind === "character") : undefined;
    if (!character || asset.type !== "audio") throw new Error("샘플을 추가할 캐릭터와 음성을 확인해 주세요.");
    await saveCharacterIdentity(projectId, nodeId, { ...character.characterIdentity, voiceSample: asset });
  }
  async function applyTtsAudio(projectId: string, sourceId: string, asset: Asset, text: string) {
    const current = projectRef.current;
    const source = current?.id === projectId ? current.graph.nodes.find((item) => item.id === sourceId) : undefined;
    if (!current || !source || asset.type !== "audio" || !["script", "scenario", "audioCue"].includes(source.kind))
      throw new Error("음성을 적용할 대본이나 음향 큐를 다시 열어 주세요.");
    const graph = current.graph;
    const existing = source.kind === "audioCue" ? source : graph.nodes.find((item) =>
      item.kind === "audioCue" && item.asset?.url === asset.url &&
      graph.edges.some((edge) => edge.source === source.id && edge.target === item.id));
    const cue = existing ?? {
      kind: "audioCue" as const, id: crypto.randomUUID(),
      title: `${source.title || "대본"} · 음성`.slice(0, 160),
      body: text, ...positionBeside(graph, source, "output"), asset,
    };
    const next = existing
      ? { ...graph, nodes: graph.nodes.map((item) => item.id === cue.id ? { ...item, asset } : item) }
      : { nodes: [...graph.nodes, cue], edges: [...graph.edges, { source: source.id, target: cue.id, usage: "guide" as const }] };
    if (!validateGraph(next)) throw new Error("음향 큐를 추가하려면 프로젝트의 노드 한도를 확인해 주세요.");
    if (!existing || existing.asset?.url !== asset.url) edit((value) => ({ ...value, graph: next }));
    if (!(await save())) throw new Error("음성을 캔버스에 반영했습니다. 저장 상태를 확인해 주세요.");
  }
  function openSoulPortrait() {
    const soul = readyCharacterSoul(node ?? undefined);
    if (!soul || !project || !node) return;
    const key = `${project.id}:${node.id}:image:work`;
    setMediaPrompts((current) => current[key] === undefined
      ? { ...current, [key]: "캐릭터 시트의 외형을 담은 기준 인물 사진을 만들어 주세요." } : current);
    selectChoice("higgsfield", soulModels[soul.variant], undefined, "image");
    setWorkOperation("image");
    setTab("agent");
  }
  function disconnectInput(source: string) {
    if (!node) return;
    edit((current) => ({
      ...current,
      graph: {
        ...current.graph,
        edges: current.graph.edges.filter(
          (edge) => !(edge.source === source && edge.target === node.id),
        ),
      },
    }));
  }
  function updateInput(source: string, patch: Partial<GraphEdge>) {
    if (!node || !projectRef.current) return;
    const current = projectRef.current;
    const graph = {
      ...current.graph,
      edges: current.graph.edges.map((edge) =>
        edge.source === source && edge.target === node.id
          ? { ...edge, ...patch }
          : edge,
      ),
    };
    if (!validateGraph(graph)) {
      setError(
        "선택한 참조 역할은 이 자료의 유형과 맞지 않습니다. 동작에는 영상, 인물·장소·소품·시작·끝 프레임에는 이미지 자료를 사용해 주세요.",
      );
      return;
    }
    edit((current) => ({ ...current, graph }));
  }
  function removeNode() {
    if (!node || !confirm(`‘${node.title}’ 노드와 연결을 삭제할까요?`)) return;
    edit((current) => ({
      ...current,
      graph: removeBoardItems(current.graph, [node.id], new Set()),
    }));
    setSelected(null);
    setTab("agent");
  }
  function applyLibraryItem(
    item: LibraryItem,
    usage: "copy" | "input" | "guide",
    point?: BoardPoint,
  ) {
    const current = projectRef.current;
    if (!current) return;
    const target =
      selected && current.graph.nodes.find((node) => node.id === selected);
    if (usage !== "copy" && !target) {
      setError("참조를 연결할 노드를 먼저 선택해 주세요.");
      return;
    }
    let graph = current.graph;
    let source = item.sourceNodeId;
    if (usage === "copy" || !source) {
      const id = crypto.randomUUID();
      const kind: Kind =
        item.asset?.type === "video"
          ? "referenceVideo"
          : item.asset?.type === "audio"
            ? "audioCue"
            : item.asset
              ? "referenceImage"
              : "note";
      graph = {
        ...graph,
        nodes: [
          ...graph.nodes,
          {
            id,
            kind,
            title: item.title || item.asset?.name || "텍스트",
            body: item.body,
            x: point?.x ?? 120 + (graph.nodes.length % 3) * 320,
            y: point?.y ?? 100 + Math.floor(graph.nodes.length / 3) * 220,
            ...(item.asset ? { asset: item.asset } : {}),
          },
        ],
      };
      source = id;
    }
    if (usage !== "copy" && target)
      graph = {
        ...graph,
        edges: [...graph.edges, { source: source!, target: target.id, usage }],
      };
    if (!validateGraph(graph)) {
      setError("노드 수, 기존 연결과 순환 여부를 확인해 주세요.");
      return;
    }
    edit((value) => ({ ...value, graph }));
  }
  async function importFiles(files: File[], point?: BoardPoint) {
    const projectId = projectRef.current?.id;
    if (!projectId) throw new Error("프로젝트를 먼저 열어 주세요.");
    for (const [index, file] of files.entries()) {
      if (projectRef.current?.id !== projectId)
        throw new Error(
          "프로젝트가 바뀌어 나머지 파일 가져오기를 중단했습니다.",
        );
      if (file.size > 64 * 1024 * 1024)
        throw new Error(`${file.name} 파일이 64 MiB를 초과합니다.`);
      if ((projectRef.current?.graph.nodes.length ?? 0) >= nodeLimit)
        throw new Error(`한 프로젝트에는 노드를 ${nodeLimit}개까지 추가할 수 있습니다.`);
      const isText =
        /\.(txt|md)$/i.test(file.name) ||
        file.type === "text/plain" ||
        file.type === "text/markdown";
      let asset: Asset | undefined;
      let body = "";
      let kind: Kind = "note";
      if (isText) {
        if (file.size > 100_000)
          throw new Error(`${file.name} 텍스트가 너무 깁니다.`);
        body = await file.text();
        if (body.length > 24_000)
          throw new Error(`${file.name} 내용은 24,000자 이하여야 합니다.`);
      } else {
        const form = new FormData();
        form.append("file", file);
        const result = await request<{ asset: Asset }>("/api/assets", {
          method: "POST",
          body: form,
        });
        asset = result.asset;
        kind =
          asset.type === "video"
            ? "referenceVideo"
            : asset.type === "audio"
              ? "audioCue"
              : "referenceImage";
      }
      const current: Project | null = projectRef.current;
      if (!current || current.id !== projectId)
        throw new Error("프로젝트가 바뀌어 파일을 연결하지 못했습니다.");
      const graph: Graph = {
        ...current.graph,
        nodes: [
          ...current.graph.nodes,
          {
            id: crypto.randomUUID(),
            kind,
            title: file.name.slice(0, 160),
            body,
            x: point ? point.x + (index % 3) * 320 : 120 + (current.graph.nodes.length % 3) * 320,
            y: point ? point.y + Math.floor(index / 3) * 220 : 100 + Math.floor(current.graph.nodes.length / 3) * 220,
            ...(asset ? { asset } : {}),
          },
        ],
      };
      if (!validateGraph(graph))
        throw new Error("노드 수 또는 파일 형식을 확인해 주세요.");
      edit((value) => ({ ...value, graph }));
    }
  }
  async function upload(file: File): Promise<boolean> {
    if (!node || !project) return false;
    const mediaType = expectedAssetType(node.kind);
    const fileMatches =
      file.type.startsWith(`${mediaType}/`) ||
      (!file.type &&
        (mediaType === "audio"
          ? /\.(wav|mp3)$/i
          : mediaType === "video"
            ? /\.(mp4|webm)$/i
            : /\.(png|jpe?g|webp)$/i
        ).test(file.name));
    if (!fileMatches) {
      setError(
        mediaType === "video"
          ? "영상 파일을 선택해 주세요."
          : mediaType === "audio"
            ? "오디오 파일을 선택해 주세요."
            : "이미지 파일을 선택해 주세요.",
      );
      return false;
    }
    const nodeId = node.id;
    const projectId = project.id;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await request<{ asset: Asset }>("/api/assets", {
        method: "POST",
        body: form,
      });
      if (projectRef.current?.id !== projectId) {
        setError(
          "업로드가 완료됐습니다. 원래 프로젝트를 열고 파일을 다시 첨부해 주세요.",
        );
        return false;
      }
      if (!projectRef.current.graph.nodes.some((item) => item.id === nodeId)) {
        setError("파일을 연결할 노드를 찾을 수 없습니다.");
        return false;
      }
      edit((current) => ({
        ...current,
        graph: {
          ...current.graph,
          nodes: current.graph.nodes.map((item) =>
            item.id === nodeId ? { ...item, asset: result.asset, portraitGrid: undefined, gridCell: undefined } : item,
          ),
        },
      }));
      return true;
    } catch (cause) {
      setError((cause as Error).message);
      return false;
    } finally {
      setUploading(false);
    }
  }
  const estimateKey = JSON.stringify([
    project?.id,
    project?.version,
    node?.id || null,
    activeProvider?.id,
    model,
    operation,
    submittedPrompt,
    attachmentIds,
    mediaProvider ? effectiveMediaSelection : null,
    imageOutput,
  ]);
  async function attachContestUrlAsLink() {
    if (
      !project ||
      !contestFromPrompt ||
      attachmentBusyRef.current[choiceKey] ||
      linkBusyRef.current[choiceKey]
    )
      return;
    if (attachments.length >= 8) {
      setError("첨부 자료는 최대 8개까지 추가할 수 있습니다.");
      return;
    }
    const originalPrompt = prompt;
    const { url, idea } = contestFromPrompt;
    const projectId = project.id;
    linkBusyRef.current[choiceKey] = true;
    setAttachmentBusyByScope((current) => ({ ...current, [choiceKey]: true }));
    try {
      const result = await request<{ attachment: AttachmentRecord }>(
        `/api/projects/${projectId}/attachments`,
        json({ url }),
      );
      if (!result.attachment || result.attachment.projectId !== projectId)
        throw new Error("첨부 결과를 확인하지 못했습니다.");
      if (projectRef.current?.id !== projectId) return;
      setAttachmentsByScope((current) => ({
        ...current,
        [choiceKey]: [...(current[choiceKey] || []), result.attachment],
      }));
      if (
        scopeRef.current === choiceKey &&
        promptRef.current?.value === originalPrompt
      )
        setPrompt(idea);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "링크를 첨부하지 못했습니다.",
      );
    } finally {
      linkBusyRef.current[choiceKey] = false;
      if (projectRef.current?.id === projectId)
        setAttachmentBusyByScope((current) => ({
          ...current,
          [choiceKey]: !!attachmentBusyRef.current[choiceKey],
        }));
    }
  }
  async function estimateCost() {
    if (
      !project ||
      !activeProvider ||
      !hasRequest ||
      attachmentBusyRef.current[choiceKey] ||
      linkBusyRef.current[choiceKey] ||
      !mediaReady ||
      videoInputError ||
      modelUnavailable ||
      estimating
    )
      return;
    setEstimating(true);
    try {
      if (!(await save())) return;
      const current = projectRef.current!;
      if (current.id !== project.id) {
        setError("프로젝트가 바뀌었습니다. 다시 요청해 주세요.");
        return;
      }
      const key = JSON.stringify([
        current.id,
        current.version,
        node?.id || null,
        activeProvider.id,
        model,
        operation,
        submittedPrompt,
        attachmentIds,
        mediaProvider ? effectiveMediaSelection : null,
        imageOutput,
      ]);
      const result = await request<{
        estimate: string | null;
        reason?: string;
      }>(
        `/api/projects/${current.id}/estimate`,
        json({
          nodeId: node?.id || null,
          provider: activeProvider.id,
          ...(model ? { model } : {}),
          operation,
          prompt: submittedPrompt,
          attachmentIds,
          version: current.version,
          ...(mediaProvider ? { media: effectiveMediaSelection } : {}),
          ...(imageOutput ? { imageOutput } : {}),
        }),
      );
      setEstimate({
        key,
        message:
          result.estimate ||
          result.reason ||
          "예상 사용량을 확인할 수 없습니다.",
      });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setEstimating(false);
    }
  }
  async function runAgent(editRequest?: string) {
    if (attachmentBusyRef.current[choiceKey] || linkBusyRef.current[choiceKey])
      return;
    if (!editRequest && contestFromPrompt && project) {
      setContestPrefill(contestFromPrompt);
      setTool("contest");
      return;
    }
    if (
      !project ||
      !activeProvider ||
      appImageHandoff ||
      !mediaReady ||
      videoInputError ||
      modelUnavailable ||
      (operation === "audio" && !voiceWork && !audioValid) ||
      !hasRequest ||
      invalidSceneCount ||
      attachmentBusy ||
      submitLock.current
    )
      return;
    submitLock.current = true;
    setSubmitting(true);
    try {
      if (!(await save())) return;
      const current = projectRef.current!;
      if (current.id !== project.id) {
        setError("프로젝트가 바뀌었습니다. 다시 요청해 주세요.");
        return;
      }
      const executionPrompt = editRequest ?? submittedPrompt;
      const key = JSON.stringify([
        current.id,
        node?.id || null,
        activeProvider.id,
        model,
        effort,
        operation,
        executionPrompt,
        attachmentIds,
        current.version,
        !node && planMode === "director" ? director : null,
        isReview,
        operation === "audio" && !voiceWork ? audio : null,
        mediaProvider ? effectiveMediaSelection : null,
        imageOutput,
        !node && planMode === "director" ? contest : null,
      ]);
      if (retryRequest.current?.key !== key)
        retryRequest.current = { key, id: crypto.randomUUID() };
      const result = await request<{ run: Run; warning?: string }>(
        `/api/projects/${current.id}/runs`,
        json({
          requestId: retryRequest.current.id,
          nodeId: node?.id || null,
          provider: activeProvider.id,
          ...(model ? { model } : {}),
          ...(effort ? { effort } : {}),
          operation,
          prompt: executionPrompt,
          attachmentIds,
          version: current.version,
          ...(!node && planMode === "director" ? { director } : {}),
          ...(isReview ? { review: true } : {}),
          ...(operation === "audio" && !voiceWork ? { audio } : {}),
          ...(mediaProvider ? { media: effectiveMediaSelection } : {}),
          ...(imageOutput ? { imageOutput } : {}),
          ...(!node && planMode === "director" && contest ? { contest } : {}),
        }),
      );
      retryRequest.current = null;
      if (projectRef.current?.id !== current.id) return;
      rememberRun(result.run, result.warning);
      setAttachmentsByScope((current) => ({
        ...current,
        [choiceKey]: (current[choiceKey] || []).filter(
          (item) => !attachmentIds.includes(item.id),
        ),
      }));
      if (scopeRef.current === choiceKey) {
        if (!mediaWork && !voiceWork) setPrompt("");
        if (!editRequest) setTab("runs");
      }
      return true;
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }
  async function submitPanelText(payload: {
    nodeId: string | null;
    provider: Provider;
    model?: string;
    effort?: AgentEffort;
    prompt: string;
    attachmentIds?: string[];
    guidanceEdit?: true;
    motionDesign?: MotionPlanRequest["motionDesign"];
    presetDesign?: { mode: "analyze" | "recommend"; draft: StylePresetDraft };
    chat?: { threadId: string; nodeIds: string[]; recipeIds: string[]; stylePreset?: StylePresetDraft };
  }) {
    const id = projectRef.current?.id;
    if (!id || submitLock.current)
      throw new Error("다른 요청을 저장하고 있습니다. 잠시 뒤 다시 요청해 주세요.");
    submitLock.current = true;
    setSubmitting(true);
    try {
      if (!(await save())) throw new Error("변경 내용을 저장한 뒤 다시 요청해 주세요.");
      const current = projectRef.current;
      if (!current || current.id !== id)
        throw new Error("프로젝트가 바뀌었습니다. 다시 요청해 주세요.");
      const key = JSON.stringify([id, current.version, payload]);
      if (panelRetry.current?.key !== key)
        panelRetry.current = { key, id: crypto.randomUUID() };
      const { run, warning } = await request<{ run: Run; warning?: string }>(
        `/api/projects/${id}/runs`,
        json({
          ...payload,
          operation: "text",
          requestId: panelRetry.current.id,
          version: current.version,
        }),
      );
      panelRetry.current = null;
      if (projectRef.current?.id === id)
        rememberRun(run, warning);
      return run;
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }
  function applyReview(
    run: Run,
    notes: NonNullable<RunResult["review"]>["notes"],
  ) {
    if (!projectRef.current || run.input.projectId !== projectRef.current.id) {
      setError("현재 프로젝트의 검토 결과만 적용할 수 있습니다.");
      return;
    }
    let graph = projectRef.current.graph;
    try {
      for (const note of notes) graph = applyReviewEdit(graph, run, note);
    } catch {
      setError("노드가 변경됐거나 삭제되어 제안을 적용할 수 없습니다.");
      return;
    }
    edit((current) => ({ ...current, graph }));
  }
  function applyRun(run: Run) {
    if (run.input.chat || run.input.guidanceEdit || run.input.presetDesign || run.input.motionDesign) return;
    if (!run.result || !projectRef.current) return;
    if (run.input.projectId !== projectRef.current.id) {
      setError("현재 프로젝트의 실행 결과만 적용할 수 있습니다.");
      return;
    }
    if (run.result.plan) {
      const plan = run.result.plan;
      const prefix = `plan_${run.id}_`;
      if (
        projectRef.current.graph.nodes.some((item) =>
          item.id.startsWith(prefix),
        )
      ) {
        setError("이미 적용한 기획 결과입니다.");
        return;
      }
      if (
        projectRef.current.graph.nodes.length + plan.nodes.length >
        nodeLimit
      ) {
        setError(
          `한 프로젝트에는 노드를 ${nodeLimit}개까지 추가할 수 있습니다.`,
        );
        return;
      }
      if (!confirm(`생성된 노드 ${plan.nodes.length}개를 캔버스에 추가할까요?`))
        return;
      const ids = new Map(
        plan.nodes.map((item, index) => [item.id, `${prefix}${index}`]),
      );
      const offset = Math.max(
        0,
        ...projectRef.current.graph.nodes.map((item) => item.x + 340),
      );
      const graph = {
        nodes: [
          ...projectRef.current.graph.nodes,
          ...plan.nodes.map((item) => ({
            ...item,
            ...(item.timeline
              ? { timeline: remapTimeline(item.timeline, ids) }
              : {}),
            ...(item.group ? { group: prefix + item.group.slice(0, 42) } : {}),
            id: ids.get(item.id)!,
            x: item.x + offset,
          })),
        ],
        edges: [
          ...projectRef.current.graph.edges,
          ...plan.edges.map((edge) => ({
            ...edge,
            source: ids.get(edge.source)!,
            target: ids.get(edge.target)!,
          })),
        ],
      };
      if (!validateGraph(graph)) {
        setError("제안된 노드와 연결을 현재 캔버스에 추가할 수 없습니다.");
        return;
      }
      edit((current) => ({ ...current, graph }));
    } else if (run.input.nodeId) {
      const target = projectRef.current.graph.nodes.find(
        (item) => item.id === run.input.nodeId,
      );
      if (!target) {
        setError("결과를 적용할 노드를 찾을 수 없습니다.");
        return;
      }
      const original = run.input.target;
      const changed =
        !original ||
        (run.input.imageEdit !== undefined &&
          JSON.stringify(run.input.imageEdit) !== JSON.stringify(target.imageEdit)) ||
        JSON.stringify(original) !==
          JSON.stringify({
            title: target.title,
            body: target.body,
            ...(original && "kind" in original ? { kind: target.kind } : {}),
            ...(target.asset ? { asset: target.asset } : {}),
          });
      const message = changed
        ? `‘${target.title}’의 현재 내용이 바뀌었을 수 있습니다. 실행 결과를 적용할까요?`
        : `‘${target.title}’에 실행 결과를 적용할까요?`;
      if (!confirm(message)) return;
      edit((current) => ({
        ...current,
        graph: {
          ...current.graph,
          nodes: current.graph.nodes.map((item) =>
            item.id === target.id
              ? {
                  ...item,
                  ...(run.result?.text !== undefined
                    ? { body: run.result.text, promptKorean: run.result.promptKorean }
                    : {}),
                  ...(run.result?.asset ? { asset: run.result.asset, portraitGrid: undefined, gridCell: undefined } : {}),
                }
              : item,
          ),
        },
      }));
      setSelected(target.id);
      setTab("node");
    }
  }
  function download() {
    if (!project) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(project, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.title || "project"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function exportVideo(nodeIds: string[]): Promise<Asset> {
    const projectId = project?.id;
    if (!projectId || !(await save()))
      throw new Error("프로젝트를 저장한 뒤 다시 시도해 주세요.");
    const current = projectRef.current;
    if (!current || current.id !== projectId)
      throw new Error("프로젝트가 바뀌었습니다. 다시 선택해 주세요.");
    const response = await request<{ asset: Asset }>(
      `/api/projects/${projectId}/exports`,
      json({ version: current.version, nodeIds }),
    );
    return response.asset;
  }
  const stateLabel = {
    saved: "저장됨",
    pending: "저장 대기",
    saving: "저장 중",
    error: "저장 실패",
    conflict: "저장 충돌",
  }[saveState];

  const previewNode = project?.graph.nodes.find((node) => node.id === previewTarget?.id);
  const ttsNode = project && ttsTarget?.projectId === project.id
    ? project.graph.nodes.find((node) => node.id === ttsTarget.nodeId) : undefined;
  const previewKind = previewNode?.imageEdit ? imageEditKinds[previewNode.imageEdit.kind] :
    previewNode?.imageOperation ? imageOperationLabels[previewNode.imageOperation.kind] :
    previewNode ? kindLabels[previewNode.kind] : "";

  const currentImageAction = imageAction?.projectId === project?.id ? imageAction : null;
  const actionNode = currentImageAction && project?.graph.nodes.find(({ id }) => id === currentImageAction.targetId);
  const draftSettings = actionNode && actionNode.imageOperation;
  const voiceActorPicker = project && node?.kind === "audioCue" && (
    <label className="voice-character-picker">VO 화자
      <select value={voiceActor?.id ?? ""} onChange={(event) => connectVoiceActor(event.target.value)}>
        <option value="">{voiceActors.length > 1 ? "화자 한 명 선택" : "캐릭터 선택"}</option>
        {project.graph.nodes.filter((item) => item.kind === "character").map((item) => (
          <option key={item.id} value={item.id}>{item.title || "캐릭터 시트"}{item.characterIdentity?.voice ? "" : " · 목소리 미등록"}</option>
        ))}
      </select>
    </label>
  );

  const generationActions = (
    <div className="generation-actions">
    {videoWork && videoInputError && <p className="video-input-error" role="status">{videoInputError}</p>}
    {voiceInputError && <p className="footnote" role="status">{voiceInputError}</p>}
    {activeProvider?.available &&
      (activeProvider.id === "higgsfield" || node?.imageEdit) && (
        <>
          <button
            className="outline-button"
            title="선택한 모델과 참조로 예상 사용량을 조회합니다. 조회되지 않는 경우도 있습니다."
            disabled={
              !hasRequest ||
              attachmentBusy ||
              estimating ||
              !mediaReady ||
              !!videoInputError ||
              modelUnavailable ||
              !project
            }
            onClick={() => void estimateCost()}
          >
            {estimating ? "사용량 확인 중" : "예상 사용량 확인"}
          </button>
          {estimate?.key === estimateKey && (
            <p className="estimate-message" role="status">
              {estimate.message}
            </p>
          )}
        </>
      )}
    {node && !mediaWork && (
      <button type="button" className="outline-button"
        title="이 노드의 제작 지침, 스킬과 워크플로우를 봅니다."
        onClick={() => setTab("guidance")}
      ><BookOpen size={16} /> 노드 지침과 워크플로우</button>
    )}
    {!appImageHandoff && (
      <button
        className="run-button studio-action" data-tone="primary"
        title={
          contestFromPrompt
            ? "공모전 요강을 확인하고 편집합니다. 아직 에이전트를 실행하지 않습니다."
            : "고른 계정과 화면에 나온 사용량 조건으로 요청합니다. 결과는 검토한 뒤 적용합니다."
        }
        disabled={
          (!activeProvider?.available && !contestFromPrompt) ||
          appImageHandoff ||
          !mediaReady ||
          !!videoInputError ||
          modelUnavailable ||
          (operation === "audio" && !voiceWork && !audioValid) ||
          !hasRequest ||
          invalidSceneCount ||
          attachmentBusy ||
          submitting ||
          !project
        }
        onClick={() => void runAgent()}
      >
        {submitting ? (
          <LoaderCircle className="spin" size={17} />
        ) : (
          <Send size={17} />
        )}{" "}
        {videoWork ? submitting ? "영상 요청 중" : "영상 생성" : imageWork ? submitting ? "이미지 요청 중" : "이미지 생성" : contestFromPrompt
          ? "공모전 요강 확인"
          : isReview
            ? "대본·연출 검토 요청"
            : node
              ? operation === "text"
                ? "선택한 노드 수정 제안"
                : operation === "audio"
                  ? voiceWork ? "캐릭터 음성 생성" : "음향 생성 요청"
                  : node.imageEdit ? "이미지 편집 요청" : "미디어 생성 요청"
              : planMode === "director"
                ? "감독에게 제작안 요청"
                : "노드 구성 요청"}
      </button>
    )}
    {mediaWork ? <div className="video-next-step">
      <p>완료 후 기록에서 미리보고, 이 노드에 적용하세요.</p>
      {!node?.imageEdit && <button type="button" className="studio-action" data-tone="quiet" data-help="이 노드의 글이나 연출 지시를 작업하는 화면으로 전환합니다." onClick={() => { setWorkOperation("text"); setMention(null); }}>본문 작업</button>}
    </div> : <p className="footnote">요청에는 선택한 서비스의 사용량과 구독 조건이 적용됩니다.</p>}
    </div>
  );

  return (
    <div className="studio">
      {ttsSampleTarget && project?.id === ttsSampleTarget.projectId &&
        <TtsSampleDialog key={project.id} projectId={project.id}
          characters={project.graph.nodes.filter((item) => item.kind === "character")}
          trigger={ttsSampleTarget.trigger} initialCharacterId={ttsSampleTarget.characterId}
          prepareRecommendation={async () => {
            if (!(await save()) || projectRef.current?.id !== project.id) throw new Error("캐릭터 시트를 저장한 뒤 다시 추천을 요청해 주세요.");
          }}
          onApply={(characterId, asset) => applyTtsSample(project.id, characterId, asset)}
          onClose={() => setTtsSampleTarget(null)} />}
      {ttsTarget && ttsNode && <TtsDialog key={`${ttsTarget.projectId}:${ttsNode.id}`}
        projectId={ttsTarget.projectId} node={ttsNode} trigger={ttsTarget.trigger}
        characters={project?.graph.nodes.filter((item) => item.kind === "character") ?? []}
        onApply={(asset, text) => applyTtsAudio(ttsTarget.projectId, ttsNode.id, asset, text)}
        onClose={() => setTtsTarget(null)} />}
      {previewNode && previewTarget && (isDocumentNode(previewNode) ?
        <NodeDocumentDialog key={`${project?.id}:${previewNode.id}`}
          initial={{ title: previewNode.title, body: previewNode.body }} asset={previewNode.asset} kindLabel={previewKind}
          trigger={previewTarget.trigger} onSave={(draft, baseline) => saveNodeDocument(previewNode.id, draft, baseline)}
          onClose={() => setPreviewTarget(null)} /> :
        <NodePreviewDialog key={`${project?.id}:${previewNode.id}`}
          title={previewNode.title} body={previewNode.body} asset={previewNode.asset} kindLabel={previewKind}
          missingAssetType={expectedAssetType(previewNode.kind)} trigger={previewTarget.trigger}
          promptKorean={previewNode.promptKorean} initiallyEditing={previewTarget.editingPrompt}
          onApplyPrompt={isPromptNode(previewNode) ? (next, baseline) => applyNodePrompt(previewNode.id, next, baseline) : undefined}
          onClose={() => setPreviewTarget(null)} />)}
      {currentImageAction?.kind === "preview" && <ImagePreviewDialog key={currentImageAction.targetId}
        asset={currentImageAction.asset} title={currentImageAction.title} onClose={closeImageEditor} />}
      {currentImageAction && (currentImageAction.kind === "annotate" || currentImageAction.kind === "rotate") &&
        <ImageAssetTools key={currentImageAction.targetId} tool={currentImageAction.kind} asset={currentImageAction.asset}
          title={currentImageAction.title} initialRotation={draftSettings && draftSettings.kind === "rotate" ? draftSettings.settings : undefined}
          onClose={closeImageEditor} onSave={(file, rotation) => saveImageOutput(currentImageAction, file, rotation)} />}
      <header className="topbar">
        <div className="brand">
          <BrandMark className="brand-mark" size={30} />
          <span>Omni AI Canvas</span>
        </div>
        <div className="top-divider" />
        <ProjectLibrary projects={projects} currentId={project?.id} title={project?.title}
          classifications={classifications} classificationsLoading={classificationsLoading} classificationsError={classificationsError}
          onTaxonomy={(kind) => {
            setTaxonomyTarget(kind ?? "all");
            void refreshClassifications();
          }}
          settingsId={settingsId} onSettingsClose={() => setSettingsId(null)}
          onOpen={switchProject} onCreate={async () => setProductionDialog({ mode: "create" })} onManage={manageProject}
          onProductionSettings={openProductionSettings} />
        {productionDialog?.mode === "create" && <ProjectStartDialog onCreate={createProject}
          onClose={() => setProductionDialog(null)} />}
        {productionDialog?.mode === "format" && <ProjectStartDialog
          project={project?.id === productionDialog.target.id ? project : productionDialog.target}
          onCreate={createProject} onChangeFormat={changeProductionFormat} onClose={() => setProductionDialog(null)} />}
        {productionDialog?.mode === "save" && project && (
          <BoardPresetSaveDialog project={project} selectedNodeIds={productionDialog.nodeIds}
            onClose={() => setProductionDialog(null)}
            prepareProject={async () => {
              if (!(await save()) || projectRef.current?.id !== project.id) throw new Error("현재 프로젝트를 저장한 뒤 다시 시도해 주세요.");
              return projectRef.current.version;
            }} />
        )}
        {port && portNode && project && <NodeConnectionDialog key={`${port.direction}:${port.id}`}
          node={portNode} direction={port.direction}
          nodes={project.graph.nodes.filter((item) => item.id !== port.id &&
            !project.graph.edges.some((edge) => edge.source === item.id && edge.target === port.id))}
          onClose={() => setPort(null)} onLink={(id) => connectPort(undefined, id)}
          onAdd={(kind) => connectPort(kind)} onImageEdit={() => openImageEdit(portNode)} />}
        <ProjectClassificationsDialog target={taxonomyTarget} classifications={classifications}
          loading={classificationsLoading} loadError={classificationsError} canOpenProjectSettings={!!project}
          onClose={(openProjectSettings) => {
            setTaxonomyTarget(null);
            if (openProjectSettings && project) setSettingsId(project.id);
          }} onReload={() => void refreshClassifications()} onChange={changeClassification} />
        <span
          className={`save-status ${saveState}`}
          aria-live="polite"
          tabIndex={0}
          title="편집 내용을 자동 저장합니다. 충돌이나 실패 안내가 나오면 저장하거나 내보내세요."
        >
          {saveState === "saving" ? (
            <LoaderCircle size={13} className="spin" />
          ) : (
            <Check size={13} />
          )}{" "}
          {stateLabel}
        </span>
        <div className="top-actions">
          <button
            className="icon-button workspace-agent-toggle"
            aria-label="프로젝트 에이전트 열기"
            title="선택한 노드와 별개로 프로젝트 대화를 엽니다."
            onClick={() => { setTab("workspace"); openPanel(); }}
          >
            <Menu size={19} />
          </button>
          <ExportMenu
            key={project?.id}
            project={project}
            onJson={download}
            onVideo={exportVideo}
          />
          <AgentSettings
            providers={providers}
            settings={workspaceSettings}
            onRead={readWorkspaceSettings}
            onSave={saveWorkspaceSettings}
            onRefresh={refreshProviders}
            refreshing={providerRefreshing}
            snapshotAt={providerSnapshot.snapshotAt}
            backgroundRefresh={providerSnapshot.refreshing}
          />
          <UserGuide onInspect={() => setHelpMode("global")} />
          <span className="avatar" aria-label="내 작업실">
            나
          </span>
        </div>
      </header>
      <main className="workspace">
        <aside className="rail" aria-label="노드 추가">
          <div className="rail-heading">만들기</div>
          <div className="rail-list">
            {(
              [
                {
                  label: "이야기",
                  items: ["brief", "scenario", "scene", "script", "shot"],
                },
                {
                  label: "자료",
                  items: ["character", "referenceImage", "referenceVideo"],
                },
                {
                  label: "제작",
                  items: [
                    "keyframe",
                    "video",
                    "audioCue",
                    "previs",
                    "switch",
                    "note",
                  ],
                },
              ] as { label: string; items: Kind[] }[]
            ).map((group) => (
              <div className="rail-group" key={group.label}>
                <span className="rail-group-label">{group.label}</span>
                {group.items.map((kind) => {
                  const Icon = icons[kind];
                  return (
                    <button
                      key={kind}
                      className={`rail-button ${kind}`}
                      onClick={() => addNode(kind)}
                      title={`캔버스에 ${kindLabels[kind]} 노드를 추가합니다.`}
                    >
                      <span>
                        <Icon size={19} />
                      </span>
                      <small>{kindLabels[kind]}</small>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="rail-bottom">
            <button className="rail-button" type="button" title="제작 키트, 캔버스 목록과 자산을 엽니다."
              onClick={toggleSidebar}>
              <span><PanelsTopLeft size={19} /></span>
              <small>도구함</small>
            </button>
            <button
              className="rail-button"
              title="에이전트 요청 패널을 엽니다."
              onClick={() => {
                setTab("workspace");
                openPanel();
              }}
            >
              <span>
                <Sparkles size={19} />
              </span>
              <small>에이전트</small>
            </button>
          </div>
        </aside>
        <div className={`workspace-library-wrap${sidebarOpen ? " desktop-open" : ""}${mobileSidebar ? " mobile-open" : ""}`}>
          <WorkspaceSidebar
            key={`${project?.id ?? "loading"}:${workspacePreferences.sidebarTab}`}
            project={project}
            runs={runs.filter((run) => run.input.projectId === project?.id)}
            selected={selected}
            initialTab={workspacePreferences.sidebarTab}
            onSelect={(id) => selectBoardNode(id, true)}
            onAdd={addNode}
            onTool={(next, trigger) => void openTool(next, trigger)}
            onFiles={importFiles}
            onUseAsset={applyLibraryItem}
            onClose={() => { setSidebarOpen(false); setMobileSidebar(false); }}
          />
        </div>
        <section
          className="board-area"
          aria-label="제작 캔버스"
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes("Files"))
              event.preventDefault();
          }}
          onDrop={(event) => {
            if (!event.dataTransfer.files.length) return;
            event.preventDefault();
            void importFiles(Array.from(event.dataTransfer.files)).catch(
              (cause) =>
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "파일을 가져오지 못했습니다.",
                ),
            );
          }}
        >
          <div className="board-header">
            <div>
              <div className="breadcrumb">
                <LayoutDashboard size={14} /> 내 작업실 <span>/</span> 캔버스
              </div>
              <div className="board-title">
                <h1>{project?.title || "나의 캔버스"}</h1>
                {project && <button type="button" className="studio-action board-format-button"
                  aria-label={`제작 형식 설정 · ${activeProductionProfile?.label ?? "무형식"}${project.productionSettings?.workflow === "fashion-ad" ? " · Higgsfield 패션 광고" : ""}${countLabel ? " · " + countLabel : ""}`}
                  aria-haspopup="dialog" onClick={() => setProductionDialog({ mode: "format", target: project })}>
                  <Settings size={14} aria-hidden="true" />
                  <span>제작 형식</span><strong>{activeProductionProfile?.label ?? "무형식"}{project.productionSettings?.workflow === "fashion-ad" ? " · 패션 광고" : ""}</strong>
                  {countLabel && <span>{countLabel}</span>}
                </button>}
              </div>
            </div>
            <div className="board-header-actions">
              <select
                className="tools-select"
                aria-label="제작 도구 열기"
                title="제작 프리셋, 모션그래픽, 인물 연출과 편집 도구를 엽니다."
                value=""
                onChange={(event) => {
                  const next = event.target.value as
                    Exclude<typeof tool, null> | "tts-sample";
                  if (next) void openTool(next, event.currentTarget);
                }}
              >
                <option value="">제작 도구</option>
                {productionTool && <optgroup label="현재 형식의 추천">
                  <option value={productionTool}>{project?.productionSettings?.workflow === "fashion-ad" ? "Higgsfield 패션 광고" : productionToolLabels[productionTool]}</option>
                </optgroup>}
                <option value="preset">제작 프리셋 · 레퍼런스 분석</option>
                <option value="blender">Blender 3D 장면</option>
                <option value="tripo">Tripo 3D 리깅·동작</option>
                {productionTool !== "higgs-workflow" && <option value="higgs-workflow">Higgsfield 제작 워크플로우</option>}
                <option value="motion">모션그래픽 스튜디오</option>
                <option value="portrait">캐릭터 연출 키트</option>
                <option value="tts-sample">TTS 등록 샘플 만들기</option>
                <option value="assets">자산 보관함</option>
                <option value="timeline">타임라인</option>
                <option value="director">감독 도구</option>
                <option value="clip">클립 편집</option>
                <option value="contest">공모전 기획</option>
              </select>
              <button
                className="studio-action board-save-preset"
                type="button"
                disabled={!project?.graph.nodes.length}
                aria-label="보드 프리셋 저장"
                onClick={() => setProductionDialog({ mode: "save" })}
              >
                <BookmarkPlus size={16} aria-hidden="true" /> <span>프리셋 저장</span>
              </button>
              <button
                className="subtle-button"
                title="프로젝트 에이전트에서 전체 작품을 논의합니다."
                onClick={() => { setTab("workspace"); openPanel(); }}
              >
                <Sparkles size={15} /> 에이전트에게 요청
              </button>
              <button
                className="primary-button"
                title="추가할 노드와 자산을 선택합니다."
                aria-haspopup="menu"
                disabled={!project}
                onClick={(event) => boardMenuRef.current?.openAddMenu(event.currentTarget)}
              >
                <Plus size={16} /> 노드 추가
              </button>
            </div>
          </div>
          {project ? (
            <CanvasBoard
              ref={boardMenuRef}
              key={`CanvasBoard-${project.id}`}
              graph={project.graph}
              runs={projectRuns}
              selected={selected}
              focusNode={focusNode?.id === selected ? focusNode : null}
              onSelect={selectBoardNode}
              onPort={openPort}
              onPreviewNode={openNodePreview}
              onVideo={openVideo}
              onSavePreset={(nodeIds) => setProductionDialog({ mode: "save", nodeIds })}
              onImportFiles={importFiles}
              onSaveAsset={saveBoardAsset}
              onLibrary={(source, point) => {
                setLibrarySource(source);
                libraryPoint.current = point;
                setTool("assets");
              }}
              onTool={(next) => {
                if (next === "agent") { setTab("workspace"); openPanel(); }
                else void openTool(next);
              }}
              onImageTool={(source, kind) => {
                try { addImageEdit(kind, undefined, source); }
                catch (cause) { setError((cause as Error).message); }
              }}
              onImageAction={(source, kind) => void openImageAction(source, kind)}
              onImageSplit={(source) => {
                selectBoardNode(source.id);
                setImageEditTarget(null);
                setGridNodeId(source.id);
                openPanel();
              }}
              onCloseImageEditor={closeImageEditor}
              imageEditorTitle={currentImageAction?.kind === "upscale" ? imageOperationLabels.upscale :
                currentImageAction?.kind === "layers" || !editTarget?.imageEdit ? undefined : imageEditKinds[editTarget.imageEdit.kind]}
              imageEditor={currentImageAction?.kind === "layers" ?
                <ImageLayerStudio key={currentImageAction.targetId} projectId={project.id} sourceId={currentImageAction.sourceId}
                  asset={currentImageAction.asset} title={currentImageAction.title} onClose={closeImageEditor}
                  onSave={(layers, description) => saveImageLayers(currentImageAction, layers, description)} /> :
                currentImageAction?.kind === "upscale" ?
                <ImageUpscaleStudio key={currentImageAction.targetId} asset={currentImageAction.asset} title={currentImageAction.title}
                  output={actionNode ? actionNode.asset : undefined}
                  initialScale={draftSettings && draftSettings.kind === "upscale" ? draftSettings.settings?.scale : undefined}
                  initialStyle={draftSettings && draftSettings.kind === "upscale" ? draftSettings.settings?.style : undefined}
                  onClose={closeImageEditor} onSave={(file, options) => saveImageOutput(currentImageAction, file, options)} /> :
                editTarget?.id === node?.id && editTarget && editSource ? (
                <>
                  <ImageEditStudio key={editTarget.id}
                    source={editTarget.imageEdit?.sourceAsset ? { ...editSource, asset: editTarget.imageEdit.sourceAsset } : editSource}
                    editNode={editTarget}
                    onCreate={(kind) => addImageEdit(kind)}
                    onUpdate={saveImageDirection}
                    onClose={closeImageEditor}
                    generating={submitting}
                    generationAvailable={Boolean(hasImageEditInput && activeProvider?.available && !modelUnavailable && !attachmentBusy)}
                    onGenerate={async (instruction, settings) => {
                      if (!(await saveImageDirection(instruction, settings))) return false;
                      return (await runAgent("저장된 연출 설정에 따라 원본 이미지를 수정해 주세요.")) === true;
                    }}
                    generationControls={<div className="canvas-image-run-options">
                      <button type="button" className="studio-action" onClick={openImageGeneration}>프롬프트·참조 설정</button>
                      <button type="button" className="studio-action" aria-haspopup="dialog" onClick={(event) => openNodeDirector(editTarget.id, event.currentTarget)}>
                        <Clapperboard size={16} aria-hidden="true" /> 디렉터 스튜디오
                      </button>
                      <label>이미지 생성 계정
                        <select aria-label="이미지 생성 계정" value={activeProvider?.id ?? ""}
                          onChange={(event) => selectChoice(event.target.value as Provider | "")}>
                          <option value="">계정 선택</option>
                          {compatible.map((provider) => (
                            <option key={provider.id} value={provider.id}>{provider.label}{provider.available ? "" : " · 연결 확인 필요"}</option>
                          ))}
                        </select>
                      </label>
                      {activeProvider && availableModels.length > 0 && <label>이미지 모델
                        <select aria-label="이미지 모델" value={storedModel}
                          onChange={(event) => selectChoice(activeProvider.id, event.target.value)}>
                          <option value="">기본 모델</option>
                          {modelUnavailable && <option value={storedModel}>{storedModel} · 확인 필요</option>}
                          {availableModels.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                        </select>
                      </label>}
                      {(editTarget.imageEdit?.kind === "light" || editTarget.imageEdit?.kind === "cinematic" ||
                        editTarget.imageEdit?.kind === "characterSheet") && <label>{editTarget.imageEdit?.kind === "characterSheet" ? "캐릭터 참조 이미지 추가" : "조명 참조 이미지 추가"}
                        <select value="" onChange={(event) => addImageLookReference(event.target.value)}>
                          <option value="">캔버스에서 이미지 선택</option>
                          {project.graph.nodes.filter((item) => item.asset?.type === "image" && item.id !== editTarget.id &&
                            !project.graph.edges.some((edge) => edge.source === item.id && edge.target === editTarget.id))
                            .map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                        </select>
                      </label>}
                      {project.graph.edges.some((edge) => edge.target === editTarget.id && edge.role === "look" && edge.usage !== "guide") &&
                        <p className="footnote">추가 이미지는 원본과 함께 모델에 참조로 전달됩니다.</p>}
                      <p className="footnote">
                        {!hasImageEditInput ? "생성하려면 연결된 원본 이미지를 다시 지정해 주세요." :
                          activeProvider?.available ? `${activeProvider.billing} · 이미지 1장` : "이미지 생성 계정 연결을 확인해 주세요."}
                      </p>
                    </div>} />
                  {editTarget.imageEdit && (!hasImageEditInput || editTarget.asset || projectRuns.some((run) => run.input.nodeId === editTarget.id)) &&
                    <ImageEditResults node={editTarget} edit={editTarget.imageEdit} source={imageEditSourceNode}
                      runs={projectRuns} onAdopt={applyRun} onBind={bindImageEditSourceAsset} />}
                </>
              ) : undefined}
              onChange={(graph: Graph) =>
                edit((current) => ({ ...current, graph }))
              }
              onAutoLayout={commitAutoLayout}
              onUndo={() => applyHistory("undo")}
              onRedo={() => applyHistory("redo")}
              canUndo={canUndo}
              canRedo={canRedo}
            />
          ) : (
            <div className="loading-board" aria-live="polite">
              {workspaceStatus === "loading" ? <><LoaderCircle className="spin" aria-hidden="true" /> 작업실을 불러오고 있습니다</> :
                workspaceStatus === "unavailable" ? <>
                  <span>작업실을 불러오지 못했습니다.</span>
                  <button type="button" className="studio-action" onClick={() => {
                    setWorkspaceStatus("loading"); setError(""); setWorkspaceRetry((attempt) => attempt + 1);
                  }}>다시 불러오기</button>
                </> : <button type="button" className="studio-action" onClick={() => setProductionDialog({ mode: "create" })}>새 프로젝트 시작</button>}
            </div>
          )}
          {tool === "preset" && project && (
            <StylePresetStudio key={`StylePresetStudio-${project.id}`} projectId={project.id}
              initialAnalysisId={linkedAnalysis}
              videoNodes={project.graph.nodes.filter((item) => item.asset?.type === "video").map(({ id, title }) => ({ id, title }))}
              prepareProject={async () => {
                if (!(await save()) || projectRef.current?.id !== project.id) throw new Error("현재 프로젝트를 저장한 뒤 다시 시도해 주세요.");
                return projectRef.current.version;
              }}
              initialDraft={director.stylePreset}
              initialCount={director.stylePreset && typeof director.sceneCount === "number" ? director.sceneCount : undefined}
              defaults={agentDefaults} providers={providers} runs={runs.filter((run) => run.input.projectId === project.id)}
              onDesign={({ mode, draft, ...payload }) =>
                submitPanelText({ ...payload, nodeId: null, presetDesign: { mode, draft } })}
              contestTitle={contest?.title}
              onContest={(draft, count) => {
                const profile = productionProfiles.find((entry) => entry.id === draft.profileId)!;
                changeDirector({ ...director, format: profile.format, sceneCount: count, stylePreset: draft });
                setContest(null);
                setContestPrefill({ url: "", idea: draft.concept });
                setTool("contest");
              }}
              onApply={(draft, count, reference, useContest) => applyProductionStyle(draft, count, "board", reference, useContest)}
              onDirector={(draft, count, useContest) => applyProductionStyle(draft, count, "director", undefined, useContest)}
              onClose={() => setTool(null)}
            />
          )}
          {tool === "tripo" && project && <TripoStudio key={`tripo-${project.id}`} projectId={project.id} onClose={() => setTool(null)} />}
          {tool === "blender" && project && (
            <BlenderSceneStudio key={`blender-${project.id}`} project={project}
              initialNode={project.graph.nodes.find((item) => item.id === blenderEditId)}
              onClose={() => setTool(null)}
              prepareProject={async () => {
                if (!(await save()) || projectRef.current?.id !== project.id) throw new Error("현재 프로젝트를 저장한 뒤 다시 시도해 주세요.");
                return projectRef.current.version;
              }}
              onSave={async (spec, nodeId) => {
                const current = projectRef.current;
                if (current?.id !== project.id) throw new Error("장면을 편집한 프로젝트를 다시 열어 주세요.");
                const saved = saveBlenderShot(current.graph, spec, nodeId ?? blenderDraftId.current);
                blenderDraftId.current = saved.nodeId;
                if (saved.graph !== current.graph) edit((p) => ({ ...p, graph: saved.graph }));
                if (!(await save()) || projectRef.current?.id !== current.id) throw new Error("3D 장면을 저장하지 못했습니다.");
                return saved.nodeId;
              }}
              onTake={async (sceneId, spec, asset, quality, acceptPrevious) => {
                const current = projectRef.current;
                if (current?.id !== project.id) throw new Error("렌더한 프로젝트를 다시 열어 주세요.");
                const next = addBlenderTake(current.graph, sceneId, spec, asset, quality, acceptPrevious);
                if (next.graph !== current.graph) edit((p) => ({ ...p, graph: next.graph }));
                if (!(await save()) || projectRef.current?.id !== current.id) throw new Error("렌더한 테이크를 보드에 저장하지 못했습니다.");
                return next.nodeId;
              }}
              onBlockingFrame={async (takeId, seconds) => {
                if (!(await save())) throw new Error("테이크를 먼저 저장해 주세요.");
                const current = projectRef.current;
                const take = current?.graph.nodes.find((item) => item.id === takeId);
                if (current?.id !== project.id || !take?.asset || !take.blenderTake) throw new Error("저장한 테이크를 다시 선택해 주세요.");
                const result = await request<{ asset: Asset }>(`/api/projects/${current.id}/clip-tools`,
                  json({ version: current.version, nodeId: takeId, sourceUrl: take.asset.url, start: seconds, action: "frame" }));
                const latest = projectRef.current;
                if (latest?.id !== current.id || latest.graph.nodes.find((item) => item.id === takeId)?.asset?.url !== take.asset.url) throw new Error("원본 테이크가 바뀌었습니다.");
                const next = addBlockingReference(latest.graph, takeId, result.asset, seconds);
                edit((p) => ({ ...p, graph: next.graph }));
                if (!(await save()) || projectRef.current?.id !== current.id) throw new Error("블로킹 참조를 저장하지 못했습니다.");
                selectBoardNode(next.nodeId, true);
                setTool(null);
              }}
              onTimeline={async (takeId, timelineId) => {
                const current = projectRef.current;
                if (current?.id !== project.id) throw new Error("렌더한 프로젝트를 다시 열어 주세요.");
                const retry = pendingTimeline.current;
                const next = linkBlenderTimeline(current.graph, takeId, timelineId ?? (retry?.takeId === takeId ? retry.id : undefined));
                pendingTimeline.current = { takeId, id: next.nodeId };
                if (next.graph !== current.graph) edit((p) => ({ ...p, graph: next.graph }));
                if (!(await save()) || projectRef.current?.id !== current.id) throw new Error("타임라인 연결을 저장하지 못했습니다.");
                selectBoardNode(next.nodeId, true);
                setTool("timeline");
              }} />
          )}
          {tool === "higgs-workflow" && project && (
            <HiggsfieldWorkflowStudio
              initialAd={project.productionSettings?.workflow === "fashion-ad" ? project.productionSettings : undefined}
              onClose={() => setTool(null)} onApply={(addition) => {
              const current = projectRef.current;
              if (current?.id !== project.id) throw new Error("작업할 프로젝트를 다시 열어 주세요.");
              const graph = addProductionGraph(current.graph, addition);
              edit((p) => ({ ...p, graph }));
              const entry = graph.nodes[current.graph.nodes.length];
              if (entry) selectBoardNode(entry.id, true);
              setTool(null);
            }} />
          )}
          {tool === "portrait" && project && (
            <PortraitKitStudio key={`PortraitKitStudio-${project.id}`} onClose={() => setTool(null)}
              onApply={(addition) => {
                const current = projectRef.current;
                if (!current || current.id !== project.id) throw new Error("인물 연출을 구성한 프로젝트에서 다시 추가해 주세요.");
                const graph = addProductionGraph(current.graph, addition);
                edit((value) => ({ ...value, graph }));
                const cast = graph.nodes.slice(current.graph.nodes.length).find((item) => item.kind === "character");
                if (cast) selectBoardNode(cast.id, true);
                setTool(null);
              }}
            />
          )}
          {tool === "motion" && project && (
            <MotionShortStudio key={`MotionShortStudio-${project.id}`} project={project} activePreset={director.stylePreset}
              directorPanel={(apply) => <MotionDirectorPanel providers={providers} defaults={agentDefaults}
                activePreset={director.stylePreset} runs={runs.filter((run) => run.input.projectId === project.id)}
                onApply={apply} onDesign={(payload) => submitPanelText({ ...payload, nodeId: null })} />}
              initialSpec={project.graph.nodes.find((item) => item.id === motionEditId)?.motionShort} onClose={() => setTool(null)}
              onRendered={(asset, title, spec, sourceNodeId) => {
                const current = projectRef.current;
                if (!current || current.id !== project.id) throw new Error("영상을 렌더한 프로젝트에서 다시 추가해 주세요.");
                const graph = addProductionGraph(current.graph, { nodes: [
                  { id: "motion-short", kind: "video", title, body: "로컬 모션 숏 렌더", asset, motionShort: spec, x: 0, y: 0 },
                ], edges: [] });
                const target = graph.nodes[graph.nodes.length - 1].id;
                for (const source of new Set([sourceNodeId, motionEditId])) {
                  if (source && current.graph.nodes.some((item) => item.id === source)) graph.edges.push({ source, target, role: "context", usage: "guide" });
                }
                if (!validateGraph(graph)) throw new Error("현재 노드·연결 한도에서 새 모션 테이크를 추가할 수 없습니다.");
                edit((value) => ({ ...value, graph }));
                selectBoardNode(graph.nodes[graph.nodes.length - 1].id, true);
                setTool(null);
              }}
            />
          )}
          {tool === "contest" && project && (
            <ContestStudio
              key={`ContestStudio-${project.id}`}
              project={project}
              initialUrl={contestPrefill?.url}
              initialIdea={contestPrefill?.idea}
              onClose={() => setTool(null)}
              onGraphChange={(projectId, update) => {
                const current = projectRef.current;
                if (!current || current.id !== projectId) return false;
                const graph = update(current.graph);
                if (!validateGraph(graph)) return false;
                edit((value) => ({ ...value, graph }));
                return true;
              }}
              onBrief={(brief, idea) => {
                if (projectRef.current?.id !== project.id) {
                  setError(
                    "프로젝트가 바뀌었습니다. 공모전 기획을 다시 열어 주세요.",
                  );
                  return;
                }
                setContest(brief);
                setContestPrefill(null);
                setSelected(null);
                setPlanMode("director");
                setTab("agent");
                openPanel();
                setGeneralPrompt(
                  idea.trim()
                    ? `공모전 요강을 바탕으로 다음 아이디어를 발전시켜 제작안을 구성해 주세요.\n${idea.trim()}`
                    : "공모전 요강을 바탕으로 독창적인 아이디어 2~3개를 구상하고, 제안한 방향을 바탕으로 제작안을 구성해 주세요.",
                );
                setTool(null);
              }}
            />
          )}
          {tool === "assets" && project && (
            <AssetLibrary
              key={`AssetLibrary-${project.id}-${librarySource}`}
              nodes={project.graph.nodes}
              edgeCount={project.graph.edges.length}
              runs={runs.filter((run) => run.input.projectId === project.id)}
              selected={selected}
              initialSource={librarySource}
              savedItems={savedAssets}
              onClose={() => {
                libraryPoint.current = undefined;
                setTool(null);
              }}
              onUse={(item, usage) => {
                const point = usage === "copy" ? libraryPoint.current : undefined;
                applyLibraryItem(item, usage, point);
                if (point) libraryPoint.current = { x: point.x + 320, y: point.y };
              }}
              onFiles={importFiles}
              onBoardImport={(incoming) => {
                const current = projectRef.current;
                if (!current || current.id !== project.id)
                  throw new Error(
                    "프로젝트가 바뀌었습니다. 다시 가져와 주세요.",
                  );
                const graph = addProductionGraph(current.graph, incoming);
                edit((value) => ({ ...value, graph }));
              }}
            />
          )}
          {tool === "timeline" && project && (
            <TimelineStudio
              key={`TimelineStudio-${project.id}`}
              autoOpen
              onClose={() => setTool(null)}
              project={project}
              selected={selected}
              onGraphChange={(graph) => {
                if (projectRef.current?.id === project.id)
                  edit((current) => ({ ...current, graph }));
              }}
              save={async () =>
                (await save()) && projectRef.current?.id === project.id
                  ? projectRef.current
                  : null
              }
            />
          )}
          {tool === "clip" && project && (
            <ClipLab
              key={`ClipLab-${project.id}`}
              project={project}
              selected={selected}
              onClose={() => setTool(null)}
              onGraphChange={(projectId, update) => {
                const current = projectRef.current;
                if (!current || current.id !== projectId) return false;
                const graph = update(current.graph);
                if (!validateGraph(graph)) return false;
                edit((value) => ({ ...value, graph }));
                return true;
              }}
            />
          )}
          {tool === "director" && project && (
            <DirectorStudio
              key={`DirectorStudio-${project.id}`}
              project={project}
              selected={selected}
              onClose={() => setTool(null)}
              onGraphChange={(projectId, update) => {
                const current = projectRef.current;
                if (!current || current.id !== projectId) return false;
                const graph = update(current.graph);
                if (!validateGraph(graph)) return false;
                edit((value) => ({ ...value, graph }));
                return true;
              }}
            />
          )}
        </section>
        <dialog
          ref={panelDialog}
          open
          className={`inspector${panelOpen ? " open" : ""}${panelHidden ? " panel-hidden" : ""}${workspacePreferences.panelWidth === "wide" ? " panel-wide" : ""}`}
          role={panelExpanded ? undefined : "complementary"}
          aria-labelledby="workspace-inspector-title"
          onClose={(event) => {
            if (event.target === event.currentTarget) restorePanel();
          }}
        >
          <div className="inspector-top">
            <div>
              <span className="inspector-icon">
                <Sparkles size={17} aria-hidden="true" />
              </span>
              <strong id="workspace-inspector-title">작업실</strong>
            </div>
            <div className="inspector-actions">
              <button ref={workroomGuideButton} type="button" className="studio-action" data-tone="quiet"
                aria-label="작업실 사용 가이드" aria-haspopup="dialog"
                data-help="작업실의 용도와 처음 시작하는 순서, 탭별 사용법을 엽니다."
                onClick={(event) => openWorkroomGuide("overview", event.currentTarget)}>
                <BookOpen size={16} aria-hidden="true" /> 가이드
              </button>
              <button ref={expandPanelButton} type="button" className="studio-action" data-tone="quiet" data-size="icon"
                hidden={panelExpanded} aria-label="작업실 넓게 보기" title="작업실 넓게 보기" aria-haspopup="dialog" onClick={expandPanel}>
                <Maximize2 size={18} aria-hidden="true" />
              </button>
              {panelExpanded && <button ref={shrinkPanelButton} type="button" className="studio-action" data-tone="quiet"
                data-help="작업실을 오른쪽 패널로 돌려놓고 캔버스를 다시 봅니다."
                onClick={() => panelDialog.current?.close()}>
                <Minimize2 size={16} aria-hidden="true" /> 패널로 돌아가기
              </button>}
              {!panelExpanded && <button type="button" className="studio-action panel-close" data-tone="quiet" data-size="icon"
                aria-label="작업실 닫기" title="작업실 닫기" onClick={closePanel}>
                <X size={18} aria-hidden="true" />
              </button>}
            </div>
          </div>
          <Tabs className="workroom-tabs" value={tab} onValueChange={(value) => { if (value) setTab(value); }}>
            <TabsList className="workroom-tab-list" aria-label="작업실 메뉴">
              {workroomGuideTabs.map(({ id, label, summary }) => (
                <TabsTab key={id} value={id} data-help={summary}>{label}</TabsTab>
              ))}
            </TabsList>
            {helpMode === "workroom" ? (
              <div className="workroom-tab-summary help-inspector-inline">
                <p role="status">설명을 보려는 기능을 눌러 주세요.</p>
                <button ref={workroomHelpExit} type="button" className="studio-action" data-tone="quiet" onClick={exitHelpMode}>설명 모드 종료</button>
              </div>
            ) : activeWorkroomTab && (
              <div className="workroom-tab-summary">
                <p>{activeWorkroomTab.summary}</p>
                <button type="button" className="studio-action" data-tone="quiet" aria-haspopup="dialog"
                  aria-label={`${activeWorkroomTab.label} 탭 사용법`}
                  onClick={(event) => openWorkroomGuide(tab, event.currentTarget)}>탭 사용법</button>
              </div>
            )}
          {panelExpanded && error && <div className="inspector-alert" role="alert">
            <span>{error}</span>
            <button type="button" className="studio-action" data-tone="quiet" onClick={() => setError("")}>닫기</button>
          </div>}
          <TabsPanel className="panel-content" value="workspace" keepMounted>
            {project && (
              <WorkspaceAgent
                key={project.id}
                project={project}
                runs={runs.filter((run) => run.input.projectId === project.id)}
                providers={providers}
                defaults={agentDefaults}
                activeStyle={director.stylePreset?.name}
                onPreset={() => void openTool("preset")}
                onSend={async ({ threadId, nodeIds, recipeIds, ...payload }) => {
                  await submitPanelText({ ...payload, nodeId: null, chat: { threadId, nodeIds, recipeIds,
                    ...(director.stylePreset ? { stylePreset: { ...director.stylePreset, evidence: "" } } : {}),
                  } });
                }}
                onPlan={openDirector}
                onVideo={() => { selectBoardNode(null); setTab("node"); openPanel(); }}
                onSettings={() => document.getElementById("scene-room-settings")?.click()}
                onProjectSettings={() => { setSettingsId(project.id); void refreshClassifications(); }}
              />
            )}
          </TabsPanel>
          <TabsPanel className="panel-content" value="guidance" keepMounted>
            {tab === "guidance" && (node && project ? (
              <NodeGuidancePanel
                key={`${project.id}:${node.id}`}
                node={node}
                runs={runs.filter((run) => run.input.projectId === project.id)}
                providers={providers}
                defaults={agentDefaults}
                onChange={(nodeId, guidance) => {
                  if (projectRef.current?.id === project.id && node.id === nodeId)
                    updateNode({ guidance });
                }}
                onRevise={async (payload) => { await submitPanelText({ ...payload, guidanceEdit: true }); }}
              />
            ) : (
              <div className="empty-panel">
                <h2>지침을 확인할 노드를 골라 주세요</h2>
                <p>{panelExpanded ? "패널로 돌아가 캔버스에서 대본, 씬, 이미지 같은 자료를 선택하세요." : "캔버스에서 대본, 씬, 이미지 같은 자료를 선택하세요."}</p>
                {workroomScenes.length > 0 && <button type="button" className="studio-action" data-help="노드 탭의 씬 목록을 열어 지침을 확인할 장면을 찾습니다." onClick={() => setTab("node")}>노드 탭에서 씬 찾기</button>}
              </div>
            ))}
          </TabsPanel>
          <TabsPanel className="panel-content" value="agent" keepMounted>
            {tab === "agent" && (
              <div className={`agent-panel${mediaWork ? " media-work" : ""}`}>
                <div className="panel-intro">
                  <h2>
                    {videoWork ? "영상 만들기" : imageWork ? "이미지 만들기" : node ? `${kindLabels[node.kind]} 작업` : "작품 기획"}
                  </h2>
                  <p>
                    {videoWork ? node?.title || "제목 없는 영상" : node ? node.title : "아이디어를 적고 씬과 샷이 담긴 제작안을 요청하세요."}
                  </p>
                  {node && !mediaWork && (
                    <button
                      className="text-button"
                      title="노드 선택을 해제하고 작품 전체 기획으로 전환합니다."
                      onClick={() => setSelected(null)}
                    >
                      <ArrowLeft size={14} /> 전체 기획으로 전환
                    </button>
                  )}
                </div>
                {!node && (
                  <DirectorControls
                    mode={planMode}
                    onModeChange={setPlanMode}
                    options={director}
                    onChange={changeDirector}
                    onPreset={() => void openTool("preset")}
                    onTemplate={() => {
                      try {
                        edit((current) => ({
                          ...current,
                          graph: director.stylePreset
                            ? addProductionGraph(current.graph, makeStyleGraph(director.stylePreset, director.sceneCount))
                            : appendProductionTemplate(
                            current.graph,
                            director.format,
                            director.sceneCount,
                          ),
                        }));
                      } catch (cause) {
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : "기본 보드를 배치하지 못했습니다.",
                        );
                      }
                    }}
                  />
                )}
                {!node && planMode === "director" && contest && (
                  <div className="provider-info">
                    <strong>공모전 요강 적용 중</strong>
                    <p>{contest.title}</p>
                    <a
                      href={contest.url}
                      target="_blank"
                      rel="noreferrer"
                      title="이 제작안의 공모전 요강 원문을 엽니다."
                    >
                      요강 출처 확인 <ArrowUpRight size={13} />
                    </a>
                    <button
                      className="text-button"
                      title="이후 제작안 요청에서 요강을 제외합니다."
                      onClick={() => setContest(null)}
                    >
                      요강 적용 해제
                    </button>
                  </div>
                )}
                {node?.kind === "scene" && (
                  <>
                    <label className="field-label" htmlFor="scene-task">
                      작업 범위
                    </label>
                    <select
                      id="scene-task"
                      title="선택한 씬만 수정하거나 연결된 대본과 연출을 검토합니다."
                      value={sceneReview ? "review" : "node"}
                      onChange={(event) => {
                        setSceneReview(event.target.value === "review");
                      }}
                    >
                      <option value="node">이 씬 내용만 수정</option>
                      <option value="review">이 씬의 대본·연출 검토</option>
                    </select>
                    {sceneReview && (
                      <p className="director-description">
                        씬에 연결된 자료를 검토하고 노드별 수정안을 제안합니다.
                        적용할 제안은 직접 선택합니다.
                      </p>
                    )}
                  </>
                )}
                {node && !isReview && !mediaWork && allowedOperations.length > 1 && (
                  <>
                    <label className="field-label" htmlFor="node-operation">
                      작업 종류
                    </label>
                    <select
                      id="node-operation"
                      title="본문 수정과 이미지·영상 생성 중 작업을 선택합니다."
                      value={operation}
                      onChange={(event) => {
                        setWorkOperation(event.target.value as Operation);
                      }}
                    >
                      {allowedOperations.map((item) => (
                        <option key={item} value={item}>
                          {item === "text"
                            ? "연출 지시·본문 수정"
                            : item === "image"
                              ? "이미지 생성"
                              : item === "audio"
                                ? "음향 생성"
                                : "영상 생성"}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {voiceWork && voiceActorPicker}
                {operation === "audio" && !voiceWork && (
                  <div className="audio-settings">
                    <label className="field-label" htmlFor="audio-engine">
                      Road Music 엔진
                    </label>
                    <select
                      id="audio-engine"
                      title="사용할 로컬 음향 생성 엔진을 선택합니다."
                      value={audio.engine}
                      onChange={(event) => {
                        const engine = event.target
                          .value as AudioOptions["engine"];
                        setAudio((current) => ({
                          ...current,
                          engine,
                          purpose: engine === "ace" ? current.purpose : "music",
                          seconds:
                            engine === "ace"
                              ? Math.max(
                                  1,
                                  Math.min(
                                    current.seconds,
                                    current.purpose === "music" ? 600 : 30,
                                  ),
                                )
                              : Math.max(20, Math.min(current.seconds, 360)),
                        }));
                      }}
                    >
                      <option value="ace">ACE-Step</option>
                      <option value="yue-mlx">YuE MLX</option>
                      <option value="yue">YuE</option>
                    </select>
                    <label className="field-label" htmlFor="audio-purpose">
                      음향 용도
                    </label>
                    <select
                      id="audio-purpose"
                      title="음악, 효과음 또는 환경음을 선택합니다."
                      value={audio.purpose}
                      onChange={(event) => {
                        const purpose = event.target
                          .value as AudioOptions["purpose"];
                        setAudio((current) => ({
                          ...current,
                          purpose,
                          seconds: Math.min(
                            current.seconds,
                            purpose === "music" ? 600 : 30,
                          ),
                        }));
                      }}
                    >
                      <option value="music">음악</option>
                      <option value="sfx" disabled={audio.engine !== "ace"}>
                        효과음
                      </option>
                      <option
                        value="ambience"
                        disabled={audio.engine !== "ace"}
                      >
                        환경음
                      </option>
                    </select>
                    <label className="field-label" htmlFor="audio-seconds">
                      목표 길이 · 초
                    </label>
                    <input
                      id="audio-seconds"
                      title="목표 길이를 초 단위로 입력합니다. 실제 결과 길이는 다를 수 있습니다."
                      type="number"
                      min={audioMinimum}
                      max={audioMaximum}
                      value={audio.seconds}
                      onChange={(event) =>
                        setAudio((current) => ({
                          ...current,
                          seconds: Number(event.target.value),
                        }))
                      }
                    />
                    <p className="footnote">
                      {audioMinimum}~{audioMaximum}초. 생성 후 실제 길이와
                      음원을 확인하세요.
                    </p>
                  </div>
                )}
                <div className="generation-input">
                {mediaWork && <h3>프롬프트와 참조</h3>}
                {project && !voiceWork && (
                  <AgentAttachments
                    key={choiceKey}
                    projectId={project.id}
                    items={attachments}
                    provider={activeProvider?.id}
                    operation={operation}
                    compact={mediaWork}
                    references={requestReferences.filter((item) => item.nodeId !== node?.id)}
                    onConnectReference={node ? () => openPort(node.id, "input") : undefined}
                    onMention={insertMentionMarker}
                    onDirector={node ? (trigger) => openNodeDirector(node.id, trigger) : undefined}
                    onChange={(items) => {
                      if (projectRef.current?.id === project.id)
                        setAttachmentsByScope((current) => ({
                          ...current,
                          [choiceKey]: items,
                        }));
                    }}
                    onBusyChange={(busy) => {
                      if (projectRef.current?.id === project.id) {
                        attachmentBusyRef.current[choiceKey] = busy;
                        setAttachmentBusyByScope((current) => ({
                          ...current,
                          [choiceKey]: busy || !!linkBusyRef.current[choiceKey],
                        }));
                      }
                    }}
                  />
                )}
                <label className="field-label" htmlFor="prompt">
                  {voiceWork ? "발화 대사" : videoWork ? "영상 프롬프트" : imageWork ? "이미지 프롬프트" : "요청 내용"}
                </label>
                <textarea
                  id="prompt"
                  ref={promptRef}
                  aria-autocomplete={voiceWork ? undefined : "list"}
                  aria-controls={!voiceWork && mention ? "node-mention-list" : undefined}
                  aria-activedescendant={
                    !voiceWork && mention && mentionCandidates[mentionIndex]
                      ? `node-mention-${mentionIndex}`
                      : undefined
                  }
                  title={voiceWork ? "합성할 대사만 입력합니다." : "에이전트가 수행할 작업을 입력합니다. 선택한 전송 참조가 함께 전달됩니다."}
                  className="prompt"
                  value={prompt}
                  maxLength={12000}
                  onChange={(event) => {
                    setPrompt(event.target.value);
                    if (!voiceWork) updateMention(
                      event.target.value,
                      event.target.selectionStart,
                    );
                  }}
                  onClick={(event) =>
                    !voiceWork && updateMention(
                      event.currentTarget.value,
                      event.currentTarget.selectionStart,
                    )
                  }
                  onKeyDown={(event) => {
                    if (
                      voiceWork || !mention ||
                      event.nativeEvent.isComposing ||
                      event.keyCode === 229
                    )
                      return;
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setMention(null);
                    } else if (
                      event.key === "ArrowDown" &&
                      mentionCandidates.length
                    ) {
                      event.preventDefault();
                      setMentionIndex(
                        (index) => (index + 1) % mentionCandidates.length,
                      );
                    } else if (
                      event.key === "ArrowUp" &&
                      mentionCandidates.length
                    ) {
                      event.preventDefault();
                      setMentionIndex(
                        (index) =>
                          (index - 1 + mentionCandidates.length) %
                          mentionCandidates.length,
                      );
                    } else if (
                      event.key === "Enter" &&
                      mentionCandidates[mentionIndex]
                    ) {
                      event.preventDefault();
                      insertMention(mentionCandidates[mentionIndex]);
                    }
                  }}
                  placeholder={
                    voiceWork ? "예: 그때는 돌아올 길이 있다고 믿었다." : videoWork ? "예: 카메라가 인물 뒤를 따라가다 멈추고, 인물이 천천히 고개를 돌린다."
                    : imageWork ? "예: 인물과 의상은 유지하고, 창문으로 들어오는 부드러운 새벽빛을 더한다."
                    : isReview
                      ? "예: 인물의 감정 변화와 대사의 자연스러움을 검토해줘"
                      : node
                        ? operation === "text"
                          ? "예: 이 장면의 갈등을 선명하게 다듬어줘"
                          : "만들고 싶은 장면과 분위기를 설명해 주세요"
                        : "예: 오래된 극장의 마지막 상영을 배경으로 한 짧은 드라마를 만들어줘"
                  }
                />
                {!mediaWork && !voiceWork && <button type="button" className="text-button" data-help="이 요청에 함께 보낼 캔버스 자료를 검색합니다." onClick={insertMentionMarker}>@ 노드 참조</button>}
                {contestFromPrompt && (
                  <button
                    type="button"
                    className="outline-button"
                    title="공모전 요강 대신 공개 페이지 본문을 일반 참고 링크로 첨부합니다."
                    disabled={attachmentBusy}
                    onClick={() => void attachContestUrlAsLink()}
                  >
                    {attachmentBusy ? "링크 첨부 중" : "일반 참고 링크로 첨부"}
                  </button>
                )}
                {!voiceWork && mention && (
                  <div
                    id="node-mention-list"
                    role="listbox"
                    aria-label="참조할 노드"
                    className="mention-list"
                  >
                    {mentionCandidates.length ? (
                      mentionCandidates.map((candidate, index) => (
                        <button
                          type="button"
                          role="option"
                          id={`node-mention-${index}`}
                          aria-selected={mentionIndex === index}
                          key={candidate.id}
                          title="이 노드를 요청에 참조합니다."
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => insertMention(candidate)}
                        >
                          <strong>{candidate.title || "제목 없음"}</strong>
                          <span>{kindLabels[candidate.kind]}</span>
                        </button>
                      ))
                    ) : (
                      <p>일치하는 노드가 없습니다.</p>
                    )}
                  </div>
                )}
                {project && (
                  <details className="request-preview">
                    <summary title="선택한 작업에 전달할 참조를 확인합니다. 연출 확인용 자료는 제외됩니다.">
                      {videoWork ? `연결된 제작 자료 ${requestReferences.filter((item) => item.nodeId !== node?.id).length}개` : "전송할 참조 미리보기"}
                    </summary>
                    <p>{videoWork ? "연결된 씬·샷 본문은 프롬프트에 포함됩니다. 미디어 입력은 작업 방식에 따라 달라집니다." : "연출 확인용 연결은 제외됩니다."}</p>
                    {requestReferences.length ? (
                      <ul>
                        {requestReferences.map((item, index) => (
                          <li key={`${item.nodeId || item.title}-${index}`}>
                            <strong>{item.title || "제목 없음"}</strong>
                            {item.role && item.role !== "context"
                              ? ` · ${roleLabels[item.role]}`
                              : ""}
                            {item.asset ? ` · ${item.asset.name}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>전송할 참조가 없습니다.</p>
                    )}
                  </details>
                )}
                {manualHandoff && (
                  <button
                    className="outline-button"
                    title="요청과 전송 가능한 텍스트 참조를 복사합니다. 미디어 파일은 별도로 첨부하세요."
                    disabled={
                      (!prompt.trim() && !attachments.length) || attachmentBusy
                    }
                    onClick={() => {
                      const refs = requestReferences
                        .map((item) => `${item.title}\n${item.body}`)
                        .join("\n\n");
                      const attachedText = attachments
                        .filter((item) => item.text)
                        .map((item) => `${item.name}\n${item.text}`)
                        .join("\n\n");
                      void navigator.clipboard
                        .writeText(
                          [submittedPrompt, refs, attachedText]
                            .filter(Boolean)
                            .join("\n\n"),
                        )
                        .then(() =>
                          setError(
                            "요청과 참조 내용을 복사했습니다. 서비스에서 작업한 뒤 노드에 결과를 붙여넣거나 파일을 첨부하세요.",
                          ),
                        )
                        .catch(() =>
                          setError(
                            "클립보드에 복사하지 못했습니다. 요청 내용을 직접 복사해 주세요.",
                          ),
                        );
                    }}
                  >
                    요청과 참조 복사
                  </button>
                )}
                {appImageHandoff &&
                  requestReferences
                    .filter((item) => item.asset?.type === "image")
                    .map((item, index) => (
                      <a
                        className="outline-button"
                        style={{
                          whiteSpace: "normal",
                          overflowWrap: "anywhere",
                          padding: "8px",
                        }}
                        key={`${item.nodeId || item.title}-${index}`}
                        href={item.asset!.url}
                        download={item.asset!.name}
                        title="이 이미지 참조를 내려받아 Antigravity 앱에 첨부합니다."
                      >
                        <ArrowDownToLine size={16} /> 참조 내려받기 ·{" "}
                        {item.title || item.asset!.name}
                      </a>
                    ))}
                {appImageHandoff &&
                  attachments.flatMap((item) =>
                    [item.asset, ...(item.frames || [])]
                      .filter(
                        (asset): asset is Asset => asset?.type === "image",
                      )
                      .map((asset, index) => (
                        <a
                          className="outline-button"
                          style={{
                            whiteSpace: "normal",
                            overflowWrap: "anywhere",
                            padding: "8px",
                          }}
                          key={`${item.id}-${index}`}
                          href={asset.url}
                          download={asset.name}
                          title="첨부 이미지를 내려받아 Antigravity 앱에 첨부합니다."
                        >
                          <ArrowDownToLine size={16} /> 첨부 내려받기 ·{" "}
                          {asset.name}
                        </a>
                      )),
                  )}
                {appImageHandoff && (
                  <button
                    className="outline-button"
                    title="앱에서 완성한 이미지를 선택 노드에 첨부합니다."
                    onClick={() => setTab("node")}
                  >
                    <Upload size={16} /> 생성한 이미지 첨부
                  </button>
                )}
                {isReview && activeProvider && !activeProvider.available && (
                  <p className="footnote">
                    이 검토는 연결된 에이전트에서 실행할 수 있습니다.
                  </p>
                )}
                </div>
                <div className="generation-settings">
                {mediaWork && <h3>모델과 출력</h3>}
                <label
                  className="field-label provider-label"
                  htmlFor="provider"
                >
                  {videoWork ? "영상 서비스" : imageWork ? "이미지 서비스" : "사용할 에이전트"}
                </label>
                {!mediaWork && <p className="footnote">
                  구독 계정이나 앱, 따로 결제하는 API 중에서 고를 수 있습니다. 서비스마다 사용량 조건을 확인하세요.
                </p>}
                <select
                  id="provider"
                  title="이 작업에 쓸 구독 계정이나 따로 결제하는 API를 고릅니다."
                  value={activeProvider?.id || ""}
                  onChange={(event) =>
                    selectChoice(event.target.value as Provider | "")
                  }
                >
                  <option value="">{videoWork ? "영상 서비스를 선택해 주세요" : node?.imageEdit ? "이미지 편집 계정을 선택해 주세요" : "에이전트를 선택해 주세요"}</option>
                  {compatible.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.id === "agy" && operation === "image"
                        ? "Antigravity 앱 · 이미지 수동 작업"
                        : item.label}
                      {item.id === "road-music"
                        ? " · 로컬 엔진"
                        : ![
                              "openai-image",
                              "gemini-image",
                              "seedream",
                            ].includes(item.id)
                          ? " · 구독·계정"
                          : " · API 따로 결제"}
                      {!(item.id === "agy" && operation === "image") &&
                      !item.available
                        ? ["openai-image", "gemini-image", "seedream"].includes(
                            item.id,
                          )
                          ? " · 설정 필요"
                          : item.id === "road-music"
                            ? " · 설치 확인 필요"
                            : ["higgsfield", "kling", "topview"].includes(item.id) ? " · 연결 필요" : " · 외부 작업"
                        : ""}
                    </option>
                  ))}
                </select>
                {allowedChoice && (!videoWork || agentDefaults.video) && (
                  <button type="button" className="outline-button" onClick={resetChoice} title="이 작업에서 따로 고른 값을 지우고 설정의 기본값을 사용합니다.">
                    설정의 기본값 사용
                  </button>
                )}
                {!allowedChoice && agentDefaults[operation] && (
                  <p className="footnote">설정의 기본값을 사용합니다.</p>
                )}
                {voiceWork && <p className="footnote">Seed Audio 1.0 · {voiceBinding ? `${voiceActor?.title || "캐릭터"}의 등록 목소리` : "등록할 목소리 필요"}</p>}
                {activeProvider && !appImageHandoff && !voiceWork && (
                  <>
                    <label
                      className="field-label provider-label"
                      htmlFor="provider-model"
                    >
                      {videoWork ? "영상 모델" : imageWork ? "이미지 모델" : "모델"}
                    </label>
                    <select
                      id="provider-model"
                      title={mediaProvider ? "선택한 서비스의 모델을 고릅니다." : "현재 서비스와 작업에 쓸 모델을 고릅니다."}
                      value={storedModel}
                      onChange={(event) =>
                        selectChoice(activeProvider.id, event.target.value)
                      }
                    >
                      <option value="">{mediaProvider ? "모델을 선택해 주세요" : "기본 설정"}</option>
                      {modelUnavailable && <option value={storedModel}>{storedModel} · 확인 필요</option>}
                      {availableModels.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {activeProvider && reasoningOptions.length > 0 && <>
                  <label className="field-label provider-label" htmlFor="provider-effort">추론 강도</label>
                  <select id="provider-effort" value={effort ?? ""}
                    title="이 작업에만 사용할 추론 강도입니다."
                    onChange={(event) => selectChoice(activeProvider.id, storedModel, isAgentEffort(event.target.value) ? event.target.value : "")}>
                    <option value="">CLI 기본값</option>
                    {reasoningOptions.map((value) => <option key={value} value={value}>{effortLabels[value]} · {value}</option>)}
                  </select>
                </>}
                {modelUnavailable && (
                  <p className="footnote" role="status">선택한 모델을 현재 사용할 수 없습니다. 연결을 확인하거나 다른 모델을 선택해 주세요.</p>
                )}
                {node?.imageEdit && !hasImageEditInput && (
                  <p className="footnote" role="status">실행하려면 노드 설정에서 연결된 원본 이미지를 확인해 주세요.</p>
                )}
                {activeProvider && (!mediaWork || !activeProvider.available) && (
                  <div className="provider-info">
                    <strong>
                      {appImageHandoff
                        ? "앱에서 이미지 생성"
                        : activeProvider.available
                          ? "연결 준비됨"
                          : apiProvider || activeProvider.id === "road-music"
                            ? "연결 설정 필요"
                            : mediaProvider ? "연결 설정 필요" : "외부 서비스에서 작업"}
                    </strong>
                    <p>
                      {appImageHandoff
                        ? "요청과 이미지 참조를 앱에 가져가 생성한 다음 결과를 이 노드에 첨부하세요."
                        : activeProvider.detail}
                    </p>
                    <p>{activeProvider.billing}</p>
                    {apiProvider && (
                      <p>이 연결을 쓰면 API 사용량만큼 따로 과금됩니다.</p>
                    )}
                    {activeProvider.id === "topview" && !activeProvider.available && (
                      <p><a href="/api/providers/topview/connect" title="Topview 공식 계정을 연결합니다.">Topview 계정 연결</a></p>
                    )}
                    {activeProvider.id === "kling" && !activeProvider.available && (
                      <p>프로젝트 터미널에서 <code>./node_modules/.bin/kling login</code>으로 계정을 연결하세요.</p>
                    )}
                    {activeProvider.id === "higgsfield" && !activeProvider.available && (
                      <p>프로젝트 터미널에서 <code>./node_modules/.bin/higgsfield auth login</code>으로 계정을 연결하세요.</p>
                    )}
                    {mediaProvider && <button type="button" className="outline-button" onClick={() => void refreshProviders()} disabled={providerRefreshing} title="계정 연결과 사용 가능한 모델을 다시 확인합니다.">{providerRefreshing ? "확인 중" : "연결 상태 새로고침"}</button>}
                    {(!activeProvider.available || appImageHandoff) && (
                      <a
                        href={activeProvider.website}
                        title="서비스의 공식 사이트에서 로그인 또는 계정 설정을 확인합니다."
                        target="_blank"
                        rel="noreferrer"
                      >
                        {apiProvider
                          ? "계정 설정 안내"
                          : activeProvider.id === "road-music"
                            ? "설치 안내"
                            : "서비스 열기"}{" "}
                        <ArrowUpRight size={13} />
                      </a>
                    )}
                  </div>
                )}
                {mediaProvider && activeProvider?.available && model && (
                  profileState.key !== mediaKey ? <p className="footnote" role="status">모델 설정을 불러오는 중입니다.</p> : profileState.error ? <div><p className="footnote" role="alert">{profileState.error}</p><button type="button" className="outline-button" onClick={() => setProfileRevision((revision) => revision + 1)}>모델 설정 다시 불러오기</button></div> : profiles.length ? (
                    <MediaModelOptions profiles={profiles} selection={effectiveMediaSelection} attachments={attachments} references={requestReferences} video={videoWork}
                      preferredAspect={project?.productionSettings?.aspect}
                      onChange={(selection) => setMediaSelections((current) => ({ ...current, [mediaKey]: selection }))} />
                  ) : <p className="footnote">이 모델에서 사용 가능한 작업 방식이 없습니다.</p>
                )}
                {imageWork && activeProvider?.id === "codex" && <ImageOutputOptions value={imageOutput ?? {}} onChange={setImageOutput} />}
                {mediaWork && activeProvider?.available && <p className="footnote">{activeProvider.billing}</p>}
                </div>
                {!mediaWork && generationActions}
              </div>
            )}
          </TabsPanel>
          <TabsPanel className="panel-content" value="node" keepMounted>
            {tab === "node" &&
              (node ? (
                <div className="node-panel">
                  <div className="node-panel-title">
                    <span className={`kind-icon ${node.kind}`}>
                      {(() => {
                        const Icon = icons[node.kind];
                        return <Icon size={18} />;
                      })()}
                    </span>
                    <div>
                    <small>{node.imageEdit ? imageEditKinds[node.imageEdit.kind] : kindLabels[node.kind]}</small>
                      <h2>노드 편집</h2>
                    </div>
                    <button
                      className="icon-button delete-button studio-action"
                      data-tone="danger" data-size="icon"
                      aria-label="노드 삭제"
                      title="이 노드와 연결을 삭제합니다. 확인 후 적용됩니다."
                      onClick={removeNode}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                  {allowedOperations.includes("image") && <div className="node-video-entry">
                    <button type="button" className="studio-action" data-tone="primary" data-help="이 노드의 프롬프트와 참조를 바탕으로 이미지 제작을 준비합니다." onClick={openImageGeneration}>
                      <ImageIcon size={16} aria-hidden="true" /> 이미지 만들기
                    </button>
                    <button type="button" className="studio-action" aria-haspopup="dialog" data-help="장면 행동, 카메라, 조명과 미술 지시를 노드에 저장합니다." onClick={(event) => openNodeDirector(node.id, event.currentTarget)}>
                      <Clapperboard size={16} aria-hidden="true" /> 디렉터 스튜디오
                    </button>
                  </div>}
                  {canStartVideo(node) && <div className="node-video-entry">
                    <button type="button" className="studio-action" data-tone="primary" data-help="이 자료와 연결된 참조로 영상 제작을 준비하고 모델과 출력 옵션을 고릅니다." onClick={() => openVideo(node.id)}>
                      <Film size={17} aria-hidden="true" /> {node.kind === "scene" ? "이 씬 영상 만들기" : node.kind === "shot" ? "이 샷 영상 만들기" : "영상 만들기"}
                    </button>
                    {node.kind === "scene" && <p>클립 하나로 만들거나 아래 샷을 따로 생성해 타임라인에서 이어 붙이세요.</p>}
                    {node.kind === "scene" && linkedShots.length > 0 && <details className="request-preview">
                      <summary data-help="이 씬에 연결된 샷을 펼쳐 개별 영상 작업을 시작합니다.">샷별 영상 만들기 · {linkedShots.length}개</summary>
                      <div className="node-video-entry">
                        {linkedShots.map((shot) => (
                          <button key={shot.id} type="button" className="studio-action shot-video-link" data-help="이 샷으로 영상 제작 설정을 엽니다." onClick={() => openVideo(shot.id)}>
                            <Film size={15} aria-hidden="true" /><span>{shot.title || "제목 없는 샷"}</span><span>영상 만들기</span>
                          </button>
                        ))}
                      </div>
                    </details>}
                  </div>}
                  <button type="button" className="outline-button studio-action" aria-haspopup="dialog"
                    data-help="노드의 전체 내용과 첨부 파일을 별도 창에서 확인합니다."
                    onClick={(event) => openNodePreview(node.id, event.currentTarget)}>
                    {isDocumentNode(node) ? "문서 보기" : "노드 미리보기"}
                  </button>
                  <label className="field-label" htmlFor="node-title">
                    제목
                  </label>
                  <input
                    id="node-title"
                    title="노드의 이름을 편집합니다. 변경 내용은 자동 저장됩니다."
                    value={node.title}
                    maxLength={160}
                    onChange={(event) =>
                      updateNode({ title: event.target.value })
                    }
                  />
                  {isPromptNode(node) ? <button type="button" className="outline-button studio-action" aria-haspopup="dialog"
                    data-help="노드의 프롬프트를 읽고, 편집한 문구를 적용합니다."
                    onClick={(event) => openNodePreview(node.id, event.currentTarget, true)}>프롬프트 편집</button> :
                    !node.imageEdit && <>
                    <label className="field-label" htmlFor="node-body">내용</label>
                    <textarea
                      id="node-body"
                      title="기획과 대본 또는 연출 지시를 직접 편집합니다."
                      className="node-body"
                      value={node.body}
                      maxLength={24000}
                      onChange={(event) => updateNode({ body: event.target.value })}
                      placeholder="이 노드에 필요한 내용을 적어 주세요"
                    />
                  </>}
                  {node.kind === "shot" && <button className="outline-button studio-action" title="이 샷의 GLB 캐릭터, 포즈, 장면 배치와 렌더 설정을 엽니다." onClick={() => void openTool("blender")}>
                    {node.blenderScene ? "Blender 장면 다시 편집" : "Blender 3D 장면 설정"}
                  </button>}
                  {editSource && imageEditTarget?.sourceId === node.id && !editTarget ? (
                    <ImageEditStudio key={`direction:${node.id}`}
                      source={editSource}
                      onCreate={(kind) => {
                        try { addImageEdit(kind); }
                        catch (cause) { setError((cause as Error).message); }
                      }}
                      onUpdate={saveImageDirection}
                      onClose={() => setImageEditTarget(null)} />
                  ) : node.asset?.type === "image" && (
                    <button type="button" className="outline-button studio-action" data-help="현재 이미지로 감정, 조명, 카메라 등 연출 작업을 시작합니다." onClick={() => openImageEdit(node)}>
                      <ImageIcon size={16} aria-hidden="true" /> {node.imageEdit ? "이 결과에서 연출 추가" : "연출 추가"}
                    </button>
                  )}
                  {project && node.asset?.type === "image" && (
                    gridNodeId === node.id ? <PortraitGridStudio key={`${project.id}-${node.id}-${node.asset.url}`} project={project} node={node}
                      initialLayout={initialGridLayout}
                      onUpdate={(portraitGrid) => updateNode({ portraitGrid })}
                      onVideo={(cutIds, config) => connectStoryboardVideo(node.id, cutIds, config)}
                      save={async () => {
                        const current = (await save()) && projectRef.current?.id === project.id ? projectRef.current : null;
                        gridSnapshot.current = current ? { project: current, revision: revision.current } : null;
                        return current;
                      }}
                      onClose={() => setGridNodeId(null)}
                      onAdopt={(next) => {
                        const snapshot = gridSnapshot.current;
                        if (snapshot) acceptProjectGraph(snapshot.project, next, snapshot.revision);
                      }} />
                    : <button className="outline-button studio-action" type="button" data-help="시트의 컷 경계를 맞추고 선택한 컷을 개별 이미지로 분리합니다." onClick={() => setGridNodeId(node.id)}>이미지 시트 분할</button>
                  )}
                  {node.imageEdit && imageEditTarget?.editId !== node.id && <ImageEditResults node={node} edit={node.imageEdit}
                    source={imageEditSourceNode} runs={projectRuns}
                    onEdit={() => openImageEdit(imageEditSourceNode ?? node, node.id)}
                    onBind={bindImageEditSourceAsset}
                    onAdopt={applyRun} />}
                  {node.imageEdit && imageEditTarget?.editId !== node.id && (
                    <>
                      {hasImageEditInput && <button type="button" className="outline-button studio-action" onClick={() => {
                        if (!node.imageEdit) return;
                        try { addImageEdit(node.imageEdit.kind, node); }
                        catch (cause) { setError((cause as Error).message); }
                      }}>같은 원본에서 변형</button>}
                      <button type="button" className="outline-button studio-action" data-help="편집 노드의 생성 모델과 옵션을 설정하는 제작 탭을 엽니다." onClick={() => setTab("agent")}>
                        <Sparkles size={16} aria-hidden="true" /> 생성 모델과 실행
                      </button>
                    </>
                  )}
                  {node.blenderTake && <p className="footnote">Blender {node.blenderTake.quality === "preview" ? "프리비즈" : "최종 테이크"} · {node.blenderTake.scene.seconds}초 · {node.blenderTake.scene.camera.lens}mm</p>}
                  {project && node.kind === "character" && <>
                    <CharacterIdentityPanel key={`${project.id}:${node.id}`}
                      node={node} projectId={project.id} prepare={() => prepareCharacterIdentity(project.id, node.id)}
                      onSave={(identity) => saveCharacterIdentity(project.id, node.id, identity)} onPortrait={openSoulPortrait} />
                    <button type="button" className="studio-action" aria-haspopup="dialog"
                      onClick={(event) => void openTool("tts-sample", event.currentTarget)}>
                      <AudioLines size={16} aria-hidden="true" /> TTS 등록 샘플 만들기
                    </button>
                  </>}
                  {project && (node.kind === "script" || node.kind === "scenario" || node.kind === "audioCue") &&
                    <button type="button" className="studio-action" aria-haspopup="dialog"
                      onClick={(event) => setTtsTarget({ projectId: project.id, nodeId: node.id, trigger: event.currentTarget })}>
                      <AudioLines size={16} aria-hidden="true" /> 대사 음성 만들기
                    </button>}
                  {node.kind === "audioCue" && <>
                    {voiceActorPicker}
                    <button type="button" className="studio-action" onClick={() => {
                      selectChoice("higgsfield", undefined, undefined, "audio");
                      setWorkOperation("audio");
                      setMention(null);
                      setTab("agent");
                    }}><AudioLines size={16} aria-hidden="true" /> 등록 목소리로 VO 만들기</button>
                    <CharacterVoiceRecorder key={`voice:${node.id}`} name={node.title} disabled={uploading} onAttach={upload} />
                  </>}
                  {(["character", "referenceImage", "referenceVideo", "audioCue", "keyframe"] as Kind[]).includes(node.kind) &&
                    <NodeElementPanel key={`element:${node.id}`} node={node} onChange={updateNode} />}
                  {node.motionShort && <button className="outline-button studio-action" title="장면 문구, 길이와 모션을 다시 열어 새 테이크로 저장합니다." onClick={async () => {
                    if (await save() && projectRef.current?.id === project?.id) {
                      setMotionEditId(node.id);
                      setTool("motion");
                    }
                  }}>모션 숏 다시 편집</button>}
                  {node.kind === "switch" && (
                    <div className="switch-takes">
                      <span className="field-label">연결된 영상 비교</span>
                      <p className="footnote">
                        영상 노드 두 개를 참조로 연결한 뒤 채택할 테이크를
                        선택하세요.
                      </p>
                      {project?.graph.edges
                        .filter((edge) => edge.target === node.id)
                        .map((edge) =>
                          project.graph.nodes.find(
                            (item) => item.id === edge.source,
                          ),
                        )
                        .filter((item) => item?.asset?.type === "video")
                        .map(
                          (item) =>
                            item && (
                              <div className="switch-take" key={item.id}>
                                <strong>{item.title}</strong>
                                <video
                                  src={item.asset!.url}
                                  controls
                                  preload="metadata"
                                />
                                <button
                                  className="outline-button studio-action"
                                  onClick={() =>
                                    updateNode({ asset: item.asset })
                                  }
                                >
                                  {node.asset?.url === item.asset?.url
                                    ? "채택됨"
                                    : "이 테이크 채택"}
                                </button>
                              </div>
                            ),
                        )}
                    </div>
                  )}
                  <div className="input-references">
                    <span className="field-label">참조하는 노드</span>
                    {project?.graph.edges
                      .filter((edge) => edge.target === node.id)
                      .map((edge) => {
                        const source = project.graph.nodes.find(
                          (item) => item.id === edge.source,
                        );
                        return (
                          source && (
                            <div className="reference-entry" key={edge.source}>
                              <div className="reference-row">
                                <span>
                                  {source.title || kindLabels[source.kind]}
                                </span>
                                <button
                                  className="icon-button"
                                  aria-label={`${source.title} 연결 해제`}
                                  title="이 참조 연결을 삭제합니다. 원본 노드는 유지됩니다."
                                  onClick={() => disconnectInput(source.id)}
                                >
                                  <X size={15} />
                                </button>
                              </div>
                              <div className="reference-settings">
                                <label>
                                  사용 범위
                                  <select
                                    title="생성할 때 보낼지, 캔버스에서만 연출 확인용으로 쓸지 고릅니다."
                                    value={edge.usage || "input"}
                                    onChange={(event) =>
                                      updateInput(source.id, {
                                        usage: event.target.value as
                                          "input" | "guide",
                                      })
                                    }
                                  >
                                    <option value="input">생성에 전송</option>
                                    <option value="guide">연출 확인용</option>
                                  </select>
                                </label>
                                <label>
                                  참조 역할
                                  <select
                                    title="이 참조의 용도를 지정합니다. 역할에 따라 가능한 자료 형식이 다릅니다."
                                    value={edge.role || "context"}
                                    onChange={(event) =>
                                      updateInput(source.id, {
                                        role: event.target
                                          .value as GraphEdge["role"],
                                      })
                                    }
                                  >
                                    {roles.map((role) => (
                                      <option key={role} value={role}>
                                        {role === "context"
                                          ? "일반 · 내용 참고"
                                          : roleLabels[role]}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                            </div>
                          )
                        );
                      })}
                    <select
                      aria-label="참조할 노드 연결"
                      title="기존 노드를 입력 자료로 연결합니다. 순환 연결은 제외됩니다."
                      value=""
                      onChange={(event) => connectInput(event.target.value)}
                    >
                      <option value="">참조 노드 추가</option>
                      {project?.graph.nodes
                        .filter((item) =>
                          canConnect(project.graph, item.id, node.id),
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title || kindLabels[item.kind]}
                          </option>
                        ))}
                    </select>
                    <p>
                      연출 확인용 자료는 견적·생성 요청과 외부 복사에서
                      제외됩니다.
                    </p>
                  </div>
                  {node.asset?.url.startsWith("/sample/") && (
                    <p className="sample-credit">
                      Omni AI Canvas 예제 · 2026.11.22 ·{" "}
                      {node.asset.type === "video"
                        ? "스틸을 FFmpeg로 확대한 모션 테스트"
                        : "ChatGPT 이미지 생성"}
                    </p>
                  )}
                  {node.asset && (
                    <div className="asset-preview">
                      {node.asset.type === "image" ? (
                        <Image
                          src={node.asset.url}
                          alt={node.asset.name}
                          width={600}
                          height={400}
                          unoptimized
                        />
                      ) : node.asset.type === "audio" ? (
                        <audio src={node.asset.url} controls />
                      ) : (
                        <video src={node.asset.url} controls />
                      )}
                      <a
                        href={node.asset.url}
                        download
                        title="이 노드에 첨부한 원본 파일을 내려받습니다."
                      >
                        {node.asset.name} <ArrowDownToLine size={14} />
                      </a>
                    </div>
                  )}
                  <input
                    ref={uploadRef}
                    type="file"
                    accept={
                      expectedAssetType(node.kind) === "video"
                        ? "video/mp4,video/webm"
                        : expectedAssetType(node.kind) === "audio"
                          ? "audio/wav,audio/x-wav,audio/mpeg"
                          : "image/png,image/jpeg,image/webp"
                    }
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void upload(file);
                      event.target.value = "";
                    }}
                  />
                  <button
                    className="outline-button studio-action"
                    data-help="이 노드 종류에 맞는 파일을 첨부합니다. 새 파일은 기존 첨부를 대체합니다."
                    disabled={uploading}
                    onClick={() => uploadRef.current?.click()}
                  >
                    <Upload size={16} />{" "}
                    {uploading
                      ? "업로드 중"
                      : expectedAssetType(node.kind) === "video"
                        ? "영상 첨부"
                        : expectedAssetType(node.kind) === "audio"
                          ? "오디오 첨부"
                          : "이미지 첨부"}
                  </button>
                  {!node.imageEdit && !allowedOperations.includes("video") && !allowedOperations.includes("image") && <button
                    className="run-button studio-action" data-tone="primary"
                    title="이 노드를 대상으로 에이전트 요청을 작성합니다."
                    onClick={() => setTab("agent")}
                  >
                    <Sparkles size={16} /> {nodeOperations(node.kind).length > 1 ? "이 노드로 제작" : "본문 수정 제안"}
                  </button>}
                </div>
              ) : (
                <div className="empty-panel">
                  <Mascot pose="empty" size={120} />
                  <h2>{workroomScenes.length ? "씬에서 시작하세요" : "캔버스에서 노드를 선택해 주세요"}</h2>
                  <p>{workroomScenes.length ? "씬을 고르면 영상 만들기와 연결된 샷을 볼 수 있습니다. 캔버스에서 다른 노드를 선택해도 됩니다." : "대본, 이미지 같은 자료를 선택하면 제목과 내용, 참조를 편집할 수 있습니다."}</p>
                  {workroomScenes.length > 0 && <div className="node-video-entry">
                    {workroomScenes.map((scene) => (
                      <button type="button" key={scene.id} className="studio-action shot-video-link" data-help="이 씬을 선택하고 제목, 내용, 연결된 샷과 영상 작업을 확인합니다." onClick={() => selectBoardNode(scene.id, true)}>
                        <ListVideo size={16} aria-hidden="true" /><span>{scene.title || "제목 없는 씬"}</span>
                      </button>
                    ))}
                  </div>}
                </div>
              ))}
          </TabsPanel>
          <TabsPanel className="panel-content" value="runs" keepMounted>
            {tab === "runs" && (
              <div className="runs-panel">
                <h2>실행 기록</h2>
                <p className="panel-description">
                  요청한 작업과 결과를 확인합니다.
                </p>
                {runsError && (
                  <div className="run-error" role="alert">
                    {runsError}{" "}
                    <button
                      className="text-button"
                      title="현재 프로젝트의 실행 기록을 다시 불러옵니다."
                      onClick={() => project && void refreshRuns(project.id)}
                    >
                      다시 불러오기
                    </button>
                  </div>
                )}
                {runsCursor && <button type="button" className="outline-button" data-help="현재 목록보다 오래된 실행 기록을 불러옵니다." disabled={loadingMoreRuns} onClick={() => void loadMoreRuns()}>
                  {loadingMoreRuns ? "불러오는 중…" : "이전 실행 더 보기"}
                </button>}
                {runs.length === 0 ? (
                  <div className="empty-runs">
                    <Mascot pose="plan" size={120} />
                    <p>아직 실행한 작업이 없습니다.</p>
                  </div>
                ) : (
                  runs.map((run) => (
                    <article className="run-item" key={run.id}>
                      <div className="run-heading">
                        <strong>
                          {providers.find(
                            (item) => item.id === run.input.provider,
                          )?.label || run.input.provider}
                        </strong>
                        <span className={`run-status ${run.status}`}>
                          {
                            {
                              queued: "대기 중",
                              running: "생성 중",
                              succeeded: "완료",
                              failed: "실패",
                            }[run.status]
                          }
                        </span>
                      </div>
                      {run.status === "queued" && (
                        <button type="button" className="outline-button" disabled={!!wakingRun}
                          data-help="새 요청을 만들지 않고 대기 중인 작업을 처리하도록 실행기를 시작합니다."
                          onClick={() => void wakeRun(run)}>
                          {wakingRun === run.id ? "실행기 시작 중…" : "대기 작업 시작"}
                        </button>
                      )}
                      {run.input.model && <p>모델 {run.input.model}</p>}
                      {run.input.effort && <p>추론 강도 {effortLabels[run.input.effort]}</p>}
                      {run.input.media?.mode && <p>작업 방식 {run.input.media.mode}</p>}
                      {providers.find((item) => item.id === run.input.provider)?.billing && (
                        <p>{providers.find((item) => item.id === run.input.provider)?.billing}</p>
                      )}
                      <p>{run.input.prompt}</p>
                      {Boolean(run.input.attachments?.length) && (
                        <details className="request-preview">
                          <summary title="이 요청을 보낼 때 선택한 첨부와 처리 범위를 확인합니다.">
                            첨부 자료 {run.input.attachments!.length}개
                          </summary>
                          <ul>
                            {run.input.attachments!.map((item) => (
                              <li key={item.id}>
                                <strong>{item.name}</strong>
                                <br />
                                {item.detail}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      <time>
                        {new Date(run.createdAt).toLocaleString("ko-KR")}
                      </time>
                      {run.externalId && (
                        <p>서비스 작업 번호 {run.externalId}</p>
                      )}
                      {run.error && <p className="run-error">{run.error}</p>}
                      {run.result?.text && (
                        <div className="run-result">{run.result.text}</div>
                      )}
                      {run.result?.asset &&
                        (run.result.asset.type === "image" ? (
                          <Image
                            className="result-media"
                            src={run.result.asset.url}
                            alt={run.result.asset.name}
                            width={600}
                            height={400}
                            unoptimized
                          />
                        ) : run.result.asset.type === "audio" ? (
                          <audio
                            className="result-media"
                            src={run.result.asset.url}
                            controls
                          />
                        ) : (
                          <video
                            className="result-media"
                            src={run.result.asset.url}
                            controls
                          />
                        ))}
                      {run.result?.plan && (
                        <DirectorPlanPreview graph={run.result.plan} />
                      )}
                      {run.result?.review && project && (
                        <DirectorReview
                          graph={project.graph}
                          run={run}
                          onApply={(notes) => applyReview(run, notes)}
                        />
                      )}
                      {run.status === "succeeded" &&
                        run.result &&
                        !run.result.review && !run.input.chat && !run.input.guidanceEdit && !run.input.presetDesign && !run.input.motionDesign && (
                          <button
                            className="outline-button"
                            title="생성 결과를 확인하고 현재 캔버스에 적용합니다."
                            onClick={() => applyRun(run)}
                          >
                            <Plus size={15} /> 결과 적용
                          </button>
                        )}
                    </article>
                  ))
                )}
              </div>
            )}
          </TabsPanel>
          </Tabs>
          {tab === "agent" && mediaWork && generationActions}
          <WorkroomGuide dialog={workroomGuideDialog} topic={workroomGuideTopic}
            onClose={() => {
              setWorkroomGuideTopic(null);
              if (helpMode !== "workroom") workroomGuideOpener.current?.focus({ preventScroll: true });
            }} onInspect={() => {
              setHelpMode("workroom");
              requestAnimationFrame(() => workroomHelpExit.current?.focus({ preventScroll: true }));
            }} />
        </dialog>
      </main>
      <HelpTooltips inspect={helpMode !== null} inspectScope={helpMode === "workroom" ? ".inspector" : null}
        onExit={exitHelpMode} />
      {directorNode && directorTarget && <NodeDirectorStudio key={`${directorTarget.projectId}:${directorTarget.nodeId}`}
        title={directorNode.title || kindLabels[directorNode.kind]} value={directorNode.directorNote ?? ""} preview={directorPreview}
        onApply={(direction) => {
          if (projectRef.current?.id !== directorTarget.projectId || direction.length > 2000) return;
          edit((current) => ({ ...current, graph: { ...current.graph, nodes: current.graph.nodes.map((item) =>
            item.id === directorTarget.nodeId ? { ...item, directorNote: direction || undefined } : item) } }));
        }} onClose={() => {
          const { trigger } = directorTarget;
          setDirectorTarget(null);
          requestAnimationFrame(() => {
            if (trigger.isConnected) trigger.focus({ preventScroll: true });
          });
        }} />}
      {error && !panelExpanded && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          {saveState === "error" && (
            <button
              title="현재 편집 내용을 다시 저장합니다."
              onClick={() => void save()}
            >
              <RotateCcw size={14} /> 다시 저장
            </button>
          )}
          {saveState === "conflict" && (
            <>
              <button
                title="현재 편집 내용을 JSON 파일로 보관합니다."
                onClick={download}
              >
                <ArrowDownToLine size={14} /> 내 작업 내보내기
              </button>
              <button
                title="현재 편집 내용을 버리고 저장된 최신 프로젝트를 불러옵니다."
                onClick={() => {
                  if (
                    project &&
                    confirm(
                      "현재 편집 내용을 버리고 저장된 프로젝트를 다시 불러올까요?",
                    )
                  )
                    void loadProject(project.id).catch((cause) => setError((cause as Error).message));
                }}
              >
                저장본 불러오기
              </button>
            </>
          )}
          <button
            aria-label="오류 닫기"
            title="오류 안내를 닫습니다."
            onClick={() => setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
