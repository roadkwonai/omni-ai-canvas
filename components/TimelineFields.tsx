"use client";

import { useId, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Minus, Plus, Trash2 } from "lucide-react";
import { Field, FieldLabel } from "@ui-sdk/react/field";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { timecode } from "../lib/timeline-layout";
import { TIMELINE_MAX_FRAMES, type TimelineAudio, type TimelineClip } from "../lib/timeline-spec";
import type { CanvasNode } from "../lib/types";

// ui-sdk의 NumberInput은 표시한 글자를 다시 읽어 1/30초 간격에서 한 프레임씩 움직이지 못하고 입력값을 간격에 맞춰 반올림한다.
function StepField({ label, help, value, min = 0, max, step, jump, disabled, onChange }: {
  label: string; help: string; value: number; min?: number; max: number; step: number; jump: number; disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [text, setText] = useState<string | null>(null);
  const set = (next: number) => {
    const clamped = Math.max(min, Math.min(max, next));
    if (clamped !== value) onChange(clamped);
  };
  const move = (amount: number) => { setText(null); set(value + amount); };
  const keys: Record<string, number> = { ArrowUp: step, ArrowDown: -step, PageUp: jump, PageDown: -jump };
  return <div className="timeline-field">
    <label htmlFor={id}>{label}</label>
    <div className="timeline-number">
      <button type="button" tabIndex={-1} aria-label={`${label} 줄이기`} disabled={disabled || value <= min}
        onClick={(event) => move(event.shiftKey ? -jump : -step)}><Minus size={14} aria-hidden="true" /></button>
      <input id={id} type="text" inputMode="decimal" role="spinbutton" autoComplete="off" title={help} disabled={disabled}
        aria-valuenow={Number(value.toFixed(2))} aria-valuemin={Number(min.toFixed(2))} aria-valuemax={max}
        value={text ?? String(Number(value.toFixed(2)))}
        onChange={(event) => {
          setText(event.target.value);
          const next = Number(event.target.value);
          if (event.target.value.trim() && Number.isFinite(next)) set(next);
        }}
        onBlur={() => setText(null)}
        onKeyDown={(event) => {
          if (event.key === "Enter") setText(null);
          const amount = keys[event.key];
          if (!amount) return;
          event.preventDefault();
          move(event.shiftKey && event.key.startsWith("Arrow") ? Math.sign(amount) * jump : amount);
        }} />
      <button type="button" tabIndex={-1} aria-label={`${label} 늘리기`} disabled={disabled || value >= max}
        onClick={(event) => move(event.shiftKey ? jump : step)}><Plus size={14} aria-hidden="true" /></button>
    </div>
  </div>;
}

function FrameField({ min = 0, value, onChange, ...field }: {
  label: string; help: string; value: number; min?: number; disabled?: boolean; onChange: (frames: number) => void;
}) {
  return <StepField {...field} value={value / 30} min={min / 30} max={TIMELINE_MAX_FRAMES / 30} step={1 / 30} jump={1}
    help={`${field.help} 버튼과 방향키는 1프레임, Shift와 함께 누르면 1초씩 바꿉니다.`}
    onChange={(next) => { if (Math.round(next * 30) !== value) onChange(Math.round(next * 30)); }} />;
}

function ItemHeader({ name, index, total, onSelect, children }: {
  name: string; index: number; total: number; onSelect: (index: number) => void; children?: React.ReactNode;
}) {
  return <div className="timeline-item-header">
    <h3>{name} {index + 1} <small>/ {total}</small></h3>
    <button type="button" className="studio-action" data-tone="quiet" data-size="icon" aria-label={`이전 ${name} 선택`}
      disabled={index === 0} onClick={() => onSelect(index - 1)}><ChevronLeft size={18} aria-hidden="true" /></button>
    <button type="button" className="studio-action" data-tone="quiet" data-size="icon" aria-label={`다음 ${name} 선택`}
      disabled={index === total - 1} onClick={() => onSelect(index + 1)}><ChevronRight size={18} aria-hidden="true" /></button>
    {children}
  </div>;
}

function SourceNote({ item, seconds, onFit }: { item: { inFrame: number; durationFrames: number }; seconds?: number; onFit: () => void }) {
  if (seconds === undefined || !Number.isFinite(seconds)) return null;
  const used = item.inFrame + item.durationFrames;
  return <div className="timeline-source-note" data-over={used / 30 > seconds + 1 / 30 || undefined}>
    <p>원본 {timecode(Math.floor(seconds * 30))} 중 {timecode(item.inFrame)}–{timecode(used)}을 씁니다.</p>
    <button type="button" className="studio-action" onClick={onFit}
      title="원본 시작부터 쓸 수 있는 가장 긴 길이로 바꿉니다.">남은 길이에 맞추기</button>
  </div>;
}

export function TimelineClipFields({ clip, index, total, start, node, visuals, seconds, lensAction, onSelect, onChange, onMove, onRemove, onFit }: {
  clip: TimelineClip; index: number; total: number; start: number; node?: CanvasNode; visuals: readonly CanvasNode[]; seconds?: number;
  lensAction?: React.ReactNode; onSelect: (index: number) => void; onChange: (patch: Partial<TimelineClip>) => void;
  onMove: (step: number) => void; onRemove: () => void; onFit: () => void;
}) {
  const video = node?.asset?.type === "video";
  return <section className="timeline-item" aria-label={`컷 ${index + 1} 설정`}>
    <ItemHeader name="컷" index={index} total={total} onSelect={onSelect} />
    <p className="timeline-item-range">시간축 {timecode(start)}–{timecode(start + clip.durationFrames)}</p>
    <label className="timeline-field">화면
      <select title="이 컷에서 사용할 영상이나 이미지를 선택합니다." value={clip.nodeId ?? ""}
        onChange={(event) => onChange({ nodeId: event.target.value || null, inFrame: 0 })}>
        <option value="">빈 프리비즈 카드</option>
        {clip.nodeId && !visuals.some(({ id }) => id === clip.nodeId) && <option value={clip.nodeId}>{node?.title ?? "보드에 없는 노드"}</option>}
        {visuals.map((item) => <option value={item.id} key={item.id}>{item.title}{item.asset ? "" : " · 미생성 슬레이트"}</option>)}
      </select>
    </label>
    <div className="timeline-field-grid">
      <FrameField label="길이(초)" help="이 컷을 표시할 시간을 정합니다." min={1} value={clip.durationFrames}
        onChange={(durationFrames) => onChange({ durationFrames })} />
      <FrameField label="원본 시작(초)" help={video ? "원본 영상에서 재생을 시작할 시점을 정합니다." : "영상 컷에서만 쓰는 값입니다."}
        value={clip.inFrame} disabled={!video && clip.inFrame === 0} onChange={(inFrame) => onChange({ inFrame })} />
    </div>
    {video && <SourceNote item={clip} seconds={seconds} onFit={onFit} />}
    {index > 0 && <Field className="timeline-field">
      <FieldLabel>이전 컷과의 전환</FieldLabel>
      <SegmentedControl className="timeline-segments" value={clip.transition}
        onValueChange={(value) => onChange(value === "dissolve"
          ? { transition: "dissolve", transitionFrames: clip.transitionFrames || 15 }
          : { transition: "cut", transitionFrames: 0 })}>
        <SegmentedControlIndicator className="timeline-segments-indicator" />
        <SegmentedControlItem value="cut" title="이전 컷이 끝나면 바로 이 컷을 보여 줍니다.">하드컷</SegmentedControlItem>
        <SegmentedControlItem value="dissolve" title="이전 컷 위로 이 컷이 서서히 나타납니다. 겹치는 만큼 전체 길이가 줄어듭니다.">
          디졸브 {Number(((clip.transitionFrames || 15) / 30).toFixed(2))}초</SegmentedControlItem>
      </SegmentedControl>
    </Field>}
    {lensAction}
    <div className="timeline-item-actions">
      <button type="button" className="studio-action" disabled={index === 0} onClick={() => onMove(-1)}
        title="이 컷을 앞 순서로 이동합니다."><ArrowLeft size={16} aria-hidden="true" /> 앞으로</button>
      <button type="button" className="studio-action" disabled={index === total - 1} onClick={() => onMove(1)}
        title="이 컷을 뒤 순서로 이동합니다.">뒤로 <ArrowRight size={16} aria-hidden="true" /></button>
      <button type="button" className="studio-action" data-tone="danger" onClick={onRemove}
        title="이 컷을 타임라인에서 제거합니다."><Trash2 size={16} aria-hidden="true" /> 컷 삭제</button>
    </div>
  </section>;
}

const audioFields = [
  ["시작(초)", "startFrame", "타임라인에서 음향이 시작할 시점을 정합니다."],
  ["길이(초)", "durationFrames", "음향을 재생할 길이를 정합니다."],
  ["원본 시작(초)", "inFrame", "원본 음향의 시작 위치를 정합니다."],
  ["페이드 인(초)", "fadeInFrames", "음향이 서서히 커지는 시간을 정합니다."],
  ["페이드 아웃(초)", "fadeOutFrames", "음향이 서서히 작아지는 시간을 정합니다."],
] as const;

export function TimelineAudioFields({ track, index, total, node, sounds, seconds, onSelect, onChange, onRemove, onFit }: {
  track: TimelineAudio; index: number; total: number; node?: CanvasNode; sounds: readonly CanvasNode[]; seconds?: number;
  onSelect: (index: number) => void; onChange: (patch: Partial<TimelineAudio>) => void; onRemove: () => void; onFit: () => void;
}) {
  return <section className="timeline-item" aria-label={`음향 ${index + 1} 설정`}>
    <ItemHeader name="음향" index={index} total={total} onSelect={onSelect} />
    <p className="timeline-item-range">시간축 {timecode(track.startFrame)}–{timecode(track.startFrame + track.durationFrames)}</p>
    <label className="timeline-field">음향
      <select title="이 레이어에서 사용할 음향 노드를 선택합니다." value={track.nodeId}
        onChange={(event) => onChange({ nodeId: event.target.value })}>
        {!sounds.some(({ id }) => id === track.nodeId) && <option value={track.nodeId}>{node?.title ?? "보드에 없는 노드"}</option>}
        {sounds.map((item) => <option value={item.id} key={item.id}>{item.title}{item.asset ? "" : " · 미생성 무음"}</option>)}
      </select>
    </label>
    <div className="timeline-field-grid">
      {audioFields.map(([label, field, help]) => <FrameField key={field} label={label} help={help} value={track[field]}
        min={field === "durationFrames" ? 1 : 0} onChange={(frames) => onChange({ [field]: frames })} />)}
      <StepField label="음량" help="원본 대비 음량 배율을 정합니다. 1은 원본 음량입니다. 버튼과 방향키는 0.1, Shift와 함께 누르면 0.5씩 바꿉니다."
        value={track.gain} max={2} step={0.1} jump={0.5} onChange={(gain) => onChange({ gain: Number(gain.toFixed(4)) })} />
    </div>
    {track.gain > 1 && <p className="timeline-item-range">편집 화면에서는 원본 음량까지만 들립니다. 완성 영상에는 {track.gain}배로 들어갑니다.</p>}
    <SourceNote item={track} seconds={seconds} onFit={onFit} />
    <div className="timeline-item-actions">
      <button type="button" className="studio-action" data-tone="danger" onClick={onRemove}
        title="이 음향 레이어를 타임라인에서 제거합니다."><Trash2 size={16} aria-hidden="true" /> 음향 삭제</button>
    </div>
  </section>;
}
