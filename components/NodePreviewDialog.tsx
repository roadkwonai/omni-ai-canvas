"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Grip, RotateCcw, X } from "lucide-react";
import type { Asset } from "@/lib/types";
import NodePreviewBody from "./NodePreviewBody";
import type { ApplyPrompt } from "./NodePromptPair";
import type { PromptVersions } from "@/lib/node-prompt";
import "./node-document-dialog.css";
import "./node-preview.css";
import "./node-preview-dialog-size.css";

type PreviewSize = { width: number; height: number };
const sizeKey = "scene-room-preview-size-v1";

function readSize(): PreviewSize | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(sizeKey) || "null");
    if (value && Number.isFinite(value.width) && Number.isFinite(value.height) &&
      value.width >= 1 && value.height >= 1 && value.width <= 10000 && value.height <= 10000)
      return { width: value.width, height: value.height };
  } catch {
    // Storage may be unavailable or contain an obsolete value.
  }
  return null;
}

function constrainSize(size: PreviewSize): PreviewSize {
  const maxWidth = Math.max(1, window.innerWidth - 16);
  const maxHeight = Math.max(1, window.innerHeight - 16);
  return {
    width: Math.round(Math.min(maxWidth, Math.max(Math.min(320, maxWidth), size.width))),
    height: Math.round(Math.min(maxHeight, Math.max(Math.min(280, maxHeight), size.height))),
  };
}

function saveSize(size: PreviewSize | null) {
  try {
    if (size) window.localStorage.setItem(sizeKey, JSON.stringify(size));
    else window.localStorage.removeItem(sizeKey);
  } catch {
    // The current dialog remains resizable without storage.
  }
}

export default function NodePreviewDialog({ title, body, asset, missingAssetType, kindLabel, trigger, promptKorean, initiallyEditing, onApplyPrompt, onClose }: {
  title: string;
  body: string;
  asset?: Asset;
  missingAssetType: Asset["type"];
  kindLabel: string;
  trigger?: HTMLElement;
  promptKorean?: PromptVersions["promptKorean"];
  initiallyEditing?: boolean;
  onApplyPrompt?: ApplyPrompt;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [size, setSize] = useState<PreviewSize | null>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; size: PreviewSize } | null>(null);

  useEffect(() => {
    const modal = dialog.current;
    if (modal && !modal.open) modal.showModal();
    const frame = requestAnimationFrame(() => {
      const stored = readSize();
      if (stored) setSize(constrainSize(stored));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <dialog ref={dialog} className="node-document-dialog node-preview-dialog" aria-labelledby={`${id}-title`}
      style={size ? { "--node-preview-width": `${size.width}px`, "--node-preview-height": `${size.height}px` } as CSSProperties : undefined}
      onClose={() => {
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
        onClose();
      }}>
      <header className="node-document-header">
        <div>
          <p>{kindLabel}</p>
          <h2 id={`${id}-title`}>{title || "제목 없는 노드"}</h2>
        </div>
        <button type="button" className="studio-action" data-tone="quiet" data-size="icon" aria-label="노드 미리보기 닫기"
          onClick={() => dialog.current?.close()}><X size={18} aria-hidden="true" /></button>
      </header>
      <div className="node-document-viewport" role="region" aria-label="노드 미리보기 내용" tabIndex={0}>
        <NodePreviewBody title={title} body={body} asset={asset} missingAssetType={missingAssetType}
          promptKorean={promptKorean} initiallyEditing={initiallyEditing} onApplyPrompt={onApplyPrompt} />
      </div>
      <footer className="node-preview-size-controls">
        <button type="button" className="studio-action" onClick={() => {
          setSize(null);
          saveSize(null);
        }}><RotateCcw size={15} aria-hidden="true" /> 기본 크기</button>
        <button type="button" className="studio-action node-preview-resize" aria-label="미리보기 창 크기 조절"
          title="드래그하거나 방향키로 창 크기를 조절합니다."
          onPointerDown={(event) => {
            const modal = dialog.current;
            if (!modal || !event.isPrimary || event.button !== 0) return;
            const bounds = modal.getBoundingClientRect();
            drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
              size: { width: bounds.width, height: bounds.height } };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start || start.pointerId !== event.pointerId) return;
            setSize(constrainSize({ width: start.size.width + 2 * (event.clientX - start.x),
              height: start.size.height + 2 * (event.clientY - start.y) }));
          }}
          onPointerUp={(event) => {
            if (drag.current?.pointerId !== event.pointerId) return;
            const start = drag.current;
            drag.current = null;
            const next = constrainSize({ width: start.size.width + 2 * (event.clientX - start.x),
              height: start.size.height + 2 * (event.clientY - start.y) });
            setSize(next);
            saveSize(next);
          }}
          onPointerCancel={() => { drag.current = null; }}
          onKeyDown={(event) => {
            const delta: Record<string, [number, number]> = {
              ArrowLeft: [-40, 0], ArrowRight: [40, 0], ArrowUp: [0, -40], ArrowDown: [0, 40],
            };
            const change = delta[event.key];
            const bounds = dialog.current?.getBoundingClientRect();
            if (!change || !bounds) return;
            event.preventDefault();
            event.stopPropagation();
            const next = constrainSize({ width: bounds.width + change[0], height: bounds.height + change[1] });
            setSize(next);
            saveSize(next);
          }}>
          <Grip size={17} aria-hidden="true" /> 크기 조절
        </button>
      </footer>
    </dialog>
  );
}
