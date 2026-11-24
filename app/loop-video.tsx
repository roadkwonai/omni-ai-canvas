"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import styles from "./landing.module.css";

export default function LoopVideo({ src, poster, label, width, height }: {
  src: string; poster: string; label: string; width: number; height: number;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stopped = useRef(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const element = video.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    element.muted = true;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !stopped.current) element.play().catch(() => {});
      else element.pause();
    }, { threshold: 0.3 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.film}>
      <video ref={video} aria-label={label} poster={poster} src={src} width={width} height={height}
        style={{ aspectRatio: `${width} / ${height}` }} muted loop playsInline preload="none"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
      <button type="button" aria-label={`${label} ${playing ? "멈추기" : "재생하기"}`} onClick={() => {
        const element = video.current;
        if (!element) return;
        stopped.current = !element.paused;
        if (element.paused) element.play().catch(() => {});
        else element.pause();
      }}>
        {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
      </button>
    </div>
  );
}
