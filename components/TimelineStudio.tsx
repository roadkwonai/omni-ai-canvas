"use client";
import TimelineWords from "./TimelineWords";
import LensTransitionPanel from "./LensTransitionPanel";
import ManualLensSourcesForm from "./ManualLensSourcesForm";
import { insertLensTransition, isLegacyLensTransitionNode, legacyLensTransitionFrames, lensCutPairs, resolveLegacyLensTransition, resolveManualLegacyLensTransition, updateLensTransition, withLensStartFrames, type LensAnchorCheckpoint, type LensAnchorTransfer, type LensCorrection, type LensMask, type LensPoint, type LensReview, type LensStartFrames, type LensTransitionResult, type ManualLensSources } from "../lib/lens-transition-spec";
import { acceptsTimelineEdit } from "../lib/timeline-edit";

import { useEffect, useRef, useState } from "react";
import {
  TIMELINE_MAX_AUDIO,
  TIMELINE_MAX_CLIPS,
  TIMELINE_MAX_FRAMES,
  validateTimeline,
  type TimelineClip,
  type TimelineSpec,
} from "../lib/timeline-spec";
import type { Asset, Graph, Project } from "../lib/types";
import { serializeTimelineWords } from "../lib/timeline-captions";
import "./timeline.css";

type Props = {
  project: Project;
  onGraphChange: (graph: Graph) => void;
  save: () => Promise<Project | null>;
  selected: string | null;
  autoOpen?: boolean;
  onClose?: () => void;
};

type LensSourceSelection = { kind: "legacy"; sources?: ManualLensSources } |
  { kind: "saved"; choosing: boolean; starts?: LensStartFrames };
