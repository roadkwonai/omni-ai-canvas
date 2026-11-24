"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import DirectorPlanPreview from "./DirectorPlanPreview";
import ReferenceCutReview from "./ReferenceCutReview";
import { makeStyleGraph } from "../lib/style-preset";
import { FileVideo, Sparkles, X } from "lucide-react";
import { MAX_REFERENCE_VIDEOS, MAX_REFERENCE_VIDEO_BYTES } from "../lib/reference-limits";
import type { AgentDefaults } from "../lib/agent-preferences";
import type { AttachmentRecord } from "../lib/attachments-types";
import {
  makeStyleDraft,
  parseStyleDraft,
  productionProfiles,
  styleFields,
  techniqueChoices,
  type StylePresetDraft,
} from "../lib/style-preset-core";
import type { Graph, Provider, ProviderInfo, Run } from "../lib/types";
import { effortOptions, type AgentEffort } from "../lib/agent-effort";
import "./style-preset-studio.css";

type SavedStylePreset = {
  id: string;
  version: number;
  updatedAt: string;
  draft: StylePresetDraft;
};
type DesignRequest = {
  mode: "analyze" | "recommend";
  draft: StylePresetDraft;
  provider: Provider;
  model?: string;
  effort?: AgentEffort;
  prompt: string;
  attachmentIds: string[];
};
type Props = {
  initialAnalysisId?: string;
  projectId: string;
  videoNodes?: { id: string; title: string }[];
  prepareProject?: () => Promise<number>;
  providers: ProviderInfo[];
  runs: Run[];
  defaults?: AgentDefaults;
  initialDraft?: StylePresetDraft;
  initialCount?: number;
  onDesign: (request: DesignRequest) => Promise<Run>;
  onApply: (
    draft: StylePresetDraft,
    count: number,
    reference?: AttachmentRecord,
    useContest?: boolean,
  ) => void;
  onDirector: (
    draft: StylePresetDraft,
    count: number,
    useContest?: boolean,
  ) => void;
  contestTitle?: string;
  onContest: (draft: StylePresetDraft, count: number) => void;
  onClose: () => void;
};

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data as T;
}

type StyleBeat = NonNullable<StylePresetDraft["beats"]>[number];

function BeatEditor({
  beats,
  onChange,
}: {
  beats: StyleBeat[];
  onChange: (beats: StyleBeat[]) => void;
}) {
  function update(index: number, change: Partial<StyleBeat>) {
    onChange(
      beats.map((beat, position) =>
        position === index ? { ...beat, ...change } : beat,
      ),
    );
  }
  function add() {
    if (!beats.length) {
      onChange([
        { endPercent: 100, label: "전체 구간", framing: "", caption: "" },
      ]);
      return;
    }
    const previous = beats.length > 1 ? beats[beats.length - 2].endPercent : 0;
    const midpoint = (previous + 100) / 2;
    if (!Number.isFinite(midpoint) || midpoint <= previous || midpoint >= 100)
      return;
    onChange([
      ...beats.slice(0, -1),
      { endPercent: midpoint, label: "새 구간", framing: "", caption: "" },
      beats[beats.length - 1],
    ]);
  }
  function remove(index: number) {
    const next = beats.filter((_, position) => position !== index);
    if (next.length)
      next[next.length - 1] = { ...next[next.length - 1], endPercent: 100 };
    onChange(next);
  }
  return (
    <div className="preset-beat-editor">
      {beats.length === 0 && (
        <p>
          아직 구간이 없습니다. 직접 추가하거나 분석한 컷 후보를 사용할 수
          있습니다.
        </p>
      )}
      {beats.map((beat, index) => {
        const previous = index ? beats[index - 1].endPercent : 0;
        const invalid =
          !Number.isFinite(beat.endPercent) ||
          beat.endPercent <= previous ||
          beat.endPercent > 100 ||
          (index === beats.length - 1 && beat.endPercent !== 100) ||
          !beat.label.trim();
        return (
          <fieldset className="preset-beat" key={index}>
            <legend>
              구간 {index + 1} · {previous}–{beat.endPercent}%
            </legend>
            <div className="preset-beat-fields">
              <label>
                끝 비율 (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={beat.endPercent}
                  readOnly={index === beats.length - 1}
                  onChange={(event) =>
                    update(index, {
                      endPercent:
                        event.target.value === ""
                          ? 0
                          : Number(event.target.value),
                    })
                  }
                  aria-invalid={invalid}
                />
              </label>
              <label>
                역할
                <input
                  value={beat.label}
                  maxLength={80}
                  onChange={(event) =>
                    update(index, { label: event.target.value })
                  }
                  placeholder="예: 도입 훅"
                />
              </label>
              <label>
                구도
                <input
                  value={beat.framing}
                  maxLength={160}
                  onChange={(event) =>
                    update(index, { framing: event.target.value })
                  }
                  placeholder="예: 얼굴 클로즈업"
                />
              </label>
              <label>
                자막 슬롯
                <input
                  value={beat.caption}
                  maxLength={160}
                  onChange={(event) =>
                    update(index, { caption: event.target.value })
                  }
                  placeholder="예: 질문 한 줄"
                />
              </label>
            </div>
            {invalid && (
              <p role="status" className="preset-error">
                역할을 입력하고 끝 비율이 앞 구간보다 크도록 수정해 주세요.
              </p>
            )}
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`구간 ${index + 1} 삭제`}
            >
              구간 삭제
            </button>
          </fieldset>
        );
      })}
      <button type="button" disabled={beats.length >= 24} onClick={add}>
        구간 추가
      </button>
    </div>
  );
}

