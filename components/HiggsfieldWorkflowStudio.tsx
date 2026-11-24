"use client";

import { useEffect, useRef, useState } from "react";
import {
  defaultWorkflow,
  defaultFashionAdSettings,
  type FashionAdSettings,
  workflowBoard,
  workflows,
  type WorkflowFormat,
  type WorkflowSettings,
} from "../lib/higgsfield-workflows";
import ProductionGuidePicker from "./ProductionGuidePicker";
import DramaIdeaBank from "./DramaIdeaBank";
import { MAX_SCENE_COUNT, type Graph } from "../lib/types";
import "./higgsfield-workflow.css";

const choices = [
  [
    "states",
    "의상·소품 상태 시트",
    "같은 배역의 안경·의상 등 상태를 나눠 장면에 맞는 참조를 고릅니다.",
  ],
  [
    "voices",
    "배역별 목소리와 Video Element",
    "대사 녹음과 연기 참조를 분리해 준비합니다.",
  ],
  ["extras", "엑스트라 그룹", "배경 인물을 그룹 시트 한 장으로 관리합니다."],
  [
    "roomTour",
    "룸투어와 블로킹",
    "공간 영상과 인물 시작 위치를 적은 탑뷰를 샷에 연결합니다.",
  ],
  [
    "alternate",
    "같은 동작의 대안 앵글",
    "시작·끝 상태를 유지하며 다른 카메라를 시험합니다.",
  ],
] as const;

