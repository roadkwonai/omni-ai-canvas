"use client";
import TimelineWords from "./TimelineWords";
import LensTransitionPanel from "./LensTransitionPanel";
import ManualLensSourcesForm from "./ManualLensSourcesForm";
import { insertLensTransition, isLegacyLensTransitionNode, legacyLensTransitionFrames, lensCutPairs, resolveLegacyLensTransition, resolveManualLegacyLensTransition, updateLensTransition, withLensStartFrames, type LensAnchorCheckpoint, type LensAnchorTransfer, type LensCorrection, type LensMask, type LensPoint, type LensReview, type LensStartFrames, type LensTransitionResult, type ManualLensSources } from "../lib/lens-transition-spec";
import { acceptsTimelineEdit, discardTimelineAttempt, timelineKey } from "../lib/timeline-edit";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Clapperboard, Download, PackageCheck, Save, Scissors, X } from "lucide-react";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import { audioSource, clipRanges, clipSource, moveClip, removeClip, timecode, timelineIssues, trimAudio, trimClip } from "../lib/timeline-layout";
import {
  TIMELINE_MAX_AUDIO,
  TIMELINE_MAX_CLIPS,
  TIMELINE_MAX_FRAMES,
  TIMELINE_MAX_WORDS,
  type TimelineAudio,
  type TimelineClip,
  type TimelineSpec,
} from "../lib/timeline-spec";
import type { Asset, CanvasNode, Graph, Project } from "../lib/types";
import { serializeTimelineWords } from "../lib/timeline-captions";
import { TimelineAudioFields, TimelineClipFields } from "./TimelineFields";
import TimelineMonitor, { TimelineAddMenu, type TimelinePanel } from "./TimelineMonitor";
import { useTimelineMedia } from "./useTimelineMedia";
import "./timeline.css";

type Props = {
  project: Project;
  onGraphChange: (graph: Graph) => void;
  save: () => Promise<Project | null>;
  selected: string | null;
  onClose: () => void;
};

type LensSourceSelection = { kind: "legacy"; sources?: ManualLensSources } |
  { kind: "saved"; choosing: boolean; starts?: LensStartFrames };
type LensAnchorPreview = { image: Blob; transfer?: LensAnchorTransfer };
const empty: TimelineSpec = { aspect: "16:9", clips: [], audio: [] };
const aspects = [["16:9", "가로"], ["9:16", "세로"], ["1:1", "정사각형"]] as const;
const busyLabels = { save: "저장 중…", preview: "프리비즈 합성 중…", final: "납품본 합성 중…", lens: "렌즈 전환 처리 중…" };
const clip = (nodeId: string | null): TimelineClip => ({
  nodeId,
  durationFrames: 90,
  inFrame: 0,
  transition: "cut",
  transitionFrames: 0,
});

