"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Asset, Project } from "../lib/types";
import {
  parseMotionShort,
  scenesFromBeats,
  motionRecipes,
  type MotionRecipe,
  type MotionShortSpec,
} from "../lib/motion-short-spec";
import type { StylePresetDraft } from "../lib/style-preset-core";
import "./motion-short-studio.css";

type Props = {
  project: Project;
  activePreset?: StylePresetDraft;
  initialSpec?: MotionShortSpec;
  directorPanel?: (apply: (spec: MotionShortSpec) => void) => ReactNode;
  onClose: () => void;
  onRendered: (
    asset: Asset,
    title: string,
    spec: MotionShortSpec,
    sourceNodeId?: string,
  ) => void;
};

const initialSpec: MotionShortSpec = {
  scenes: [{ text: "첫 장면의 문구를 입력하세요", seconds: 3 }],
  aspect: "9:16",
  background: "#18191d",
  foreground: "#ffffff",
  layout: "center",
  motion: "fade",
};

export default function MotionShortStudio({
  project,
  activePreset,
  initialSpec: savedSpec,
  directorPanel,
  onClose,
  onRendered,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [spec, setSpec] = useState<MotionShortSpec>(
    () => parseMotionShort(savedSpec) ?? structuredClone(initialSpec),
  );
  const [sourceId, setSourceId] = useState("");
  const [appliedSourceId, setAppliedSourceId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cacheReport, setCacheReport] = useState<{ reused: number[]; rendered: number[] } | null>(null);
  const [result, setResult] = useState<{
    asset: Asset;
    spec: MotionShortSpec;
    sourceNodeId?: string;
  } | null>(null);
  const [added, setAdded] = useState(false);
  const beats = activePreset?.beats ?? [];
  const [selectedBeats, setSelectedBeats] = useState<number[]>(() =>
    beats.slice(0, 8).map((_, index) => index),
  );
  const [showBeatPreview, setShowBeatPreview] = useState(false);
  const previewScenes = scenesFromBeats(beats, selectedBeats);
  const sources = project.graph.nodes.filter(
    (node) =>
      ["script", "scene", "scenario", "brief", "shot"].includes(node.kind) &&
      node.body.trim(),
  );
  const imageSources = project.graph.nodes.filter(
    (node) => node.asset?.type === "image",
  );
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function update(next: MotionShortSpec) {
    setSpec(next);
    setResult(null);
    setAdded(false);
  }

  function useSource() {
    const source = sources.find((node) => node.id === sourceId);
    if (!source) return;
    const text = source.body
      .replace(/^\s*#{1,6}\s*/gm, "")
      .trim()
      .slice(0, 100);
    update({ ...spec, scenes: [{ text, seconds: 3 }] });
    setAppliedSourceId(source.id);
  }

  async function render() {
    const prepared = parseMotionShort(spec);
    if (!prepared) {
      setError(
        "문구, 이미지와 길이를 확인해 주세요. 장면은 1~48개, 장면당 1~30초, 전체 10분까지 가능합니다.",
      );
      return;
    }
    setBusy(true);
    setResult(null);
    setAdded(false);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/motion-short`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: project.version, spec: prepared }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "모션 영상을 만들지 못했습니다.");
      setCacheReport(data.scenes ?? null);
      setResult({
        asset: data.asset as Asset,
        spec: prepared,
        sourceNodeId: appliedSourceId,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "모션 영상을 만들지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="motion-short"
      aria-labelledby="motion-short-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <div>
          <h2 id="motion-short-title">모션그래픽 제작</h2>
          <p>장면별 디자인과 움직임을 정해 이 컴퓨터에서 MP4를 만듭니다.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="모션 숏 닫기"
        >
          ✕
        </button>
      </header>
      <fieldset disabled={busy}>
        {directorPanel?.((candidate) => {
          const validated = parseMotionShort(candidate);
          if (!validated) {
            setError("에이전트가 제안한 장면 설정을 확인해 주세요.");
            return;
          }
          update(validated);
          setAppliedSourceId(undefined);
          setError("");
        })}
        {activePreset && beats.length > 0 && (
          <section
            className="motion-short-preset"
            aria-labelledby="motion-short-preset-title"
          >
            <h3 id="motion-short-preset-title">
              프리셋 구간 가져오기 · {activePreset.name}
            </h3>
            <p>
              구간을 최대 24개 선택하세요. 선택한 구간의 비율을 약 24초에 맞추고
              각 장면을 1~8초로 조정합니다. 문구는 직접 작성합니다.
            </p>
            {beats.length > 8 && (
              <p>
                처음 8개 구간이 선택되어 있습니다. 필요한 구간을 추가로
                선택하세요.
              </p>
            )}
            <div className="motion-short-beats">
              {beats.map((beat, index) => (
                <label key={index}>
                  <input
                    type="checkbox"
                    checked={selectedBeats.includes(index)}
                    disabled={
                      !selectedBeats.includes(index) &&
                      selectedBeats.length >= 24
                    }
                    onChange={(event) => {
                      setSelectedBeats((current) =>
                        event.target.checked
                          ? [...current, index]
                          : current.filter((value) => value !== index),
                      );
                      setShowBeatPreview(false);
                    }}
                  />
                  <span>
                    {index ? beats[index - 1].endPercent : 0}–{beat.endPercent}%
                    · {beat.label || `구간 ${index + 1}`}
                    {beat.framing && <small>구도 · {beat.framing}</small>}
                    {beat.caption && <small>자막 지침 · {beat.caption}</small>}
                  </span>
                </label>
              ))}
            </div>
            <p>
              프리셋 자막 · {activePreset.style.captions || "설정 없음"}
              <br />
              프리셋 화면 구성 · {activePreset.style.layout || "설정 없음"}
            </p>
            <button
              type="button"
              disabled={!previewScenes.length}
              onClick={() => setShowBeatPreview(true)}
            >
              선택 구간 미리보기
            </button>
            {showBeatPreview && previewScenes.length > 0 && (
              <div className="motion-short-preset-preview">
                <p>
                  {previewScenes.length}개 장면 · 총{" "}
                  {previewScenes.reduce((sum, scene) => sum + scene.seconds, 0)}
                  초
                </p>
                <ol>
                  {[...selectedBeats]
                    .sort((a, b) => a - b)
                    .map((index, position) => (
                      <li key={index}>
                        {beats[index].label || `구간 ${index + 1}`} ·{" "}
                        {previewScenes[position].seconds}초
                      </li>
                    ))}
                </ol>
                <button
                  type="button"
                  onClick={() => {
                    const directions = `${activePreset.style.layout} ${activePreset.style.composition}`;
                    const aspect = /9\s*:\s*16|세로/.test(directions)
                      ? "9:16"
                      : /16\s*:\s*9|가로/.test(directions)
                        ? "16:9"
                        : spec.aspect;
                    update({ ...spec, scenes: previewScenes, aspect });
                    setAppliedSourceId(undefined);
                    setShowBeatPreview(false);
                    setError("");
                  }}
                >
                  장면 편집기에 반영
                </button>
              </div>
            )}
          </section>
        )}
        <div className="motion-short-source">
          <label>
            대본·씬에서 시작
            <select
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}
            >
              <option value="">노드를 선택하세요</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.title}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={useSource} disabled={!sourceId}>
            문구 가져오기
          </button>
        </div>
        <div className="motion-short-scenes">
          {spec.scenes.map((scene, index) => (
            <div key={index} className="motion-short-scene">
              <label>
                장면 {index + 1} 디자인
                <select
                  value={scene.recipe ?? "type"}
                  onChange={(event) => {
                    const recipe = event.target.value as MotionRecipe;
                    update({
                      ...spec,
                      scenes: spec.scenes.map((item, i) => {
                        if (i !== index) return item;
                        const next = { ...item, recipe };
                        if (recipe !== "parallax" && recipe !== "character")
                          delete next.image;
                        if (recipe !== "character") delete next.character;
                        return next;
                      }),
                    });
                  }}
                >
                  {Object.entries(motionRecipes).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                장면 {index + 1} 문구
                <textarea
                  value={scene.text}
                  placeholder="영상에 표시할 문구를 입력하세요"
                  maxLength={100}
                  rows={2}
                  onChange={(event) =>
                    update({
                      ...spec,
                      scenes: spec.scenes.map((item, i) =>
                        i === index
                          ? { ...item, text: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </label>
              <label>
                길이 (초)
                <input
                  type="number"
                  min="1"
                  max="30"
                  step="0.5"
                  value={scene.seconds}
                  onChange={(event) =>
                    update({
                      ...spec,
                      scenes: spec.scenes.map((item, i) =>
                        i === index
                          ? { ...item, seconds: Number(event.target.value) }
                          : item,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                disabled={spec.scenes.length === 1}
                onClick={() =>
                  update({
                    ...spec,
                    scenes: spec.scenes.filter((_, i) => i !== index),
                  })
                }
                aria-label={`장면 ${index + 1} 삭제`}
              >
                삭제
              </button>
              {scene.recipe === "number" && (
                <label>
                  수치 (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={scene.value ?? 70}
                    onChange={(event) =>
                      update({
                        ...spec,
                        scenes: spec.scenes.map((item, i) =>
                          i === index
                            ? { ...item, value: Number(event.target.value) }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
              )}
              {scene.recipe === "steps" && (
                <label className="motion-short-detail">
                  단계 이름 (슬래시로 구분)
                  <input
                    maxLength={120}
                    value={scene.detail ?? ""}
                    placeholder="준비 / 실행 / 완성"
                    onChange={(event) =>
                      update({
                        ...spec,
                        scenes: spec.scenes.map((item, i) =>
                          i === index
                            ? { ...item, detail: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
              )}
              {scene.recipe !== "steps" && (
                <label className="motion-short-detail">
                  보조 문구
                  <input
                    maxLength={120}
                    value={scene.detail ?? ""}
                    onChange={(event) =>
                      update({
                        ...spec,
                        scenes: spec.scenes.map((item, i) =>
                          i === index
                            ? { ...item, detail: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
              )}
              {scene.recipe === "character" && (
                <label className="motion-short-detail">
                  캐릭터 이미지 · 투명 PNG 권장
                  <select
                    value={scene.character?.url ?? ""}
                    onChange={(event) => {
                      const character = imageSources.find(
                        (item) => item.asset?.url === event.target.value,
                      )?.asset;
                      update({
                        ...spec,
                        scenes: spec.scenes.map((item, i) => {
                          if (i !== index) return item;
                          const next = { ...item };
                          if (character) next.character = character;
                          else delete next.character;
                          return next;
                        }),
                      });
                    }}
                  >
                    <option value="">캐릭터 이미지 노드를 선택하세요</option>
                    {imageSources.map((node) => (
                      <option key={node.id} value={node.asset!.url}>
                        {node.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(scene.recipe === "parallax" ||
                scene.recipe === "character") && (
                <label className="motion-short-detail">
                  {scene.recipe === "character"
                    ? "배경 이미지 · 선택"
                    : "프로젝트 이미지"}
                  <select
                    value={scene.image?.url ?? ""}
                    onChange={(event) => {
                      const image = imageSources.find(
                        (item) => item.asset?.url === event.target.value,
                      )?.asset;
                      update({
                        ...spec,
                        scenes: spec.scenes.map((item, i) => {
                          if (i !== index) return item;
                          const next = { ...item };
                          if (image) next.image = image;
                          else delete next.image;
                          return next;
                        }),
                      });
                    }}
                  >
                    <option value="">이미지 노드를 선택하세요</option>
                    {imageSources.map((node) => (
                      <option key={node.id} value={node.asset!.url}>
                        {node.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          ))}
          <button
            type="button"
            disabled={spec.scenes.length >= 48}
            onClick={() =>
              update({
                ...spec,
                scenes: [...spec.scenes, { text: "", seconds: 3 }],
              })
            }
          >
            + 장면 추가
          </button>
          <p>
            장면당 1~30초, 최대 48장면 · 전체 10분까지 가능합니다. 장면을 차례로 렌더해 MP4 하나로 합칩니다.
          </p>
        </div>
        <div className="motion-short-options">
          <label>
            화면 비율
            <select
              value={spec.aspect}
              onChange={(event) =>
                update({
                  ...spec,
                  aspect: event.target.value as MotionShortSpec["aspect"],
                })
              }
            >
              <option value="9:16">세로 9:16</option>
              <option value="16:9">가로 16:9</option>
            </select>
          </label>
          <label>
            문구 배치
            <select
              value={spec.layout}
              onChange={(event) =>
                update({
                  ...spec,
                  layout: event.target.value as MotionShortSpec["layout"],
                })
              }
            >
              <option value="center">가운데</option>
              <option value="left">왼쪽</option>
            </select>
          </label>
          <label>
            움직임
            <select
              value={spec.motion}
              onChange={(event) =>
                update({
                  ...spec,
                  motion: event.target.value as MotionShortSpec["motion"],
                })
              }
            >
              <option value="fade">페이드</option>
              <option value="zoom">서서히 확대</option>
              <option value="rise">위로 이동</option>
            </select>
          </label>
          <label>
            배경색
            <input
              type="color"
              value={spec.background}
              onChange={(event) =>
                update({ ...spec, background: event.target.value })
              }
            />
          </label>
          <label>
            강조색
            <input
              type="color"
              value={spec.accent ?? "#ff6600"}
              onChange={(event) =>
                update({ ...spec, accent: event.target.value })
              }
            />
          </label>
          <label>
            움직임 속도
            <select
              value={spec.easing ?? "smooth"}
              onChange={(event) =>
                update({
                  ...spec,
                  easing: event.target.value as MotionShortSpec["easing"],
                })
              }
            >
              <option value="smooth">부드럽게</option>
              <option value="snappy">빠르게</option>
            </select>
          </label>
          <label>
            글자색
            <input
              type="color"
              value={spec.foreground}
              onChange={(event) =>
                update({ ...spec, foreground: event.target.value })
              }
            />
          </label>
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="motion-short-error">
          {error}
        </p>
      )}
      <button
        type="button"
        className="motion-short-primary"
        onClick={render}
        disabled={busy}
      >
        {busy ? "장면을 순서대로 렌더하고 있습니다…" : "모션그래픽 만들기"}
      </button>
      {result && (
        <section className="motion-short-result">
          <h3>완성 영상</h3>
          {cacheReport && <p>새로 렌더한 장면 {cacheReport.rendered.join(", ") || "없음"} · 재사용한 장면 {cacheReport.reused.join(", ") || "없음"}</p>}
          <video controls src={result.asset.url} />
          <button
            type="button"
            disabled={added}
            onClick={() => {
              try {
                onRendered(
                  result.asset,
                  "모션그래픽 숏",
                  result.spec,
                  result.sourceNodeId,
                );
                setError("");
                setAdded(true);
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "영상 노드를 추가하지 못했습니다.",
                );
              }
            }}
          >
            {added ? "캔버스에 추가됨" : "영상 노드로 추가"}
          </button>
        </section>
      )}
    </dialog>
  );
}
