"use client";

import { useEffect, useRef, useState } from "react";
import {
  defaultPortraitKit,
  makePortraitGraph,
  portraitOptions,
  type PortraitKit,
} from "../lib/portrait-kit";
import type { Graph } from "../lib/types";
import "./portrait-kit-studio.css";

type Props = { onClose: () => void; onApply: (graph: Graph) => void };
const fields = [
  ["pose", "포즈와 동작"],
  ["costume", "의상"],
  ["expression", "표정과 감정 연기"],
  ["lighting", "조명"],
  ["camera", "카메라 시점"],
  ["texture", "피부와 화면 질감"],
] as const;

export default function PortraitKitStudio({ onClose, onApply }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<PortraitKit>({ ...defaultPortraitKit });
  const [error, setError] = useState("");

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function apply() {
    try {
      onApply(makePortraitGraph(draft));
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "캐릭터 보드를 추가하지 못했습니다.",
      );
    }
  }

  return (
    <dialog
      ref={dialog}
      className="portrait-kit"
      aria-labelledby="portrait-kit-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <h2 id="portrait-kit-title">캐릭터 연출 키트</h2>
          <p>
            인물, 포즈와 의상을 조합해 제작에 필요한 참조와 샷을 준비합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="캐릭터 연출 키트 닫기"
        >
          ✕
        </button>
      </header>
      <div className="portrait-kit-content">
        <div className="portrait-kit-identity">
          <label>
            캐릭터 이름
            <input
              maxLength={80}
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </label>
          <label>
            고정할 인물 특징
            <textarea
              rows={3}
              maxLength={500}
              value={draft.identity}
              onChange={(event) =>
                setDraft({ ...draft, identity: event.target.value })
              }
            />
          </label>
        </div>
        <div className="portrait-kit-fields">
          {fields.map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <select
                value={
                  portraitOptions[key].some((option) => option === draft[key])
                    ? draft[key]
                    : ""
                }
                onChange={(event) => {
                  if (event.target.value)
                    setDraft({ ...draft, [key]: event.target.value });
                }}
              >
                <option value="">직접 입력</option>
                {portraitOptions[key].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <textarea
                aria-label={`${label} 직접 편집`}
                maxLength={500}
                rows={2}
                value={draft[key]}
                onChange={(event) =>
                  setDraft({ ...draft, [key]: event.target.value })
                }
              />
            </label>
          ))}
        </div>
        <fieldset>
          <legend>함께 만들 자료</legend>
          <label>
            <input
              type="checkbox"
              checked={draft.turnaround}
              onChange={(event) =>
                setDraft({ ...draft, turnaround: event.target.checked })
              }
            />{" "}
            정면·측면·후면 3면도
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.storyboard}
              onChange={(event) =>
                setDraft({ ...draft, storyboard: event.target.checked })
              }
            />{" "}
            25컷 스토리보드와 키프레임
          </label>
          <p>
            인물, 포즈와 의상 이미지를 각각 참조 노드에 추가한 뒤 이미지
            모델에서 생성합니다.
          </p>
        </fieldset>
        <details>
          <summary>포즈·의상·얼굴 참조 찾기</summary>
          <p>
            원하는 이미지를 개별적으로 선택해 저장한 뒤 해당 참조 노드에
            첨부하세요.
          </p>
          <ul>
            <li>
              <a
                href="https://ai-pose-gallery.pages.dev/"
                target="_blank"
                rel="noreferrer"
              >
                포즈 갤러리
              </a>
            </li>
            <li>
              <a
                href="https://wavespeed.ai/free-tools/ai-pose-gallery/glamour"
                target="_blank"
                rel="noreferrer"
              >
                WaveSpeed 포즈 갤러리
              </a>
            </li>
            <li>
              <a
                href="https://ai-costume-gallery.pages.dev/"
                target="_blank"
                rel="noreferrer"
              >
                의상 갤러리
              </a>
            </li>
            <li>
              <a
                href="https://ai-portrait-gallery.pages.dev/"
                target="_blank"
                rel="noreferrer"
              >
                얼굴 참조 갤러리
              </a>
            </li>
          </ul>
        </details>
        {error && (
          <p className="portrait-kit-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer>
        <span>
          {draft.storyboard
            ? "25컷과 키프레임을 보드에 추가합니다."
            : "참조와 기준 이미지를 보드에 추가합니다."}
        </span>
        <button type="button" onClick={apply}>
          캐릭터 보드 추가
        </button>
      </footer>
    </dialog>
  );
}