type LensAnchorPreview = { image: Blob; transfer?: LensAnchorTransfer };
const empty: TimelineSpec = { aspect: "16:9", clips: [], audio: [] };
const frameValue = (event: React.ChangeEvent<HTMLInputElement>) =>
  Math.round(Number(event.target.value) * 30);
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
  autoOpen = false,
  onClose,
}: Props) {
  const initial = project.graph.nodes.find(
    (node) => node.id === selected && node.kind === "previs",
  );
  const [open, setOpen] = useState(autoOpen);
  const [timelineId, setTimelineId] = useState(
    () => initial?.id ?? crypto.randomUUID(),
  );
  const [draft, setDraft] = useState<TimelineSpec>(initial?.timeline ?? empty);
  const [busy, setBusy] = useState(false);
  const [editingClip, setEditingClip] = useState<{ id: string; index: number } | null>(null);
  const [sourceSelection, setSourceSelection] = useState<LensSourceSelection | null>(null);
  const [result, setResult] = useState<Asset | null>(null);
  const [resultMode, setResultMode] = useState<"preview" | "final">("preview");
  const [message, setMessage] = useState("");
  const current = useRef(project);
  const baseline = useRef<string | null>(
    initial?.timeline ? JSON.stringify(initial.timeline) : null,
  );
  const renderedVersion = useRef<number | null>(null);
  const renderedGraph = useRef<string | null>(null);
  const attempted = useRef<string | null>(null);
  const lensAnchor = useRef<{ key: string; version: number } | null>(null);
  const lensRenderSnapshot = useRef<{ draft: string; graph: string } | null>(null);
  const savedStartsTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    current.current = project;
  }, [project]);
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
  const totalFrames = draft.clips.reduce(
    (sum, item) => sum + item.durationFrames - item.transitionFrames,
    0,
  );

  const savedTransitions = draft.clips.flatMap((entry, index) => {
    const node = project.graph.nodes.find(({ id }) => id === entry.nodeId);
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
    outgoingTitle: project.graph.nodes.find(({ id }) => id === editSource.outgoing.nodeId)?.title ?? editSource.outgoing.asset.name,
    incomingTitle: project.graph.nodes.find(({ id }) => id === editSource.incoming.nodeId)?.title ?? editSource.incoming.asset.name,
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

  function show() {
    const existing = project.graph.nodes.find(
      (node) => node.id === selected && node.kind === "previs",
    );
    setTimelineId(existing?.id ?? crypto.randomUUID());
    setDraft(existing?.timeline ?? empty);
    baseline.current = existing?.timeline
      ? JSON.stringify(existing.timeline)
      : null;
    attempted.current = null;
    openLensEditor(null);
    setResult(null);
    setMessage("");
    setOpen(true);
  }
  function updateClip(index: number, patch: Partial<TimelineClip>) {
    setDraft((value) => ({
      ...value,
      clips: value.clips.map((item, position) =>
        position === index ? { ...item, ...patch } : item,
      ),
    }));
    setResult(null);
  }
  function move(index: number, step: number) {
    setDraft((value) => {
      const clips = [...value.clips];
      const target = index + step;
      if (target < 0 || target >= clips.length) return value;
      [clips[index], clips[target]] = [clips[target], clips[index]];
      clips[0] = { ...clips[0], transition: "cut", transitionFrames: 0 };
      return { ...value, clips };
    });
    setResult(null);
  }
  async function persistTimeline() {
    if (!validateTimeline(draft) || !draft.clips.length)
      throw new Error("컷·전환·음향·자막의 길이와 위치를 확인해 주세요.");
    const active = current.current;
    if (active.id !== project.id) throw new Error("프로젝트가 바뀌었습니다. 다시 열어 주세요.");
    const existing = active.graph.nodes.find((node) => node.id === timelineId);
    const savedSpec = existing?.timeline ? JSON.stringify(existing.timeline) : null;
    const requestedSpec = JSON.stringify(draft);
    if (!acceptsTimelineEdit(baseline.current, savedSpec, attempted.current))
      throw new Error("타임라인이 다른 곳에서 변경됐습니다. 다시 열어 주세요.");
    if (savedSpec !== requestedSpec) {
      const timelineNode = existing
        ? { ...existing, timeline: draft, asset: undefined }
        : { id: timelineId, kind: "previs" as const, title: "프리비즈", body: "", x: 80, y: 80, timeline: draft };
      const graph = {
        ...active.graph,
        nodes: existing
          ? active.graph.nodes.map((node) => node.id === timelineId ? timelineNode : node)
          : [...active.graph.nodes, timelineNode],
      };
      attempted.current = requestedSpec;
      onGraphChange(graph);
    }
    const saved = await save();
    const savedTimeline = saved?.graph.nodes.find((node) => node.id === timelineId)?.timeline;
    if (!saved || saved.id !== active.id || JSON.stringify(savedTimeline) !== requestedSpec)
      throw new Error("타임라인을 저장하지 못했습니다. 다시 시도해 주세요.");
    current.current = saved;
    baseline.current = requestedSpec;
    attempted.current = null;
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
    setBusy(true);
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
      setBusy(false);
    }
  }

  async function applyLens(result: LensTransitionResult) {
    const active = current.current;
    const snapshot = lensRenderSnapshot.current;
    if (!snapshot || active.id !== project.id || active.version !== result.version ||
        result.transitionId !== editTransition?.id ||
        JSON.stringify(active.graph) !== snapshot.graph || JSON.stringify(draft) !== snapshot.draft)
      throw new Error("렌더 이후 타임라인이나 원본이 변경됐습니다. 전환을 다시 만들어 주세요.");
    setBusy(true);
    try {
      const transitionId = editTransition?.id ?? crypto.randomUUID();
      const graph = editTransition
        ? updateLensTransition(active.graph, timelineId, result, transitionId, manualEdit ? manualSources : undefined, sourceStarts)
        : insertLensTransition(active.graph, timelineId, result, transitionId);
      const applied = graph.nodes.find(({ id }) => id === timelineId)!.timeline!;
      attempted.current = JSON.stringify(applied);
      onGraphChange(graph);
      setDraft(applied);
      setResult(null);
      const saved = await save();
      const stored = saved?.graph.nodes.find(({ id }) => id === timelineId)?.timeline;
      const savedTransition = saved?.graph.nodes.find(({ id }) => id === transitionId);
      if (!saved || saved.id !== active.id || JSON.stringify(stored) !== attempted.current ||
        savedTransition?.asset?.url !== result.asset.url || !savedTransition.lensTransition)
        throw new Error("렌즈 전환 저장을 완료하지 못했습니다. 타임라인 저장 상태를 확인해 주세요.");
      current.current = saved;
      baseline.current = attempted.current;
      attempted.current = null;
      openLensEditor(null);
      setMessage(editTransition ? "기존 렌즈 전환을 갱신했습니다." : "렌즈 전환을 타임라인에 저장했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function render(mode?: "preview" | "final") {
    setBusy(true);
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
      setResult(data.asset);
      setResultMode(mode);
      if (Array.isArray(data.warnings) && data.warnings.length)
        setMessage(data.warnings.join(" "));
      renderedVersion.current = saved.version;
      renderedGraph.current = JSON.stringify(saved.graph);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "영상 합성에 실패했습니다.",
      );
    } finally {
      setBusy(false);
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
      JSON.stringify(node?.timeline) !== baseline.current
    ) {
      setMessage("프로젝트가 변경됐습니다. 다시 합성해 주세요.");
      return;
    }
    onGraphChange({
      ...active.graph,
      nodes: active.graph.nodes.map((item) =>
        item.id === timelineId ? { ...item, asset: result } : item,
      ),
    });
    setMessage("프리비즈 노드에 영상이 반영됐습니다.");
  }
  return (
    <div className="timeline-studio">
      <button
        type="button"
        title="스토리보드와 타임라인 편집 화면을 엽니다."
        onClick={show}
      >
        스토리보드 · 타임라인
      </button>
      {open && (
        <div className="timeline-overlay" role="presentation">
          <section
            className="timeline-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="timeline-title"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !busy) {
                setOpen(false);
                onClose?.();
              }
            }}
          >
            <header>
              <div>
                <h2 id="timeline-title">스토리보드 · 타임라인</h2>
                <p>컷과 음향의 순서를 정하고 저장한 뒤 영상을 만듭니다.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onClose?.();
                }}
                aria-label="닫기"
                title="타임라인 편집 화면을 닫습니다."
                disabled={busy}
              >
                ×
              </button>
            </header>
            <fieldset disabled={busy}>
              <p>
                최대 7분, 60컷, 음향 40개를 배치할 수 있습니다. 각 원본과 완성
                파일은 64 MiB 이하여야 합니다.
              </p>
              <label>
                화면 비율{" "}
                <select
                  title="완성 영상의 가로·세로 화면 비율을 정합니다."
                  value={draft.aspect}
                  onChange={(event) => {
                    setDraft({
                      ...draft,
                      aspect: event.target.value as TimelineSpec["aspect"],
                    });
                    setResult(null);
                  }}
                >
                  <option value="16:9">가로 16:9</option>
                  <option value="9:16">세로 9:16</option>
                  <option value="1:1">정사각형 1:1</option>
                </select>
              </label>
              {totalFrames > 0 && (
                <div
                  className="timeline-overview"
                  aria-label={`전체 길이 ${(totalFrames / 30).toFixed(1)}초`}
                >
                  <div className="timeline-visual-track">
                    {draft.clips.map((item, index) => (
                      <div
                        key={index}
                        style={{
                          flex: Math.max(
                            1,
                            item.durationFrames - item.transitionFrames,
                          ),
                        }}
                        title={`${item.durationFrames / 30}초`}
                      >
                        {project.graph.nodes.find(
                          (node) => node.id === item.nodeId,
                        )?.title || "빈 카드"}
                      </div>
                    ))}
                  </div>
                  {draft.audio.map((track, index) => (
                    <div className="timeline-audio-track" key={index}>
                      <span
                        style={{
                          left: `${Math.min(100, Math.max(0, (track.startFrame / totalFrames) * 100))}%`,
                          width: `${Math.min(100, Math.max(0, (track.durationFrames / totalFrames) * 100))}%`,
                        }}
                      >
                        {project.graph.nodes.find(
                          (node) => node.id === track.nodeId,
                        )?.title || "음향"}
                      </span>
                    </div>
                  ))}
                  <small>{(totalFrames / 30).toFixed(1)}초</small>
                </div>
              )}
              <h3>컷 순서</h3>
              {draft.clips.map((item, index) => (
                <div className="timeline-row" key={index}>
                  <label>
                    컷 {index + 1}
                    <select
                      title="이 컷에서 사용할 영상이나 이미지를 선택합니다."
                      value={item.nodeId ?? ""}
                      onChange={(event) =>
                        updateClip(index, {
                          nodeId: event.target.value || null,
                          inFrame: 0,
                        })
                      }
                    >
                      <option value="">빈 프리비즈 카드</option>
                      {visuals.map((node) => (
                        <option value={node.id} key={node.id}>
                          {node.title}
                          {node.asset ? "" : " · 미생성 슬레이트"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    길이(초)
                    <input
                      title="이 컷을 표시할 시간을 초 단위로 정합니다."
                      type="number"
                      min="0.04"
                      max={TIMELINE_MAX_FRAMES / 30}
                      step="0.1"
                      value={item.durationFrames / 30}
                      onChange={(event) =>
                        updateClip(index, { durationFrames: frameValue(event) })
                      }
                    />
                  </label>
                  <label>
                    원본 시작(초)
                    <input
                      title="원본 영상에서 재생을 시작할 시점을 초 단위로 정합니다."
                      type="number"
                      min="0"
                      max={TIMELINE_MAX_FRAMES / 30}
                      step="0.1"
                      value={item.inFrame / 30}
                      onChange={(event) =>
                        updateClip(index, { inFrame: frameValue(event) })
                      }
                    />
                  </label>
                  {index > 0 && (
                    <label>
                      전환
                      <select
                        title="이전 컷과의 전환을 하드컷 또는 0.5초 디졸브로 정합니다."
                        value={item.transition}
                        onChange={(event) =>
                          updateClip(
                            index,
                            event.target.value === "dissolve"
                              ? { transition: "dissolve", transitionFrames: 15 }
                              : { transition: "cut", transitionFrames: 0 },
                          )
                        }
                      >
                        <option value="cut">하드컷</option>
                        <option value="dissolve">디졸브 0.5초</option>
                      </select>
                    </label>
                  )}
                  <div>
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      aria-label={`컷 ${index + 1} 위로`}
                      title="이 컷을 앞 순서로 이동합니다."
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      aria-label={`컷 ${index + 1} 아래로`}
                      title="이 컷을 뒤 순서로 이동합니다."
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      title="이 컷을 타임라인에서 제거합니다."
                      onClick={() => {
                        setDraft({
                          ...draft,
                          clips: draft.clips
                            .filter((_, position) => position !== index)
                            .map((entry, position) =>
                              position === 0
                                ? {
                                    ...entry,
                                    transition: "cut",
                                    transitionFrames: 0,
                                  }
                                : entry,
                            ),
                        });
                        setResult(null);
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                title="타임라인 끝에 빈 컷을 추가합니다."
                disabled={draft.clips.length >= TIMELINE_MAX_CLIPS}
                onClick={() => {
                  setDraft({ ...draft, clips: [...draft.clips, clip(null)] });
                  setResult(null);
                }}
              >
                + 컷 추가
              </button>
              {savedTransitions.length > 0 && <div className="lens-outline-actions" aria-label="적용한 렌즈 전환">
                {savedTransitions.map(({ id, index, frames }) => <button key={index} type="button" className="studio-action"
                  disabled={frames === null} aria-pressed={editTransition?.index === index} onClick={() => openLensEditor({ id, index })}>
                  {index + 1}번 컷 렌즈 전환 다시 편집
                </button>)}
                {editTransition && <button type="button" className="studio-action" onClick={() => openLensEditor(null)}>재편집 닫기</button>}
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
              <h3>음향 레이어</h3>
              {draft.audio.map((track, index) => (
                <div className="timeline-row" key={index}>
                  <label>
                    음향
                    <select
                      title="이 레이어에서 사용할 음향 노드를 선택합니다."
                      value={track.nodeId}
                      onChange={(event) => {
                        setDraft({
                          ...draft,
                          audio: draft.audio.map((item, position) =>
                            position === index
                              ? { ...item, nodeId: event.target.value }
                              : item,
                          ),
                        });
                        setResult(null);
                      }}
                    >
                      {sounds.map((node) => (
                        <option value={node.id} key={node.id}>
                          {node.title}
                          {node.asset ? "" : " · 미생성 무음"}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(
                    [
                      ["시작", "startFrame"],
                      ["원본 시작", "inFrame"],
                      ["길이", "durationFrames"],
                      ["페이드 인", "fadeInFrames"],
                      ["페이드 아웃", "fadeOutFrames"],
                    ] as const
                  ).map(([label, field]) => (
                    <label key={field}>
                      {label}(초)
                      <input
                        title={
                          {
                            startFrame:
                              "타임라인에서 음향이 시작할 시점을 초 단위로 정합니다.",
                            inFrame:
                              "원본 음향의 시작 위치를 초 단위로 정합니다.",
                            durationFrames:
                              "음향을 재생할 길이를 초 단위로 정합니다.",
                            fadeInFrames:
                              "음향이 서서히 커지는 시간을 초 단위로 정합니다.",
                            fadeOutFrames:
                              "음향이 서서히 작아지는 시간을 초 단위로 정합니다.",
                          }[field]
                        }
                        type="number"
                        min="0"
                        max={TIMELINE_MAX_FRAMES / 30}
                        step="0.1"
                        value={track[field] / 30}
                        onChange={(event) => {
                          setDraft({
                            ...draft,
                            audio: draft.audio.map((item, position) =>
                              position === index
                                ? { ...item, [field]: frameValue(event) }
                                : item,
                            ),
                          });
                          setResult(null);
                        }}
                      />
                    </label>
                  ))}
                  <label>
                    음량
                    <input
                      title="원본 대비 음량 배율을 정합니다. 1은 원본 음량입니다."
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={track.gain}
                      onChange={(event) => {
                        setDraft({
                          ...draft,
                          audio: draft.audio.map((item, position) =>
                            position === index
                              ? { ...item, gain: Number(event.target.value) }
                              : item,
                          ),
                        });
                        setResult(null);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    title="이 음향 레이어를 타임라인에서 제거합니다."
                    onClick={() => {
                      setDraft({
                        ...draft,
                        audio: draft.audio.filter(
                          (_, position) => position !== index,
                        ),
                      });
                      setResult(null);
                    }}
                  >
                    삭제
                  </button>
                </div>
              ))}
              <button
                type="button"
                title="음향 노드를 새 레이어로 추가합니다."
                disabled={
                  !sounds.length || draft.audio.length >= TIMELINE_MAX_AUDIO
                }
                onClick={() => {
                  setDraft({
                    ...draft,
                    audio: [
                      ...draft.audio,
                      {
                        nodeId: sounds[0].id,
                        startFrame: 0,
                        inFrame: 0,
                        durationFrames: 30,
                        gain: 1,
                        fadeInFrames: 0,
                        fadeOutFrames: 0,
                      },
                    ],
                  });
                  setResult(null);
                }}
              >
                + 음향 추가
              </button>
              {!sounds.length && (
                <p>음향 노드에 파일을 추가하면 여기에서 배치할 수 있습니다.</p>
              )}
              <TimelineWords project={project} audio={draft.audio} words={draft.words ?? []} frames={totalFrames}
                disabled={busy} save={save} onChange={(words) => {
                  setDraft((value) => ({ ...value, words }));
                  setResult(null);
                }} />
              {message && <p role="status">{message}</p>}
              {result && (
                <div className="timeline-result">
                  <video controls src={result.url}>
                    {!!draft.words?.length && <track default kind="subtitles" srcLang="ko" label="단어 자막"
                      src={`data:text/vtt;charset=utf-8,${encodeURIComponent(serializeTimelineWords(draft.words, "vtt"))}`} />}
                  </video>
                  <a href={result.url} download={result.name}>
                    {resultMode === "preview"
                      ? "프리비즈 MP4 내려받기"
                      : "납품본 MP4 내려받기"}
                  </a>
                  {resultMode === "final" && (
                    <button
                      type="button"
                      title="완성 영상을 프리비즈 노드에 적용합니다."
                      onClick={attach}
                    >
                      납품본을 노드에 반영
                    </button>
                  )}
                </div>
              )}
              <footer>
                <button type="button" disabled={busy} onClick={() => void render()}>타임라인 저장</button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void render("preview")}
                >
                  {busy ? "영상 합성 중…" : "저장하고 프리비즈 만들기"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void render("final")}
                >
                  납품본 만들기
                </button>
              </footer>
            </fieldset>
          </section>
        </div>
      )}
    </div>
  );
}
