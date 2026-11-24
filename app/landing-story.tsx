"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Aperture, Film, Maximize2, Network, Play } from "lucide-react";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import board from "../public/landing/canvas-board.webp";
import emotion from "../public/landing/canvas-emotion.webp";
import timeline from "../public/landing/canvas-timeline.webp";
import styles from "./landing.module.css";

const scenes = [
  {
    id: "board",
    label: "자료 연결",
    icon: Network,
    title: "대본과 인물을 한 샷에 연결해요",
    detail: "〈마지막 상영〉의 대본과 영사기사 참조를 키프레임에 연결했어요. 원본이 다음 영상으로 어떻게 이어졌는지 보드에서 보여요.",
    points: ["포트의 ＋를 눌러 다음 노드 추가", "시작 프레임과 인물 참조의 역할 지정"],
    source: "/landing/canvas-board.webp",
    image: board,
    alt: "기획, 대본, 캐릭터, 키프레임, 영상 노드가 연결된 마지막 상영 제작 보드",
  },
  {
    id: "direction",
    label: "이미지 연출",
    icon: Aperture,
    title: "같은 장면을 다르게 연출해요",
    detail: "키프레임에서 감정 편집기를 열면 원본과 기준 표정이 나란히 나와요. 표정, 조명, 시점을 바꾼 후보는 원본에 연결되니 바로 비교해 보세요.",
    points: ["5×5 감정판과 기준 표정", "원본과 후보를 비교해 고르기"],
    source: "/landing/canvas-emotion.webp",
    image: emotion,
    alt: "원본 키프레임과 기준 표정, 5×5 감정판을 보여 주는 감정 편집기",
  },
  {
    id: "timeline",
    label: "컷 편집",
    icon: Film,
    title: "고른 영상을 컷으로 이어 붙여요",
    detail: "보드의 키프레임과 영상을 컷에 넣고 순서와 시작점, 길이를 정해요. 음향과 자막도 같은 타임라인에서 맞춰요.",
    points: ["이미지와 영상을 컷에 배치", "길이, 전환, 음향, 자막 조정"],
    source: "/landing/canvas-timeline.webp",
    image: timeline,
    alt: "키프레임 영사창 너머와 영상 마지막 불빛을 두 컷으로 배치한 타임라인",
  },
];

const tabIds = [...scenes.map(({ id }) => id), "result"];

export default function LandingStory() {
  const [tab, setTab] = useState("board");

  useEffect(() => {
    function openLinkedTab() {
      const id = window.location.hash.replace("#scene-", "");
      if (tabIds.includes(id)) setTab(id);
    }
    openLinkedTab();
    window.addEventListener("hashchange", openLinkedTab);
    return () => window.removeEventListener("hashchange", openLinkedTab);
  }, []);

  return (
    <Tabs className={styles.storyTabs} value={tab} onValueChange={(next) => {
      if (!next) return;
      setTab(next);
      // 같은 장면 링크를 다시 눌러도 hashchange가 일어나게 한다.
      if (window.location.hash.startsWith("#scene-")) history.replaceState(history.state, "", "#workflow");
    }}>
      {tabIds.map((id) => <span key={id} className={styles.sceneAnchor} id={`scene-${id}`} />)}
      <TabsList aria-label="마지막 상영 제작 과정" className={styles.tabsList}>
        {scenes.map(({ id, label, icon: Icon }) => (
          <TabsTab key={id} value={id} className={styles.tab}>
            <Icon size={18} aria-hidden="true" />{label}
          </TabsTab>
        ))}
        <TabsTab value="result" className={styles.tab}><Play size={18} aria-hidden="true" />예제 재생</TabsTab>
      </TabsList>
      {scenes.map(({ id, title, detail, points, source, image, alt }) => (
        <TabsPanel key={id} value={id} className={styles.storyPanel}>
          <div className={styles.storyCopy}>
            <h3>{title}</h3>
            <p>{detail}</p>
            <ul>{points.map((point) => <li key={point}>{point}</li>)}</ul>
          </div>
          <figure className={styles.storyCapture}>
            <Image src={image} alt={alt} unoptimized />
            <figcaption>
              실제 제작실 화면
              <a href={source} aria-label={title + " 원본 캡처 보기"}>원본 보기 <Maximize2 size={15} aria-hidden="true" /></a>
            </figcaption>
          </figure>
        </TabsPanel>
      ))}
      <TabsPanel value="result" className={styles.storyPanel}>
        <div className={styles.storyCopy}>
          <h3>키프레임 한 장을 움직여 봐요</h3>
          <p>영사실 스틸을 천천히 확대한 영상이에요. 시선이 어디로 가는지 살펴보세요. 예제 보드에서 키프레임과 함께 열 수 있어요.</p>
          <ul><li>〈마지막 상영〉 5초 무음 영상</li><li>예제 키프레임으로 만든 움직임 테스트</li></ul>
        </div>
        <figure className={styles.storyCapture}>
          <video aria-label="마지막 상영 5초 무음 모션 예제" poster="/sample/frame.webp" controls playsInline preload="none">
            <source src="/sample/preview.mp4" type="video/mp4" />
            <a href="/sample/preview.mp4">예제 영상 열기</a>
          </video>
          <figcaption>〈마지막 상영〉 움직임 테스트</figcaption>
        </figure>
      </TabsPanel>
    </Tabs>
  );
}
