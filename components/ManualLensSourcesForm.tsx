"use client";

import { useCallback, useRef, useState } from "react";
import type { ManualLensSources } from "../lib/lens-transition-spec";
import { TIMELINE_MAX_FRAMES, type TimelineSpec } from "../lib/timeline-spec";
import LensSourceFramePicker from "./LensSourceFramePicker";
import "./manual-lens-sources.css";

type Take = { id: string; title: string };
type SavedSources = {
  outgoing: Take & { startFrame: number };
  incoming: Take & { startFrame: number };
};

export default function ManualLensSourcesForm({ takes, frames, busy = false, savedSources,
  previewContext: { projectId, version, aspect, transitionId }, onConfirm, onCancel }: {
  takes: readonly Take[];
  frames: number;
  busy?: boolean;
  savedSources?: SavedSources;
  previewContext: { projectId: string; version: number; aspect: TimelineSpec["aspect"]; transitionId?: string };
  onConfirm: (selection: ManualLensSources) => void;
  onCancel?: () => void;
}) {
  const [outgoingId, setOutgoingId] = useState(savedSources?.outgoing.id ?? "");
  const [incomingId, setIncomingId] = useState(savedSources?.incoming.id ?? "");
  const [outgoingStart, setOutgoingStart] = useState(String(savedSources?.outgoing.startFrame ?? 0));
  const [incomingStart, setIncomingStart] = useState(String(savedSources?.incoming.startFrame ?? 0));
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<"outgoing" | "incoming" | null>(null);
  const outgoingPreview = useRef<HTMLButtonElement>(null);
  const incomingPreview = useRef<HTMLButtonElement>(null);
  const loadPreview = useCallback(async (takeId: string, frame: number, signal: AbortSignal) => {
    const response = await fetch(`/api/projects/${projectId}/lens-transition/source-frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ takeId, frame, version, aspect, transitionId, side: transitionId ? preview : undefined }),
      signal,
    });
    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.error || "원본 프레임을 불러오지 못했습니다.");
    }
    return {
      image: await response.blob(),
      frame: Number(response.headers.get("X-Lens-Frame")),
      lastFrame: Number(response.headers.get("X-Lens-Last-Frame")),
    };
  }, [projectId, version, aspect, transitionId, preview]);

  function closePreview() {
    const trigger = preview === "outgoing" ? outgoingPreview : incomingPreview;
    setPreview(null);
    trigger.current?.focus();
  }

  const validFrame = (value: string) => value.trim() !== "" &&
    Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= TIMELINE_MAX_FRAMES;
  const valid = (savedSources ? Boolean(outgoingId && incomingId) :
    takes.some((take) => take.id === outgoingId) && takes.some((take) => take.id === incomingId)) &&
    validFrame(outgoingStart) && validFrame(incomingStart);

  return <section className="manual-lens-sources" aria-label="렌즈 전환 원본 범위">
    <h4>{savedSources ? "원본 시작점 변경" : "원본 범위 직접 지정"}</h4>
    <p>프레임 번호를 입력하거나 미리보기에서 시작점을 고르세요. 전환 길이는 {frames}프레임입니다. 프레임 번호는 초당 30프레임 기준으로 0부터 셉니다.</p>
    {savedSources && <p>앞 시작점이 바뀌면 저장한 윤곽을 새 프레임까지 추적합니다.</p>}
    {!savedSources && !takes.length && <p role="status">원본 영상 테이크를 프로젝트에 먼저 추가해 주세요.</p>}
    <div className="manual-lens-fields">
      <div className="manual-lens-take">
      {savedSources ? <p>앞 원본 테이크 · {savedSources.outgoing.title}</p> : <label>앞 원본 테이크
        <select value={outgoingId} disabled={busy} onChange={(event) => { setOutgoingId(event.target.value); setPreview(null); }}>
          <option value="">원본 선택</option>
          {takes.map((take) => <option key={take.id} value={take.id}>{take.title}</option>)}
        </select>
      </label>}
      <label>앞 시작 프레임
        <input type="number" min={0} max={TIMELINE_MAX_FRAMES} step={1} inputMode="numeric" value={outgoingStart}
          disabled={busy} onChange={(event) => setOutgoingStart(event.target.value)} />
      </label>
      <button ref={outgoingPreview} type="button" className="studio-action" disabled={busy || !outgoingId}
        onClick={() => setPreview("outgoing")}>앞 원본 미리보기</button>
      </div>
      <div className="manual-lens-take">
      {savedSources ? <p>뒤 원본 테이크 · {savedSources.incoming.title}</p> : <label>뒤 원본 테이크
        <select value={incomingId} disabled={busy} onChange={(event) => { setIncomingId(event.target.value); setPreview(null); }}>
          <option value="">원본 선택</option>
          {takes.map((take) => <option key={take.id} value={take.id}>{take.title}</option>)}
        </select>
      </label>}
      <label>뒤 시작 프레임
        <input type="number" min={0} max={TIMELINE_MAX_FRAMES} step={1} inputMode="numeric" value={incomingStart}
          disabled={busy} onChange={(event) => setIncomingStart(event.target.value)} />
      </label>
      <button ref={incomingPreview} type="button" className="studio-action" disabled={busy || !incomingId}
        onClick={() => setPreview("incoming")}>뒤 원본 미리보기</button>
      </div>
    </div>
    {preview && <LensSourceFramePicker
      key={`${preview}:${preview === "outgoing" ? outgoingId : incomingId}`}
      takeId={preview === "outgoing" ? outgoingId : incomingId}
      title={preview === "outgoing" ? "앞 원본" : "뒤 원본"}
      initialFrame={Number(preview === "outgoing" ? outgoingStart : incomingStart) || 0}
      requiredFrames={preview === "outgoing" ? Math.ceil(frames / 2) : Math.floor(frames / 2)}
      busy={busy}
      loadFrame={loadPreview}
      onSelect={(frame) => {
        if (preview === "outgoing") setOutgoingStart(String(frame));
        else setIncomingStart(String(frame));
        closePreview();
      }}
      onClose={closePreview} />}
    <button type="button" className="studio-action" data-tone="primary" disabled={busy || !valid}
      onClick={() => {
        setError("");
        try {
          onConfirm({ outgoingId, incomingId, outgoingStart: Number(outgoingStart), incomingStart: Number(incomingStart) });
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "원본 범위를 적용하지 못했습니다.");
        }
      }}>
      {savedSources ? "시작점 적용" : "원본 범위 적용"}
    </button>
    {onCancel && <button type="button" className="studio-action" disabled={busy} onClick={onCancel}>취소</button>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
