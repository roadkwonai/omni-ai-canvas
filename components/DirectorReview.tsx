"use client";

import { useState } from "react";
import { reviewEditState } from "../lib/director-review-apply";
import type { Graph, Run, RunResult } from "../lib/types";

type Note = NonNullable<RunResult["review"]>["notes"][number];

type Props = {
  graph: Graph;
  run: Run;
  onApply: (notes: Note[]) => void;
};

export default function DirectorReview({ graph, run, onApply }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const review = run.result?.review;
  if (!review) return null;
  const ready = review.notes.filter(
    (note) =>
      selected.includes(note.nodeId) &&
      reviewEditState(graph, run, note) === "ready",
  );

  return (
    <div className="review-preview">
      <strong>대본·연출 검토</strong>
      <p>{review.summary}</p>
      {review.notes.map((note) => {
        const state = reviewEditState(graph, run, note);
        const original = run.input.references.find(
          (reference) => reference.nodeId === note.nodeId,
        );
        const label = original?.title || "제목 없는 노드";
        return (
          <article className="review-note" key={note.nodeId}>
            <div className="review-note-heading">
              <label>
                <input
                  type="checkbox"
                  title="이 수정안을 선택해 다른 제안과 함께 적용합니다."
                  checked={state === "ready" && selected.includes(note.nodeId)}
                  disabled={state !== "ready"}
                  onChange={(event) =>
                    setSelected((ids) =>
                      event.target.checked
                        ? [...ids, note.nodeId]
                        : ids.filter((id) => id !== note.nodeId),
                    )
                  }
                />
                <strong>{label}</strong>
              </label>
              <span>
                {state === "applied"
                  ? "적용됨"
                  : state === "conflict"
                    ? "변경 또는 삭제됨"
                    : "검토 가능"}
              </span>
            </div>
            <p>{note.reason}</p>
            <details>
              <summary title="실행 당시의 본문과 제안된 새 본문을 비교합니다.">
                기존 내용과 수정안 비교
              </summary>
              <div className="review-text">
                <strong>기존 내용</strong>
                <p>{original?.body || "내용 없음"}</p>
                <strong>수정안</strong>
                <p>{note.body || "내용 없음"}</p>
              </div>
            </details>
            <button
              className="outline-button"
              title="현재 노드가 변경되지 않았을 때 이 수정안만 적용합니다."
              disabled={state !== "ready"}
              onClick={() => onApply([note])}
            >
              이 제안 적용
            </button>
          </article>
        );
      })}
      <button
        className="run-button"
        title="선택한 제안 중 현재 내용이 일치하는 노드에만 적용합니다."
        disabled={!ready.length}
        onClick={() => onApply(ready)}
      >
        선택한 제안 {ready.length}개 적용
      </button>
    </div>
  );
}
