"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import type { PromptLanguage, PromptVersions } from "@/lib/node-prompt";
import NodeMarkdown from "./NodeMarkdown";

type Draft = { language: PromptLanguage; text: string; baseline: PromptVersions };
export type ApplyPrompt = (next: PromptVersions, baseline: PromptVersions) => Promise<void>;

export default function NodePromptPair({ body, promptKorean, initiallyEditing, onApply }: PromptVersions & {
  initiallyEditing?: boolean;
  onApply: ApplyPrompt;
}) {
  const legacyKorean = !promptKorean && (body.match(/[가-힣]/g)?.length ?? 0) > (body.match(/[A-Za-z]/g)?.length ?? 0);
  const versions = { en: legacyKorean ? "" : body, ko: promptKorean?.text ?? (legacyKorean ? body : "") };
  const original: PromptVersions = { body, promptKorean };
  const initialLanguage = legacyKorean ? "ko" : "en";
  const [draft, setDraft] = useState<Draft | null>(() =>
    initiallyEditing ? { language: initialLanguage, text: versions[initialLanguage], baseline: original } : null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const counterpart = useRef<{ language: PromptLanguage; text: string; translation: string } | null>(null);
  const editingLanguage = draft?.language;

  useEffect(() => {
    if (editingLanguage) input.current?.focus();
  }, [editingLanguage]);

  async function apply(event: React.FormEvent) {
    event.preventDefault();
    if (!draft?.text.trim() || applying) return;
    setApplying(true);
    setError("");
    try {
      const { language, text, baseline } = draft;
      let translation = counterpart.current?.language === language && counterpart.current.text === text
        ? counterpart.current.translation : undefined;
      if (!translation) {
        const response = await fetch("/api/node-preview/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, target: language === "en" ? "ko" : "en" }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || typeof result.translation !== "string" || !result.translation.trim()) {
          throw new Error(typeof result.error === "string" ? result.error : "다른 언어 버전을 만들지 못했습니다.");
        }
        translation = result.translation;
        counterpart.current = { language, text, translation: result.translation };
      }
      if (!translation) throw new Error("다른 언어 버전이 비어 있습니다.");
      await onApply({
        body: language === "en" ? text : translation,
        promptKorean: { text: language === "ko" ? text : translation },
      }, baseline);
      setDraft(null);
      counterpart.current = null;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "프롬프트를 적용하지 못했습니다.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      {([
        ["en", "영문 프롬프트"],
        ["ko", "한국어 프롬프트"],
      ] as const).map(([language, label]) => (
        <section className="node-preview-prompt" key={language} aria-label={label}>
          <div className="node-preview-prompt-heading">
            <h3>{label}</h3>
            {draft?.language !== language && <button type="button" className="studio-action"
              aria-label={`${label} 편집`} disabled={!!draft}
              onClick={() => setDraft({ language, text: versions[language], baseline: original })}>
              <Pencil size={15} aria-hidden="true" /> 편집
            </button>}
          </div>
          {draft?.language === language ? <form className="node-preview-prompt-form" onSubmit={(event) => void apply(event)}>
            <textarea ref={input} aria-label={label} rows={6} maxLength={24000} value={draft.text} disabled={applying}
              onChange={(event) => setDraft({ ...draft, text: event.target.value })} />
            {error && <p role="alert">{error}</p>}
            <div className="node-preview-prompt-actions">
              <button type="button" className="studio-action" disabled={applying} onClick={() => {
                setDraft(null);
                setError("");
                counterpart.current = null;
              }}>취소</button>
              <button type="submit" className="studio-action" data-tone="primary" disabled={applying || !draft.text.trim()}>
                {applying ? "두 버전 적용 중" : "두 버전에 적용"}
              </button>
            </div>
          </form> : versions[language].trim() ?
            <div lang={language}><NodeMarkdown text={versions[language]} /></div> :
            <p className="node-preview-empty">저장된 {label}가 없습니다.</p>}
        </section>
      ))}
    </>
  );
}
