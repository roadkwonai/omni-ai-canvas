"use client";

import ProductionGuidePicker from "./ProductionGuidePicker";
import {
  DIRECTOR_FORMATS,
  MAX_SCENE_COUNT,
  directorFormatLabels,
  type DirectorOptions,
} from "../lib/types";

type Props = {
  mode: "director" | "free" | "review";
  onModeChange: (mode: "director" | "free" | "review") => void;
  options: DirectorOptions;
  onChange: (options: DirectorOptions) => void;
  onTemplate?: () => void;
  onPreset?: () => void;
};

export default function DirectorControls({
  mode,
  onModeChange,
  options,
  onChange,
  onTemplate,
  onPreset,
}: Props) {
  return (
    <div className="director-controls">
      <label className="field-label" htmlFor="plan-mode">
        기획 방식
      </label>
      <select
        id="plan-mode"
        title="새 제작안, 자유 노드 구성 또는 기존 대본·연출 검토를 선택합니다."
        value={mode}
        onChange={(event) => onModeChange(event.target.value as Props["mode"])}
      >
        <option value="director">새 제작안</option>
        <option value="free">자유 노드 구성</option>
        <option value="review">대본·연출 검토</option>
      </select>
      {mode === "review" && (
        <p className="director-description">
          현재 작품의 대본과 연출을 검토하고, 기존 노드별 수정안을 제안합니다.
          검토에는 선택한 에이전트의 사용량이 적용됩니다.
        </p>
      )}
      {mode === "director" && (
        <>
          <div className="director-fields">
            <div>
              <label className="field-label" htmlFor="director-format">
                작품 형식
              </label>
              <select
                id="director-format"
                title="감독이 제안할 작품의 형식을 선택합니다."
                value={options.format}
                onChange={(event) =>
                  onChange({
                    ...(options.skillIds ? { skillIds: options.skillIds } : {}),
                    sceneCount: options.sceneCount,
                    format: event.target.value as DirectorOptions["format"],
                  })
                }
              >
                {DIRECTOR_FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {directorFormatLabels[format]}
                  </option>
                ))}
              </select>
              {options.stylePreset && <small className="director-description">작품 형식을 바꾸면 현재 스타일 프리셋을 해제합니다. 직접 선택한 지침은 계속 사용합니다.</small>}
            </div>
            <div>
              <label className="field-label" htmlFor="scene-count">
                제안 장면 수
              </label>
              <select
                id="scene-count"
                title="감독이 시나리오에 맞춰 장면 수를 정하게 하거나 직접 지정합니다."
                value={options.sceneCount === "auto" ? "auto" : "manual"}
                onChange={(event) =>
                  onChange({
                    ...options,
                    sceneCount: event.target.value === "auto" ? "auto" : 3,
                  })
                }
              >
                <option value="auto">시나리오 기준 자동</option>
                <option value="manual">직접 입력</option>
              </select>
              {options.sceneCount !== "auto" && <input type="number" aria-label="직접 지정할 제안 장면 수"
                min={1} max={MAX_SCENE_COUNT} value={Number.isFinite(options.sceneCount) ? options.sceneCount : ""}
                onChange={(event) => onChange({ ...options, sceneCount: event.target.value === "" ? Number.NaN : Number(event.target.value) })} />}
            </div>
          </div>
          <details className="request-preview director-extra">
          <summary data-help="제작안에 반영할 스킬과 스타일을 고릅니다.">제작 지침·프리셋</summary>
          <ProductionGuidePicker kind={options.format === "ad" ? "brief" : "scenario"}
            recommendedIds={options.format === "ad"
              ? ["commercial-check", "commercial-prompt", "commercial-acting"]
              : options.format === "film"
                ? ["cinematic-engine", "acting", "blocking", "casting-continuity"]
                : options.format === "musicVideo"
                  ? ["casting-continuity", "shot-plan", "faceless-plan"]
                  : ["story-hook", "acting", "casting-continuity"]}
            selected={options.skillIds}
            onChange={(skillIds) => onChange({ ...options, skillIds })} />
          {onPreset && <button className="outline-button" title="콘텐츠 타입, 레퍼런스, 연출 기법과 내 프리셋을 선택합니다." onClick={onPreset}>
            {options.stylePreset ? `제작 프리셋 · ${options.stylePreset.name}` : "제작 프리셋 선택"}
          </button>}
          {options.stylePreset && <button className="text-button" title="이후 감독 기획과 프로젝트 대화에서 프리셋 적용을 해제합니다." onClick={() => onChange({ format: options.format, sceneCount: options.sceneCount, ...(options.skillIds ? { skillIds: options.skillIds } : {}) })}>프리셋 적용 해제</button>}
          </details>
          {onTemplate && (
            <button
              className="outline-button"
              title="AI 요청 없이 선택한 형식의 빈 제작 노드를 배치합니다."
              onClick={onTemplate}
            >
              기본 제작 보드 배치 · 무료
            </button>
          )}
        </>
      )}
    </div>
  );
}
