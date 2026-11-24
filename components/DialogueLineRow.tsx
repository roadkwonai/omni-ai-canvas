"use client";

import { memo, useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Ellipsis, MessageSquarePlus, Play, RefreshCw, Trash2, Undo2, WandSparkles } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@ui-sdk/react/menu";
import { Popover, PopoverClose, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@ui-sdk/react/popover";
import { isSpeaker, type DialogueRow, type LineStatus } from "@/lib/dialogue";
import { plainSpeech, speechStyles } from "@/lib/local-tts-options";
import { fromKorean, toKorean } from "@/lib/speech-markup";
import { insertTag, SpeechTagBar } from "./LocalTtsControls";
import SpeechMarkup from "./SpeechMarkup";
import "./board-context-menu.css";

type LineState = LineStatus | "failed";
export type LineActions = {
  edit: (id: string) => void; cancel: (id: string) => void; save: (id: string, line: { speaker: string; text: string }, addNext: boolean) => void;
  insert: (id: string) => void; remove: (id: string) => void; move: (id: string, by: -1 | 1) => void;
  play: (id: string) => void; redo: (id: string) => void; revertDirection: (id: string) => void;
};
const states: Record<LineState, string> = { new: "새 줄", changed: "고침", done: "완성", failed: "실패" };
const styleLabels: string[] = Object.values(speechStyles).map(({ label }) => label);

/** 고른 말투를 대사 맨 앞에 두고 먼저 고른 말투는 바꾼다. */
const withStyle = (text: string, label: string) => {
  const first = text.match(/^\[([^\]]+)\]\s*/);
  const rest = first && styleLabels.includes(first[1]) ? text.slice(first[0].length) : text;
  return first?.[1] === label ? rest : `[${label}] ${rest}`;
};

/** 대사에 넣을 지시를 고르는 작은 목록. 글은 한국어 지시로 적는다. */
export function CuePopover({ area, text, disabled, styles = true, onChange }: {
  area: React.RefObject<HTMLTextAreaElement | null>; text: string; disabled: boolean; styles?: boolean; onChange: (text: string) => void;
}) {
  const id = useId();
  return <Popover>
    <PopoverTrigger className="studio-action" data-tone="quiet" aria-disabled={disabled || undefined}><MessageSquarePlus size={16} aria-hidden="true" /> 지시 넣기</PopoverTrigger>
    <PopoverContent className="tts-multi-filter-popup cue-popover" side="bottom" align="start">
      <PopoverTitle>대사에 넣을 지시</PopoverTitle>
      {styles && <div className="local-tts-field">
        <span id={id}>줄 전체의 말투</span>
        <div className="local-tts-chips" role="group" aria-labelledby={id}>{styleLabels.map((label) => <button key={label} type="button" className="tts-filter-chip"
          aria-pressed={text.startsWith(`[${label}]`)} onClick={() => onChange(withStyle(text, label))}>{label}</button>)}</div>
      </div>}
      <SpeechTagBar model="drama-3" disabled={disabled} onInsert={(before, after = "") => insertTag(area.current, text, onChange, toKorean(before), toKorean(after))} />
      <PopoverClose className="studio-action" data-tone="quiet">닫기</PopoverClose>
    </PopoverContent>
  </Popover>;
}

function LineEditor({ row, speakers, disabled, actions }: { row: DialogueRow; speakers: string[]; disabled: boolean; actions: LineActions }) {
  const [speaker, setSpeaker] = useState(row.speaker);
  const [text, setText] = useState(() => toKorean(row.text));
  const [error, setError] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const list = useId();
  useEffect(() => {
    const field = area.current;
    field?.focus();
    field?.setSelectionRange(field.value.length, field.value.length);
  }, []);

  function save(addNext: boolean) {
    const name = speaker.trim();
    const words = fromKorean(text.replace(/\s*\n\s*/g, " ").trim());
    if (!isSpeaker(name)) return setError("화자 이름은 세 낱말, 20자 안의 글자와 숫자로 적어 주세요. ‘지문’이나 ‘장소’ 같은 말은 쓸 수 없습니다.");
    if (!plainSpeech(words) || words.includes("<|")) return setError("소리 내어 읽을 대사를 적어 주세요.");
    actions.save(row.id, { speaker: name, text: words }, addNext);
  }
  function onKey(event: React.KeyboardEvent) {
    // Safari는 조합을 끝낸 뒤에 확정 Enter를 코드 229로 보낸다.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      actions.cancel(row.id);
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      save(event.metaKey || event.ctrlKey);
    }
  }
  return <div className="dialogue-editor">
    <label>화자<input value={speaker} list={list} maxLength={20} disabled={disabled} onKeyDown={onKey} onChange={(event) => setSpeaker(event.target.value)} /></label>
    <datalist id={list}>{speakers.map((name) => <option key={name} value={name} />)}</datalist>
    <label>대사<textarea ref={area} value={text} rows={2} disabled={disabled} aria-invalid={Boolean(error)} onKeyDown={onKey} onChange={(event) => setText(event.target.value)} /></label>
    {error && <p role="alert">{error}</p>}
    <div className="tts-actions">
      <button type="button" className="studio-action" data-tone="primary" disabled={disabled} onClick={() => save(false)}>저장</button>
      <button type="button" className="studio-action" data-tone="quiet" onClick={() => actions.cancel(row.id)}>취소</button>
      <CuePopover area={area} text={text} disabled={disabled} onChange={setText} />
      <small>Enter 저장 · ⌘/Ctrl+Enter 저장하고 다음 줄 · Esc 취소</small>
    </div>
  </div>;
}

