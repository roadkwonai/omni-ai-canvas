"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { asset } from "@/lib/site";
import styles from "./landing.module.css";

const videoId = "x3-nif4Fmgg";

const chapters = [
  [10, "보드 하나로 모은 제작실"],
  [29, "제작 형식과 감독 기획"],
  [61, "노드와 연결"],
  [90, "이미지 연출과 인물"],
  [118, "디렉터 스튜디오"],
  [143, "영상 만들기"],
  [167, "대사와 목소리"],
  [200, "3D와 모션그래픽"],
  [231, "타임라인"],
  [257, "비용과 정리"],
] as const;

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** 누르기 전에는 YouTube에 연결하지 않는다. */
export default function IntroVideo() {
  const [start, setStart] = useState<number>();
  const stage = useRef<HTMLDivElement>(null);
  const play = (seconds: number) => {
    setStart(seconds);
    stage.current?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div className={styles.intro}>
      <div className={styles.introStage} ref={stage}>
        {start === undefined
          ? <button type="button" aria-label="5분 소개 영상 재생하기" onClick={() => {
              play(0);
              requestAnimationFrame(() => stage.current?.querySelector("iframe")?.focus());
            }}>
              <Image src={asset("/landing/intro-video.webp")} alt="" width={1280} height={720} unoptimized />
            </button>
          : <iframe key={start} src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&start=${start}`}
              title="Omni AI Canvas 5분 소개 영상" allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />}
      </div>
      <ol className={styles.introChapters} aria-label="소개 영상의 주요 장면">
        {chapters.map(([seconds, label]) => <li key={seconds}>
          <button type="button" aria-pressed={start === seconds} onClick={() => play(seconds)}><span>{clock(seconds)}</span>{label}</button>
        </li>)}
      </ol>
      <p className={styles.introNote}>누르면 YouTube에서 영상을 불러와요. 내레이션은 AI 음성이에요. <a href={`https://youtu.be/${videoId}`} target="_blank" rel="noreferrer">YouTube에서 보기</a></p>
    </div>
  );
}
