"use client";

import { useState } from "react";
import Image from "next/image";
import type { AttachmentRecord } from "../lib/attachments-types";
import type { RunResult } from "../lib/types";

type Props = {
  record: AttachmentRecord;
  review?: RunResult["cutReview"];
  onSeek: (time: number) => void;
  playhead: () => number;
  onCorrect: (cuts: number[]) => Promise<void>;
  onRange: (first: number, last: number) => Promise<void>;
  busy: boolean;
};

export default function ReferenceCutReview({
  record,
  review,
  onSeek,
  playhead,
  onCorrect,
  onRange,
  busy,
}: Props) {
  const analysis = record.cutAnalysis;
  const timing = record.referenceTiming;
  const [page, setPage] = useState(
    Math.floor(((analysis?.range?.first ?? 1) - 1) / 12),
  );
  const [first, setFirst] = useState(analysis?.range?.first ?? 1);
  const [marks, setMarks] = useState(timing?.cutTimes ?? []);
  const [markAt, setMarkAt] = useState("");
  const [last, setLast] = useState(
    analysis?.range?.last ?? Math.min(12, analysis?.totalDetectedCuts ?? 1),
  );
  if (!analysis || !timing) return null;
  const time = Number(markAt);
  const validMark = markAt !== "" && Number.isFinite(time) && time > 0 && time < timing.durationSeconds;
  const nearest = marks.reduce<number | undefined>((best, current) =>
    best === undefined || Math.abs(current - time) < Math.abs(best - time) ? current : best, undefined);
  const changed = marks.length !== timing.cutTimes.length || marks.some((mark,i) => mark !== timing.cutTimes[i]);
  const byCut = new Map(review?.map((item) => [item.cut, item]));
  const sampleCounts = new Map<number, number>();
  for (const item of analysis.samples)
    sampleCounts.set(item.cut, (sampleCounts.get(item.cut) ?? 0) + 1);
  const boundaries = [0, ...timing.cutTimes, timing.durationSeconds];
  const total = boundaries.length - 1;
  const start = page * 12;
  const end = Math.min(start + 12, total);
  const invalidRange =
    !Number.isInteger(first) ||
    !Number.isInteger(last) ||
    first < 1 ||
    last > total ||
    last < first ||
    last - first >= 96;

  return (
    <section className="cut-review" aria-label="컷별 분석">
      <h4>컷별 분석</h4>
      {analysis.boundarySource === "manual" && <p>제작자가 보정한 경계를 사용합니다.</p>}
      <p>
        검출 후보 {total}컷 · 화면 표본 {analysis.coveredCuts}컷(
        {analysis.samples.length}장)
        {review && <> · 에이전트 해석 {byCut.size}컷</>}
      </p>
      <details><summary>편집점 직접 보정하기</summary>
        <p>원본을 보면서 놓친 전환을 추가하거나 잘못 잡힌 경계를 제거하세요. 보정본은 새 분석 자료로 저장됩니다.</p>
        <div className="cut-range">
          <label>원본 시각(초)<input type="number" min={0} max={timing.durationSeconds} step="0.01" value={markAt} onChange={(e) => setMarkAt(e.target.value)} /></label>
          <button type="button" onClick={() => setMarkAt(playhead().toFixed(3))}>재생 위치 가져오기</button>
          <button type="button" disabled={!validMark || marks.length >= 6000 || marks.includes(time)} onClick={() => setMarks([...marks, time].sort((a,b) => a-b))}>경계 추가</button>
          {validMark && nearest !== undefined && <button type="button" onClick={() => setMarks(marks.filter((item) => item !== nearest))}>{nearest.toFixed(2)}초 경계 삭제</button>}
        </div>
        <div className="cut-pagination"><span>보정 초안 {marks.length + 1}컷</span>
          <button type="button" disabled={!changed || busy} onClick={() => void onCorrect(marks)}>보정한 컷으로 표본 준비</button>
          <button type="button" disabled={!changed || busy} onClick={() => setMarks(timing.cutTimes)}>수정 취소</button>
        </div>
      </details>
      <ol className="cut-review-list" start={start + 1}>
        {boundaries.slice(start, end).map((time, index) => {
          const cut = start + index + 1;
          const observation = byCut.get(cut);
          const samples = sampleCounts.get(cut) ?? 0;
          return (
            <li key={cut}>
              <button
                type="button"
                onClick={() => onSeek(time)}
                title="이 컷의 시작으로 이동합니다."
              >
                컷 {cut} · {time.toFixed(2)}–{boundaries[cut].toFixed(2)}초
              </button>
              <small>
                {samples ? `표본 ${samples}장` : "이번 요청에 표본 없음"}
              </small>
              {observation && (
                <dl>
                  <dt>구도</dt>
                  <dd>{observation.composition}</dd>
                  <dt>자막</dt>
                  <dd>{observation.caption}</dd>
                  <dt>변화</dt>
                  <dd>{observation.change}</dd>
                </dl>
              )}
              {review && samples > 0 && !observation && (
                <p>이번 응답에 이 컷의 해석이 없습니다.</p>
              )}
            </li>
          );
        })}
      </ol>
      {total > 12 && (
        <div className="cut-pagination">
          <button
            type="button"
            disabled={start === 0}
            onClick={() => setPage(page - 1)}
          >
            이전 컷
          </button>
          <span>
            {start + 1}–{end} / {total}
          </span>
          <button
            type="button"
            disabled={end >= total}
            onClick={() => setPage(page + 1)}
          >
            다음 컷
          </button>
        </div>
      )}
      {!!record.analysisSheets?.length && (
        <details>
          <summary>
            에이전트용 분석 시트 {record.analysisSheets.length}장 보기
          </summary>
          <div className="cut-sheets">
            {record.analysisSheets.map((sheet, index) => (
              <a
                key={sheet.url}
                href={sheet.url}
                target="_blank"
                rel="noreferrer"
              >
                <Image
                  unoptimized
                  loading="lazy"
                  width={672}
                  height={480}
                  alt={`시트 ${index + 1} · 클릭해 원본 크기로 보기`}
                  src={sheet.url}
                />
              </a>
            ))}
          </div>
        </details>
      )}
      <details>
        <summary>컷 구간을 골라 자세히 분석하기</summary>
        <p>
          선택한 구간에 표본을 다시 배분합니다. 준비한 화면을 확인한 뒤
          에이전트에 분석을 요청하세요.
        </p>
        <div className="cut-range">
          <label>
            시작 컷
            <input
              type="number"
              min={1}
              max={total}
              value={first || ""}
              onChange={(e) => setFirst(Number(e.target.value))}
            />
          </label>
          <label>
            종료 컷
            <input
              type="number"
              min={first || 1}
              max={total}
              value={last || ""}
              onChange={(e) => setLast(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            disabled={busy || invalidRange}
            onClick={() => void onRange(first, last)}
          >
            구간 표본 준비
          </button>
        </div>
        {invalidRange && <p>원본 안에서 연속된 컷 1~96개를 선택해 주세요.</p>}
      </details>
    </section>
  );
}
