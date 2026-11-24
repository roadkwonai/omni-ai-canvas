"use client";

import { RotateCcw, Undo2, WandSparkles } from "lucide-react";
import { directionLabels, type DirectedLine, type DirectionLine } from "@/lib/speech-direction";
import { requestJson } from "@/lib/local-tts-poll";
import type { LocalTtsModel } from "@/lib/tts-types";
import "./local-tts.css";

export type Directed = { /** AI가 넣기 전의 글. */ before: string; lines: DirectionLine[]; made: DirectedLine[]; reverted: number[] };

export async function askDirections(endpoint: string, model: LocalTtsModel, lines: DirectionLine[], context: string) {
  return (await requestJson<{ lines: DirectedLine[] }>(`${endpoint}/direct`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, lines, context: context.slice(0, 20_000) }),
  })).lines;
}

export function DirectionButton({ again, disabled, onClick }: { again: boolean; disabled: boolean; onClick: () => void }) {
  return <button type="button" className="studio-action local-tts-more" disabled={disabled} onClick={onClick}>
    <WandSparkles size={16} aria-hidden="true" /> {again ? "AI로 지시 다시 고르기" : "AI로 연기 지시 넣기"}
  </button>;
}

export default function DirectionReview({ model, directed, overall, disabled, onRevert, onRevertAll }: {
  model: LocalTtsModel; directed: Directed; /** 글 전체에 고른 말투. */ overall?: string; disabled: boolean; onRevert: (index: number) => void; onRevertAll: () => void;
}) {
  const changed = directed.made.flatMap((line, index) => line.changed ? [{ ...line, index }] : []);
  if (!changed.length && !overall) return <p role="status">AI가 대본을 읽었지만 더 넣을 지시를 찾지 못했습니다.</p>;
  const left = changed.filter(({ index }) => !directed.reverted.includes(index)).length;
  return <section className="direction-review" aria-label="AI가 넣은 연기 지시">
    <div className="tts-catalog-summary">
      <p role="status"><strong>{changed.length > 0 && `AI가 ${directed.made.length}줄 중 ${left}줄에 지시를 넣었습니다. `}{overall && `AI가 고른 전체 말투: ${overall}. `}</strong>대사는 바꾸지 않았습니다.</p>
      <button type="button" className="studio-action" data-tone="quiet" disabled={disabled} onClick={onRevertAll}><RotateCcw size={16} aria-hidden="true" /> 모두 되돌리기</button>
    </div>
    {changed.length > 0 && <ol>
      {changed.map(({ index, text, reason }) => {
        const reverted = directed.reverted.includes(index);
        return <li key={index} data-reverted={reverted}>
          <div>
            <p>{directed.lines[index].text}</p>
            <p className="direction-labels">{directionLabels(text, model).map((label, at) => <small key={at}>{label}</small>)}{reason && <span>{reason}</span>}</p>
          </div>
          <button type="button" className="studio-action" data-tone="quiet" disabled={disabled} aria-pressed={reverted} onClick={() => onRevert(index)}>
            <Undo2 size={16} aria-hidden="true" /> {reverted ? "다시 넣기" : "되돌리기"}
          </button>
        </li>;
      })}
    </ol>}
  </section>;
}
