"use client";

import { useEffect, useRef, useState } from "react";
import { TIMELINE_MAX_FRAMES } from "../lib/timeline-spec";

type LoadedFrame = { image: Blob; frame: number; lastFrame: number };
type View =
  | { status: "loading"; frame: number; lastFrame?: number }
  | { status: "ready"; frame: number; lastFrame: number; url: string }
  | { status: "error"; frame: number; lastFrame?: number; message: string };

export default function LensSourceFramePicker({ takeId, title, initialFrame, requiredFrames, busy, loadFrame, onSelect, onClose }: {
  takeId: string;
  title: string;
  initialFrame: number;
  requiredFrames: number;
  busy: boolean;
  loadFrame: (takeId: string, frame: number, signal: AbortSignal) => Promise<LoadedFrame>;
  onSelect: (frame: number) => void;
  onClose: () => void;
}) {
  const start = Number.isSafeInteger(initialFrame) && initialFrame >= 0 && initialFrame <= TIMELINE_MAX_FRAMES ? initialFrame : 0;
  const [request, setRequest] = useState({ frame: start, delay: 0 });
  const [view, setView] = useState<View>({ status: "loading", frame: start });
  const [loadedUrl, setLoadedUrl] = useState("");
  const panel = useRef<HTMLElement>(null);

  useEffect(() => { panel.current?.focus(); }, []);

  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    const timer = window.setTimeout(() => loadFrame(takeId, request.frame, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(result.image);
      setView({ status: "ready", frame: result.frame, lastFrame: result.lastFrame, url });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setView((previous) => ({ status: "error", frame: request.frame, lastFrame: previous.lastFrame,
        message: error instanceof Error ? error.message : "프레임을 불러오지 못했습니다." }));
    }), request.delay);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [takeId, request, loadFrame]);

  function move(frame: number, delay = 0) {
    setView({ status: "loading", frame, lastFrame: view.lastFrame });
    setRequest({ frame, delay });
  }

  const ready = view.status === "ready" && loadedUrl === view.url;
  const selectable = ready && view.frame + requiredFrames <= view.lastFrame + 1;
  return <section ref={panel} tabIndex={-1} className="lens-source-frame-picker" aria-label={`${title} 프레임 선택`}>
    <div className="lens-source-frame-header">
      <strong>{title} 프레임 선택</strong>
      <button type="button" className="studio-action" onClick={onClose} disabled={busy}>닫기</button>
    </div>
    <div className="lens-source-frame-image">
      {view.status === "ready" &&
        // eslint-disable-next-line @next/next/no-img-element
        <img src={view.url} alt={`${title} ${view.frame}프레임`}
          onLoad={() => setLoadedUrl(view.url)} onError={() => setView({ status: "error", frame: view.frame,
            lastFrame: view.lastFrame, message: "프레임 이미지를 표시하지 못했습니다." })} />}
      {view.status === "loading" && <p role="status">프레임을 불러오고 있습니다.</p>}
      {view.status === "error" && <p role="alert">{view.message}</p>}
    </div>
    <p aria-live="polite">현재 {view.frame}프레임{view.lastFrame !== undefined ? ` / 마지막 ${view.lastFrame}프레임` : ""}</p>
    {view.lastFrame !== undefined && <label>{title} 프레임 탐색
      <input type="range" min={0} max={view.lastFrame} value={Math.min(view.frame, view.lastFrame)}
        disabled={busy} onChange={(event) => move(Number(event.target.value), 100)} />
    </label>}
    <div className="lens-source-frame-actions">
      <button type="button" className="studio-action" disabled={busy || view.frame <= 0} aria-disabled={view.status === "loading"}
        onClick={() => { if (view.status !== "loading") move(view.frame - 1); }}>이전 프레임</button>
      <button type="button" className="studio-action" disabled={busy || view.lastFrame === undefined || view.frame >= view.lastFrame}
        aria-disabled={!ready} onClick={() => { if (ready) move(view.frame + 1); }}>다음 프레임</button>
      {view.status === "error" && <button type="button" className="studio-action" disabled={busy}
        onClick={() => move(0)}>처음으로 이동</button>}
    </div>
    {ready && !selectable && <p>이 위치에서 전환에 필요한 {requiredFrames}프레임이 남아 있지 않습니다.</p>}
    <button type="button" className="studio-action" data-tone="primary" disabled={busy || !selectable}
      onClick={() => { if (view.status === "ready") onSelect(view.frame); }}>현재 프레임을 시작점으로 지정</button>
  </section>;
}