export default function HiggsfieldWorkflowStudio({
  onClose,
  onApply,
  initialAd,
}: {
  onClose: () => void;
  onApply: (graph: Graph) => void;
  initialAd?: Pick<FashionAdSettings, "sceneCount" | "aspect">;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [settings, setSettings] = useState<WorkflowSettings>(() =>
    initialAd
      ? { ...defaultWorkflow("fashion-ad"), ad: { ...defaultFashionAdSettings(), ...initialAd } }
      : defaultWorkflow("cinema"),
  );
  const [cast, setCast] = useState("");
  const [error, setError] = useState("");
  const workflow = workflows[settings.format];
  const ad = settings.format === "fashion-ad" ? settings.ad ?? defaultFashionAdSettings() : null;
  const names = [
    ...new Set(
      cast
        .split(/[,，\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  if (!names.length) names.push("주인공");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      className="higgs-workflow"
      ref={dialog}
      aria-labelledby="higgs-workflow-heading"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="higgs-workflow-heading">Higgsfield 제작 워크플로우</h2>
        <button type="button" aria-label="닫기" onClick={onClose}>
          닫기
        </button>
      </header>
      <div className="higgs-workflow-body">
        <label>
          제작 유형
          <select
            value={settings.format}
            onChange={(event) => {
              const format = event.target.value as WorkflowFormat;
              setSettings({ ...defaultWorkflow(format), idea: settings.idea });
            }}
          >
            {Object.entries(workflows).map(([key, item]) => (
              <option key={key} value={key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <p>
          {workflow.stages.join(" → ")}{" "}
          <a
            href={`https://higgsfield.ai/ko/@adilinthewildtempo/blogs/${workflow.article}`}
            target="_blank"
            rel="noreferrer"
          >
            제작 사례 열기 ↗
          </a>
        </p>
        <p>선택한 자료는 보드의 노드와 연결로 추가됩니다. 생성 입력으로 사용하기 전 파일과 모델 슬롯을 확인하세요. <a href="/guide#guide-production-skills" target="_blank" rel="noreferrer">워크플로우 사용 가이드 ↗</a></p>
        <label>
          {ad ? "제품·캠페인 브리프" : "작품 아이디어"}
          <textarea
            rows={2}
            maxLength={4000}
            value={settings.idea}
            onChange={(e) => setSettings({ ...settings, idea: e.target.value })}
          />
        </label>
        {settings.format === "drama" && (
          <DramaIdeaBank
            onChoose={(premise) => setSettings({ ...settings, premise })}
          />
        )}
        {settings.format === "drama" && settings.premise && (
          <p>
            기획 참조 · #{settings.premise.number} {settings.premise.title}{" "}
            <button
              type="button"
              onClick={() => setSettings({ ...settings, premise: undefined })}
            >
              해제
            </button>
          </p>
        )}
        <label>
          배역 이름
          <input
            value={cast}
            maxLength={160}
            onChange={(event) => {
              setCast(event.target.value);
              setSettings({ ...settings, sceneCast: undefined });
            }}
            placeholder="예: 윤서, 민우 (최대 4명)"
          />
        </label>
        {ad ? <><fieldset>
          <legend>패션 광고 구성</legend>
          <label>광고 씬 수
            <select value={ad.sceneCount} onChange={(event) => setSettings({ ...settings,
              ad: { ...ad, sceneCount: event.target.value === "auto" ? "auto" : Number(event.target.value) } })}>
              <option value="auto">시나리오에 맞춰 자동 결정</option>
              {Array.from({ length: MAX_SCENE_COUNT }, (_, index) =>
                <option key={index + 1} value={index + 1}>{index + 1}개</option>)}
            </select>
          </label>
          <label>광고 화면비
            <select value={ad.aspect} onChange={(event) => setSettings({ ...settings,
              ad: { ...ad, aspect: event.target.value as FashionAdSettings["aspect"] } })}>
              <option>16:9</option><option>9:16</option><option>1:1</option>
            </select>
          </label>
          <label className="higgs-option">
            <input type="checkbox" checked={settings.roomTour} onChange={(event) => setSettings({ ...settings, roomTour: event.target.checked })} />
            <span>공간·소품 배치 참고 노드</span>
          </label>
          <label className="higgs-option">
            <input type="checkbox" checked={ad.transitions} onChange={(event) => setSettings({
              ...settings, ad: { ...ad, transitions: event.target.checked },
            })} />
            <span>제품 렌즈 전환 계획 노드</span>
          </label>
          <p>참조와 씬별 테이크를 연결한 새 광고 작업 묶음을 추가합니다.</p>
        </fieldset>
        {ad.sceneCount !== "auto" && <details>
          <summary>광고 씬별 등장 배역</summary>
          <div className="higgs-idea-bank">
            <p>기본은 첫 배역입니다. 모두 해제하면 제품만 나오는 씬을 준비합니다.</p>
            {Array.from({ length: ad.sceneCount }, (_, index) => {
              const selected = settings.sceneCast?.[index] ?? [{ actor: 0, variant: false }];
              return <fieldset key={index + 1}>
                <legend>광고 씬 {index + 1}</legend>
                {names.slice(0, 4).map((name, actor) => (
                  <label className="higgs-option" key={name}>
                    <input type="checkbox" checked={selected.some((item) => item.actor === actor)} onChange={(event) => {
                      const next = selected.filter((item) => item.actor !== actor);
                      if (event.target.checked) next.push({ actor, variant: false });
                      setSettings({ ...settings, sceneCast: { ...settings.sceneCast, [index]: next } });
                    }} /> {name}
                  </label>
                ))}
              </fieldset>;
            })}
          </div>
        </details>}</> : <><fieldset>
          <legend>장면에 필요한 제작 자료</legend>
          {choices.map(([key, label, help]) => (
            <label key={key} className="higgs-option">
              <input
                type="checkbox"
                aria-describedby={`higgs-help-${key}`}
                title={help}
                checked={settings[key]}
                onChange={(e) =>
                  setSettings({ ...settings, [key]: e.target.checked })
                }
              />
              <span>
                {label}
                <small id={`higgs-help-${key}`}>{help}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <details>
          <summary>씬별 배역·상태와 참조 용도</summary>
          <div className="higgs-idea-bank">
            {workflow.stages.map((stage, index) => (
              <fieldset key={stage}>
                <legend>
                  씬 {index + 1} · {stage}
                </legend>
                {names.slice(0, 4).map((name, actor) => {
                  const active = settings.sceneCast?.[index] ?? [
                    { actor: index % names.length, variant: false },
                  ];
                  const member = active.find((item) => item.actor === actor);
                  return (
                    <label key={actor}>
                      {name}
                      <select
                        title={`${name}의 이 씬 출연과 참조 상태를 선택합니다. 기본 상태는 기준 이미지, 변형 상태는 별도 상태 시트를 연결합니다.`}
                        value={
                          member
                            ? member.variant && settings.states
                              ? "variant"
                              : "base"
                            : "off"
                        }
                        onChange={(event) => {
                          const next = active.filter(
                            (item) => item.actor !== actor,
                          );
                          if (event.target.value !== "off")
                            next.push({
                              actor,
                              variant: event.target.value === "variant",
                            });
                          setSettings({
                            ...settings,
                            sceneCast: { ...settings.sceneCast, [index]: next },
                          });
                        }}
                      >
                        <option value="off">등장하지 않음</option>
                        <option value="base">기본 상태</option>
                        {settings.states && (
                          <option value="variant">변형 상태</option>
                        )}
                      </select>
                    </label>
                  );
                })}
              </fieldset>
            ))}
            {settings.roomTour && (
              <label className="higgs-option">
                <input
                  type="checkbox"
                  aria-describedby="higgs-blocking-help"
                  title="블로킹 이미지를 연출 확인용에서 생성 입력으로 변경합니다."
                  checked={!!settings.blockingInput}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      blockingInput: event.target.checked,
                    })
                  }
                />
                <span>
                  블로킹 이미지를 생성 입력으로 사용
                  <small id="higgs-blocking-help">
                    해제하면 샷에서만 확인합니다. 선택하면 블로킹 이미지를 영상 노드 입력으로 연결합니다. 카메라는 샷 지시를 따릅니다.
                  </small>
                </span>
              </label>
            )}
            {settings.voices && (
              <label className="higgs-option">
                <input
                  type="checkbox"
                  aria-describedby="higgs-element-help"
                  title="배역 비디오를 영상 노드의 동작 참조 입력으로 연결합니다."
                  checked={!!settings.elementInput}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      elementInput: event.target.checked,
                    })
                  }
                />
                <span>
                  배역 비디오를 동작 입력으로 사용
                  <small id="higgs-element-help">
                    해제하면 샷에서만 확인합니다. 선택하면 배역별 비디오를 영상 노드의 동작 참조로 연결합니다. 파일을 첨부하고 모델 슬롯을 확인하세요.
                  </small>
                </span>
              </label>
            )}
          </div>
        </details></>}
        <details>
          <summary>
            장르별 추천 지침 확인·변경 ({settings.skills.length}개 선택)
          </summary>
          <ProductionGuidePicker
            kind="brief"
            selected={settings.skills}
            recommendedIds={[...workflow.guides]}
            onChange={(skills) => setSettings({ ...settings, skills })}
          />
        </details>
        {error && <p role="alert">{error}</p>}
      </div>
      <footer>
        <button
          type="button"
          onClick={() => {
            try {
              onApply(
                workflowBoard({ ...settings, cast: cast.split(/[,，\n]/) }),
              );
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "제작 보드를 추가하지 못했습니다.",
              );
            }
          }}
        >
          선택한 구성으로 노드 추가
        </button>
      </footer>
    </dialog>
  );
}
