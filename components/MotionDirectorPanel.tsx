"use client";

import { useState } from "react";
import { effortOptions, type AgentEffort } from "../lib/agent-effort";
import "./motion-director.css";
import { motionRecipes, type MotionShortSpec } from "../lib/motion-short-spec";
import type { AgentDefaults } from "../lib/agent-preferences";
import type { StylePresetDraft } from "../lib/style-preset-core";
import type { Provider, ProviderInfo, Run } from "../lib/types";

const galleries = [
  {
    label: "Keyframe Gallery",
    url: "https://keyframe.gallery/",
    study: "제품 동작의 시작·중간·끝을 읽을 수 있는 화면 순서로 설계한다.",
  },
  {
    label: "Awesome Opus Videos",
    url: "https://github.com/yihui-dev/awesome-opus5-5-videos",
    study:
      "예제의 아이디어를 도형·텍스트·카메라 움직임으로 나누고 새 소재에 맞춰 구성한다.",
  },
  {
    label: "AI City Builders",
    url: "https://www.aicitybuilders.com/remotion",
    study: "재사용할 장면 구성 요소와 컷별 길이를 정해 설명 영상을 설계한다.",
  },
  {
    label: "Oneshotted",
    url: "https://oneshotted.io/",
    study:
      "타이포·데이터 시각화·제품 소개 중 핵심 동작을 선택하고 장면마다 정보 한 가지를 강조한다.",
  },
];

export type MotionPlanRequest = {
  provider: Provider;
  model?: string;
  effort?: AgentEffort;
  prompt: string;
  motionDesign: {
    aspect: "16:9" | "9:16";
    seconds: number;
    style?: StylePresetDraft;
  };
};
type Props = {
  providers: ProviderInfo[];
  defaults: AgentDefaults;
  runs: Run[];
  activePreset?: StylePresetDraft;
  onDesign: (request: MotionPlanRequest) => Promise<Run>;
  onApply: (spec: MotionShortSpec) => void;
};

