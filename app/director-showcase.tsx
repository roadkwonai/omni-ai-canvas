"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import type { ShowcaseItem } from "@/lib/director-showcase";
import LoopVideo from "./loop-video";
import styles from "./landing.module.css";

type Reference = { still: string; video?: string; source: string };
type Move = ShowcaseItem & { still: string; video: string; source: string | null };
type Group = { id: string; label: string; items: ShowcaseItem[] };

export default function DirectorShowcase({ groups, ownMoves }: { groups: Group[]; ownMoves: string[] }) {
  const [references, setReferences] = useState<Record<string, Reference>>({});
  const [tab, setTab] = useState<string>();
  const [selected, setSelected] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/director-references", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : { items: {} })
      .then(({ items }) => setReferences(items ?? {}))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const moves = groups[0].items.flatMap((item): Move[] => {
    const reference = references[item.id];
    if (reference?.video) return [{ ...item, still: reference.still, video: reference.video, source: reference.source }];
    return ownMoves.includes(item.id)
      ? [{ ...item, still: `/director/moves/${item.id}.webp`, video: `/director/moves/${item.id}.mp4`, source: null }] : [];
  });
  const move = moves.find(({ id }) => id === selected) ?? moves[0];

  return (
    <Tabs className={styles.showcase} value={tab ?? groups[0].id} onValueChange={(next) => { if (next) setTab(next); }}>
      <TabsList aria-label="촬영 기법 묶음" className={`${styles.tabsList} ${styles.showcaseTabs}`}>
        {groups.map(({ id, label }) => <TabsTab key={id} value={id} className={styles.tab}>{label}</TabsTab>)}
      </TabsList>
      <TabsPanel value={groups[0].id} className={styles.moves}>
        <figure className={styles.moveStage}>
          <LoopVideo key={move.video} src={move.video} poster={move.still} label={`${move.name} 예제 영상`} width={640} height={360} />
          <figcaption><strong>{move.name}</strong> {move.use}</figcaption>
        </figure>
        <ul className={styles.moveList} aria-label="카메라 이동 예제">
          {moves.map(({ id, name, still }) => <li key={id}>
            <button type="button" aria-pressed={id === move.id} onClick={() => setSelected(id)}>
              <Image src={still} alt="" width={320} height={180} loading="lazy" unoptimized />{name}
            </button>
          </li>)}
        </ul>
        <p className={styles.showcaseNote}>{move.source
          ? <><a href={move.source} target="_blank" rel="noreferrer">예시 · CineGuide</a>는 이 컴퓨터에만 보관한 참고 자료예요. © Sputlab x Ainspire</>
          : "AI로 만든 사진에 카메라 움직임을 넣은 예제예요. 실제 결과는 고른 모델에 따라 달라요."}</p>
      </TabsPanel>
      {groups.slice(1).map(({ id, items }) => <TabsPanel key={id} value={id}>
        <ul className={styles.stills}>
          {items.map((item) => <li key={item.id}>
            <Image src={`/director/examples/${item.id}.webp`} alt="" width={356} height={356} loading="lazy" unoptimized />
            <h3>{item.name}</h3>
            <p>{item.use}</p>
          </li>)}
        </ul>
        <p className={styles.showcaseNote}>예제 사진은 AI로 만들었어요. 실제 결과는 고른 모델에 따라 달라요.</p>
      </TabsPanel>)}
    </Tabs>
  );
}
