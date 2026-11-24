"use client";

import { useId, type ReactNode } from "react";
import { Check, ChevronDown, RotateCcw, UserRound } from "lucide-react";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@ui-sdk/react/collapsible";
import { Toggle, ToggleGroup } from "@ui-sdk/react/toggle";
import { designAges, designEnergies, designFromCharacter, designGenders, designPitches, designTones, maxTones, optionRanges, samplingDefaults, secondsRange, speechStyles, speechTags, supportsDesign, type LocalTtsOptions, type VoiceDesign } from "@/lib/local-tts-options";
import type { LocalTtsModel } from "@/lib/tts-types";
import "./local-tts.css";

type Entry = string | { label: string };
const labelOf = (entry: Entry) => typeof entry === "string" ? entry : entry.label;

function Chips<T extends string>({ label, hint, entries, value, multiple, disabled, onChange }: {
  label: string; hint?: string; entries: Record<T, Entry>; value: T[]; multiple?: boolean; disabled: boolean; onChange: (value: T[]) => void;
}) {
  const id = useId();
  return <div className="local-tts-field">
    <span id={id}>{label}{hint && <small>{hint}</small>}</span>
    <ToggleGroup className="local-tts-chips" aria-labelledby={id} value={value} multiple={multiple} disabled={disabled}
      onValueChange={(next) => onChange(next as T[])}>
      {(Object.keys(entries) as T[]).map((key) => <Toggle key={key} className="tts-filter-chip" value={key}>
        {value.includes(key) && <Check size={14} aria-hidden="true" />}{labelOf(entries[key])}
      </Toggle>)}
    </ToggleGroup>
  </div>;
}

export function Range({ label, hint, value, fallback, suffix = "", range, disabled, onChange }: {
  label: string; hint?: string; value: number | undefined; fallback: number; suffix?: string;
  range: { min: number; max: number; step: number }; disabled: boolean; onChange: (value: number | undefined) => void;
}) {
  const shown = value ?? fallback;
  // 이름표 안의 output도 이름표를 받는 요소라서 입력을 직접 가리킨다.
  const id = useId();
  return <label className="local-tts-range" htmlFor={id}>
    <span>{label}<output>{shown}{suffix}</output></span>
    <input id={id} type="range" min={range.min} max={range.max} step={range.step} value={shown} disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value) === fallback ? undefined : Number(event.target.value))} />
    {hint && <small>{hint}</small>}
  </label>;
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return <section className="local-tts-section"><h3>{title}</h3>{children}</section>;
}

/** 커서 자리에 지시를 넣고 고른 말을 감싼다. */
export function insertTag(area: HTMLTextAreaElement | null, text: string, onChange: (text: string) => void, before: string, after = "") {
  const start = area?.selectionStart ?? text.length;
  const end = area?.selectionEnd ?? text.length;
  onChange(text.slice(0, start) + before + text.slice(start, end) + after + text.slice(end));
  requestAnimationFrame(() => {
    area?.focus();
    area?.setSelectionRange(start + before.length, end + before.length);
  });
}

const commonTags = 8;

export function SpeechTagBar({ model, disabled, onInsert }: { model: LocalTtsModel; disabled: boolean; onInsert: (before: string, after?: string) => void }) {
  const { points, weak, spans } = speechTags[model];
  const id = useId();
  const chips = (entries: [string, string][]) => entries.map(([tag, label]) => <button key={tag} type="button" className="tts-filter-chip" disabled={disabled}
    onClick={() => onInsert(`[${tag}] `)}>{label}</button>);
  const main = Object.entries(points).slice(0, commonTags);
  const more = [...Object.entries(points).slice(commonTags), ...Object.entries(weak)];
  return <>
    <div className="local-tts-field">
      <span id={id}>대사에 넣을 소리와 쉼<small>커서 자리에 넣습니다. [ ] 안에 원하는 지시를 직접 써도 됩니다.</small></span>
      <div className="local-tts-chips" role="group" aria-labelledby={id}>{chips(main)}</div>
      <Collapsible className="local-tts-field">
        <CollapsibleTrigger className="studio-action local-tts-more" data-tone="quiet">지시 {more.length}개 더 보기 <ChevronDown size={16} aria-hidden="true" /></CollapsibleTrigger>
        <CollapsiblePanel className="local-tts-field">
          {Object.keys(weak).length > 0 && <p>모델의 공식 지시이지만 한국어 시험에서는 효과가 뚜렷하지 않았습니다.</p>}
          <div className="local-tts-chips" role="group" aria-label="더 많은 지시">{chips(more)}</div>
        </CollapsiblePanel>
      </Collapsible>
    </div>
    {Object.keys(spans).length > 0 && <div className="local-tts-field">
      <span id={`${id}-span`}>말을 감싸는 지시<small>대사에서 고른 말에만 적용합니다.</small></span>
      <div className="local-tts-chips" role="group" aria-labelledby={`${id}-span`}>
        {Object.entries(spans).map(([tag, label]) => <button key={tag} type="button" className="tts-filter-chip" data-span disabled={disabled}
          onClick={() => onInsert(`<${tag}>`, `</${tag}>`)}>{label}</button>)}
      </div>
    </div>}
  </>;
}

