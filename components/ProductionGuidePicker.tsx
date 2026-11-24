"use client";

import { useRef, useState } from "react";
import {
  productionGuides,
  recommendedProductionGuides,
  type ProductionGuideId,
} from "../lib/higgsfield-guidance-kit";
import type { Kind } from "../lib/types";
import "./production-guide-picker.css";

type Props = {
  kind: Kind;
  selected?: ProductionGuideId[];
  recommendedIds?: ProductionGuideId[];
  onChange: (ids: ProductionGuideId[]) => void;
};

export default function ProductionGuidePicker({ kind, selected, recommendedIds, onChange }: Props) {
  const [sourceOpen, setSourceOpen] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceError, setSourceError] = useState("");
  const sourceRequest = useRef(0);
  const recommendations = recommendedIds ?? recommendedProductionGuides(kind);
  const picked = selected ?? [];
  const overlaps = [
    picked.includes("seedance-shot") && picked.includes("commercial-prompt")
      ? "숏드라마 영상 프롬프트와 광고 영상 프롬프트는 시간·카메라·참조 구성이 많이 겹칩니다. 광고면 광고용을, 서사 중심이면 숏드라마용을 먼저 권합니다." : "",
    picked.includes("acting") && picked.includes("commercial-acting")
      ? "드라마 연기와 광고 연기는 목적·행동·반응 구성이 겹칩니다. 상품 시연이면 광고용을 우선 권합니다." : "",
    picked.includes("faceless-plan") && picked.includes("video-explainer")
      ? "Video Explainer는 Faceless Video의 호환 진입 경로입니다. 하나만 선택해도 내레이션 구성에 사용할 수 있습니다." : "",
    picked.includes("cinema-prompt") && (picked.includes("seedance-shot") || picked.includes("commercial-prompt"))
      ? "공식 생성 프롬프트의 카메라·참조 설명이 영상 프롬프트와 겹칩니다. 영상 구간별 포맷이 필요하면 해당 영상 지침을 우선 권합니다." : "",
  ].filter(Boolean);

  async function showSource(id: string) {
    const request = ++sourceRequest.current;
    if (sourceOpen === id) { setSourceOpen(""); return; }
    setSourceOpen(id);
    setSourceText("");
    setSourceError("");
    try {
      const response = await fetch(`/api/guidance?source=${encodeURIComponent(id)}`);
      const body = await response.json() as { content?: unknown; error?: unknown } | null;
      if (!response.ok && typeof body?.error === "string") throw new Error(body.error);
      if (!response.ok || typeof body?.content !== "string")
        throw new Error("설치된 원본을 확인할 수 없습니다.");
      if (request === sourceRequest.current) setSourceText(body.content);
    } catch (error) {
      if (request === sourceRequest.current)
        setSourceError(error instanceof Error ? error.message : "설치된 원본을 확인할 수 없습니다.");
    }
  }

  return (
    <section className="production-guides" aria-label="제작 지침 선택">
      <h4>스킬·워크플로우 지침</h4>
      <p>추천 항목을 먼저 확인하고 필요한 지침을 선택하세요. 체크한 내용은 저장 후 작업 요청에 포함됩니다.</p>
      {selected === undefined && <p>아직 지침을 선택하지 않았습니다. 기존 노드는 현재 지침을 유지합니다.</p>}
      {recommendations.length > 0 && <button type="button" data-help="현재 작업에 추천되는 제작 스킬을 선택 목록에 적용합니다." onClick={() => onChange([...recommendations])}>
        이 노드의 추천 설정 적용
      </button>}
      {overlaps.length > 0 && <div className="production-guides-overlap" role="status">
        {overlaps.map((message) => <p key={message}>{message}</p>)}
        <p>두 지침을 함께 쓰려면 선택을 그대로 두세요.</p>
      </div>}
      <p>공간 블로킹은 인물의 시작 위치와 축, 샷 설계는 동작과 카메라 경로, 아나모픽은 렌즈 룩을 다룹니다. 시간별 영상 프롬프트는 이 정보를 모델 입력 형식으로 정리하므로 함께 사용할 수 있습니다.</p>
      <div className="production-guides-list">
        {productionGuides.map((guide) => {
          const recommended = recommendations.includes(guide.id);
          return <article key={guide.id}>
            <label>
              <input type="checkbox" checked={picked.includes(guide.id)} onChange={(event) =>
                onChange(event.target.checked ? [...picked, guide.id] : picked.filter((id) => id !== guide.id))} />
              <span>{guide.label} {recommended && <small>추천</small>}</span>
            </label>
            <p>{guide.summary}</p>
            <details>
              <summary data-help="이 제작 스킬이 요청에 더하는 내용과 권장 작업 순서를 펼칩니다.">적용 내용과 단계 보기</summary>
              <p>{guide.instructions}</p>
              <ol>{guide.workflow.map((step) => <li key={step}>{step}</li>)}</ol>
              <p><a href={guide.source} target="_blank" rel="noreferrer">{guide.sourceKind} · 출처 보기</a></p>
              {"localSource" in guide && <button type="button" onClick={() => void showSource(guide.localSource)}
                aria-expanded={sourceOpen === guide.localSource}>
                {sourceOpen === guide.localSource ? "설치 원문 닫기" : "보관된 원문 보기"}
              </button>}
              {"localSource" in guide && sourceOpen === guide.localSource && <pre className="production-guides-source">{sourceText || sourceError || "원본을 확인하고 있습니다."}</pre>}
            </details>
          </article>;
        })}
      </div>
      <p>공식 스킬과 제작자 배포 자료는 출처별로 표시합니다. 제작자 원문은 이 컴퓨터의 개인 연구 자료이며 선택한 요약 지침만 작업에 반영됩니다. 선택한 노드 레시피에 담긴 지침도 함께 전달됩니다.</p>
      <button type="button" onClick={() => void showSource("prompt")} aria-expanded={sourceOpen === "prompt"}>
        {sourceOpen === "prompt" ? "설치된 공식 원본 닫기" : "설치된 공식 프롬프트 스킬 원문 보기"}
      </button>
      {sourceOpen === "prompt" && <pre className="production-guides-source">{sourceText || sourceError || "공식 원본을 확인하고 있습니다."}</pre>}
    </section>
  );
}
