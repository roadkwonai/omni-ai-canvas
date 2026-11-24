"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { isLensMask, LENS_MAX_ANCHOR_CHECKPOINTS, type LensAnchorCheckpoint, type LensAnchorTransfer, type LensMask, type LensCorrection, type LensReview, type LensTransitionResult, type LensTransitionRecipe, type LensTransitionSource } from "../lib/lens-transition-spec";
import "./lens-transition.css";

type Pair = { cutIndex: number; outgoingTitle: string; incomingTitle: string; maxFrames: number };

export default function LensTransitionPanel({ pairs, savedTransition, updatedSource, legacyTransition = false, manualLegacy = false, busy = false, onAnchor, onDetect, onReview, onRender, onApply }: {
  pairs: readonly Pair[];
  savedTransition?: LensTransitionRecipe;
  updatedSource?: LensTransitionSource;
  legacyTransition?: boolean;
  manualLegacy?: boolean;
  busy?: boolean;
  onAnchor: (cutIndex: number, frames: number, anchorCheckpoints?: LensAnchorCheckpoint[]) => Promise<{ image: Blob; transfer?: LensAnchorTransfer }>;
  onDetect: (cutIndex: number, frames: number, point: { x: number; y: number }) => Promise<{ x: number; y: number }[]>;
  onReview: (cutIndex: number, frames: number, mask: LensMask, corrections: LensCorrection[]) => Promise<LensReview>;
  onRender: (cutIndex: number, frames: number, mask: LensMask, corrections: LensCorrection[], anchorCheckpoints?: LensAnchorCheckpoint[]) => Promise<LensTransitionResult>;
  onApply: (result: LensTransitionResult) => Promise<void>;
}) {
  const [cutIndex, setCutIndex] = useState(pairs[0]?.cutIndex ?? -1);
  const pair = pairs.find((item) => item.cutIndex === cutIndex);
  const outgoingChanged = Boolean(updatedSource && savedTransition && updatedSource.outgoing.startFrame !== savedTransition.outgoing.startFrame);
  const initialTracking = outgoingChanged ? undefined : savedTransition;
  const [frames, setFrames] = useState(savedTransition?.frames ?? (legacyTransition ? pairs[0]?.maxFrames ?? 18 : Math.min(18, pairs[0]?.maxFrames ?? 18)));
  const [mask, setMask] = useState<LensMask>(() => initialTracking ? structuredClone(initialTracking.mask) : { x: 0.3, y: 0.3, width: 0.3, height: 0.3 });
  const [outline, setOutline] = useState<{ x: number; y: number }[]>(() => structuredClone(initialTracking?.mask.outline ?? []));
  const [pointX, setPointX] = useState(50);
  const [pointY, setPointY] = useState(50);
  const [closed, setClosed] = useState(() => Boolean(initialTracking?.mask.outline?.length));
  const [manual, setManual] = useState(false);
  const [editing, setEditing] = useState(false);
  const drag = useRef<number | null>(null);
  const [anchor, setAnchor] = useState("");
  const [result, setResult] = useState<LensTransitionResult>();
  const [review, setReview] = useState<LensReview>();
  const [reviewIndex, setReviewIndex] = useState(0);
  const [corrections, setCorrections] = useState<LensCorrection[]>(() => structuredClone(initialTracking?.corrections ?? []));
  const [reviewPoints, setReviewPoints] = useState<{ x: number; y: number }[]>([]);
  const [reviewEditing, setReviewEditing] = useState(false);
  const reviewDrag = useRef<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [transferStatus, setTransferStatus] = useState<"ready" | "adjust" | null>(null);
  const [interruptedFrame, setInterruptedFrame] = useState<number>();
  const [anchorCheckpoints, setAnchorCheckpoints] = useState<LensAnchorCheckpoint[]>([]);
  const request = useRef(0);

  useEffect(() => () => { if (anchor) URL.revokeObjectURL(anchor); }, [anchor]);
  useEffect(() => () => { request.current += 1; }, []);
  function reset() { setReview(undefined); setCorrections([]); setReviewEditing(false); setReviewIndex(0); setManual(false); setEditing(false); setOutline([]); setClosed(false); setTransferStatus(null); setInterruptedFrame(undefined); setAnchorCheckpoints([]); request.current += 1; setAnchor(""); setResult(undefined); setError(""); }
  async function load(checkpoints = anchorCheckpoints) {
    if (!pair) return;
    const token = ++request.current;
    setPending(true); setError(""); setResult(undefined);
    try {
      const loaded = await onAnchor(pair.cutIndex, frames, checkpoints.length ? checkpoints : undefined);
      if (request.current !== token) return;
      if (outgoingChanged && (!loaded.transfer?.mask.outline || !isLensMask(loaded.transfer.mask)))
        throw new Error("새 시작점의 렌즈 윤곽을 불러오지 못했습니다. 다시 시도해 주세요.");
      if (loaded.transfer) {
        setMask(loaded.transfer.mask);
        setOutline(loaded.transfer.mask.outline ?? []);
        setCorrections(loaded.transfer.corrections);
        setReview(undefined);
        setReviewEditing(false);
        setInterruptedFrame(loaded.transfer.interruptedFrame);
        setClosed(!loaded.transfer.needsAdjustment && loaded.transfer.interruptedFrame === undefined);
        setEditing(Boolean(loaded.transfer.needsAdjustment) || loaded.transfer.interruptedFrame !== undefined);
        setManual(false);
        setTransferStatus(loaded.transfer.needsAdjustment || loaded.transfer.interruptedFrame !== undefined ? "adjust" : "ready");
      }
      setAnchor(URL.createObjectURL(loaded.image));
    } catch (cause) {
      if (request.current === token) setError(cause instanceof Error ? cause.message : "기준 프레임을 불러오지 못했습니다.");
    } finally { if (request.current === token) setPending(false); }
  }

  function resumeAnchorTracking() {
    if (interruptedFrame === undefined || !isLensMask(mask) || !mask.outline) return;
    const checkpoints = [...anchorCheckpoints.filter(item => item.sourceFrame !== interruptedFrame), {
      sourceFrame: interruptedFrame,
      outline: structuredClone(mask.outline),
    }].slice(-LENS_MAX_ANCHOR_CHECKPOINTS);
    setAnchorCheckpoints(checkpoints);
    void load(checkpoints);
  }
  const autoLoad = useEffectEvent(() => { void load(); });
  useEffect(() => {
    if (!outgoingChanged) return;
    const timer = window.setTimeout(() => autoLoad(), 0);
    return () => window.clearTimeout(timer);
  }, [outgoingChanged]);
  function updateOutline(points: { x: number; y: number }[]) {
    setOutline(points);
    setClosed(false);
    setResult(undefined);
    setReview(undefined);
    setReviewEditing(false);
    if (!points.length || points.length !== mask.outline?.length) setCorrections([]);
    if (!points.length) return;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    setMask({ x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y, outline: points });
  }
  async function detect(point: { x: number; y: number }) {
    if (!pair) return;
    const token = ++request.current;
    setPending(true); setError(""); setResult(undefined);
    try {
      const points = await onDetect(pair.cutIndex, frames, point);
      if (request.current !== token) return;
      const xs = points.map((item) => item.x), ys = points.map((item) => item.y);
      const x = Math.min(...xs), y = Math.min(...ys);
      const next = { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y, outline: points };
      if (!isLensMask(next)) throw new Error("렌즈 윤곽을 확인할 수 없습니다. 다시 선택해 주세요.");
      setOutline(points); setMask(next); setReview(undefined); setCorrections([]); setClosed(true); setEditing(false); setTransferStatus(null);
    } catch (cause) {
      if (request.current === token) setError(cause instanceof Error ? cause.message : "렌즈 윤곽을 찾지 못했습니다.");
    } finally { if (request.current === token) setPending(false); }
  }
  async function refreshReview(next: LensCorrection[]) {
    if (!pair) return;
    const token = ++request.current;
    setPending(true); setError(""); setResult(undefined);
    try {
      const result = await onReview(pair.cutIndex, frames, mask, next);
      if (request.current !== token) return;
      setReview(result); setCorrections(next); setReviewEditing(false);
      const index = Math.min(reviewIndex, result.frames.length - 1);
      setReviewIndex(index); setReviewPoints(result.frames[index]?.outline ?? []);
    } catch (cause) {
      if (request.current === token) { setReview(undefined); setError(cause instanceof Error ? cause.message : "추적을 확인하지 못했습니다."); }
    } finally { if (request.current === token) setPending(false); }
  }
  function selectReview(index: number) {
    if (!review || reviewEditing) return;
    const next = Math.max(0, Math.min(review.frames.length - 1, index));
    setReviewIndex(next); setReviewPoints(review.frames[next].outline);
  }
  async function render() {
    if (!pair) return;
    const token = ++request.current;
    setPending(true); setError(""); setResult(undefined);
    try {
      const next = await onRender(pair.cutIndex, frames, mask, corrections, anchorCheckpoints.length ? anchorCheckpoints : undefined);
      if (request.current === token) setResult(next);
    } catch (cause) {
      if (request.current === token) setError(cause instanceof Error ? cause.message : "전환을 만들지 못했습니다.");
    } finally { if (request.current === token) setPending(false); }
  }
  async function apply() {
    if (!result) return;
    setPending(true); setError("");
    try { await onApply(result); setResult(undefined); setAnchor(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "전환을 적용하지 못했습니다."); }
    finally { setPending(false); }
  }
  const locked = busy || pending;
  return <section className="lens-transition" aria-label="렌즈 전환">
    <h3>{savedTransition ? "렌즈 전환 다시 편집" : legacyTransition ? "이전 렌즈 전환 편집" : "렌즈 전환"}</h3>
    {savedTransition && !updatedSource && <>
      <p>저장된 시작 프레임은 앞 {savedTransition.outgoing.startFrame} · 뒤 {savedTransition.incoming.startFrame}입니다.</p>
      <p>저장된 기준 윤곽과 보정 {savedTransition.corrections.length}개를 불러왔습니다. 기준 프레임을 불러온 뒤 확인하세요.</p>
      {savedTransition.anchorCheckpoints?.length ? <p>저장된 중단 보정 원본 프레임 {savedTransition.anchorCheckpoints.map(item => item.sourceFrame).join(", ")}</p> : null}
    </>}
    {updatedSource && <>
      <p>적용할 시작 프레임은 앞 {updatedSource.outgoing.startFrame} · 뒤 {updatedSource.incoming.startFrame}입니다.</p>
      <p>{outgoingChanged ? "저장된 윤곽을 새 시작점으로 추적합니다." : "저장된 윤곽과 보정을 불러왔습니다. 기준 프레임을 열어 새 범위에서 전환을 만드세요."}</p>
    </>}
    {outgoingChanged && pending && <p role="status">새 시작점까지 렌즈 윤곽을 추적하고 있습니다.</p>}
    {transferStatus === "ready" && <p role="status">새 시작점에 윤곽을 맞췄습니다. 필요한 점을 수정할 수 있습니다.</p>}
    {interruptedFrame !== undefined
      ? <p role="status">원본 {interruptedFrame}프레임에서 추적이 끊겼습니다. 필요한 윤곽점만 수정하고 이어서 추적하세요.</p>
      : transferStatus === "adjust" && <p role="status">추적이 불확실합니다. 렌즈 윤곽을 확인하고 필요한 점을 수정한 뒤 윤곽 완성을 눌러 주세요.</p>}
    {legacyTransition && <p>{manualLegacy ? "직접 지정한 앞뒤 원본 범위를 불러옵니다." : "연결된 앞뒤 컷의 경계에서 원본 범위를 불러왔습니다."} 기준 프레임에서 윤곽과 필요한 보정값을 새로 지정하세요.</p>}
    <p>인접한 두 영상의 연결점에서 렌즈를 지정합니다. 결과를 확인한 뒤 적용하면 전체 편집 길이를 유지합니다.</p>
    {pairs.length === 0 ? <p>전환을 넣을 두 영상 컷을 나란히 배치하고 그 사이를 하드컷으로 설정하세요.</p> : <>
      <label>연결할 컷<select value={cutIndex} disabled={locked || Boolean(savedTransition) || legacyTransition} onChange={(event) => {
        const index = Number(event.target.value);
        const next = pairs.find((item) => item.cutIndex === index);
        setCutIndex(index); setFrames(Math.min(18, next?.maxFrames ?? 18)); reset();
      }}>
        {!pair && <option value={cutIndex}>컷을 다시 선택해 주세요</option>}
        {pairs.map((item) => <option value={item.cutIndex} key={item.cutIndex}>{item.outgoingTitle} → {item.incomingTitle}</option>)}
      </select></label>
      <label>전환 길이 (프레임, 30fps)<input type="number" min={12} max={Math.min(60, pair?.maxFrames ?? 60)} step={1} value={frames}
        disabled={locked || Boolean(savedTransition) || legacyTransition} onChange={(event) => { setFrames(Number(event.target.value)); reset(); }} /></label>
      <button type="button" className="studio-action" disabled={locked || !pair || frames < 12 || frames > Math.min(60, pair.maxFrames) || !Number.isInteger(frames)} onClick={() => void load()}>
        기준 프레임 불러오기
      </button>
      {anchor && <>
        <p>{editing ? "수정할 윤곽점을 드래그하세요." : closed ? "필요하면 윤곽을 수정한 뒤 전환을 만드세요." : manual ? "렌즈 안쪽 테두리를 따라 점을 찍어 주세요." : "렌즈 안쪽을 한 번 클릭하세요."}</p>
        <div className="lens-transition-frame" onPointerDown={(event) => {
          if (locked || !event.isPrimary || event.button !== 0) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const point = {
            x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
            y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
          };
          if (editing && outline.length) {
            const distances = outline.map((p) => Math.hypot((p.x - point.x) * rect.width, (p.y - point.y) * rect.height));
            const closest = Math.min(...distances);
            if (closest <= 24) {
              drag.current = distances.indexOf(closest);
              event.currentTarget.setPointerCapture(event.pointerId);
            }
          } else if (interruptedFrame === undefined && manual && !closed && outline.length < 32) updateOutline([...outline, point]);
          else if (interruptedFrame === undefined && !closed) void detect(point);
        }} onPointerMove={(event) => {
          if (drag.current === null || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const index = drag.current;
          updateOutline(outline.map((item, i) => i === index ? {
            x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
            y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
          } : item));
        }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={anchor} alt={interruptedFrame === undefined ? "전환 시작 프레임" : `추적이 끊긴 원본 ${interruptedFrame}프레임`} draggable={false} />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {closed ? <polygon points={outline.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")} /> :
              <polyline points={outline.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")} />}
            {(!closed || editing) && outline.map((point, index) => <circle key={index} cx={point.x * 100} cy={point.y * 100} r="0.7" />)}
          </svg>
        </div>
        <p aria-live="polite">윤곽점 {outline.length}개{closed ? " · 완성됨" : ""}</p>
        <div className="lens-outline-actions">
          {interruptedFrame === undefined && <>
          <button type="button" className="studio-action" disabled={locked} onClick={() => { setManual(false); setEditing(false); updateOutline([]); setTransferStatus(null); setError(""); }}>다른 렌즈 선택</button>
          <button type="button" className="studio-action" disabled={locked} onClick={() => { setManual(true); setEditing(false); updateOutline([]); setTransferStatus(null); setError(""); }}>직접 찍기</button>
          <button type="button" className="studio-action" disabled={locked || !outline.length} onClick={() => updateOutline(outline.slice(0, -1))}>마지막 점 취소</button>
          <button type="button" className="studio-action" disabled={locked || !outline.length} onClick={() => { updateOutline([]); setTransferStatus(null); }}>윤곽 지우기</button>
          {closed
            ? <button type="button" className="studio-action" disabled={locked} onClick={() => { setEditing(true); setClosed(false); }}>윤곽 수정</button>
            : <button type="button" className="studio-action" disabled={locked || outline.length < 5 || !isLensMask(mask)} onClick={() => { setEditing(false); setClosed(true); setTransferStatus(null); }}>윤곽 완성</button>}
          </>}
          {interruptedFrame !== undefined && <button type="button" className="studio-action" data-tone="primary" disabled={locked || !isLensMask(mask) || !mask.outline} onClick={resumeAnchorTracking}>보정하고 이어서 추적</button>}
        </div>
        {outline.length >= 5 && !isLensMask(mask) && <p role="status">윤곽이 너무 작거나 점이 겹쳐 있습니다. 테두리를 따라 순서대로 점을 놓아 주세요.</p>}
        <details>
          <summary>좌표로 점 추가 및 수정</summary>
          <div className="lens-transition-fields">
            <label>가로 위치 (%)<input type="number" min={0} max={100} step={0.1} value={pointX} disabled={locked} onChange={(event) => setPointX(Number(event.target.value))} /></label>
            <label>세로 위치 (%)<input type="number" min={0} max={100} step={0.1} value={pointY} disabled={locked} onChange={(event) => setPointY(Number(event.target.value))} /></label>
            <button type="button" className="studio-action" disabled={locked || interruptedFrame !== undefined || closed || editing || (manual && outline.length >= 32) || pointX < 0 || pointX > 100 || pointY < 0 || pointY > 100}
              onClick={() => {
                const point = { x: pointX / 100, y: pointY / 100 };
                if (manual) updateOutline([...outline, point]);
                else void detect(point);
              }}>{manual ? "좌표 점 추가" : "이 위치에서 윤곽 찾기"}</button>
          </div>
          {outline.map((point, index) => <div className="lens-transition-fields" key={index}>
            {(["x", "y"] as const).map((key) => <label key={key}>점 {index + 1} {key === "x" ? "가로" : "세로"} (%)
              <input type="number" min={0} max={100} step={0.1} disabled={locked} value={Math.round(point[key] * 1000) / 10} onChange={(event) => {
                const value = Math.max(0, Math.min(1, Number(event.target.value) / 100));
                updateOutline(outline.map((item, i) => i === index ? { ...item, [key]: value } : item));
              }} />
            </label>)}
          </div>)}
        </details>
        <button type="button" className="studio-action" disabled={locked || interruptedFrame !== undefined || !closed || !isLensMask(mask)} onClick={() => void refreshReview(corrections)}>프레임별 추적 보기</button>
        {review && review.frames.length > 0 && <>
          <p aria-live="polite">추적 프레임 {reviewIndex + 1} / {review.frames.length} · 원본 {review.frames[reviewIndex].sourceFrame}프레임{corrections.some(c => c.frame === reviewIndex) ? " · 보정됨" : ""}</p>
          {review.frames[reviewIndex].needsCorrection && <p role="status">추적이 끊긴 프레임입니다. 보이는 윤곽을 렌즈 안쪽에 맞춰 보정해 주세요.</p>}
          <div className="lens-transition-frame" onPointerDown={(event) => {
            if (!reviewEditing || locked) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
            const distances = reviewPoints.map(p => Math.hypot((p.x - x) * rect.width, (p.y - y) * rect.height));
            const closest = Math.min(...distances);
            if (closest <= 24) { reviewDrag.current = distances.indexOf(closest); event.currentTarget.setPointerCapture(event.pointerId); }
          }} onPointerMove={(event) => {
            if (reviewDrag.current === null || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
            const rect = event.currentTarget.getBoundingClientRect(), index = reviewDrag.current;
            setReviewPoints(points => points.map((p, i) => i === index ? { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) } : p));
          }} onPointerUp={() => { reviewDrag.current = null; }} onPointerCancel={() => { reviewDrag.current = null; }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={review.frames[reviewIndex].image} alt={`추적 원본 ${review.frames[reviewIndex].sourceFrame}프레임`} draggable={false} />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polygon points={reviewPoints.map(p => `${p.x * 100},${p.y * 100}`).join(" ")} />
              {reviewEditing && reviewPoints.map((p,i) => <circle key={i} cx={p.x * 100} cy={p.y * 100} r="0.7" />)}
            </svg>
          </div>
          <label>추적 프레임<input type="range" min={0} max={review.frames.length - 1} value={reviewIndex} disabled={locked || reviewEditing} onChange={event => selectReview(Number(event.target.value))} /></label>
          <div className="lens-outline-actions">
            <button type="button" className="studio-action" disabled={locked || reviewEditing || reviewIndex === 0} onClick={() => selectReview(reviewIndex - 1)}>이전 프레임</button>
            <button type="button" className="studio-action" disabled={locked || reviewEditing || reviewIndex === review.frames.length - 1} onClick={() => selectReview(reviewIndex + 1)}>다음 프레임</button>
            {!reviewEditing ? <button type="button" className="studio-action" disabled={locked || reviewIndex === 0} onClick={() => { setReviewPoints(review.frames[reviewIndex].outline.map(p => ({...p}))); setReviewEditing(true); setResult(undefined); }}>이 프레임 보정</button> : <>
              <button type="button" className="studio-action" disabled={locked} onClick={() => { setReviewPoints(review.frames[reviewIndex].outline); setReviewEditing(false); }}>보정 취소</button>
              <button type="button" className="studio-action" data-tone="primary" disabled={locked} onClick={() => {
                const xs=reviewPoints.map(p=>p.x), ys=reviewPoints.map(p=>p.y), x=Math.min(...xs), y=Math.min(...ys);
                if (!isLensMask({x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y,outline:reviewPoints})) { setError("윤곽이 겹치거나 너무 작습니다."); return; }
                void refreshReview([...corrections.filter(c => c.frame !== reviewIndex), { frame: reviewIndex, outline: reviewPoints }].sort((a,b)=>a.frame-b.frame));
              }}>보정하고 다시 추적</button>
            </>}
            {corrections.some(c => c.frame === reviewIndex) && <button type="button" className="studio-action" disabled={locked || reviewEditing} onClick={() => void refreshReview(corrections.filter(c => c.frame !== reviewIndex))}>이 보정 삭제</button>}
          </div>
          {reviewEditing && <details><summary>선택 프레임 좌표 수정</summary>{reviewPoints.map((point,index) => <div className="lens-transition-fields" key={index}>{(["x","y"] as const).map(key => <label key={key}>점 {index + 1} {key === "x" ? "가로" : "세로"} (%)<input type="number" min={0} max={100} step={0.1} value={Math.round(point[key] * 1000) / 10} onChange={event => { const v = Math.max(0,Math.min(1,Number(event.target.value)/100)); setReviewPoints(points => points.map((p,i)=>i===index?{...p,[key]:v}:p)); }} /></label>)}</div>)}</details>}
          {corrections.length > 0 && <p>보정된 프레임 {corrections.map(c=>c.frame+1).join(", ")}</p>}
        </>}
        <button type="button" className="studio-action" data-tone="primary" disabled={locked || interruptedFrame !== undefined || reviewEditing || !closed || !isLensMask(mask) || review?.frames.some((frame) => frame.needsCorrection)}
          onClick={() => void render()}>{pending ? "처리 중" : "전환 만들기"}</button>
      </>}
      {result && <div className="lens-transition-result">
        <video src={result.asset.url} controls playsInline aria-label="생성된 렌즈 전환 미리보기" />
        <p>추적 프레임 {result.tracking.trackedFrames}개</p>
        {result.tracking.finalOutline && <p>마지막 추적 프레임의 윤곽점 {result.tracking.finalOutline.length}개</p>}
        <button type="button" className="studio-action" data-tone="primary" disabled={locked} onClick={() => void apply()}>{savedTransition || legacyTransition ? "기존 전환 갱신" : "타임라인에 적용"}</button>
      </div>}
      {error && <p role="alert">{error}</p>}
    </>}
  </section>;
}
