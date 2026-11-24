"use client";

import { useId, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverClose, PopoverContent, PopoverTitle, PopoverTrigger } from "@ui-sdk/react/popover";
import "./tts-multi-filter.css";

type Props<T extends string> = {
  label: string;
  options: { label: string; values: T[] }[];
  selected: T[];
  disabled?: boolean;
  onChange: (picked: T[]) => void;
};

export default function TtsMultiFilter<T extends string>({ label, options, selected, disabled, onChange }: Props<T>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<T[]>([]);
  const [query, setQuery] = useState("");
  const picked = options.filter((option) => option.values.some((value) => selected.includes(value)));
  const display = picked.length === 0 ? "전체" : picked.length === 1 ? picked[0].label : `${picked.length}개 선택`;
  const visible = options.filter(({ label }) => label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  return (
    <div className="tts-multi-filter">
      <span id={id}>{label}</span>
      <Popover open={open} onOpenChange={(next) => {
        if (next && disabled) return;
        if (next) {
          setDraft(selected);
          setQuery("");
        }
        setOpen(next);
      }}>
        <PopoverTrigger className="tts-multi-filter-trigger" aria-disabled={disabled || undefined}
          aria-labelledby={`${id} ${id}-value`}>
          <span id={`${id}-value`}>{display}</span><ChevronDown size={16} aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent className="tts-multi-filter-popup" side="bottom" align="start">
          <PopoverTitle>{label}</PopoverTitle>
          {options.length > 12 && <input type="search" aria-label={`${label} 검색`} placeholder={`${label} 검색`}
            value={query} onChange={(event) => setQuery(event.target.value)} />}
          <div className="tts-multi-filter-options" role="group" aria-label={`${label} 선택값`}>
            <button type="button" className="tts-filter-chip" aria-pressed={draft.length === 0}
              onClick={() => setDraft([])}>전체</button>
            {visible.map((option) => {
              const pressed = option.values.some((value) => draft.includes(value));
              return <button type="button" className="tts-filter-chip" key={option.label} aria-pressed={pressed}
                onClick={() => setDraft((current) => pressed
                  ? current.filter((value) => !option.values.includes(value))
                  : [...new Set([...current, ...option.values])])}>
                {pressed && <Check size={14} aria-hidden="true" />}{option.label}
              </button>;
            })}
          </div>
          {!visible.length && <small>검색 결과가 없습니다.</small>}
          <div className="tts-multi-filter-footer">
            <PopoverClose className="studio-action" data-tone="quiet">취소</PopoverClose>
            <button type="button" className="studio-action" data-tone="primary" onClick={() => {
              setOpen(false);
              onChange(draft);
            }}>적용</button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