function ReferenceMetrics({ records }: { records: AttachmentRecord[] }) {
  return <div className="preset-evidence"><strong>영상별 측정값</strong><p>화면 변화 후보와 표본으로 계산했습니다. 표본 밖 자막은 포함되지 않습니다.</p>
    <div style={{ overflowX: "auto" }}><table><thead><tr><th>영상</th><th>길이</th><th>검출 컷</th><th>중앙 컷 길이</th><th>분석 범위</th><th>화면 문자</th></tr></thead><tbody>
      {records.map((record, index) => {
        const timing = record.referenceTiming;
        const cuts = timing ? [0, ...timing.cutTimes, timing.durationSeconds] : [];
        const durations = cuts.slice(1).map((end, i) => end - cuts[i]).sort((a, b) => a - b);
        const median = durations.length ? (durations[Math.floor((durations.length - 1) / 2)] + durations[Math.floor(durations.length / 2)]) / 2 : null;
        const samples = record.cutAnalysis?.samples ?? [];
        const ocr = record.text.match(/컷별 화면 문자 추가 분석 표본 (\d+)\/(\d+)개/);
        const recognized = new Set([...record.text.matchAll(/^(\d+\.\d+)초 (?:상단|중단|하단) \(.*?\) 신뢰도/gm)].map((match) => match[1])).size;
        return <tr key={record.id}><th>{index + 1}. {record.name}</th><td>{timing ? timing.durationSeconds.toFixed(2) + "초" : "미확인"}</td><td>{timing?.cutDetection === "failed" ? "검출 실패" : durations.length || "미확인"}</td><td>{timing?.cutDetection === "failed" || median === null ? "미확인" : median.toFixed(2) + "초"}</td><td>{samples.length ? samples[0].time.toFixed(2) + "–" + samples[samples.length - 1].time.toFixed(2) + "초 · " + (record.cutAnalysis?.coveredCuts ?? 0) + "컷" : "미확인"}</td><td>{ocr ? "문자 후보 " + recognized + "시각 · OCR " + ocr[1] + "표본" : "미확인"}</td></tr>;
      })}
    </tbody></table></div></div>;
}

function draftKey(draft?: StylePresetDraft) {
  if (!draft) return "";
  const fields = Object.keys(
    styleFields,
  ) as (keyof StylePresetDraft["style"])[];
  return JSON.stringify([
    draft.name,
    draft.profileId,
    draft.concept,
    draft.evidence,
    [...draft.techniques].sort(),
    fields.map((key) => draft.style[key]),
    draft.beats?.map((beat) => [
      beat.endPercent,
      beat.label,
      beat.framing,
      beat.caption,
    ]) ?? [],
  ]);
}

function DraftBoardPreview({
  draft,
  count,
}: {
  draft: StylePresetDraft;
  count: number;
}) {
  const [open, setOpen] = useState(false);
  let graph: Graph | null = null;
  if (open) {
    try {
      graph = makeStyleGraph(draft, count);
    } catch {
      graph = null;
    }
  }
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary title="추가 전 생성될 기본 노드와 참조 연결을 확인합니다.">
        기본 노드와 연결 미리보기
      </summary>
      {open && (graph ? <DirectorPlanPreview graph={graph} /> : <p>프리셋 이름과 구간 설정을 확인하면 기본 노드가 표시됩니다.</p>)}
    </details>
  );
}

function ReferenceEvidence({
  record,
  onRemove,
  review,
  onRange,
  onCorrect,
  busy,
}: {
  record: AttachmentRecord;
  onRemove: () => void;
  review?: NonNullable<Run["result"]>["cutReview"];
  onRange: (first: number, last: number) => Promise<void>;
  onCorrect: (cuts: number[]) => Promise<void>;
  busy: boolean;
}) {
  const player = useRef<HTMLVideoElement>(null);
  return (
    <div className="preset-evidence">
      <div>
        <strong>{record.name}</strong>
        <button type="button" onClick={onRemove} aria-label="첨부 제거">
          <X size={16} />
        </button>
      </div>
      <p>{record.detail}</p>
      {record.asset?.type === "video" && (
        <video
          ref={player}
          className="preset-original"
          controls
          playsInline
          preload="metadata"
          aria-label="레퍼런스 원본 영상"
          src={record.asset.url}
        />
      )}
      {record.frames?.length ? (
        <div className="preset-frames">
          {record.frames.map((frame, index) => {
            const time = record.referenceTiming?.frameTimes[index];
            return (
              <figure key={frame.url}>
                <button
                  type="button"
                  disabled={time === undefined}
                  title="원본에서 이 시각으로 이동합니다."
                  onClick={() => {
                    if (player.current && time !== undefined)
                      player.current.currentTime = time;
                  }}
                >
                  <Image
                    src={frame.url}
                    alt={frame.name}
                    width={160}
                    height={90}
                    unoptimized
                  />
                </button>
                <figcaption>
                  {time === undefined ? frame.name : `${time.toFixed(1)}초`}
                </figcaption>
              </figure>
            );
          })}
        </div>
      ) : null}
      {record.text && (
        <details>
          <summary>분석 근거와 자막 보기</summary>
          <pre>{record.text}</pre>
        </details>
      )}
      <ReferenceCutReview record={record} review={review} onRange={onRange} busy={busy}
        onCorrect={onCorrect} playhead={() => player.current?.currentTime ?? 0}
        onSeek={(time) => { if (player.current) player.current.currentTime = time; }}
      />
    </div>
  );
}

