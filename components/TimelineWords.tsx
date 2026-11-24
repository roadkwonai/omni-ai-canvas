"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Mic, Plus, Trash2 } from "lucide-react";
import { serializeTimelineWords } from "../lib/timeline-captions";
import { transcriptSignature } from "../lib/timeline-edit";
import {
  TIMELINE_MAX_WORDS,
  type TimelineAudio,
  type TimelineWord,
} from "../lib/timeline-spec";
import type { Project } from "../lib/types";

type Props = {
  project: Project;
  audio: TimelineAudio[];
  words: TimelineWord[];
  frames: number;
  disabled: boolean;
  target: { index: number } | null;
  onChange: (words: TimelineWord[]) => void;
  save: () => Promise<Project | null>;
};
const pageSize = 25;

export default function TimelineWords({
  project,
  audio,
  words,
  frames,
  disabled,
  target,
  onChange,
  save,
}: Props) {
  const [trackIndex, setTrackIndex] = useState("");
  const [page, setPage] = useState(0);
  const [shownTarget, setShownTarget] = useState(target);
  if (target !== shownTarget) {
    setShownTarget(target);
    if (target) setPage(Math.floor(target.index / pageSize));
  }
  const list = useRef<HTMLElement>(null);
  useEffect(() => {
    if (target) list.current?.querySelector<HTMLElement>(`[data-word="${target.index}"]`)?.focus();
  }, [target]);
  const [pending, setPending] = useState<{ words: TimelineWord[]; signature: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const visiblePage = Math.min(
    page,
    Math.max(0, Math.ceil(words.length / pageSize) - 1),
  );
  const first = visiblePage * pageSize;
  const chosen = trackIndex ? audio[Number(trackIndex)] : undefined;
  const signature = transcriptSignature({ projectId: project.id, track: chosen,
    assetUrl: project.graph.nodes.find((node) => node.id === chosen?.nodeId)?.asset?.url, words, frames });
  const latest = useRef(signature);
  const active = useRef(true);
  useEffect(() => { latest.current = signature; }, [signature]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  async function transcribe() {
    if (!chosen || busy) return;
    const submittedSignature = signature;
    setBusy(true);
    setMessage("");
    setPending(null);
    try {
      const saved = await save();
      if (saved?.id !== project.id)
        throw new Error("현재 프로젝트를 저장한 뒤 다시 시도해 주세요.");
      const response = await fetch(
        `/api/projects/${project.id}/timeline/words`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...chosen, version: saved.version }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "단어 시각을 읽지 못했습니다.");
      if (active.current && latest.current === submittedSignature)
        setPending({ words: data.words as TimelineWord[], signature: submittedSignature });
      else if (active.current) setMessage("음향이나 자막이 바뀌어 받아쓴 내용을 적용하지 않았습니다.");
    } catch (error) {
      if (active.current) setMessage(
        error instanceof Error ? error.message : "받아쓰지 못했습니다.",
      );
    } finally {
      if (active.current) setBusy(false);
    }
  }
  function replace(index: number, changes: Partial<TimelineWord>) {
    onChange(
      words.map((word, position) =>
        position === index ? { ...word, ...changes } : word,
      ),
    );
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([serializeTimelineWords(words, "srt")], {
        type: "text/plain;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "Omni AI Canvas-단어-자막.srt";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  const canExport =
    words.length > 0 &&
    words.every(
      (word, index) =>
        word.text.trim() &&
        word.startFrame >= (words[index - 1]?.endFrame ?? 0) &&
        word.endFrame > word.startFrame &&
        word.endFrame <= frames,
    );
  const lastEnd = words.at(-1)?.endFrame ?? 0;
  return (
    <section ref={list} className="timeline-words" aria-label="단어 자막">
      <h3>단어 자막 <small>{words.length}개</small></h3>
      <p>
        음향에서 단어가 나오는 시각을 추정하거나 직접 입력하세요. MP4에는 켜고 끌 수 있는 자막으로 저장됩니다.
      </p>
      <div className="timeline-row timeline-transcribe">
        <label>
          전사할 음향
          <select
            value={trackIndex}
            onChange={(event) => {
              setTrackIndex(event.target.value);
              setPending(null);
            }}
            disabled={busy || disabled}
          >
            <option value="">음향 레이어 선택</option>
            {audio.map((track, index) => {
              const node = project.graph.nodes.find(
                (item) => item.id === track.nodeId,
              );
              return (
                <option
                  key={index}
                  value={String(index)}
                  disabled={node?.asset?.type !== "audio"}
                >
                  {node?.title ?? "음향"} · {(track.startFrame / 30).toFixed(2)}
                  초
                </option>
              );
            })}
          </select>
        </label>
        <button
          type="button"
          className="studio-action"
          disabled={busy || disabled || !chosen}
          onClick={() => void transcribe()}
        >
          <Mic size={16} aria-hidden="true" /> 로컬 음성 전사
        </button>
      </div>
      {busy && <p role="status">이 컴퓨터에서 음성을 받아쓰고 있습니다.</p>}
      {message && <p role="alert">{message}</p>}
      {pending && pending.signature === signature && (
        <div className="timeline-caption-tools">
          <p>
            전사 제안 {pending.words.length}개
            {pending.words.length
              ? ` · ${pending.words
                  .slice(0, 6)
                  .map((word) => word.text)
                  .join(" ")}`
              : ""}
          </p>
          <button
            type="button"
            className="studio-action"
            disabled={
              disabled ||
              !pending.words.length ||
              pending.words.some((word) => word.endFrame > frames)
            }
            onClick={() => {
              if (pending.signature !== latest.current) return;
              onChange(pending.words);
              setPage(0);
              setPending(null);
            }}
          >
            {words.length ? "받아쓴 내용으로 자막 바꾸기" : "전사 적용"}
          </button>
          <button type="button" className="studio-action" data-tone="quiet" onClick={() => setPending(null)}>
            제안 닫기
          </button>
        </div>
      )}
      {words.slice(first, first + pageSize).map((word, offset) => {
        const index = first + offset;
        return (
          <div className="timeline-row" key={index}>
            <label>
              단어 {index + 1}
              <input
                data-word={index}
                value={word.text}
                maxLength={150}
                disabled={disabled}
                onChange={(event) =>
                  replace(index, { text: event.target.value })
                }
              />
            </label>
            <label>
              시작(초)
              <input
                type="number"
                min="0"
                step="any"
                max={frames / 30}
                value={Number((word.startFrame / 30).toFixed(3))}
                disabled={disabled}
                onChange={(event) =>
                  replace(index, {
                    startFrame: Math.round(Number(event.target.value) * 30),
                  })
                }
              />
            </label>
            <label>
              끝(초)
              <input
                type="number"
                min="0"
                step="any"
                max={frames / 30}
                value={Number((word.endFrame / 30).toFixed(3))}
                disabled={disabled}
                onChange={(event) =>
                  replace(index, {
                    endFrame: Math.round(Number(event.target.value) * 30),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="studio-action"
              data-tone="quiet"
              data-size="icon"
              disabled={disabled}
              aria-label={`단어 ${index + 1} 삭제`}
              onClick={() => onChange(words.filter((_, i) => i !== index))}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        );
      })}
      {words.length > pageSize && (
        <nav className="timeline-caption-tools" aria-label="자막 페이지">
          <button
            type="button"
            className="studio-action"
            disabled={visiblePage === 0}
            onClick={() => setPage(visiblePage - 1)}
          >
            이전
          </button>
          <span>
            {first + 1}–{Math.min(words.length, first + pageSize)} /{" "}
            {words.length}
          </span>
          <button
            type="button"
            className="studio-action"
            disabled={first + pageSize >= words.length}
            onClick={() => setPage(visiblePage + 1)}
          >
            다음
          </button>
        </nav>
      )}
      <div className="timeline-caption-tools">
        <button
          type="button"
          className="studio-action"
          disabled={
            disabled || lastEnd >= frames || words.length >= TIMELINE_MAX_WORDS
          }
          onClick={() => {
            onChange([
              ...words,
              {
                text: "",
                startFrame: lastEnd,
                endFrame: Math.min(frames, lastEnd + 12),
              },
            ]);
            setPage(Math.floor(words.length / pageSize));
          }}
        >
          <Plus size={16} aria-hidden="true" /> 단어 추가
        </button>
        <button type="button" className="studio-action" disabled={!canExport} onClick={download}>
          <Download size={16} aria-hidden="true" /> SRT 내려받기
        </button>
      </div>
      {words.length > 0 && !canExport && (
        <p role="status">단어와 겹치지 않는 시작·끝 시각을 확인해 주세요.</p>
      )}
    </section>
  );
}