type Update = (change: (options: LocalTtsOptions) => LocalTtsOptions) => void;

export function VoiceDesignControls({ model, options, disabled, characterText, canUseDesignModel, onUpdate, onUseDesignModel }: {
  model: LocalTtsModel; options: LocalTtsOptions; disabled: boolean; characterText?: string; canUseDesignModel?: boolean;
  onUpdate: Update; onUseDesignModel?: () => void;
}) {
  if (!supportsDesign(model)) return <div className="local-tts-notice">
    <p>S2 Pro는 글로 성별과 나이를 정할 수 없습니다. 목소리를 설계하려면 Drama 3를 쓰고, 마음에 든 음성을 캐릭터에 저장하면 S2 Pro에서도 참조로 쓸 수 있습니다.</p>
    {canUseDesignModel && <button type="button" className="studio-action" disabled={disabled} onClick={onUseDesignModel}>Drama 3로 목소리 설계하기</button>}
  </div>;
  const design = options.design ?? {};
  const setDesign = (next: Partial<VoiceDesign>) => onUpdate((current) => ({ ...current, design: { ...current.design, ...next } }));
  const fromCharacter = characterText ? designFromCharacter(characterText) : {};
  return <Section title="목소리 설계">
    {Object.keys(fromCharacter).length > 0 && <button type="button" className="studio-action" disabled={disabled} onClick={() => setDesign(fromCharacter)}>
      <UserRound size={16} aria-hidden="true" /> 캐릭터 시트의 성별·나이 가져오기
    </button>}
    <Chips label="성별" entries={designGenders} value={design.gender ? [design.gender] : []} disabled={disabled} onChange={([gender]) => setDesign({ gender })} />
    <Chips label="나이대" entries={designAges} value={design.age ? [design.age] : []} disabled={disabled} onChange={([age]) => setDesign({ age })} />
    <Chips label="음색" hint={`최대 ${maxTones}개`} entries={designTones} value={design.tones ?? []} multiple disabled={disabled}
      onChange={(tones) => setDesign({ tones: tones.length > maxTones ? design.tones : tones })} />
    <Chips label="분위기" entries={designEnergies} value={design.energy ? [design.energy] : []} disabled={disabled} onChange={([energy]) => setDesign({ energy })} />
    <Chips label="음높이" hint="남성 목소리에서 더 잘 반영됩니다." entries={designPitches} value={design.pitch ? [design.pitch] : []} disabled={disabled} onChange={([pitch]) => setDesign({ pitch })} />
    <label>더 자세한 목소리 설명<input value={design.note ?? ""} maxLength={200} disabled={disabled} placeholder="예: 새벽 라디오 진행자처럼 마이크에 가까이"
      onChange={(event) => setDesign({ note: event.target.value })} /></label>
    <label>장면<input value={design.scene ?? ""} maxLength={200} disabled={disabled} placeholder="예: 비 오는 밤, 불 꺼진 사무실"
      onChange={(event) => setDesign({ scene: event.target.value })} /></label>
    <p>고르지 않은 항목은 모델이 정합니다.</p>
  </Section>;
}

