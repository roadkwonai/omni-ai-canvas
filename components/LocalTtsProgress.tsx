"use client";

import { Check, LoaderCircle } from "lucide-react";
import { Progress, ProgressIndicator, ProgressLabel, ProgressTrack, ProgressValue } from "@ui-sdk/react/progress";
import type { LocalTtsPhase, LocalTtsProgress as Reading } from "@/lib/tts-types";
import "./local-tts.css";

const steps: Record<LocalTtsPhase, string> = { queued: "대기", preparing: "준비", loading: "모델 올리기", generating: "음성 생성", finishing: "마무리" };
const order = Object.keys(steps) as LocalTtsPhase[];
export const phaseLabels: Record<LocalTtsPhase, string> = {
  queued: "순서를 기다리는 중", preparing: "대사와 참조 음성을 준비하는 중", loading: "모델을 메모리에 올리는 중",
  generating: "음성을 만드는 중", finishing: "소리를 다듬고 저장하는 중",
};
const duration = (seconds: number) => {
  const whole = Math.round(seconds);
  return whole < 60 ? `${whole}초` : `${Math.floor(whole / 60)}분 ${whole % 60}초`;
};

export default function LocalTtsProgress({ reading, modelLabel }: { reading: Reading; modelLabel: string }) {
  const { phase, percent, seconds, elapsed, ahead, part, parts, remaining } = reading;
  const current = order.indexOf(phase);
  const details = [
    phase === "queued" && ahead > 0 && `앞선 작업 ${ahead}개`,
    part === 0 && "화자 목소리 준비",
    part && parts && parts > 1 && `문장 묶음 ${Math.min(part, parts)}/${parts}`,
    seconds > 0 && `${duration(seconds)} 분량 완성`,
    `경과 ${duration(elapsed)}`,
    remaining !== undefined && `약 ${duration(remaining)} 남음`,
  ].filter(Boolean);
  return <div className="local-tts-progress">
    <Progress value={percent}>
      <ProgressLabel>{modelLabel} · {phaseLabels[phase]}</ProgressLabel>
      <ProgressValue />
      <ProgressTrack className="local-tts-track"><ProgressIndicator className="local-tts-indicator" /></ProgressTrack>
    </Progress>
    <ol className="local-tts-steps" aria-label="생성 단계">
      {order.map((step, index) => <li key={step} data-state={index < current ? "done" : index === current ? "current" : "next"} aria-current={index === current ? "step" : undefined}>
        {index < current ? <Check size={14} aria-hidden="true" /> : index === current ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : null}{steps[step]}
      </li>)}
    </ol>
    <p>{details.join(" · ")}</p>
  </div>;
}
