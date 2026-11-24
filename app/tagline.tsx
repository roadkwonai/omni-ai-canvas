"use client";

import { useEffect, useRef } from "react";
import styles from "./landing.module.css";

const lines = ["컷을 하나 고르면", "어느 대본에서 나왔는지 보여요"];

export default function Tagline() {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const element = heading.current;
    if (!element || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      element.dataset.reveal = "true";
      observer.disconnect();
    }, { threshold: 0.4 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  let order = 0;
  return (
    <section className={styles.tagline} aria-labelledby="tagline-title">
      <div className={styles.content}>
        <h2 aria-label={lines.join(" ")} className={styles.heading2} id="tagline-title" ref={heading}>
          {lines.map((line) => (
            <span aria-hidden="true" className={styles.taglineLine} key={line}>
              {line.split(" ").map((word, index) => (
                <span key={`${index}-${word}`}>{index > 0 && " "}<span className={styles.word} style={{ animationDelay: `${order++ * 65}ms` }}>{word}</span></span>
              ))}
            </span>
          ))}
        </h2>
      </div>
    </section>
  );
}