export default function TimelineStudio({
  project,
  onGraphChange,
  save,
  selected,
  onClose,
}: Props) {
  const initial = project.graph.nodes.find(
    (node) => node.id === selected && node.kind === "previs",
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const [timelineId, setTimelineId] = useState(
    () => initial?.id ?? crypto.randomUUID(),
  );
  const [draft, setDraft] = useState<TimelineSpec>(initial?.timeline ?? empty);
  const [busyTask, setBusyTask] = useState<keyof typeof busyLabels | null>(null);
  const busy = busyTask !== null;
  const [panel, setPanel] = useState<TimelinePanel>("clip");
  const [clipChoice, setClipChoice] = useState(0);
  const [audioChoice, setAudioChoice] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const busyTrigger = useRef<HTMLElement | null>(null);
  const [editingClip, setEditingClip] = useState<{ id: string; index: number } | null>(null);
  const [sourceSelection, setSourceSelection] = useState<LensSourceSelection | null>(null);
  const [result, setResult] = useState<{ asset: Asset; mode: "preview" | "final"; notes: string[] } | null>(null);
  const [message, setMessage] = useState("");
  const current = useRef(project);
  const [savedSpec, setSavedSpec] = useState<string | null>(
    () => timelineKey(initial?.timeline),
  );
  const baseline = useRef<string | null>(savedSpec);
  const renderedVersion = useRef<number | null>(null);
  const renderedGraph = useRef<string | null>(null);
  const attempted = useRef<string | null>(null);
  const beforeAttempt = useRef(new Map<string, CanvasNode | null>());
  const [attemptPending, setAttemptPending] = useState(false);
  const [wordTarget, setWordTarget] = useState<{ index: number } | null>(null);
  const lensAnchor = useRef<{ key: string; version: number } | null>(null);
  const lensRenderSnapshot = useRef<{ draft: string; graph: string } | null>(null);
  const savedStartsTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    current.current = project;
  }, [project]);
  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);
  const visuals = project.graph.nodes.filter(
    (node) =>
      node.id !== timelineId &&
      (["shot", "keyframe", "video"].includes(node.kind) ||
        node.asset?.type === "image" ||
        node.asset?.type === "video"),
  );
  const sounds = project.graph.nodes.filter(
    (node) => node.kind === "audioCue" || node.asset?.type === "audio",
  );
  const ranges = clipRanges(draft.clips);
  const totalFrames = ranges.at(-1)?.end ?? 0;
  const clipIndex = Math.min(clipChoice, Math.max(0, draft.clips.length - 1));
  const audioIndex = Math.min(audioChoice, Math.max(0, draft.audio.length - 1));
  const nodes = useMemo(() => new Map<string, CanvasNode>(project.graph.nodes.map((node) => [node.id, node])), [project.graph.nodes]);
  const media = useTimelineMedia(draft, nodes);
  const secondsOf = (nodeId: string | null) => media.seconds.get(nodes.get(nodeId ?? "")?.asset?.url ?? "");
  const issues = useMemo(() => timelineIssues(draft, { nodes, seconds: media.seconds }), [draft, nodes, media.seconds]);
  const slates = draft.clips.filter((item) => clipSource(item.nodeId, nodes) === "slate").length;
  const silent = draft.audio.filter((item) => audioSource(item.nodeId, nodes) === "silent").length;
  const draftKey = useMemo(() => timelineKey(draft), [draft]);
  const dirty = attemptPending || draftKey !== (savedSpec ?? timelineKey(empty));
  const isEmpty = !draft.clips.length && !draft.audio.length && !draft.words?.length;
  const otherTimelines = project.graph.nodes.filter((node) => node.kind === "previs" && node.timeline?.clips.length && node.id !== timelineId);

  const savedTransitions = draft.clips.flatMap((entry, index) => {
    const node = nodes.get(entry.nodeId ?? "");
    if (!node || (!node.lensTransition && !isLegacyLensTransitionNode(node))) return [];
    const source = node.lensTransition ?? resolveLegacyLensTransition(project.graph, draft, index, node.id);
    return [{ id: node.id, index, recipe: node.lensTransition, source, frames: source?.frames ?? legacyLensTransitionFrames(node) }];
  });
  const editTransition = savedTransitions.find(({ id, index }) => id === editingClip?.id && index === editingClip.index);
  const manualSources = sourceSelection?.kind === "legacy" ? sourceSelection.sources : undefined;
  const sourceStarts = sourceSelection?.kind === "saved" ? sourceSelection.starts : undefined;
  const choosingSavedStarts = sourceSelection?.kind === "saved" && sourceSelection.choosing;
  const savedRecipe = editTransition?.recipe;
  const updatedSource = savedRecipe && sourceStarts ? withLensStartFrames(savedRecipe, sourceStarts) : undefined;
  const manualEdit = editTransition && !editTransition.recipe && editTransition.frames !== null &&
    (!editTransition.source || sourceSelection?.kind === "legacy");
  const editSource = !manualEdit ? updatedSource ?? editTransition?.source : manualSources
    ? resolveManualLegacyLensTransition(project.graph, draft, editTransition.index, editTransition.id, manualSources)
    : null;
  const lensPairs = editTransition && editSource ? [{
    cutIndex: editTransition.index, maxFrames: editSource.frames,
    outgoingTitle: nodes.get(editSource.outgoing.nodeId)?.title ?? editSource.outgoing.asset.name,
    incomingTitle: nodes.get(editSource.incoming.nodeId)?.title ?? editSource.incoming.asset.name,
  }] : lensCutPairs(project.graph, draft);

  function openLensEditor(clip: { id: string; index: number } | null, chooseSources = false) {
    lensAnchor.current = null;
    lensRenderSnapshot.current = null;
    setEditingClip(clip);
    setSourceSelection(chooseSources ? { kind: "legacy" } : null);
    setMessage("");
  }

  function finishSavedStarts(starts: LensStartFrames | undefined) {
    setSourceSelection(starts ? { kind: "saved", choosing: false, starts } : null);
    savedStartsTrigger.current?.focus();
  }

  function selectSavedStarts({ outgoingStart, incomingStart }: LensStartFrames) {
    if (!savedRecipe || !editSource) return;
    if (outgoingStart === editSource.outgoing.startFrame && incomingStart === editSource.incoming.startFrame) {
      finishSavedStarts(sourceStarts);
      return;
    }
    lensAnchor.current = null;
    lensRenderSnapshot.current = null;
    setMessage("");
    finishSavedStarts(outgoingStart === savedRecipe.outgoing.startFrame && incomingStart === savedRecipe.incoming.startFrame
      ? undefined : { outgoingStart, incomingStart });
  }

  // 실행하는 동안 누른 버튼이 잠겨도 포커스를 창 안에 둔다.
  function startTask(task: keyof typeof busyLabels) {
    if (document.activeElement instanceof HTMLElement) busyTrigger.current = document.activeElement;
    setBusyTask(task);
    dialog.current?.focus();
  }
  useEffect(() => {
    if (busy || (document.activeElement !== dialog.current && document.activeElement !== document.body)) return;
    busyTrigger.current?.focus();
    busyTrigger.current = null;
  }, [busy]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function markSaved(spec: string | null) {
    baseline.current = spec;
    attempted.current = null;
    beforeAttempt.current.clear();
    setAttemptPending(false);
    setSavedSpec(spec);
  }
  // 저장에 실패하면 보드에 남은 값을 버릴 수 있게 시도 전 노드를 기억한다.
  function attempt(spec: TimelineSpec, graph: Graph, ids: string[]) {
    for (const id of ids)
      if (!beforeAttempt.current.has(id)) beforeAttempt.current.set(id, current.current.graph.nodes.find((node) => node.id === id) ?? null);
    attempted.current = timelineKey(spec);
    setAttemptPending(true);
    onGraphChange(graph);
  }
  function confirmDiscard(action: string) {
    if (!dirty) return true;
    if (!window.confirm(`저장하지 않은 타임라인 변경을 버리고 ${action}`)) return false;
    if (beforeAttempt.current.size) onGraphChange(discardTimelineAttempt(current.current.graph, beforeAttempt.current));
    return true;
  }
  function openTimeline(node: CanvasNode) {
    if (!confirmDiscard("다른 타임라인을 열까요?")) return;
    setTimelineId(node.id);
    setDraft(node.timeline ?? empty);
    markSaved(timelineKey(node.timeline));
    openLensEditor(null);
    setResult(null);
    select("clip", 0);
    dialog.current?.focus();
  }
  function close() {
    if (!busy && confirmDiscard("닫을까요?")) dialog.current?.close();
  }
  const escapeOutside = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented || dialog.current?.contains(event.target as Node)) return;
    event.preventDefault();
    close();
  });
  useEffect(() => {
    window.addEventListener("keydown", escapeOutside);
    return () => window.removeEventListener("keydown", escapeOutside);
  }, []);
  function select(next: TimelinePanel, index?: number) {
    setPanel(next);
    if (index === undefined) return;
    if (next === "clip") setClipChoice(index);
    if (next === "audio") setAudioChoice(index);
    if (next === "words") setWordTarget({ index });
  }
  function viewResult(shown: boolean) {
    setShowResult(shown);
    if (panel === "lens") setPanel("clip");
  }
  function edit(next: TimelineSpec) {
    setDraft(next);
    setResult(null);
    setMessage("");
  }
  const updateClip = (index: number, patch: Partial<TimelineClip>) =>
    edit({ ...draft, clips: draft.clips.map((item, position) => position === index ? { ...item, ...patch } : item) });
  const updateAudio = (index: number, patch: Partial<TimelineAudio>) =>
    edit({ ...draft, audio: draft.audio.map((item, position) => position === index ? { ...item, ...patch } : item) });
  function addClip(nodeId: string | null) {
    edit({ ...draft, clips: [...draft.clips, clip(nodeId)] });
    select("clip", draft.clips.length);
  }
  function addAudio(nodeId: string, startFrame: number) {
    edit({ ...draft, audio: [...draft.audio, { nodeId, startFrame, inFrame: 0, durationFrames: Math.min(30, totalFrames - startFrame), gain: 1, fadeInFrames: 0, fadeOutFrames: 0 }] });
    select("audio", draft.audio.length);
  }
  async function persistTimeline() {
    if (issues[0]?.blocking) throw new Error(issues[0].text);
    const active = current.current;
    if (active.id !== project.id) throw new Error("프로젝트가 바뀌었습니다. 다시 열어 주세요.");
    const existing = active.graph.nodes.find((node) => node.id === timelineId);
    const boardSpec = timelineKey(existing?.timeline);
    const requestedSpec = timelineKey(draft);
    if (!acceptsTimelineEdit(baseline.current, boardSpec, attempted.current))
      throw new Error("타임라인이 다른 곳에서 변경됐습니다. 다시 열어 주세요.");
    if (boardSpec !== requestedSpec) {
      const timelineNode = existing
        ? { ...existing, timeline: draft, asset: undefined }
        : { id: timelineId, kind: "previs" as const, title: "프리비즈", body: "", x: 80, y: 80, timeline: draft };
      const graph = {
        ...active.graph,
        nodes: existing
          ? active.graph.nodes.map((node) => node.id === timelineId ? timelineNode : node)
          : [...active.graph.nodes, timelineNode],
      };
      attempt(draft, graph, [timelineId]);
    }
    const saved = await save();
    const savedTimeline = saved?.graph.nodes.find((node) => node.id === timelineId)?.timeline;
    if (!saved || saved.id !== active.id || timelineKey(savedTimeline) !== requestedSpec)
      throw new Error("타임라인을 저장하지 못했습니다. 다시 시도해 주세요.");
    current.current = saved;
    markSaved(requestedSpec);
    return saved;
  }

  async function requestLens(cutIndex: number, frames: number, selection?: { action: "reanchor"; anchorCheckpoints: LensAnchorCheckpoint[] }): Promise<LensAnchorPreview>;
  async function requestLens(cutIndex: number, frames: number, selection: { action: "render"; mask: LensMask; corrections: LensCorrection[]; anchorCheckpoints?: LensAnchorCheckpoint[] }): Promise<LensTransitionResult>;
  async function requestLens(cutIndex: number, frames: number, selection: { action: "review"; mask: LensMask; corrections: LensCorrection[] }): Promise<LensReview>;
  async function requestLens(cutIndex: number, frames: number, selection: { action: "detect"; point: LensPoint }): Promise<LensPoint[]>;
  async function requestLens(cutIndex: number, frames: number, selection?:
    { action: "review" | "render"; mask: LensMask; corrections: LensCorrection[]; anchorCheckpoints?: LensAnchorCheckpoint[] } |
    { action: "detect"; point: LensPoint } | { action: "reanchor"; anchorCheckpoints: LensAnchorCheckpoint[] }):
    Promise<LensAnchorPreview | LensReview | LensTransitionResult | LensPoint[]> {
    startTask("lens");
    try {
      const saved = await persistTimeline();
      const key = JSON.stringify([timelineId, cutIndex, frames, draft, editTransition?.id, manualSources, sourceStarts]);
      if (selection && (lensAnchor.current?.key !== key || lensAnchor.current.version !== saved.version))
        throw new Error("타임라인이 변경됐습니다. 기준 프레임을 다시 불러와 주세요.");
      const reanchor = selection?.action === "reanchor" || (!selection && sourceStarts && savedRecipe && sourceStarts.outgoingStart !== savedRecipe.outgoing.startFrame);
      const response = await fetch(`/api/projects/${saved.id}/lens-transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timelineId, version: saved.version, cutIndex, frames, transitionId: editTransition?.id,
          manualSources: manualEdit ? manualSources : undefined, sourceStarts, ...(selection ?? { action: reanchor ? "reanchor" : "anchor" }) }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "렌즈 전환을 처리하지 못했습니다.");
      }
      if (selection?.action === "detect") {
        const { outline }: { outline: LensPoint[] } = await response.json();
        return outline;
      }
      if (selection?.action === "review") {
        const review: LensReview = await response.json();
        lensRenderSnapshot.current = null;
        return review;
      }
      if (selection?.action === "render") {
        const payload: LensTransitionResult = await response.json();
        lensRenderSnapshot.current = { draft: JSON.stringify(draft), graph: JSON.stringify(saved.graph) };
        return payload;
      }
      const payload: { image: string; transfer: LensAnchorTransfer } | undefined = reanchor ? await response.json() : undefined;
      const image = payload ? await fetch(payload.image).then((value) => value.blob()) : await response.blob();
      lensAnchor.current = { key, version: saved.version };
      lensRenderSnapshot.current = null;
      return payload ? { image, transfer: payload.transfer } : { image };
    } finally {
      setBusyTask(null);
    }
  }

  async function applyLens(result: LensTransitionResult) {
    const active = current.current;
    const snapshot = lensRenderSnapshot.current;
    if (!snapshot || active.id !== project.id || active.version !== result.version ||
        result.transitionId !== editTransition?.id ||
        JSON.stringify(active.graph) !== snapshot.graph || JSON.stringify(draft) !== snapshot.draft)
      throw new Error("렌더 이후 타임라인이나 원본이 변경됐습니다. 전환을 다시 만들어 주세요.");
    startTask("lens");
    try {
      const transitionId = editTransition?.id ?? crypto.randomUUID();
      const graph = editTransition
        ? updateLensTransition(active.graph, timelineId, result, transitionId, manualEdit ? manualSources : undefined, sourceStarts)
        : insertLensTransition(active.graph, timelineId, result, transitionId);
      const applied = graph.nodes.find(({ id }) => id === timelineId)!.timeline!;
      attempt(applied, graph, [timelineId, transitionId]);
      setDraft(applied);
      setResult(null);
      const saved = await save();
      const stored = saved?.graph.nodes.find(({ id }) => id === timelineId)?.timeline;
      const savedTransition = saved?.graph.nodes.find(({ id }) => id === transitionId);
      if (!saved || saved.id !== active.id || timelineKey(stored) !== attempted.current ||
        savedTransition?.asset?.url !== result.asset.url || !savedTransition.lensTransition)
        throw new Error("렌즈 전환 저장을 완료하지 못했습니다. 타임라인 저장 상태를 확인해 주세요.");
      current.current = saved;
      markSaved(attempted.current);
      openLensEditor(null);
      setMessage(editTransition ? "기존 렌즈 전환을 갱신했습니다." : "렌즈 전환을 타임라인에 저장했습니다.");
    } finally {
      setBusyTask(null);
    }
  }

  async function render(mode?: "preview" | "final") {
    startTask(mode ?? "save");
    setMessage("");
    setResult(null);
    try {
      const saved = await persistTimeline();
      if (!mode) {
        setMessage("타임라인을 저장했습니다.");
        return;
      }
      const response = await fetch(`/api/projects/${saved.id}/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timelineId, version: saved.version, mode }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "영상 합성에 실패했습니다.");
      setResult({ asset: data.asset, mode, notes: Array.isArray(data.warnings) ? data.warnings : [] });
      viewResult(true);
      setMessage(mode === "preview" ? "프리비즈를 만들었습니다." : "납품본을 만들었습니다.");
      renderedVersion.current = saved.version;
      renderedGraph.current = JSON.stringify(saved.graph);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "영상 합성에 실패했습니다.",
      );
    } finally {
      setBusyTask(null);
    }
  }
  function attach() {
    const active = current.current;
    const node = active.graph.nodes.find((item) => item.id === timelineId);
    if (
      !result ||
      active.id !== project.id ||
      active.version !== renderedVersion.current ||
      JSON.stringify(active.graph) !== renderedGraph.current ||
      timelineKey(node?.timeline) !== baseline.current
    ) {
      setMessage("프로젝트가 변경됐습니다. 다시 합성해 주세요.");
      return;
    }
    onGraphChange({
      ...active.graph,
      nodes: active.graph.nodes.map((item) =>
        item.id === timelineId ? { ...item, asset: result.asset } : item,
      ),
    });
    setMessage("프리비즈 노드에 영상이 반영됐습니다.");
  }
  const selectedClip = draft.clips[clipIndex];
  const selectedAudio = draft.audio[audioIndex];
  const clipItems = [{ id: "", title: "빈 프리비즈 카드", note: "제목과 지시가 없는 슬레이트" }, ...visuals.map((node) => ({
    id: node.id, title: node.title, note: node.asset ? node.asset.type === "video" ? "영상" : "이미지" : "미생성 슬레이트" }))];
  const soundItems = sounds.map((node) => ({ id: node.id, title: node.title, note: node.asset ? "음향 파일" : "미생성 무음" }));
  const selectedTransition = savedTransitions.find(({ index }) => index === clipIndex);
  const status = busyTask ? busyLabels[busyTask] : message || (!draft.clips.length ? "컷을 추가하면 저장할 수 있습니다."
    : slates + silent ? `${[slates && `슬레이트 ${slates}컷`, silent && `무음 ${silent}개`].filter(Boolean).join(" · ")} · 납품본에는 모든 파일이 필요합니다.`
      : "30fps MP4 · 원본과 완성 파일은 각각 64 MiB까지");
  const emptyStage = <div className="timeline-empty">
    <Clapperboard size={32} aria-hidden="true" />
    <h3>아직 배치한 컷이 없습니다</h3>
    <ol>
      <li>보드의 샷·이미지·영상을 컷으로 넣습니다. 아직 만들지 않은 샷도 슬레이트로 길이를 볼 수 있습니다.</li>
      <li>컷 길이와 전환을 정하고 음향과 자막을 시간축에 놓습니다.</li>
      <li>프리비즈로 흐름을 확인하고 파일이 모두 준비되면 납품본을 만듭니다.</li>
    </ol>
    <TimelineAddMenu label="첫 컷 추가" help="보드의 샷·이미지·영상이나 빈 카드를 첫 컷으로 넣습니다." items={clipItems} tone="primary" disabled={busy}
      onPick={(id) => { addClip(id || null); requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>(".timeline-clip")?.focus()); }} />
    {otherTimelines.length > 0 && <div className="timeline-saved-list">
      <p>이 프로젝트에 저장한 타임라인</p>
      {otherTimelines.map((node) => <button type="button" className="studio-action" key={node.id} onClick={() => openTimeline(node)}>
        {node.title} · {node.timeline!.clips.length}컷 · {timecode(clipRanges(node.timeline!.clips).at(-1)?.end ?? 0)}</button>)}
    </div>}
  </div>;
  const resultStage = result && <div className="timeline-result">
    <video controls src={result.asset.url} aria-label={result.mode === "preview" ? "완성한 프리비즈" : "완성한 납품본"}>
      {!!draft.words?.length && <track default kind="subtitles" srcLang="ko" label="단어 자막"
        src={`data:text/vtt;charset=utf-8,${encodeURIComponent(serializeTimelineWords(draft.words, "vtt"))}`} />}
    </video>
    <div className="timeline-result-actions">
      <a className="studio-action" href={result.asset.url} download={result.asset.name}><Download size={16} aria-hidden="true" />
        {result.mode === "preview" ? "프리비즈 MP4 내려받기" : "납품본 MP4 내려받기"}</a>
      {result.mode === "final" && <button type="button" className="studio-action" data-tone="primary"
        title="완성 영상을 프리비즈 노드에 적용합니다." onClick={attach}>납품본을 노드에 반영</button>}
    </div>
    {result.notes.length > 0 && <details className="timeline-result-notes">
      <summary>슬레이트·무음으로 처리한 항목 {result.notes.length}개</summary>
      <ul>{result.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
    </details>}
  </div>;
  return (
    <dialog ref={dialog} tabIndex={-1} className="timeline-studio" aria-labelledby="timeline-title"
      onKeyDown={(event) => {
        // cancel만 막으면 브라우저가 두 번째 Esc에서 확인 없이 닫는다.
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        // 메뉴에서 누른 Esc는 메뉴만 닫는다.
        if (!(event.target as Element).closest('[role="menu"]')) close();
      }}
      onCancel={(event) => { event.preventDefault(); close(); }} onClose={onClose}>
      <header className="timeline-header">
        <div className="timeline-heading">
          <p>{nodes.get(timelineId)?.title ?? "새 타임라인"} · {dirty ? "저장하지 않은 변경" : savedSpec ? "저장됨" : "빈 타임라인"}</p>
          <h2 id="timeline-title">스토리보드 · 타임라인</h2>
        </div>
        <SegmentedControl className="timeline-segments" aria-label="화면 비율" value={draft.aspect} disabled={busy}
          onValueChange={(aspect) => { if (aspect) edit({ ...draft, aspect: aspect as TimelineSpec["aspect"] }); }}>
          <SegmentedControlIndicator className="timeline-segments-indicator" />
          {aspects.map(([value, label]) => <SegmentedControlItem key={value} value={value} title={`완성 영상을 ${label} ${value}로 만듭니다.`}>
            <span className="timeline-aspect-name">{label}</span> {value}</SegmentedControlItem>)}
        </SegmentedControl>
        <dl className="timeline-stats">
          <div data-over={totalFrames > TIMELINE_MAX_FRAMES || undefined}><dt>길이</dt><dd>{timecode(totalFrames)}<small> / {timecode(TIMELINE_MAX_FRAMES).slice(0, -2)}</small></dd></div>
          <div><dt>컷</dt><dd>{draft.clips.length}<small> / {TIMELINE_MAX_CLIPS}</small></dd></div>
          <div><dt>음향</dt><dd>{draft.audio.length}<small> / {TIMELINE_MAX_AUDIO}</small></dd></div>
          <div><dt>자막</dt><dd>{draft.words?.length ?? 0}<small> / {TIMELINE_MAX_WORDS}</small></dd></div>
        </dl>
        <button type="button" className="studio-action timeline-close" data-tone="quiet" data-size="icon" aria-label="타임라인 닫기"
          title="타임라인 편집 화면을 닫습니다." disabled={busy} onClick={close}><X size={18} aria-hidden="true" /></button>
      </header>
      {(issues.length > 0 || result) && <div className="timeline-notice">
        {issues.length > 0 && <ul aria-label={`확인할 항목 ${issues.length}개`}>
          {issues.slice(0, 20).map((issue) => <li key={`${issue.kind}:${issue.index}`}>
            <button type="button" onClick={() => select(issue.kind === "timeline" ? "clip" : issue.kind, issue.index)} disabled={busy}>{issue.text}</button>
          </li>)}
          {issues.length > 20 && <li>외 {issues.length - 20}개</li>}
        </ul>}
        {result && <SegmentedControl className="timeline-segments" aria-label="미리보기 종류" value={showResult ? "result" : "edit"}
          onValueChange={(value) => viewResult(value === "result")}>
          <SegmentedControlIndicator className="timeline-segments-indicator" />
          <SegmentedControlItem value="edit">편집 화면</SegmentedControlItem>
          <SegmentedControlItem value="result">{result.mode === "preview" ? "완성한 프리비즈" : "완성한 납품본"}</SegmentedControlItem>
        </SegmentedControl>}
      </div>}
      <fieldset className="timeline-body" disabled={busy} data-panel={panel} data-empty={isEmpty || undefined}>
        <TimelineMonitor key={timelineId} nodes={nodes} draft={draft} media={media} issues={issues} clipIndex={clipIndex} audioIndex={audioIndex}
          panel={panel} disabled={busy} stage={result && showResult ? resultStage : isEmpty ? emptyStage : undefined}
          clipItems={clipItems} soundItems={soundItems} onSelect={select} onEdit={edit} onAddClip={addClip} onAddAudio={addAudio} />
        <Tabs className="timeline-inspector" value={panel} onValueChange={(value) => { if (value) setPanel(value as TimelinePanel); }}>
          <TabsList className="timeline-tabs" aria-label="편집 항목">
            <TabsTab value="clip">컷</TabsTab>
            <TabsTab value="audio">음향 {draft.audio.length}</TabsTab>
            <TabsTab value="words">자막 {draft.words?.length ?? 0}</TabsTab>
            <TabsTab value="lens">렌즈 전환 {savedTransitions.length}</TabsTab>
          </TabsList>
          <TabsPanel value="clip" className="timeline-panel">
            {selectedClip ? <TimelineClipFields clip={selectedClip} index={clipIndex} total={draft.clips.length} start={ranges[clipIndex].start}
              node={nodes.get(selectedClip.nodeId ?? "")} visuals={visuals} seconds={secondsOf(selectedClip.nodeId)}
              lensAction={selectedTransition && <button type="button" className="studio-action" disabled={selectedTransition.frames === null}
                onClick={() => { openLensEditor({ id: selectedTransition.id, index: selectedTransition.index }); setPanel("lens"); }}>
                <Scissors size={16} aria-hidden="true" /> 렌즈 전환 다시 편집</button>}
              onSelect={(index) => select("clip", index)} onChange={(patch) => updateClip(clipIndex, patch)}
              onMove={(step) => { edit({ ...draft, clips: moveClip(draft.clips, clipIndex, clipIndex + step) }); select("clip", clipIndex + step); }}
              onRemove={() => { edit({ ...draft, clips: removeClip(draft.clips, clipIndex) }); select("clip", Math.max(0, clipIndex - 1)); if (draft.clips.length === 1) dialog.current?.focus(); }}
              onFit={() => edit({ ...draft, clips: trimClip(draft.clips, clipIndex, TIMELINE_MAX_FRAMES, secondsOf(selectedClip.nodeId)) })} />
              : <p className="timeline-panel-empty">컷을 추가하면 길이와 전환을 정할 수 있습니다.</p>}
          </TabsPanel>
          <TabsPanel value="audio" className="timeline-panel">
            {selectedAudio ? <TimelineAudioFields track={selectedAudio} index={audioIndex} total={draft.audio.length} sounds={sounds}
              node={nodes.get(selectedAudio.nodeId)} seconds={secondsOf(selectedAudio.nodeId)}
              onSelect={(index) => select("audio", index)} onChange={(patch) => updateAudio(audioIndex, patch)}
              onRemove={() => { edit({ ...draft, audio: draft.audio.filter((_, position) => position !== audioIndex) }); select("audio", Math.max(0, audioIndex - 1)); if (draft.audio.length === 1) dialog.current?.focus(); }}
              onFit={() => edit({ ...draft, audio: draft.audio.map((item, position) => position === audioIndex
                ? trimAudio(item, totalFrames, TIMELINE_MAX_FRAMES, secondsOf(item.nodeId)) : item) })} />
              : <p className="timeline-panel-empty">{sounds.length ? "음향을 추가하면 시작 시점과 길이, 음량을 정할 수 있습니다." : "음향 노드에 파일을 추가하면 여기에서 배치할 수 있습니다."}</p>}
          </TabsPanel>
          <TabsPanel value="words" className="timeline-panel" keepMounted>
            <TimelineWords project={project} audio={draft.audio} words={draft.words ?? []} frames={totalFrames}
              disabled={busy} target={wordTarget} save={save} onChange={(words) => {
                setDraft((value) => ({ ...value, words }));
                setResult(null);
                setMessage("");
              }} />
          </TabsPanel>
          <TabsPanel value="lens" className="timeline-panel timeline-lens-panel" keepMounted>
            {savedTransitions.length > 0 && <div className="lens-outline-actions" role="group" aria-label="적용한 렌즈 전환">
              {savedTransitions.map(({ id, index, frames }) => <button key={index} type="button" className="studio-action"
                disabled={frames === null} aria-pressed={editTransition?.index === index} onClick={() => openLensEditor({ id, index })}>
                {index + 1}번 컷 렌즈 전환 다시 편집
              </button>)}
              {editTransition && <button type="button" className="studio-action" data-tone="quiet" onClick={() => openLensEditor(null)}>재편집 닫기</button>}
              {savedTransitions.some(({ frames }) => frames === null) && <p>전환의 원래 길이를 확인할 수 없는 컷이 있습니다.</p>}
            </div>}
            {manualEdit && !editSource && <ManualLensSourcesForm
              key={`${timelineId}:${editTransition.id}:${editTransition.index}`} frames={editTransition.frames!} busy={busy}
              previewContext={{ projectId: project.id, version: project.version, aspect: draft.aspect }}
              takes={project.graph.nodes.filter((node) => node.id !== editTransition.id && node.asset?.type === "video")}
              onConfirm={(selection) => {
                if (!resolveManualLegacyLensTransition(project.graph, draft, editTransition.index, editTransition.id, selection))
                  throw new Error("원본 테이크와 시작 프레임, 기존 전환 컷의 범위를 확인해 주세요.");
                lensAnchor.current = null;
                lensRenderSnapshot.current = null;
                setSourceSelection({ kind: "legacy", sources: selection });
                setMessage("");
              }} />}
            {manualEdit && editSource && <div className="lens-outline-actions">
              <p>직접 지정한 시작 프레임은 앞 {editSource.outgoing.startFrame} · 뒤 {editSource.incoming.startFrame}입니다.</p>
              <button type="button" className="studio-action" disabled={busy} onClick={() => openLensEditor(editTransition, true)}>원본 범위 다시 지정</button>
            </div>}
            {editTransition?.source && !editTransition.recipe && <div className="lens-outline-actions">
              <button type="button" className="studio-action" disabled={busy} onClick={() => openLensEditor(editTransition, !manualEdit)}>
                {manualEdit ? "자동으로 찾은 범위 사용" : "원본 범위 직접 지정"}
              </button>
            </div>}
            {savedRecipe && <div className="lens-outline-actions">
              <button ref={savedStartsTrigger} type="button" className="studio-action" disabled={busy}
                aria-disabled={choosingSavedStarts} aria-expanded={choosingSavedStarts}
                onClick={() => { if (!choosingSavedStarts) setSourceSelection({ kind: "saved", choosing: true, starts: sourceStarts }); }}>
                시작 프레임 변경
              </button>
            </div>}
            {savedRecipe && choosingSavedStarts && editSource && <ManualLensSourcesForm
              frames={editSource.frames} busy={busy} takes={[]}
              previewContext={{ projectId: project.id, version: project.version, aspect: savedRecipe.aspect, transitionId: editTransition?.id }}
              savedSources={{
                outgoing: { id: editSource.outgoing.nodeId, title: lensPairs[0].outgoingTitle, startFrame: editSource.outgoing.startFrame },
                incoming: { id: editSource.incoming.nodeId, title: lensPairs[0].incomingTitle, startFrame: editSource.incoming.startFrame },
              }}
              onConfirm={selectSavedStarts} onCancel={() => finishSavedStarts(sourceStarts)} />}
            {(!editTransition || editSource) && <div hidden={choosingSavedStarts}><LensTransitionPanel
              key={`${timelineId}:${editTransition ? `${editTransition.id}:${editTransition.index}` : "new"}:${JSON.stringify([manualSources, sourceStarts])}`}
              pairs={lensPairs} savedTransition={savedRecipe} updatedSource={updatedSource} legacyTransition={Boolean(editSource && !savedRecipe)} manualLegacy={Boolean(manualEdit)} busy={busy}
              onAnchor={(cutIndex, frames, anchorCheckpoints) => requestLens(cutIndex, frames,
                anchorCheckpoints?.length ? { action: "reanchor", anchorCheckpoints } : undefined)}
              onDetect={(cutIndex, frames, point) => requestLens(cutIndex, frames, { action: "detect", point })}
              onReview={(cutIndex, frames, mask, corrections) => requestLens(cutIndex, frames, { action: "review", mask, corrections })}
              onRender={(cutIndex, frames, mask, corrections, anchorCheckpoints) => requestLens(cutIndex, frames, {
                action: "render", mask, corrections, anchorCheckpoints: anchorCheckpoints?.length ? anchorCheckpoints : undefined,
              })}
              onApply={applyLens} /></div>}
          </TabsPanel>
        </Tabs>
      </fieldset>
      <footer className="timeline-footer">
        <p role="status">{status}</p>
        <div>
          <button type="button" className="studio-action" disabled={busy || !draft.clips.length} onClick={() => void render()}>
            <Save size={16} aria-hidden="true" /> 타임라인 저장</button>
          <button type="button" className="studio-action" disabled={busy || !draft.clips.length} onClick={() => void render("final")}
            title="모든 컷과 음향의 파일이 준비된 완성 영상을 만듭니다."><PackageCheck size={16} aria-hidden="true" /> 납품본 만들기</button>
          <button type="button" className="studio-action" data-tone="primary" disabled={busy || !draft.clips.length} onClick={() => void render("preview")}
            title="저장한 뒤 빈 컷은 슬레이트로, 빈 음향은 무음으로 채운 확인용 영상을 만듭니다."><Clapperboard size={16} aria-hidden="true" /> 저장하고 프리비즈 만들기</button>
        </div>
      </footer>
    </dialog>
  );
}