export default function SpeechControls({ model, reference, characters, options, disabled, onUpdate }: {
  model: LocalTtsModel; reference: boolean; characters: number; options: LocalTtsOptions; disabled: boolean; onUpdate: Update;
}) {
  const set = (next: Partial<LocalTtsOptions>) => onUpdate((current) => ({ ...current, ...next }));
  const sampling = samplingDefaults[model];
  const seconds = secondsRange(characters);
  return <div className="local-tts-controls">
    {reference && <p>성별과 나이는 고른 참조 음성을 따릅니다.{model === "s2-pro" && " S2 Pro는 연기도 참조 음성을 거의 그대로 따르므로, 연기를 바꾸려면 Drama 3를 쓰세요."}</p>}
    <Section title="연기와 말투">
      <Chips label="감정과 말투" entries={speechStyles} value={options.style ? [options.style] : []} disabled={disabled}
        onChange={([style]) => set({ style, styleNote: undefined })} />
      <label>직접 쓰기<input value={options.styleNote ?? ""} maxLength={120} disabled={disabled} placeholder="예: 울음을 참으며 또박또박"
        onChange={(event) => set({ styleNote: event.target.value, style: undefined })} /></label>
    </Section>
    <Collapsible className="local-tts-section">
      <CollapsibleTrigger className="studio-action local-tts-more" data-tone="quiet">속도·음정·고급 설정 <ChevronDown size={16} aria-hidden="true" /></CollapsibleTrigger>
      <CollapsiblePanel className="local-tts-advanced">
        {model === "drama-3" && <label>목표 길이(초)<input type="number" inputMode="decimal" min={seconds.min} max={seconds.max} step={seconds.step} value={options.seconds ?? ""} disabled={disabled}
          aria-invalid={options.seconds !== undefined && !(options.seconds >= seconds.min && options.seconds <= seconds.max)} placeholder="비우면 자연스러운 길이"
          onChange={(event) => set({ seconds: event.target.value === "" ? undefined : Number(event.target.value) })} />
          <small>이 대사는 {seconds.min}~{seconds.max}초로 늘여 말하게 할 수 있습니다. 더 짧게 하려면 말하는 속도를 올리세요. 짧은 합성에는 쓰지 않습니다.</small></label>}
        <Range label="말하는 속도" suffix="배" value={options.speed} fallback={1} range={optionRanges.speed} disabled={disabled} onChange={(speed) => set({ speed })} />
        <Range label="음정 보정" suffix="반음" hint="만든 뒤에 높낮이를 옮깁니다. 크게 옮기면 소리가 부자연스러울 수 있습니다." value={options.semitones} fallback={0}
          range={optionRanges.semitones} disabled={disabled} onChange={(semitones) => set({ semitones })} />
        <label className="tts-rights"><input type="checkbox" checked={Boolean(options.normalize)} disabled={disabled}
          onChange={(event) => set({ normalize: event.target.checked || undefined })} /><span>음량 고르게 맞추기</span></label>
        <Range label="표현 변화(temperature)" hint="낮추면 안정적이고 높이면 테이크마다 크게 달라집니다. 너무 낮으면 중간이 끊길 수 있습니다." value={options.temperature} fallback={sampling.temperature}
          range={optionRanges.temperature} disabled={disabled} onChange={(temperature) => set({ temperature })} />
        <Range label="후보 범위(top-p)" value={options.topP} fallback={sampling.topP} range={optionRanges.topP} disabled={disabled} onChange={(topP) => set({ topP })} />
        <label>후보 개수(top-k)<input type="number" inputMode="numeric" min={optionRanges.topK.min} max={optionRanges.topK.max} value={options.topK ?? ""} disabled={disabled}
          placeholder={sampling.topK ? `기본 ${sampling.topK}` : "기본 제한 없음"}
          onChange={(event) => set({ topK: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>
        <label>시드<input type="number" inputMode="numeric" min={optionRanges.seed.min} max={optionRanges.seed.max} value={options.seed ?? ""} disabled={disabled}
          placeholder="비우면 만들 때마다 새로 정함" onChange={(event) => set({ seed: event.target.value === "" ? undefined : Number(event.target.value) })} />
          <small>같은 설정과 같은 시드로 만들면 같은 음성이 나옵니다.</small></label>
      </CollapsiblePanel>
    </Collapsible>
    <button type="button" className="studio-action local-tts-more" data-tone="quiet" disabled={disabled} onClick={() => onUpdate(() => ({}))}>
      <RotateCcw size={16} aria-hidden="true" /> 옵션 모두 초기화
    </button>
  </div>;
}
