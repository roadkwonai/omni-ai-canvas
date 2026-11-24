"use client";

import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { List, Search, X } from "lucide-react";
import { chapters, groups, starts, type ChapterId } from "./guide/contents";
import { GuideContext, searchWords } from "./guide/parts";
import StartChapters from "./guide/start";
import PlanChapters from "./guide/plan";
import BoardChapters from "./guide/board";
import MediaChapters from "./guide/media";
import FinishChapters from "./guide/finish";
import HelpChapters from "./guide/help";

/** embedded: 제작실의 대화상자 안에서는 주소의 해시를 바꾸지 않고 그 자리에서 이동한다. */
export default function GuideDocument({ embedded = false }: { embedded?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const navId = useId();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ReadonlySet<string> | null>(null);
  const [current, setCurrent] = useState<ChapterId>(chapters[0][0]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const scroller = element.closest(".guide-scroll");
    const sections = [...element.querySelectorAll("section")];
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = (scroller?.getBoundingClientRect().top ?? 0) + 140;
      const passed = sections.filter((section) => !section.hidden && section.getBoundingClientRect().top <= line);
      setCurrent((passed.at(-1) ?? sections[0]).id as ChapterId);
    };
    const schedule = () => { frame ||= requestAnimationFrame(update); };
    const target = scroller ?? window;
    target.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => {
      target.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  // 지금 읽는 장이 긴 목차 밖으로 나가지 않게 한다. scrollIntoView는 본문까지 움직인다.
  useEffect(() => {
    const index = root.current?.querySelector<HTMLElement>(".guide-index");
    const link = index?.querySelector<HTMLElement>("[aria-current]");
    if (!index || !link) return;
    const box = index.getBoundingClientRect(), target = link.getBoundingClientRect();
    if (target.top < box.top) index.scrollTop -= box.top - target.top + 40;
    else if (target.bottom > box.bottom) index.scrollTop += target.bottom - box.bottom + 40;
  }, [current, open]);

  function find(text: string) {
    setQuery(text);
    const words = searchWords(text);
    setMatches(words.length ? new Set(chapters.flatMap(([id, label]) => {
      const content = `${label} ${root.current?.querySelector(`#${id}`)?.textContent ?? ""}`.toLocaleLowerCase();
      return words.every((word) => content.includes(word)) ? [id] : [];
    })) : null);
  }

  function go(event: MouseEvent, id: ChapterId) {
    setOpen(false);
    if (!embedded) return;
    event.preventDefault();
    const section = root.current?.querySelector<HTMLElement>(`#${id}`);
    section?.scrollIntoView();
    section?.focus({ preventScroll: true });
  }

  const currentLabel = chapters.find(([id]) => id === current)?.[1];

  return (
    <div className="guide-layout" ref={root}>
      <div className="guide-body">
        <div className="guide-side" data-open={open || undefined}>
          <div className="guide-search">
            <Search size={16} aria-hidden="true" />
            <input ref={search} type="search" value={query} placeholder="가이드 검색" aria-label="가이드 검색" onChange={(event) => find(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Escape" && query) { event.preventDefault(); event.stopPropagation(); find(""); } }} />
            {query && <button type="button" className="studio-action" data-tone="quiet" data-size="icon" aria-label="검색어 지우기"
              onClick={() => { find(""); search.current?.focus(); }}><X size={16} aria-hidden="true" /></button>}
          </div>
          <button type="button" className="studio-action guide-toc-toggle" aria-expanded={open} aria-controls={navId} onClick={() => setOpen(!open)}>
            <List size={16} aria-hidden="true" /> <span>목차<em>{matches ? `검색 결과 ${matches.size}개` : currentLabel}</em></span>
          </button>
          <nav id={navId} className="guide-index" aria-label="가이드 목차">
            {groups.map(({ label, chapters: items }) => {
              const shown = items.filter(([id]) => !matches || matches.has(id));
              return shown.length > 0 && (
                <div key={label}>
                  <p>{label}</p>
                  <ul>{shown.map(([id, text]) => (
                    <li key={id}><a href={`#${id}`} aria-current={current === id ? "location" : undefined} onClick={(event) => go(event, id)}>{text}</a></li>
                  ))}</ul>
                </div>
              );
            })}
          </nav>
        </div>
        <GuideContext value={{ query, matches, go }}>
          <article className="guide-document">
            <p className="guide-result" role="status">{matches && (matches.size ? `‘${query.trim()}’ 검색 결과 ${matches.size}개 장` : "찾는 내용이 없습니다. 다른 낱말로 검색하세요.")}</p>
            <ul className="guide-starts" aria-label="하고 싶은 일로 찾기" hidden={matches !== null}>
              {starts.map(([id, label, detail]) => (
                <li key={id}><a href={`#${id}`} onClick={(event) => go(event, id)}><strong>{label}</strong><span>{detail}</span></a></li>
              ))}
            </ul>
            <StartChapters />
            <PlanChapters />
            <BoardChapters />
            <MediaChapters />
            <FinishChapters />
            <HelpChapters />
          </article>
        </GuideContext>
      </div>
    </div>
  );
}