export default function MotionDirectorPanel({
  providers,
  defaults,
  runs,
  activePreset,
  onDesign,
  onApply,
}: Props) {
  const [topic, setTopic] = useState("");
  const [aspect, setAspect] = useState<"16:9" | "9:16">("9:16");
  const [seconds, setSeconds] = useState(24);
  const [gallery, setGallery] = useState("");
  const [choice, setChoice] = useState<{ provider: string; model: string; effort?: AgentEffort }>({
    provider: defaults.text?.provider ?? "",
    model: defaults.text?.model ?? "",
    effort: defaults.text?.effort,
  });
  const [selectedRun, setSelectedRun] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [appliedId, setAppliedId] = useState("");
  const available = providers.filter((provider) =>
    provider.operations.includes("text"),
  );
  const account = available.find((provider) => provider.id === choice.provider);
  const models =
    account?.models?.filter((model) => model.operations.includes("text")) ?? [];
  const effort = choice.effort && effortOptions(account, choice.model).includes(choice.effort) ? choice.effort : undefined;
  const plans = runs.filter((run) => run.input.motionDesign);
  const selected = plans.find((run) => run.id === selectedRun);
  const spec = selected?.result?.motionSpec;
  const reference = galleries.find((item) => item.label === gallery);
  const valid =
    topic.trim() &&
    account?.available &&
    (!choice.model || models.some((model) => model.id === choice.model)) &&
    Number.isInteger(seconds) &&
    seconds >= 1 &&
    seconds <= 600;
  async function design() {
    if (!valid || !account || pending) return;
    setError("");
    setPending(true);
    try {
      const request = await onDesign({
        provider: account.id,
        ...(choice.model ? { model: choice.model } : {}),
        ...(effort ? { effort } : {}),
        prompt: [
          topic.trim(),
          reference && `선택한 연출 연구 방향: ${reference.study}`,
        ]
          .filter(Boolean)
          .join("\n"),
        motionDesign: {
          aspect,
          seconds,
          ...(activePreset ? { style: { ...activePreset, evidence: "" } } : {}),
        },
      });
      setSelectedRun(request.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "모션 기획을 요청하지 못했습니다.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <details className="motion-director">
      <summary>에이전트와 모션 기획하기</summary>
      <label>
        영상 주제와 요청
        <textarea
          rows={3}
          maxLength={8000}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="예: 카세트테이프가 소리를 저장하는 원리를 1분 동안 설명해 줘."
        />
      </label>
      {activePreset && <p>적용 프리셋 · {activePreset.name}</p>}
      <div className="motion-director-fields">
        <label>
          에이전트
          <select
            value={choice.provider}
            onChange={(e) => setChoice({ provider: e.target.value, model: "" })}
          >
            <option value="">계정 선택</option>
            {available.map((item) => (
              <option key={item.id} value={item.id} disabled={!item.available}>
                {item.label}
                {!item.available && " · 연결 필요"}
              </option>
            ))}
          </select>
        </label>
        <label>
          모델
          <select
            value={choice.model}
            onChange={(e) => setChoice({ provider: choice.provider, model: e.target.value })}
          >
            <option value="">계정 기본 모델</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          목표 길이(초)
          <input
            type="number"
            min={1}
            max={600}
            value={seconds || ""}
            onChange={(e) => setSeconds(Number(e.target.value))}
          />
        </label>
        <label>
          출력 비율
          <select
            value={aspect}
            onChange={(e) => setAspect(e.target.value as typeof aspect)}
          >
            <option>9:16</option>
            <option>16:9</option>
          </select>
        </label>
      </div>
      <label>
        레퍼런스 갤러리
        <select value={gallery} onChange={(e) => setGallery(e.target.value)}>
          <option value="">선택 사항</option>
          {galleries.map((item) => (
            <option key={item.label}>{item.label}</option>
          ))}
        </select>
      </label>
      {reference && (
        <p>
          {reference.study}{" "}
          <a href={reference.url} target="_blank" rel="noreferrer">
            사례 열기 ↗
          </a>
        </p>
      )}
      <button
        type="button"
        disabled={
          !valid ||
          pending ||
          selected?.status === "running" ||
          selected?.status === "queued"
        }
        onClick={() => void design()}
      >
        모션 구성 제안받기
      </button>
      {plans.length > 0 && (
        <label>
          이 프로젝트의 모션 기획
          <select
            value={selectedRun}
            onChange={(e) => setSelectedRun(e.target.value)}
          >
            <option value="">실행 선택</option>
            {plans.map((run) => (
              <option value={run.id} key={run.id}>
                {run.input.prompt.slice(0, 52)}
              </option>
            ))}
          </select>
        </label>
      )}
      {(selected?.status === "running" || selected?.status === "queued") && (
        <p role="status">구독 에이전트가 장면을 구성하고 있습니다.</p>
      )}
      {(error || selected?.error) && (
        <p role="alert" className="motion-short-error">
          {error || selected?.error}
        </p>
      )}
      {spec && (
        <section>
          <strong>
            {spec.scenes.length}장면 ·{" "}
            {spec.scenes.reduce((sum, scene) => sum + scene.seconds, 0)}초 ·{" "}
            {spec.aspect}
          </strong>
          <ol>
            {spec.scenes.map((scene, index) => (
              <li key={index}>
                {scene.text} · {motionRecipes[scene.recipe ?? "type"]} ·{" "}
                {scene.seconds}초
              </li>
            ))}
          </ol>
          <button
            type="button"
            disabled={appliedId === selectedRun}
            onClick={() => {
              onApply(structuredClone(spec));
              setAppliedId(selectedRun);
            }}
          >
            {appliedId === selectedRun
              ? "편집기에 반영됨"
              : "제안을 편집기에 반영"}
          </button>
        </section>
      )}
    </details>
  );
}
