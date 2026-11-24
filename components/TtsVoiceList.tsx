"use client";

import { memo, useEffect, useId, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import { fishTagLabel } from "@/lib/fish-tag-labels";
import { localDefaultVoiceId, type TtsProvider, type TtsVoice } from "@/lib/tts-types";

export type Translation = { id: string; nameKo: string; descriptionKo?: string };

export const voiceKey = (provider: TtsProvider, voice: TtsVoice) => JSON.stringify([provider, voice.id, voice.name, voice.description]);
export const requiresTranslation = ({ name, description }: TtsVoice) => [name, description].some((part) => {
  const letters = part?.match(/\p{L}/gu);
  if (!letters?.length) return false;
  return letters.filter((letter) => !/\p{Script=Hangul}/u.test(letter)).length > letters.length / 2;
});
export function localizedVoice(voice: TtsVoice, item?: Translation) {
  return { nameKo: item?.nameKo ?? voice.nameKo, descriptionKo: item?.descriptionKo ?? voice.descriptionKo };
}

type RowProps = {
  voice: TtsVoice;
  translation?: Translation;
  translating: boolean;
  tagLabels: Record<string, string>;
  group: string;
  selected: boolean;
  disabled: boolean;
  onSelect: (voice: TtsVoice) => void;
};

const VoiceRow = memo(function VoiceRow({ voice, translation, translating, tagLabels, group, selected, disabled, onSelect }: RowProps) {
  const translated = localizedVoice(voice, translation);
  const name = translated.nameKo ?? voice.name;
  const description = translated.descriptionKo ?? (translating && voice.description && requiresTranslation(voice)
    ? "설명을 한국어로 번역 중입니다." : voice.description);
  const visibleTags = (voice.tags ?? []).filter((tag) => !["male", "female"].includes(tag.toLowerCase())).slice(0, 4);
  return <li>
    <label className="tts-voice-option" data-selected={selected}>
      <input type="radio" name={group} checked={selected} disabled={disabled} onChange={() => onSelect(voice)} />
      <span>
        <strong>{name}</strong>
        {description && <small className="tts-voice-description">{description}</small>}
        {"reason" in voice && typeof voice.reason === "string" && <small className="tts-voice-reason">{voice.reason}</small>}
        {(voice.gender || visibleTags.length > 0) && <span className="tts-voice-tags">
          {voice.gender && <small>{fishTagLabel(voice.gender, tagLabels)}</small>}
          {visibleTags.map((tag) => <small key={tag}>{fishTagLabel(tag, tagLabels)}</small>)}
        </span>}
      </span>
    </label>
    {selected && voice.id !== localDefaultVoiceId && <div className="tts-voice-preview">
      {translated.nameKo && <details className="tts-original">
        <summary>원문 이름과 설명</summary>
        <p>{voice.name}</p>{voice.description && <p>{voice.description}</p>}
      </details>}
      {voice.previewUrl ? <audio controls preload="none" src={voice.previewUrl} aria-label={`${name} 목소리 미리 듣기`} />
        : <p>제공 샘플이 없습니다. <strong>짧게 합성</strong>으로 이 목소리를 들어 보세요.</p>}
    </div>}
  </li>;
});

type Props = {
  provider: TtsProvider;
  voices: TtsVoice[];
  translations: Record<string, Translation>;
  translating: boolean;
  tagLabels: Record<string, string>;
  selectedId?: string;
  disabled: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  moreError: string;
  onSelect: (voice: TtsVoice) => void;
  onMore: () => void;
};

export default memo(function TtsVoiceList({ provider, voices, translations, translating, tagLabels, selectedId, disabled, hasMore, loadingMore, moreError, onSelect, onMore }: Props) {
  const group = useId();
  const list = useRef<HTMLUListElement>(null);
  const sentinel = useRef<HTMLLIElement>(null);
  const waiting = hasMore && !loadingMore && !moreError && !disabled;

  // 새 페이지를 붙인 뒤에도 끝이 화면 안에 남아 있을 수 있어 목록 길이가 바뀔 때 다시 관찰한다.
  useEffect(() => {
    if (!waiting || !sentinel.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onMore();
    }, { root: list.current, rootMargin: "0px 0px 800px 0px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [onMore, voices.length, waiting]);

  return <ul ref={list} className="tts-voices" aria-label="목소리 목록">
    {voices.map((voice) => <VoiceRow key={voice.id} voice={voice}
      translation={translations[voiceKey(provider, voice)]} translating={translating} tagLabels={tagLabels}
      group={group} selected={selectedId === voice.id} disabled={disabled} onSelect={onSelect} />)}
    {hasMore && <li ref={sentinel} className="tts-voices-more">
      {moreError ? <>
        <p role="alert">{moreError}</p>
        <button type="button" className="studio-action" data-tone="quiet" disabled={disabled} onClick={onMore}>다시 불러오기</button>
      </> : <p role="status">{loadingMore && <><LoaderCircle size={16} className="spin" aria-hidden="true" /> 목소리를 더 불러오는 중</>}</p>}
    </li>}
  </ul>;
});