export default memo(function DialogueLineRow({ row, index, total, color, speakers, state, time, reason, playing, dimmed, editing, disabled, canMake, actions }: {
  row: DialogueRow; index: number; total: number; color: number; speakers: string[]; state: LineState; time: string; reason: string | undefined;
  playing: boolean; dimmed: boolean; editing: boolean; disabled: boolean; canMake: boolean; actions: LineActions;
}) {
  const name = `${index + 1}번째 줄`;
  if (editing) return <li className="dialogue-line" data-speaker={color} data-editing>
    <LineEditor row={row} speakers={speakers} disabled={disabled} actions={actions} />
  </li>;
  return <li className="dialogue-line" data-speaker={color} data-dimmed={dimmed || undefined} aria-current={playing || undefined}>
    <span className="speaker-tag" id={`speaker-${row.id}`}>{row.speaker}</span>
    <button type="button" className="dialogue-words" id={`line-${row.id}`} aria-labelledby={`speaker-${row.id} line-${row.id}`} disabled={disabled} aria-describedby={`state-${row.id}`} onClick={() => actions.edit(row.id)}
      onKeyDown={(event) => {
        if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
        event.preventDefault();
        actions.move(row.id, event.key === "ArrowUp" ? -1 : 1);
      }}><SpeechMarkup text={row.text} /></button>
    <span className="dialogue-state" id={`state-${row.id}`} data-state={state}>{state === "done" ? time : states[state]}</span>
    <div className="dialogue-buttons">
      {reason !== undefined && <Popover>
        <PopoverTrigger className="studio-action" data-tone="quiet" data-size="icon" aria-label={`${name}에 AI가 넣은 지시 보기`}><WandSparkles size={16} aria-hidden="true" /></PopoverTrigger>
        <PopoverContent className="tts-multi-filter-popup" side="bottom" align="end">
          <PopoverTitle>AI가 넣은 지시</PopoverTitle>
          <PopoverDescription>{reason || "대본의 상황에 맞춰 골랐습니다."}</PopoverDescription>
          <PopoverClose className="studio-action" onClick={() => actions.revertDirection(row.id)}><Undo2 size={16} aria-hidden="true" /> 이 줄 되돌리기</PopoverClose>
        </PopoverContent>
      </Popover>}
      <button type="button" className="studio-action" data-tone="quiet" data-size="icon" disabled={!time} aria-label={`${name} 듣기`} onClick={() => actions.play(row.id)}><Play size={16} aria-hidden="true" /></button>
      <button type="button" className="studio-action" data-tone="quiet" data-size="icon" disabled={!canMake || state === "new"} aria-label={`${name}만 다시 만들기`} onClick={() => actions.redo(row.id)}><RefreshCw size={16} aria-hidden="true" /></button>
      <Menu>
        <MenuTrigger className="studio-action" data-tone="quiet" data-size="icon" disabled={disabled} aria-label={`${name} 더 보기`}><Ellipsis size={16} aria-hidden="true" /></MenuTrigger>
        <MenuContent className="board-context-menu" side="bottom" align="end" aria-label={`${name} 작업`}>
          <MenuItem className="board-context-item" value="insert" onSelect={() => actions.insert(row.id)}><ChevronDown size={16} aria-hidden="true" /> 아래에 줄 추가</MenuItem>
          <MenuItem className="board-context-item" value="up" disabled={index === 0} onSelect={() => actions.move(row.id, -1)}><ArrowUp size={16} aria-hidden="true" /> 위로 옮기기</MenuItem>
          <MenuItem className="board-context-item" value="down" disabled={index === total - 1} onSelect={() => actions.move(row.id, 1)}><ArrowDown size={16} aria-hidden="true" /> 아래로 옮기기</MenuItem>
          <MenuItem className="board-context-item" value="remove" onSelect={() => actions.remove(row.id)}><Trash2 size={16} aria-hidden="true" /> 줄 삭제</MenuItem>
        </MenuContent>
      </Menu>
    </div>
  </li>;
});
