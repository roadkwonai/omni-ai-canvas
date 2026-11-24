"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, Check, ChevronDown, FileText, ListMusic, Plus, RefreshCw, RotateCcw, Shuffle, Sparkles, X } from "lucide-react";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@ui-sdk/react/collapsible";
import { castSample, castVoice, dialogueLimits, dialogueSpeakers, dialogueText, lineStatus, matchRows, parseDialogue, similarSpeakers, speakerColors, suggestVoice, voiceKey, type CastChoice, type DialogueLine, type DialogueRow, type MadeLine } from "@/lib/dialogue";
import { optionSummary, plainSpeech, plainVoice, speechStyles } from "@/lib/local-tts-options";
import { requestJson } from "@/lib/local-tts-poll";
import { toKorean } from "@/lib/speech-markup";
import { assetId, localDefaultVoiceId, localTtsModels, randomSeed, ttsTextLimit, type LocalTtsModel, type TtsCatalog, type TtsVoice } from "@/lib/tts-types";
import type { Asset, CanvasNode } from "@/lib/types";
import DialogueLineRow, { CuePopover, type LineActions } from "./DialogueLineRow";
import { Range, VoiceDesignControls } from "./LocalTtsControls";
import LocalTtsProgressPanel, { phaseLabels } from "./LocalTtsProgress";
import { askDirections, DirectionButton } from "./SpeechDirector";
import { useLocalTts } from "./useLocalTts";
import "./tts-studio.css";
import "./dialogue-studio.css";

type Made = { asset: Asset; gap: number; order: string[]; lines: Record<string, MadeLine>; marks: Record<string, [number, number]> };
type Direction = { before: string; after: string; reason: string };
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const same = (first: DialogueLine[], second: DialogueLine[]) => dialogueText(first) === dialogueText(second);

function readSaved<T>(key: string, valid: (value: unknown) => boolean): Record<string, T> {
  try {
    return Object.fromEntries(Object.entries(JSON.parse(window.localStorage.getItem(key) ?? "{}")).filter(([, value]) => valid(value))) as Record<string, T>;
  } catch { return {}; }
}
function writeSaved(key: string, value: object) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장하지 못해도 이번 작업에는 쓴다. */ }
}
const isChoice = (value: unknown) => {
  const choice = value as Partial<CastChoice> | null;
  return typeof choice?.voiceId === "string" && Boolean(choice.design) && typeof choice.design === "object" && Number.isInteger(choice.variant);
};

