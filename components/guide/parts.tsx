"use client";

import { createContext, use, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import Image from "next/image";
import { ExternalLink, Maximize2 } from "lucide-react";
import { asset } from "@/lib/site";
import { chapters, figures, groups, screens, type ChapterId, type FigureId, type GroupLabel, type ScreenId } from "./contents";

export const searchWords = (query: string) => query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);

export const GuideContext = createContext<{
  query: string;
  /** 검색에 걸린 장. 검색하지 않으면 null */
  matches: ReadonlySet<string> | null;
  go: (event: MouseEvent, id: ChapterId) => void;
}>({ query: "", matches: null, go: () => {} });

export function Group({ label, children }: { label: GroupLabel; children: ReactNode }) {
  const { matches } = use(GuideContext);
  const ids: readonly string[] = groups.find((group) => group.label === label)!.chapters.map(([id]) => id);
  return (
    <div className="guide-group" hidden={matches !== null && !ids.some((id) => matches.has(id))}>
      <p className="guide-group-label">{label}</p>
      {children}
    </div>
  );
}

export function Section({ id, children }: { id: ChapterId; children: ReactNode }) {
  const { matches } = use(GuideContext);
  return <section id={id} tabIndex={-1} hidden={matches !== null && !matches.has(id)}>{children}</section>;
}

/** 여는 방법. title은 메뉴 이름과 다른 창 제목 */
export function Path({ steps, title }: { steps: string[]; title?: string }) {
  return (
    <p className="guide-path">
      <span>여는 곳</span> <strong>{steps.join(" › ")}</strong>{title && <> · 창 제목은 <strong>{title}</strong></>}
    </p>
  );
}

export function Figure({ file, alt }: { file: FigureId; alt: string }) {
  const [zoom, setZoom] = useState(false);
  const url = asset(`/guide/${file}.svg`);
  const { wide: [width, height], narrow } = figures[file];
  return (
    <figure className="guide-figure" style={{ maxWidth: width }}>
      <div className="guide-viewport" tabIndex={zoom ? 0 : undefined} aria-label={zoom ? "확대한 도식, 스크롤해 이동" : undefined}>
        <picture>
          {!zoom && <source media="(max-width: 640px)" srcSet={asset(`/guide/${file}-narrow.svg`)} width={narrow[0]} height={narrow[1]} />}
          <Image src={url} alt={alt} width={width} height={height} unoptimized style={zoom ? { minWidth: width } : undefined} />
        </picture>
      </div>
      <figcaption>
        <span>{alt}</span>
        <span className="guide-figure-tools">
          <button type="button" className="studio-action" data-tone="quiet" data-size="icon" aria-pressed={zoom}
            aria-label={zoom ? "도식을 화면에 맞추기" : "도식을 원본 크기로 보기"} title={zoom ? "화면에 맞추기" : "원본 크기로 보기"} onClick={() => setZoom(!zoom)}>
            <Maximize2 size={16} aria-hidden="true" />
          </button>
          <a className="studio-action" data-tone="quiet" data-size="icon" href={url} target="_blank" rel="noreferrer" aria-label="도식을 새 창에서 보기" title="새 창에서 보기">
            <ExternalLink size={16} aria-hidden="true" />
          </a>
        </span>
      </figcaption>
    </figure>
  );
}

/** 실제 화면. marks의 x, y는 그림 안의 위치(%)이며 아래 목록이 같은 번호로 설명한다. */
export function Screen({ file, alt, marks }: { file: ScreenId; alt: string; marks?: { x: number; y: number; label: ReactNode }[] }) {
  const [width, height] = screens[file];
  return (
    <figure className="guide-figure guide-screen" data-size={height > width ? "phone" : width < 1100 ? "medium" : undefined}>
      <div className="guide-shot">
        <a href={asset(`/guide/${file}.webp`)} target="_blank" rel="noreferrer" title="원본 크기로 보기">
          <Image src={asset(`/guide/${file}.webp`)} alt={alt} width={width} height={height} unoptimized />
        </a>
        {marks?.map(({ x, y }, index) => <span key={index} aria-hidden="true" className="guide-mark" style={{ left: `${x}%`, top: `${y}%` }}>{index + 1}</span>)}
      </div>
      {marks && <ol className="guide-marks">{marks.map(({ label }, index) => <li key={index}>{label}</li>)}</ol>}
      <figcaption><span>{alt}</span></figcaption>
    </figure>
  );
}

/** 같은 원본에서 만든 결과를 나란히 보여 준다. */
export function Results({ label, items }: { label: string; items: { file: ScreenId; name: string; note: string }[] }) {
  return (
    <ul className="guide-results" aria-label={label}>
      {items.map(({ file, name, note }) => (
        <li key={file}>
          <a href={asset(`/guide/${file}.webp`)} target="_blank" rel="noreferrer" title="원본 크기로 보기">
            <Image src={asset(`/guide/${file}.webp`)} alt={`${name}. ${note}`} width={screens[file][0]} height={screens[file][1]} unoptimized />
          </a>
          <strong>{name}</strong>
          <span>{note}</span>
        </li>
      ))}
    </ul>
  );
}

/** 넓은 화면에서는 표, 좁은 화면에서는 첫 칸을 제목으로 쓰는 묶음 */
export function Table({ label, head, rows }: { label: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <table className="guide-table" aria-label={label}>
      <thead><tr>{head.map((name) => <th key={name} scope="col">{name}</th>)}</tr></thead>
      <tbody>
        {rows.map((cells, row) => (
          <tr key={row}>
            {cells.map((cell, column) => column
              ? <td key={column} data-label={head[column]}>{cell}</td>
              : <th key={column} scope="row">{cell}</th>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 화면 문구와 해결. 검색한 낱말이 든 항목은 펼친다. */
export function Trouble({ title = "막힐 때", items }: { title?: string; items: [message: string, action: ReactNode][] }) {
  const { query } = use(GuideContext);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const words = searchWords(query);
    for (const item of list.current?.querySelectorAll("details") ?? [])
      item.open = words.length > 0 && words.every((word) => item.textContent?.toLocaleLowerCase().includes(word));
  }, [query]);
  return (
    <div className="guide-trouble" ref={list}>
      <h3>{title}</h3>
      {items.map(([message, action]) => (
        <details key={message}>
          <summary>{message}</summary>
          <p>{action}</p>
        </details>
      ))}
    </div>
  );
}

export function Related({ ids }: { ids: ChapterId[] }) {
  const { go } = use(GuideContext);
  return (
    <p className="guide-related">
      <span>이어서 보기</span>
      {ids.map((id) => <a key={id} href={`#${id}`} onClick={(event) => go(event, id)}>{chapters.find(([chapter]) => chapter === id)![1]}</a>)}
    </p>
  );
}
