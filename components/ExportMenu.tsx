"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  FileJson,
  Film,
  LoaderCircle,
  X,
} from "lucide-react";
import { isCutSource, type Asset, type Project } from "../lib/types";

type Props = {
  project: Project | null;
  onJson: () => void;
  onVideo: (nodeIds: string[]) => Promise<Asset>;
};

export default function ExportMenu({ project, onJson, onVideo }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "video">("menu");
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Asset | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const videoNodes = project?.graph.nodes.filter(isCutSource) || [];
  const orderedNodes = orderedIds.flatMap((id) => {
    const node = videoNodes.find((item) => item.id === id);
    return node ? [node] : [];
  });
  const currentSelection = orderedNodes.filter((node) =>
    selectedIds.includes(node.id),
  );

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    function closeOutside(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open]);

  function showVideo() {
    if (busy) return;
    const ids = videoNodes.map((node) => node.id);
    setOrderedIds(ids);
    setSelectedIds(ids.slice(0, 10));
    setError("");
    setResult(null);
    setView("video");
  }
  function move(id: string, step: number) {
    setOrderedIds((ids) => {
      const next = [...ids];
      const index = next.indexOf(id);
      const target = index + step;
      if (index < 0 || target < 0 || target >= next.length) return ids;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setResult(null);
  }
  async function exportVideo() {
    if (!currentSelection.length || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await onVideo(currentSelection.map((node) => node.id)));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "영상을 내보내지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="export-menu-wrap" ref={wrapper}>
      <button
        ref={trigger}
        className="export-button"
        aria-label="내보내기"
        title="캔버스를 JSON으로 저장하거나 고른 컷을 이 컴퓨터에서 MP4로 이어 붙입니다."
        aria-expanded={open}
        aria-controls="export-popover"
        onClick={() => {
          setOpen(!open);
          if (!busy) setView("menu");
        }}
        disabled={!project}
      >
        <ArrowDownToLine size={16} /> <span>내보내기</span>
      </button>
      {open && (
        <div
          className="export-popover"
          id="export-popover"
          aria-label="내보내기 메뉴"
        >
          <div className="export-head">
            <strong>{view === "menu" ? "내보내기" : "영상 내보내기"}</strong>
            <button
              className="icon-button"
              aria-label="내보내기 닫기"
              title="내보내기 메뉴를 닫습니다."
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <X size={17} />
            </button>
          </div>
          {view === "menu" ? (
            <div className="export-options">
              <button
                title="노드 본문·연결·자산 참조를 JSON 파일로 저장합니다."
                onClick={() => {
                  onJson();
                  setOpen(false);
                }}
              >
                <FileJson size={18} />
                <span>
                  <strong>프로젝트 JSON</strong>
                  <small>노드와 연결을 파일로 저장</small>
                </span>
              </button>
              <button
                title="파일이 첨부된 영상 노드와 재생 순서를 선택합니다."
                onClick={showVideo}
              >
                <Film size={18} />
                <span>
                  <strong>영상 내보내기</strong>
                  <small>장면을 이어 MP4 하나로 저장</small>
                </span>
              </button>
            </div>
          ) : (
            <div className="export-video">
              <p>영상이 첨부된 노드를 최대 10개 선택하고 순서를 정해 주세요.</p>
              {orderedNodes.length ? (
                <ol className="export-list">
                  {orderedNodes.map((node, index) => (
                    <li key={node.id}>
                      <label>
                        <input
                          type="checkbox"
                          title="이 컷을 최종 MP4에 포함하거나 제외합니다."
                          checked={selectedIds.includes(node.id)}
                          disabled={
                            busy ||
                            (!selectedIds.includes(node.id) &&
                              selectedIds.length >= 10)
                          }
                          onChange={(event) => {
                            setSelectedIds((ids) =>
                              event.target.checked
                                ? [...ids, node.id]
                                : ids.filter((id) => id !== node.id),
                            );
                            setResult(null);
                          }}
                        />
                        <span>{node.title || "제목 없는 영상"}</span>
                      </label>
                      <div>
                        <button
                          className="icon-button"
                          aria-label={`${node.title} 위로 이동`}
                          title="이 컷을 한 칸 앞으로 이동합니다."
                          disabled={index === 0 || busy}
                          onClick={() => move(node.id, -1)}
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`${node.title} 아래로 이동`}
                          title="이 컷을 한 칸 뒤로 이동합니다."
                          disabled={index === orderedNodes.length - 1 || busy}
                          onClick={() => move(node.id, 1)}
                        >
                          <ArrowDown size={16} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="export-empty">
                  영상 노드에 영상 파일을 먼저 첨부해 주세요.
                </p>
              )}
              {error && (
                <p className="export-error" role="alert">
                  {error}
                </p>
              )}
              {result && (
                <a
                  className="export-result"
                  title="완성된 영상을 이 컴퓨터에 내려받습니다."
                  href={result.url}
                  download={result.name}
                >
                  <ArrowDownToLine size={16} /> 완성된 MP4 내려받기
                </a>
              )}
              <button
                className="run-button"
                title="선택한 영상을 순서대로 합쳐 새 MP4를 만듭니다. 외부 생성 비용은 없습니다."
                disabled={!currentSelection.length || busy}
                onClick={() => void exportVideo()}
              >
                {busy && <LoaderCircle size={16} className="spin" />}
                {busy ? "영상 만드는 중" : "MP4 만들기"}
              </button>
              <button
                className="export-back"
                title="프로젝트 JSON과 영상 중 다시 선택합니다."
                onClick={() => setView("menu")}
                disabled={busy}
              >
                다른 내보내기 선택
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