export default function DialogueStudio({ projectId, script, characters, applyLabel, onApply, onBusyChange }: {
  projectId: string; script: string; characters: CanvasNode[]; applyLabel: string;
  onApply: (asset: Asset, text: string) => Promise<void>; onBusyChange: (busy: boolean) => void;
}) {
  const endpoint = `/api/projects/${projectId}/tts`;
  const castKey = `scene-room-cast:${projectId}`;
  const colorKey = `scene-room-cast-colors:${projectId}`;
  const { progress, requestId, generate, cancel } = useLocalTts(endpoint);
  const [initial] = useState(() => parseDialogue(script));
  const [rows, setRows] = useState<DialogueRow[]>(() => initial.lines.map((line, index) => ({ ...line, id: `s${index}`, take: 0 })));
  const [draft, setDraft] = useState<string>();
  const [keptDraft, setKeptDraft] = useState("");
  const [editing, setEditing] = useState<string>();
  const [highlight, setHighlight] = useState("");
  const [ready, setReady] = useState<boolean>();
  const [voices, setVoices] = useState<TtsVoice[]>();
  const [cast, setCast] = useState(() => readSaved<CastChoice>(castKey, isChoice));
  const [savedColors, setSavedColors] = useState(() => readSaved<number>(colorKey, Number.isInteger));
  const [apart, setApart] = useState<string[]>([]);
  const [gap, setGap] = useState(0.4);
  const [rights, setRights] = useState(false);
  const [seed, setSeed] = useState(randomSeed);
  const [made, setMade] = useState<Made>();
  const [failed, setFailed] = useState<string>();
  const [playing, setPlaying] = useState<string>();
  const [sample, setSample] = useState<{ name: string; url: string }>();
  const [directions, setDirections] = useState<Record<string, Direction>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const textArea = useRef<HTMLTextAreaElement>(null);
  const player = useRef<HTMLAudioElement>(null);
  const result = useRef<HTMLDivElement>(null);
  const stopAt = useRef<number>(undefined);
  const list = useRef<HTMLOListElement>(null);
  const focusNext = useRef<string>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      requestJson<{ localModels: Record<LocalTtsModel, boolean> }>(endpoint, { signal }),
      requestJson<TtsCatalog>(`${endpoint}?provider=local`, { signal }),
    ]).then(([{ localModels }, catalog]) => {
      setReady(localModels["drama-3"]);
      setVoices(catalog.voices.filter(({ id }) => id !== localDefaultVoiceId));
    }).catch((error) => { if (!signal.aborted) setMessage(error instanceof Error ? error.message : "목소리 목록을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [endpoint]);
  useEffect(() => { if (made) result.current?.scrollIntoView({ block: "nearest" }); }, [made]);

  const typed = draft === undefined ? undefined : parseDialogue(draft);
  const lines: DialogueLine[] = typed?.lines ?? rows;
  const speakers = dialogueSpeakers(lines);
  const names = speakers.map(({ name }) => name);
  const colors = speakerColors(names, savedColors);
  // 글을 적는 동안의 덜 적은 이름에는 색을 남기지 않는다.
  if (draft === undefined && names.some((name) => !Object.hasOwn(savedColors, name))) setSavedColors(colors);
  useEffect(() => { writeSaved(colorKey, savedColors); }, [colorKey, savedColors]);
  const length = lines.reduce((sum, line) => sum + line.text.length, 0);
  const voiceIds = (voices ?? []).map(({ id }) => id);
  const sheets = characters.map((node) => ({ title: node.title, body: node.body, sampleId: node.characterIdentity?.voiceSample && assetId(node.characterIdentity.voiceSample) }));
  function choiceOf(name: string): CastChoice {
    const choice = cast[name] ?? suggestVoice(name, sheets, voiceIds);
    return choice.voiceId && !voiceIds.includes(choice.voiceId) ? { ...choice, voiceId: "" } : choice;
  }
  function choose(name: string, change: Partial<CastChoice>) {
    const next = { ...cast, [name]: { ...choiceOf(name), ...change } };
    setCast(next);
    setSample(undefined);
    writeSaved(castKey, next);
  }
  const keys = new Map(names.map((name) => [name, voiceKey(name, choiceOf(name))]));
  const statuses = new Map(rows.map((row) => [row.id, lineStatus(row, keys.get(row.speaker) ?? "", made?.lines[row.id])]));
  const silent = lines.findIndex(({ text }) => !plainSpeech(text));
  const needsRights = names.some((name) => choiceOf(name).voiceId);
  const problem = !lines.length ? (draft === undefined ? "대화가 없습니다. 줄을 추가하거나 글로 편집해 주세요." : "한 줄에 하나씩 ‘화자: 대사’로 적어 주세요.")
    : silent >= 0 && editing === undefined ? `${silent + 1}번째 줄에 소리 내어 읽을 대사가 없습니다.`
    : length > ttsTextLimit ? `한 번에 대사 ${ttsTextLimit.toLocaleString()}자까지 만들 수 있습니다. 장면을 나눠 주세요.`
    : lines.length > dialogueLimits.lines ? `한 번에 ${dialogueLimits.lines}줄까지 만들 수 있습니다. 장면을 나눠 주세요.`
    : speakers.length > dialogueLimits.speakers ? `한 번에 화자 ${dialogueLimits.speakers}명까지 만들 수 있습니다. 화자 이름의 표기를 확인해 주세요.` : "";
  const disabled = Boolean(busy);
  const canMake = !disabled && Boolean(ready && voices) && !problem && (!needsRights || rights) && editing === undefined;
  const directedCount = draft === undefined ? rows.filter((row) => directions[row.id]?.after === row.text).length : 0;
  const changed = draft === undefined ? rows.filter((row) => statuses.get(row.id) !== "done").length : lines.length;
  const rearranged = Boolean(made) && (made!.gap !== gap || made!.order.join() !== rows.map(({ id }) => id).join());
  const makeLabel = !made || draft !== undefined ? "대화 만들기" : changed ? `바뀐 ${changed}줄 만들기` : rearranged ? "바뀐 순서와 쉼으로 잇기" : "모두 만들었습니다";

  async function work(label: string, task: () => Promise<void>) {
    setBusy(label);
    setMessage("");
    onBusyChange(true);
    try { await task(); } catch (error) {
      setMessage(error instanceof Error ? error.message : "음성을 만들지 못했습니다.");
    } finally {
      setBusy("");
      onBusyChange(false);
    }
  }
  const showPhase = ({ phase }: { phase: keyof typeof phaseLabels }) => setBusy((current) => current.startsWith("음성 생성을 취소") ? current : phaseLabels[phase]);

  function openDraft() {
    const text = toKorean(dialogueText(rows));
    setDraft(keptDraft && same(parseDialogue(keptDraft).lines, rows) ? keptDraft : text);
    setEditing(undefined);
  }
  /** 글로 고치던 내용을 줄에 반영하고 지금의 줄을 돌려준다. */
  function settle(): DialogueRow[] {
    if (draft === undefined || !typed) return rows;
    const next = matchRows(rows, typed.lines, () => crypto.randomUUID());
    setRows(next);
    setKeptDraft(draft);
    setDraft(undefined);
    return next;
  }

  const listen = (name: string) => work("목소리를 준비하는 중", async () => {
    const voice = castVoice(name, choiceOf(name));
    if ("voiceId" in voice) return setSample({ name, url: voices!.find(({ id }) => id === voice.voiceId)!.previewUrl! });
    const { asset } = await generate(crypto.randomUUID(), {
      provider: "local", voiceId: localDefaultVoiceId, localModel: "drama-3", text: castSample, confirmed: true, options: { design: optionSummary({ design: voice.design }) ? voice.design : { note: plainVoice }, seed: voice.seed },
    }, showPhase);
    setSample({ name, url: asset.url });
  });

  const make = (target: DialogueRow[], nextSeed = seed) => work("대화를 만드는 중", async () => {
    setFailed(undefined);
    try {
      const { asset, marks = [] } = await generate(crypto.randomUUID(), {
        confirmed: true, rightsConfirmed: rights,
        dialogue: {
          lines: target.map(({ speaker, text, take }) => ({ speaker, text, take })),
          cast: dialogueSpeakers(target).map(({ name }) => castVoice(name, choiceOf(name))), gap, seed: nextSeed,
        },
      }, showPhase);
      setSeed(nextSeed);
      setRows(target);
      stopAt.current = undefined;
      setMade({
        asset, gap, order: target.map(({ id }) => id),
        lines: Object.fromEntries(target.map(({ id, speaker, text, take }) => [id, { speaker, text, take, voice: keys.get(speaker) ?? voiceKey(speaker, choiceOf(speaker)) }])),
        marks: Object.fromEntries(target.map(({ id }, index) => [id, marks[index]])),
      });
    } catch (error) {
      const at = error instanceof Error ? Number(error.message.match(/^(\d+)번째 줄/)?.[1]) : NaN;
      // 같은 시드는 같은 소리를 내므로 실패한 줄은 다음에 다른 시드로 만들도록 횟수를 남긴다.
      if (at) {
        setRows(target);
        setFailed(target[at - 1]?.id);
      }
      throw error;
    }
  });

  const direct = () => work("AI가 대본을 읽고 연기 지시를 고르는 중", async () => {
    const target = settle();
    const source = target.map((row) => ({ ...row, text: directions[row.id]?.after === row.text ? directions[row.id].before : row.text }));
    const people = characters.map((node) => `${node.title}: ${node.body.slice(0, 400)}`).join("\n");
    const answers = await askDirections(endpoint, "drama-3", source.map(({ speaker, text }) => ({ speaker, text })), `${script.slice(0, 14_000)}\n\n# 등장인물\n${people}`);
    const next: Record<string, Direction> = {};
    setRows(source.map((row, index) => {
      const { changed: added, style, text, reason } = answers[index];
      if (!added) return row;
      const after = style ? `[${speechStyles[style].prompt}] ${text}` : text;
      next[row.id] = { before: row.text, after, reason };
      return { ...row, text: after };
    }));
    setDirections(next);
    if (!Object.keys(next).length) setMessage("AI가 대본을 읽었지만 더 넣을 지시를 찾지 못했습니다.");
  });
  const revertRow = (row: DialogueRow) => directions[row.id]?.after === row.text ? { ...row, text: directions[row.id].before } : row;

  // 줄이 다시 그려진 뒤에 초점을 옮긴다.
  useEffect(() => {
    if (focusNext.current === undefined) return;
    const row = list.current?.querySelector<HTMLButtonElement>(`[id="line-${focusNext.current}"]`);
    // 만드는 동안 막힌 줄에는 끝난 뒤에 초점을 준다. 그사이 다른 곳을 고르면 옮기지 않는다.
    if (row?.disabled) return;
    if (!document.activeElement || document.activeElement === document.body || list.current?.contains(document.activeElement)) row?.focus();
    focusNext.current = undefined;
  });
  function focusRow(id: string | undefined) { focusNext.current = id; }
  function addRow(after?: string) {
    const index = after === undefined ? rows.length - 1 : rows.findIndex(({ id }) => id === after);
    const speaker = rows.slice(0, index + 1).findLast((row) => row.speaker !== rows[index]?.speaker)?.speaker ?? rows[index]?.speaker ?? "";
    const row: DialogueRow = { id: crypto.randomUUID(), take: 0, speaker, text: "" };
    setRows((current) => current.toSpliced(index + 1, 0, row));
    setEditing(row.id);
  }
  const handlers: LineActions = {
    edit: setEditing,
    cancel: (id) => {
      setEditing(undefined);
      // 적지 않은 새 줄은 남기지 않는다.
      const index = rows.findIndex((row) => row.id === id);
      const empty = !rows[index]?.text;
      if (empty) setRows(rows.filter((row) => row.id !== id));
      focusRow(empty ? (rows[index - 1] ?? rows[index + 1])?.id : id);
    },
    save: (id, line, addNext) => {
      setRows((current) => current.map((row) => row.id === id ? { ...row, ...line } : row));
      setFailed((current) => current === id ? undefined : current);
      setEditing(undefined);
      if (!addNext) return focusRow(id);
      const row: DialogueRow = { id: crypto.randomUUID(), take: 0, speaker: rows.findLast((other) => other.speaker !== line.speaker)?.speaker ?? line.speaker, text: "" };
      setRows((current) => current.toSpliced(current.findIndex((other) => other.id === id) + 1, 0, row));
      setEditing(row.id);
    },
    insert: addRow,
    remove: (id) => {
      const index = rows.findIndex((row) => row.id === id);
      setRows(rows.filter((row) => row.id !== id));
      focusRow((rows[index + 1] ?? rows[index - 1])?.id);
    },
    move: (id, by) => {
      const index = rows.findIndex((row) => row.id === id);
      const to = index + by;
      if (to < 0 || to >= rows.length || disabled) return;
      setRows(rows.toSpliced(index, 1).toSpliced(to, 0, rows[index]));
      setMessage(`${rows[index].speaker}의 줄을 ${to + 1}번째로 옮겼습니다.`);
      focusRow(id);
    },
    play: (id) => {
      const mark = made?.marks[id];
      if (!player.current || !mark) return;
      stopAt.current = mark[1];
      player.current.currentTime = mark[0];
      void player.current.play();
    },
    redo: (id) => {
      focusRow(id);
      void make(rows.map((row) => row.id === id ? { ...row, take: row.take + 1 } : row));
    },
    revertDirection: (id) => setRows((current) => current.map((row) => row.id === id ? revertRow(row) : row)),
  };
  const latest = useRef(handlers);
  useEffect(() => { latest.current = handlers; });
  // 줄이 많아도 바뀐 줄만 다시 그리도록 동작은 한 번만 만든다.
  const [actions] = useState<LineActions>(() => ({
    edit: (id) => latest.current.edit(id), cancel: (id) => latest.current.cancel(id), save: (...args) => latest.current.save(...args), insert: (id) => latest.current.insert(id),
    remove: (id) => latest.current.remove(id), move: (...args) => latest.current.move(...args), play: (id) => latest.current.play(id), redo: (id) => latest.current.redo(id),
    revertDirection: (id) => latest.current.revertDirection(id),
  }));

  function followPlayer(audio: HTMLAudioElement) {
    if (stopAt.current !== undefined && audio.currentTime >= stopAt.current) audio.pause();
    setPlaying(audio.paused ? undefined : made?.order.find((id) => made.marks[id] && audio.currentTime >= made.marks[id][0] && audio.currentTime < made.marks[id][1]));
  }
  async function stop() {
    setBusy("음성 생성을 취소하는 중");
    await cancel().catch(() => setBusy("취소 요청을 보내지 못했습니다. 생성을 계속합니다."));
  }
  const pairs = draft === undefined ? similarSpeakers(names).filter((pair) => !apart.includes(pair.toSorted().join())) : [];
  const speakerNames = names.join("\n");
  const [stableNames, setStableNames] = useState<{ key: string; names: string[] }>({ key: speakerNames, names });
  if (stableNames.key !== speakerNames) setStableNames({ key: speakerNames, names });

  return <section className="tts-studio dialogue-studio" aria-label="여러 화자 대화 제작">
    {ready === false && <p>터미널에서 <code>npm run setup:local-tts</code>로 Drama 3를 설치해 주세요.</p>}

    <div className="dialogue-cast" role="group" aria-label="화자별 목소리">
      {speakers.slice(0, dialogueLimits.speakers).map(({ name, lines: count }) => {
        const choice = choiceOf(name);
        const voice = choice.voiceId ? voices?.find(({ id }) => id === choice.voiceId)?.name : optionSummary({ design: choice.design }) || "모델이 정함";
        return <section key={name} aria-label={`${name} 목소리`} data-speaker={colors[name]}>
          <div className="dialogue-cast-head">
            <button type="button" className="speaker-tag" aria-pressed={highlight === name} aria-label={`${name} 줄 ${count}개 강조`} onClick={() => setHighlight(highlight === name ? "" : name)}>{name} <small>{count}</small></button>
            <button type="button" className="studio-action" data-tone="quiet" data-size="icon" disabled={disabled || !ready || !voices} aria-label={`${name} 목소리 듣기`} onClick={() => void listen(name)}><AudioLines size={16} aria-hidden="true" /></button>
          </div>
          <Collapsible className="local-tts-field">
            <CollapsibleTrigger className="studio-action local-tts-more" data-tone="quiet" aria-label={`${name} 목소리 바꾸기, 지금은 ${voice}`}>{voice} <ChevronDown size={16} aria-hidden="true" /></CollapsibleTrigger>
            <CollapsiblePanel className="local-tts-field">
              <label>목소리
                <select value={choice.voiceId} disabled={disabled || !voices} onChange={(event) => choose(name, { voiceId: event.target.value })}>
                  <option value="">새 목소리 만들기</option>
                  {voices?.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.description}</option>)}
                </select>
              </label>
              {!choice.voiceId && <>
                <VoiceDesignControls model="drama-3" options={{ design: choice.design }} disabled={disabled}
                  onUpdate={(change) => choose(name, { design: change({ design: choice.design }).design ?? {} })} />
                <button type="button" className="studio-action local-tts-more" data-tone="quiet" disabled={disabled} onClick={() => choose(name, { variant: choice.variant + 1 })}>
                  <Shuffle size={16} aria-hidden="true" /> 다른 목소리</button>
              </>}
            </CollapsiblePanel>
          </Collapsible>
          {sample?.name === name && <audio controls autoPlay src={sample.url} aria-label={`${name} 목소리 듣기`} />}
        </section>;
      })}
    </div>
    {pairs.map(([first, second]) => <div key={`${first}-${second}`} className="local-tts-notice dialogue-merge">
      <p>‘{first}’와 ‘{second}’는 같은 인물인가요?</p>
      <div className="tts-actions">
        {[first, second].map((name, index) => <button key={name} type="button" className="studio-action" disabled={disabled}
          onClick={() => setRows(rows.map((row) => row.speaker === [second, first][index] ? { ...row, speaker: name } : row))}>‘{name}’ 이름 쓰기</button>)}
        <button type="button" className="studio-action" data-tone="quiet" onClick={() => setApart([...apart, [first, second].toSorted().join()])}>다른 인물</button>
      </div>
    </div>)}

    <div className="dialogue-toolbar">
      <p role="status">{lines.length}줄 · 화자 {speakers.length}명 · {length.toLocaleString()} / {ttsTextLimit.toLocaleString()}자
        {(typed?.ignored ?? 0) > 0 && ` · 화자 없는 ${typed!.ignored}줄은 읽지 않습니다`}{same(lines, initial.lines) && initial.ignored > 0 && ` · 대본의 지문 ${initial.ignored}줄은 뺐습니다`}
        {directedCount > 0 && ` · AI 지시 ${directedCount}줄`}</p>
      <div className="tts-actions">
        <DirectionButton again={directedCount > 0} disabled={disabled || Boolean(problem) || editing !== undefined} onClick={() => void direct()} />
        {directedCount > 0 && <button type="button" className="studio-action" data-tone="quiet" disabled={disabled} onClick={() => setRows(rows.map(revertRow))}><RotateCcw size={16} aria-hidden="true" /> AI 지시 모두 되돌리기</button>}
        {draft === undefined
          ? <button type="button" className="studio-action" data-tone="quiet" disabled={disabled || editing !== undefined} onClick={openDraft}><FileText size={16} aria-hidden="true" /> 글로 편집</button>
          : <button type="button" className="studio-action" data-tone="quiet" disabled={disabled} onClick={() => void settle()}><ListMusic size={16} aria-hidden="true" /> 줄로 보기</button>}
      </div>
    </div>

    {draft !== undefined ? <div className="local-tts-field">
      <label>대화
        <textarea ref={textArea} value={draft} rows={12} disabled={disabled} aria-invalid={Boolean(problem)} placeholder={"시우: 다녀왔어.\n시아: [한숨] 왜 이렇게 늦었어?"}
          onChange={(event) => setDraft(event.target.value)} />
      </label>
      <CuePopover area={textArea} text={draft} disabled={disabled} styles={false} onChange={setDraft} />
    </div> : <>
      <ol ref={list} className="dialogue-rows" aria-label="대화">
        {rows.map((row, index) => {
          const mark = made?.marks[row.id];
          return <DialogueLineRow key={row.id} row={row} index={index} total={rows.length} color={colors[row.speaker] ?? 0} speakers={stableNames.names}
            state={failed === row.id ? "failed" : statuses.get(row.id)!} time={mark ? clock(mark[0]) : ""} reason={directions[row.id]?.after === row.text ? directions[row.id].reason : undefined}
            playing={playing === row.id} dimmed={Boolean(highlight) && highlight !== row.speaker && names.includes(highlight)} editing={editing === row.id}
            disabled={disabled || (editing !== undefined && editing !== row.id)} canMake={canMake} actions={actions} />;
        })}
      </ol>
      <button type="button" className="studio-action local-tts-more" data-tone="quiet" disabled={disabled || editing !== undefined} onClick={() => addRow()}><Plus size={16} aria-hidden="true" /> 줄 추가</button>
    </>}

    {made && <div ref={result} className="tts-result">
      <strong>만든 대화</strong>
      <audio ref={player} controls src={made.asset.url} aria-label="만든 대화 재생" onPlay={(event) => followPlayer(event.currentTarget)} onTimeUpdate={(event) => followPlayer(event.currentTarget)}
        onPause={() => { stopAt.current = undefined; setPlaying(undefined); }} />
      {(changed > 0 || rearranged) && <p>고친 내용은 다시 만든 뒤에 이 음성에 들어갑니다.</p>}
      <div className="tts-actions">
        <button type="button" className="studio-action" disabled={disabled} onClick={() => void work("적용 중", () => onApply(made.asset, toKorean(dialogueText(made.order.map((id) => made.lines[id])))))}><Check size={16} aria-hidden="true" /> {applyLabel}</button>
        <a className="studio-action" href={made.asset.url} download={made.asset.name}>다운로드</a>
      </div>
    </div>}
    <Range label="줄 사이 쉼" suffix="초" value={gap} fallback={0.4} range={dialogueLimits.gap} disabled={disabled} onChange={(value) => setGap(value ?? 0.4)} />
    {needsRights && <label className="tts-rights">
      <input type="checkbox" checked={rights} disabled={disabled} onChange={(event) => setRights(event.target.checked)} />
      <span>고른 목소리를 참조해 음성을 만들 권한이 있고, 실존 인물의 동의 없는 복제가 아님을 확인했습니다.</span>
    </label>}
    <div className="tts-submit">
      <div className="tts-actions">
        <button type="button" className="studio-action" data-tone="primary" disabled={!canMake || (Boolean(made) && draft === undefined && !changed && !rearranged)} onClick={() => void make(settle())}><Sparkles size={16} aria-hidden="true" /> {makeLabel}</button>
        {made && draft === undefined && <button type="button" className="studio-action" disabled={!canMake} onClick={() => void make(rows.map((row) => ({ ...row, take: 0 })), randomSeed())}><RefreshCw size={16} aria-hidden="true" /> 모든 줄 새로</button>}
        {requestId && <button type="button" className="studio-action" data-tone="quiet" onClick={() => void stop()}><X size={16} aria-hidden="true" /> 생성 취소</button>}
      </div>
      {progress && <LocalTtsProgressPanel reading={progress} modelLabel={localTtsModels["drama-3"].label} />}
      <p className="tts-status" role="status" data-hidden={Boolean(progress)}>{busy || problem || message || (editing !== undefined ? "줄을 저장하거나 취소하면 만들 수 있습니다." : "")}</p>
    </div>
  </section>;
}