export default function StylePresetStudio({
  projectId,
  videoNodes = [],
  prepareProject,
  initialAnalysisId,
  providers,
  runs,
  defaults,
  initialDraft,
  initialCount,
  contestTitle,
  onContest,
  onDesign,
  onApply,
  onDirector,
  onClose,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(() =>
    initialDraft
      ? structuredClone(initialDraft)
      : makeStyleDraft(productionProfiles[0].id),
  );
  const [count, setCount] = useState(
    () =>
      initialCount ??
      productionProfiles.find((item) => item.id === initialDraft?.profileId)
        ?.sceneCount ??
      productionProfiles[0].sceneCount,
  );
  const [saved, setSaved] = useState<SavedStylePreset[]>([]);
  const [selected, setSelected] = useState<SavedStylePreset | null>(null);
  const [libraryFilter, setLibraryFilter] = useState("");
  const [attachment, setAttachment] = useState<AttachmentRecord | null>(null);
  const [additional, setAdditional] = useState<AttachmentRecord[]>([]);
  const [sourceNode, setSourceNode] = useState("");
  const [url, setUrl] = useState("");
  const [providerChoice, setProviderChoice] = useState<{
    provider: Provider | "";
    model: string;
    effort?: AgentEffort;
  } | null>(null);
  const [prompt, setPrompt] = useState("");
  const [pendingRun, setPendingRun] = useState<Run | null>(null);
  const [reviewedRun, setReviewedRun] = useState<Run | null>(null);
  const restoredInitial = useRef(false);
  const reviewGeneration = useRef(0);
  const [preview, setPreview] = useState<StylePresetDraft | null>(null);
  const [proposalSource, setProposalSource] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [includeContest, setIncludeContest] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const compatible = providers.filter((item) =>
    item.operations.includes("text"),
  );
  const choice = providerChoice ??
    defaults?.text ?? { provider: "" as const, model: "" };
  const provider = compatible.find((item) => item.id === choice.provider);
  const models =
    provider?.models?.filter((item) => item.operations.includes("text")) ?? [];
  const effort = choice.effort && effortOptions(provider, choice.model).includes(choice.effort) ? choice.effort : undefined;
  const invalidModel =
    !!choice.model && !models.some((item) => item.id === choice.model);
  const currentRun = pendingRun
    ? (runs.find((run) => run.id === pendingRun.id) ?? pendingRun)
    : null;
  const waiting =
    currentRun?.status === "queued" || currentRun?.status === "running";
  const priorRuns = runs.filter(
    (run) =>
      run.input.projectId === projectId &&
      run.input.presetDesign &&
      run.status === "succeeded" &&
      parseStyleDraft(run.result?.stylePreset),
  );
  const profile = productionProfiles.find(
    (item) => item.id === draft.profileId,
  );
  const library = saved.filter(
    (item) => !libraryFilter || item.draft.profileId === libraryFilter,
  );

  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    fetch("/api/style-presets", { signal: controller.signal })
      .then((response) =>
        readResponse<{ presets: SavedStylePreset[] }>(response),
      )
      .then((data) => setSaved(data.presets))
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "프리셋을 불러오지 못했습니다.",
          );
      });
    return () => controller.abort();
  }, []);

  function changeProfile(id: string) {
    const next = makeStyleDraft(id);
    setDraft(next);
    setIncludeContest(false);
    setCount(
      productionProfiles.find((item) => item.id === id)?.sceneCount ?? 3,
    );
    setSelected(null);
    setPreview(null);
    setMessage("");
  }
  function updateStyle(key: keyof StylePresetDraft["style"], value: string) {
    setDraft((current) => ({
      ...current,
      style: { ...current.style, [key]: value },
    }));
  }
  async function uploadFiles(files: File[]) {
    if (busy || !files.length) return;
    const records = attachment ? [attachment, ...additional] : [];
    const remaining = MAX_REFERENCE_VIDEOS - records.length;
    if (files.length > remaining) {
      setError(`레퍼런스는 최대 ${MAX_REFERENCE_VIDEOS}개까지 추가할 수 있습니다. 현재 ${records.length}개가 선택되어 있습니다.`);
      return;
    }
    reviewGeneration.current++;
    setReviewedRun(null);
    setPendingRun(null);
    setPreview(null);
    setMessage("");
    setError("");
    const failures: string[] = [];
    let added = 0;
    for (const [index, file] of files.entries()) {
      setBusy(`영상을 준비하고 있습니다. ${index + 1}/${files.length}`);
      try {
        if (file.size > MAX_REFERENCE_VIDEO_BYTES) throw new Error("영상 파일은 1 GiB 이하여야 합니다.");
        const response = await fetch(`/api/projects/${projectId}/attachments/reference-video`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
          body: file,
        });
        const data = await readResponse<{ attachment: AttachmentRecord }>(response);
        records.push(data.attachment);
        setAttachment(records[0]);
        setAdditional(records.slice(1));
        added++;
      } catch (cause) {
        failures.push(`${file.name} · ${cause instanceof Error ? cause.message : "첨부를 처리하지 못했습니다."}`);
      }
    }
    if (added) setMessage(`레퍼런스 영상 ${added}개를 추가했습니다.`);
    if (failures.length) setError(`첨부 실패 · ${failures.join(" / ")}`);
    setBusy("");
  }

  async function uploadUrl() {
    if (!url.trim() || busy) return;
    if ((attachment ? 1 : 0) + additional.length >= MAX_REFERENCE_VIDEOS) {
      setError(`레퍼런스는 최대 ${MAX_REFERENCE_VIDEOS}개까지 추가할 수 있습니다.`);
      return;
    }
    reviewGeneration.current++;
    setReviewedRun(null);
    setPendingRun(null);
    setPreview(null);
    setBusy("YouTube 영상을 준비하고 있습니다.");
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), referenceVideo: true }),
      });
      const data = await readResponse<{ attachment: AttachmentRecord }>(response);
      if (attachment) setAdditional((items) => [...items, data.attachment]);
      else setAttachment(data.attachment);
      setUrl("");
      setMessage("YouTube 영상을 추가했습니다.");
    } catch (cause) {
      setError(`YouTube 영상 첨부 실패 · ${cause instanceof Error ? cause.message : "첨부를 처리하지 못했습니다."}`);
    } finally { setBusy(""); }
  }

  async function attachNode() {
    if (!sourceNode || !prepareProject || busy) return;
    if ((attachment ? 1 : 0) + additional.length >= MAX_REFERENCE_VIDEOS) {
      setError(`레퍼런스는 최대 ${MAX_REFERENCE_VIDEOS}개까지 추가할 수 있습니다.`);
      return;
    }
    reviewGeneration.current++;
    setBusy("프로젝트 영상을 분석하고 있습니다.");
    setError("");
    try {
      const version = await prepareProject();
      const response = await fetch(`/api/projects/${projectId}/attachments/from-node`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: sourceNode, version }),
      });
      const data = await readResponse<{ attachment: AttachmentRecord }>(response);
      if (attachment) setAdditional((items) => [...items, data.attachment]);
      else setAttachment(data.attachment);
      setPreview(null);
      setReviewedRun(null);
      setPendingRun(null);
      setMessage("프로젝트 영상을 비교 자료로 추가했습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "영상을 불러오지 못했습니다.");
    } finally { setBusy(""); }
  }

  function removeReference(id: string) {
    reviewGeneration.current++;
    if (attachment?.id === id) {
      setAttachment(additional[0] ?? null);
      setAdditional(additional.slice(1));
    } else setAdditional((items) => items.filter((item) => item.id !== id));
    setPreview(null);
    setReviewedRun(null);
    setPendingRun(null);
  }

  function selectReference(id: string) {
    const next = additional.find((item) => item.id === id);
    if (!attachment || !next) return;
    reviewGeneration.current++;
    setAttachment(next);
    setAdditional((items) => items.map((item) => item.id === id ? attachment : item));
  }

  async function requestDesign(mode: "analyze" | "recommend") {
    if (!provider || !provider.available || invalidModel || busy || waiting)
      return;
    if (mode === "analyze" && !attachment) {
      setError("분석할 영상이나 자료를 먼저 첨부해 주세요.");
      return;
    }
    if (!parseStyleDraft(draft)) {
      setError("프리셋 이름과 구간 순서를 확인해 주세요.");
      return;
    }
    setError("");
    setMessage("");
    setPreview(null);
    setBusy(
      mode === "analyze"
        ? "분석을 요청하고 있습니다."
        : "추천을 요청하고 있습니다.",
    );
    try {
      const result = await onDesign({
        mode,
        draft,
        provider: provider.id,
        ...(choice.model ? { model: choice.model } : {}),
        ...(effort ? { effort } : {}),
        prompt:
          prompt.trim() ||
          (mode === "analyze"
            ? "첨부한 레퍼런스를 분석해 제작 프리셋을 제안해 주세요."
            : "콘셉트에 맞는 제작 프리셋을 추천해 주세요."),
        attachmentIds: mode === "analyze" && attachment ? [attachment.id, ...additional.map((item) => item.id)] : [],
      });
      setPendingRun(result);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "에이전트에 요청하지 못했습니다.",
      );
    } finally {
      setBusy("");
    }
  }
  async function savePreset(copy: boolean) {
    const valid = parseStyleDraft(draft);
    if (!valid) {
      setError("프리셋 이름과 제작 설정을 확인해 주세요.");
      return;
    }
    setBusy("프리셋을 저장하고 있습니다.");
    setError("");
    setMessage("");
    try {
      const updating = selected && !copy;
      const response = await fetch("/api/style-presets", {
        method: updating ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          updating
            ? { id: selected.id, version: selected.version, draft: valid }
            : { draft: valid },
        ),
      });
      if (response.status === 409) {
        const latest = await readResponse<{ presets: SavedStylePreset[] }>(
          await fetch("/api/style-presets"),
        );
        setSaved(latest.presets);
        setShowLibrary(true);
      }
      const data = await readResponse<{ preset: SavedStylePreset }>(response);
      setSaved((items) => [
        data.preset,
        ...items.filter((item) => item.id !== data.preset.id),
      ]);
      setSelected(data.preset);
      setMessage(
        "프리셋을 저장했습니다. 다른 프로젝트에서도 불러올 수 있습니다.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "프리셋을 저장하지 못했습니다.",
      );
    } finally {
      setBusy("");
    }
  }
  function loadPreset(item: SavedStylePreset) {
    reviewGeneration.current++;
    setDraft(structuredClone(item.draft));
    setIncludeContest(false);
    setCount(
      productionProfiles.find((entry) => entry.id === item.draft.profileId)
        ?.sceneCount ?? 3,
    );
    setSelected(item);
    setAttachment(null);
    setAdditional([]);
    setPreview(null);
    setShowLibrary(false);
    setMessage(`‘${item.draft.name}’ 프리셋을 불러왔습니다.`);
    setError("");
  }
  const reviewRun = useCallback(async (run: Run) => {
    const suggestion = parseStyleDraft(run.result?.stylePreset);
    if (!suggestion) {
      setError("읽을 수 있는 프리셋 제안이 없습니다.");
      return;
    }
    const generation = ++reviewGeneration.current;
    const sources = run.input.attachments?.filter((item) => item.kind === "video") ?? [];
    setReviewedRun(run);
    setAttachment(null);
    setAdditional([]);
    setPreview(suggestion);
    setProposalSource(draftKey(run.input.presetDesign?.draft));
    setMessage("제안 내용을 검토한 뒤 편집기에 반영하세요.");
    setError("");
    if (!sources.length) return;
    const results = await Promise.allSettled(sources.map(async (source) => {
      const response = await fetch(`/api/projects/${projectId}/attachments?id=${encodeURIComponent(source.id)}`);
      return (await readResponse<{ attachment: AttachmentRecord }>(response)).attachment;
    }));
    if (reviewGeneration.current !== generation) return;
    const restored = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    setAttachment(restored[0] ?? null);
    setAdditional(restored.slice(1));
    if (restored.length !== sources.length) setError("실행 결과는 불러왔습니다. 일부 로컬 원본 자료를 열 수 없습니다.");
  }, [projectId]);

  useEffect(() => {
    if (restoredInitial.current || !initialAnalysisId) return;
    const run = runs.find((item) => item.id === initialAnalysisId && item.input.projectId === projectId && item.result?.stylePreset);
    if (!run) return;
    const timer = window.setTimeout(() => {
      restoredInitial.current = true;
      void reviewRun(run);
      dialog.current?.querySelector("#preset-reference")?.scrollIntoView({ block: "start" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialAnalysisId, projectId, runs, reviewRun]);

  async function prepareCutEvidence(selection: {first:number; last:number} | {cutTimes:number[]}) {
    if (!attachment || busy) return;
    reviewGeneration.current++;
    setBusy("선택한 컷의 표본을 준비하고 있습니다.");
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/attachments/range`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentId: attachment.id, ...selection }),
      });
      const data = await readResponse<{ attachment: AttachmentRecord }>(response);
      setAttachment(data.attachment);
      setPreview(null);
      setPendingRun(null);
      setReviewedRun(null);
      setMessage(`${"first" in selection ? `원본 컷 ${selection.first}–${selection.last}` : "보정한 컷 경계"}의 표본을 준비했습니다. 레퍼런스 분석을 눌러 구도와 자막 해석을 요청하세요.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "구간을 준비하지 못했습니다."); }
    finally { setBusy(""); }
  }

  return (
    <dialog
      ref={dialog}
      className="preset-dialog"
      aria-labelledby="preset-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="preset-header">
        <div>
          <h2 id="preset-title">영상 스타일 프리셋</h2>
          <p>콘셉트와 레퍼런스를 나만의 제작 지침으로 정리합니다.</p>
        </div>
        <button
          type="button"
          className="preset-close"
          onClick={onClose}
          aria-label="닫기"
        >
          <X size={20} />
        </button>
      </header>
      <nav className="preset-nav" aria-label="프리셋 편집 항목">
        {[
          ["preset-setup", "형식·아이디어"],
          ["preset-reference", "레퍼런스·추천"],
          ["preset-beats", "구간 구성"],
          ["preset-edit", "스타일·저장"],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            onClick={() =>
              document
                .getElementById(id)
                ?.scrollIntoView({ block: "start", behavior: "smooth" })
            }
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="preset-body">
        <section className="preset-section" aria-labelledby="preset-setup">
          <div className="preset-section-heading">
            <div>
              <h3 id="preset-setup">제작 형식과 아이디어</h3>
              <p>형식에 맞춰 기획부터 장면 제작까지 기본 흐름을 준비합니다.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowLibrary(!showLibrary)}
              aria-expanded={showLibrary}
            >
              내 프리셋 {saved.length}
            </button>
          </div>
          {showLibrary && (
            <div className="preset-library">
              <label>
                형식별 보기
                <select
                  value={libraryFilter}
                  onChange={(event) => setLibraryFilter(event.target.value)}
                >
                  <option value="">모든 형식</option>
                  {productionProfiles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              {library.length ? (
                <ul>
                  {library.map((item) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => loadPreset(item)}>
                        <strong>{item.draft.name}</strong>
                        <span>
                          {
                            productionProfiles.find(
                              (entry) => entry.id === item.draft.profileId,
                            )?.label
                          }{" "}
                          ·{" "}
                          {new Date(item.updatedAt).toLocaleDateString("ko-KR")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>저장된 프리셋이 없습니다.</p>
              )}
            </div>
          )}
          <div className="preset-grid">
            <label>
              제작 형식
              <select
                value={draft.profileId}
                onChange={(event) => changeProfile(event.target.value)}
              >
                {productionProfiles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              씬 수
              <select
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
              >
                {[1, 2, 3, 4, 5, 6].map((value) => (
                  <option value={value} key={value}>
                    {value}개
                  </option>
                ))}
              </select>
            </label>
          </div>
          {profile && <p className="preset-hint">{profile.description}</p>}
          {(contestTitle || draft.profileId === "contest") && (
            <fieldset className="preset-contest">
              <legend>출품 요강</legend>
              {contestTitle ? (
                <label>
                  <input
                    type="checkbox"
                    checked={includeContest}
                    onChange={(event) =>
                      setIncludeContest(event.target.checked)
                    }
                  />{" "}
                  이번 작품에 ‘{contestTitle}’ 요강 적용
                </label>
              ) : (
                <p>
                  요강 없이 아이디어와 보드를 준비할 수 있습니다. 실제 심사
                  기준과 납품 규격은 요강을 연결하면 반영됩니다.
                </p>
              )}
              <button
                type="button"
                title="편집한 콘셉트를 이어서 공식 요강을 확인합니다."
                onClick={() => {
                  const valid = parseStyleDraft(draft);
                  if (valid) onContest(valid, count);
                  else setError("프리셋 이름과 구간 설정을 확인해 주세요.");
                }}
              >
                {contestTitle ? "다른 공모 요강 연결" : "공모 요강 연결"}
              </button>
            </fieldset>
          )}
          <label>
            프리셋 이름
            <input
              value={draft.name}
              maxLength={100}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
              placeholder="예: 따뜻한 30초 제품 이야기"
            />
          </label>
          <label>
            영상 콘셉트
            <textarea
              value={draft.concept}
              maxLength={500}
              onChange={(event) =>
                setDraft({ ...draft, concept: event.target.value })
              }
              placeholder="주제, 시청자, 만들고 싶은 분위기를 적어 주세요."
              rows={3}
            />
          </label>
          <fieldset className="preset-techniques">
            <legend>연출 기법</legend>
            <div>
              {techniqueChoices.map((item) => (
                <label key={item.id} title={item.instruction}>
                  <input
                    type="checkbox"
                    checked={draft.techniques.includes(item.id)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        techniques: event.target.checked
                          ? [...draft.techniques, item.id]
                          : draft.techniques.filter((id) => id !== item.id),
                      })
                    }
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </fieldset>
          <DraftBoardPreview draft={draft} count={count} />
        </section>

        <section className="preset-section" aria-labelledby="preset-reference">
          <h3 id="preset-reference">레퍼런스와 AI 추천</h3>
          <p>
            MP4·WebM 파일이나 공개 YouTube 주소를 준비하고 프레임과 확인 가능한
            정보를 바탕으로 분석합니다.
          </p>
          <div className="preset-upload">
            <input
              ref={fileInput}
              type="file"
              accept="video/mp4,video/webm,.mp4,.webm"
              aria-label="레퍼런스 영상 파일 선택"
              multiple
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                void uploadFiles(files);
              }}
            />
            <button type="button" disabled={!!busy || (attachment ? 1 : 0) + additional.length >= MAX_REFERENCE_VIDEOS}
              onClick={() => fileInput.current?.click()}>
              <FileVideo size={16} aria-hidden="true" /> 영상 파일 추가
            </button>
            <span>영상당 최대 1 GiB · 60분 · 최대 {MAX_REFERENCE_VIDEOS}개</span>
          </div>
          <div className="preset-url">
            <input type="url" aria-label="YouTube 영상 주소" placeholder="YouTube 영상 주소" value={url}
              onChange={(event) => setUrl(event.target.value)} />
            <button type="button" disabled={!url.trim() || !!busy || (attachment ? 1 : 0) + additional.length >= MAX_REFERENCE_VIDEOS}
              onClick={() => void uploadUrl()}>YouTube 영상 추가</button>
          </div>
          {videoNodes.length > 0 && <div className="preset-url">
            <label>프로젝트 영상 선택<select value={sourceNode} onChange={(event) => setSourceNode(event.target.value)}>
              <option value="">노드 선택</option>
              {videoNodes.map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}
            </select></label>
            <button type="button" disabled={!sourceNode || !!busy || (attachment ? 1 : 0) + additional.length >= MAX_REFERENCE_VIDEOS}
              onClick={() => void attachNode()}>프로젝트 영상 추가</button>
          </div>}
          {attachment && <>
            <div className="preset-reference-list" aria-label="첨부한 레퍼런스 영상">
              <div className="preset-reference-heading">
                <h4>첨부한 영상 {(1 + additional.length)}/{MAX_REFERENCE_VIDEOS}</h4>
                <p>모든 영상을 분석합니다. 영상이 여러 개면 시간순 분석 시트 총 8장을 나눠 전달합니다. 상세 확인할 영상을 선택하세요.</p>
              </div>
              {[attachment, ...additional].map((item, index) => <div className="preset-reference-row" key={item.id}>
                <div>
                  <strong>{index + 1}. {item.name}</strong>
                  <p>{item.referenceTiming ? `${item.referenceTiming.durationSeconds.toFixed(1)}초 · 화면 변화 후보 ${item.referenceTiming.cutTimes.length}개` : item.detail}</p>
                </div>
                <div className="preset-reference-actions">
                  <button type="button" disabled={!!busy || !!waiting} aria-pressed={item.id === attachment.id}
                    onClick={() => selectReference(item.id)}>{item.id === attachment.id ? "상세 확인 중" : "상세 보기"}</button>
                  <button type="button" disabled={!!busy || !!waiting} aria-label={`${item.name} 레퍼런스 제거`}
                    onClick={() => removeReference(item.id)}>제거</button>
                </div>
              </div>)}
            </div>
            {additional.length > 0 && <ReferenceMetrics records={[attachment, ...additional]} />}
            <ReferenceEvidence
              key={attachment.id}
              record={attachment}
              review={reviewedRun?.input.attachments?.[0]?.id === attachment.id
                ? reviewedRun.result?.cutReview : undefined}
              busy={!!busy || !!waiting}
              onRange={(first,last) => prepareCutEvidence({first,last})}
              onCorrect={(cutTimes) => prepareCutEvidence({cutTimes})}
              onRemove={() => removeReference(attachment.id)}
            />
          </>}
          <div className="preset-grid">
            <label>
              에이전트
              <select
                value={choice.provider}
                onChange={(event) =>
                  setProviderChoice({
                    provider: event.target.value as Provider | "",
                    model: "",
                  })
                }
              >
                <option value="">에이전트 선택</option>
                {compatible.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                    {item.available ? "" : " · 연결 필요"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              모델
              <select
                value={choice.model}
                onChange={(event) =>
                  setProviderChoice({
                    provider: choice.provider,
                    model: event.target.value,
                  })
                }
              >
                <option value="">기본 모델</option>
                {invalidModel && (
                  <option value={choice.model}>
                    {choice.model} · 확인 필요
                  </option>
                )}
                {models.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {provider && <p className="preset-hint">{provider.billing}</p>}
          {attachment &&
            provider &&
            !["codex", "claude"].includes(provider.id) && (
              <p className="preset-hint">
                영상의 프레임을 분석하려면 이미지를 읽을 수 있는 에이전트를
                선택해 주세요.
              </p>
            )}
          <label>
            추가 요청
            <textarea
              value={prompt}
              maxLength={12000}
              onChange={(event) => setPrompt(event.target.value)}
              rows={2}
              placeholder="강조할 구성이나 바꾸고 싶은 부분을 적어 주세요."
            />
          </label>
          <div className="preset-actions">
            <button
              type="button"
              disabled={
                !provider?.available ||
                invalidModel ||
                !!busy ||
                !!waiting ||
                !attachment ||
                !["codex", "claude"].includes(provider?.id ?? "")
              }
              onClick={() => void requestDesign("analyze")}
            >
              <Sparkles size={16} /> 레퍼런스 분석
            </button>
            <button
              type="button"
              disabled={
                !provider?.available || invalidModel || !!busy || !!waiting
              }
              onClick={() => void requestDesign("recommend")}
            >
              아이디어로 추천받기
            </button>
          </div>
          {currentRun && (
            <div className="preset-run" aria-live="polite">
              {waiting ? (
                "에이전트가 제작 스타일을 분석하고 있습니다."
              ) : currentRun.status === "failed" ? (
                <span role="alert">
                  {currentRun.error || "분석을 완료하지 못했습니다."}
                </span>
              ) : currentRun.status === "succeeded" ? (
                <button type="button" onClick={() => reviewRun(currentRun)}>
                  완료된 제안 검토
                </button>
              ) : null}
            </div>
          )}
          {priorRuns.length > 0 && (
            <details className="preset-history">
              <summary>이 프로젝트의 이전 제안</summary>
              <ul>
                {priorRuns.map((run) => (
                  <li key={run.id}>
                    <button type="button" onClick={() => reviewRun(run)}>
                      {run.input.presetDesign?.draft.name || "프리셋 제안"} ·{" "}
                      {new Date(run.createdAt).toLocaleString("ko-KR")}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {preview && (
            <div className="preset-preview">
              <h4>AI 제안 미리보기</h4>
              <p>
                <strong>{preview.name}</strong> ·{" "}
                {
                  productionProfiles.find(
                    (item) => item.id === preview.profileId,
                  )?.label
                }
              </p>
              <p>{preview.concept}</p>
              <p>
                선택 기법 ·{" "}
                {techniqueChoices
                  .filter((item) => preview.techniques.includes(item.id))
                  .map((item) => item.label)
                  .join(", ") || "없음"}
              </p>
              <dl>
                {(Object.keys(styleFields) as (keyof typeof styleFields)[]).map(
                  (key) =>
                    preview.style[key] && (
                      <div key={key}>
                        <dt>{styleFields[key]}</dt>
                        <dd>{preview.style[key]}</dd>
                      </div>
                    ),
                )}
              </dl>
              {preview.beats?.length ? (
                <div className="preset-preview-beats">
                  <strong>구간 구성</strong>
                  <ol>
                    {preview.beats.map((beat, index) => (
                      <li key={index}>
                        <b>
                          {index ? preview.beats![index - 1].endPercent : 0}–
                          {beat.endPercent}% · {beat.label}
                        </b>
                        {beat.framing && <span>구도 · {beat.framing}</span>}
                        {beat.caption && <span>자막 · {beat.caption}</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {preview.evidence && (
                <p className="preset-observation">{preview.evidence}</p>
              )}
              <button
                type="button"
                onClick={() => {
                  setDraft(preview);
                  if (draft.profileId !== preview.profileId) {
                    setCount(
                      productionProfiles.find(
                        (item) => item.id === preview.profileId,
                      )?.sceneCount ?? count,
                    );
                  }
                  if (draftKey(draft) !== proposalSource) setSelected(null);
                  setPreview(null);
                  setMessage(
                    "제안을 편집기에 반영했습니다. 내용을 수정하고 저장하세요.",
                  );
                }}
              >
                제안을 편집기에 반영
              </button>
            </div>
          )}
        </section>

        <section className="preset-section" aria-labelledby="preset-beats">
          <h3 id="preset-beats">영상 구간 구성</h3>
          <p>
            영상 전체 길이를 100%로 두고 각 구간의 역할, 구도와 자막을
            기록합니다. 마지막 구간은 100%에서 끝납니다.
          </p>
          {attachment?.referenceTiming?.cutDetection === "failed" && (
            <p>
              화면 전환 후보를 찾지 못했습니다. 구간을 직접 추가해 주세요.
            </p>
          )}
          {attachment?.referenceTiming?.cutDetection === "measured" && (
            <>
              <p>
                자동 감지한 화면 변화는 컷 후보입니다. 버튼을 누르면 기존 구간을
                새 후보로 대체합니다.
              </p>
              <button
                className="preset-beat-import"
                type="button"
                onClick={() => {
                  const { durationSeconds, cutTimes } =
                    attachment.referenceTiming!;
                  const cuts = [
                    ...new Set(
                      cutTimes
                        .filter(
                          (time) =>
                            Number.isFinite(time) &&
                            time > 0 &&
                            time < durationSeconds,
                        )
                        .sort((a, b) => a - b),
                    ),
                  ];
                  const sampled =
                    cuts.length <= 23
                      ? cuts
                      : Array.from(
                          { length: 23 },
                          (_, index) =>
                            cuts[Math.floor((index * (cuts.length - 1)) / 22)],
                        );
                  const percentages = [
                    ...new Set(
                      sampled
                        .map(
                          (time) =>
                            Math.round((time / durationSeconds) * 10000) / 100,
                        )
                        .filter((value) => value > 0 && value < 100),
                    ),
                  ];
                  setDraft((current) => ({
                    ...current,
                    beats: [...percentages, 100].map((endPercent, index) => ({
                      endPercent,
                      label: `구간 ${index + 1}`,
                      framing: "",
                      caption: "",
                    })),
                  }));
                  setMessage(
                    "화면 전환 후보로 구간을 나눴습니다. 구간마다 역할과 구도를 확인해 주세요.",
                  );
                }}
              >
                {attachment.referenceTiming.cutTimes.length
                  ? "컷 후보로 구간 나누기"
                  : "구간 하나로 만들기"}
              </button>
            </>
          )}
          <BeatEditor
            beats={draft.beats ?? []}
            onChange={(beats) => setDraft((current) => ({ ...current, beats }))}
          />
        </section>

        <section className="preset-section" aria-labelledby="preset-edit">
          <h3 id="preset-edit">제작 스타일 세부 설정</h3>
          <p>전개, 촬영과 편집 방식을 직접 조정할 수 있습니다.</p>
          <div className="preset-style-grid">
            {(Object.keys(styleFields) as (keyof typeof styleFields)[]).map(
              (key) => (
                <label key={key}>
                  {styleFields[key]}
                  <textarea
                    rows={3}
                    maxLength={250}
                    value={draft.style[key]}
                    onChange={(event) => updateStyle(key, event.target.value)}
                  />
                </label>
              ),
            )}
          </div>
          <label>
            분석 근거와 메모
            <textarea
              rows={3}
              maxLength={1000}
              value={draft.evidence}
              onChange={(event) =>
                setDraft({ ...draft, evidence: event.target.value })
              }
              placeholder="참고한 구간과 관찰한 내용을 기록하세요."
            />
          </label>
          <div className="preset-actions">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void savePreset(false)}
            >
              {selected ? "변경 저장" : "프리셋 저장"}
            </button>
            {selected && (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void savePreset(true)}
              >
                복사본으로 저장
              </button>
            )}
          </div>
        </section>
        {busy && (
          <p className="preset-status" role="status">
            {busy}
          </p>
        )}
        {message && (
          <p className="preset-status" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="preset-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="preset-footer">
        <span>
          {profile?.label} · {count}개 씬
        </span>
        <div>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => {
              const valid = parseStyleDraft(draft);
              if (valid)
                onApply(valid, count, attachment ?? undefined, includeContest);
              else setError("프리셋 이름과 제작 설정을 확인해 주세요.");
            }}
          >
            기본 노드 추가
          </button>
          <button
            type="button"
            disabled={!!busy}
            className="preset-primary"
            onClick={() => {
              const valid = parseStyleDraft(draft);
              if (valid) onDirector(valid, count, includeContest);
              else setError("프리셋 이름과 제작 설정을 확인해 주세요.");
            }}
          >
            감독과 기획하기
          </button>
        </div>
      </footer>
    </dialog>
  );
}
