"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { NodeToolbar, Position, useInternalNode, useStore, useViewport } from "@xyflow/react";
import { ArrowDownToLine, Camera, Grid3X3, Layers, Maximize, MoreHorizontal, Pencil, RotateCw, ScanLine, Smile, Sun, UserRound, type LucideIcon } from "lucide-react";
import { imageOperationLabels, type ImageOperation } from "../lib/image-operation";
import { imageEditKinds, type ImageEditKind } from "../lib/image-edit";
import type { CanvasNode } from "../lib/types";
import "./canvas-image-tools.css";

const shortcuts = [
  ["characterSheet", "캐릭터 설정도", UserRound],
  ["emotion", "감정", Smile],
  ["light", "조명", Sun],
  ["angle", "다각도", Camera],
  ["grid9", "9그리드", Grid3X3],
] as const satisfies readonly [ImageEditKind, string, LucideIcon][];

export const imageActionIcons: Record<ImageOperation, LucideIcon> = {
  layers: Layers, upscale: ScanLine, annotate: Pencil, rotate: RotateCw, download: ArrowDownToLine, preview: Maximize,
};

export default function CanvasImageTools({
  node, moving, editor, editorTitle, onCreate, onAction, onMore, onCloseEditor,
}: {
  node: CanvasNode;
  moving: boolean;
  editor?: ReactNode;
  editorTitle?: string;
  onCreate: (kind: ImageEditKind) => void;
  onAction: (kind: ImageOperation) => void;
  onMore: (trigger: HTMLElement) => void;
  onCloseEditor: () => void;
}) {
  const internal = useInternalNode(node.id);
  const viewport = useViewport();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const panel = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  // 새 노드는 측정되기 전에 null을 그리므로, 창이 생긴 뒤에 다시 열어야 한다.
  const editorOpen = Boolean(editor) && Boolean(internal);
  useEffect(() => {
    if (!editorOpen) return;
    const modal = dialog.current;
    if (modal && !modal.open) modal.showModal();
    const container = modal ?? panel.current;
    const frame = requestAnimationFrame(() => {
      (container?.querySelector<HTMLElement>("[data-image-editor-heading]") ?? container)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [editorOpen, editorTitle, node.id]);

  if (!internal) return null;
  const measuredWidth = (internal.measured.width ?? 0) * viewport.zoom;
  const left = internal.internals.positionAbsolute.x * viewport.zoom + viewport.x;
  const top = internal.internals.positionAbsolute.y * viewport.zoom + viewport.y;
  const bottom = top + (internal.measured.height ?? 0) * viewport.zoom;
  const center = left + measuredWidth / 2;
  const margin = 12;
  const compact = width < 910;
  const condensed = width < 530;
  const toolWidth = Math.min(width - 2 * margin, condensed ? 240 : compact ? 520 : 870);
  function actionButton(kind: ImageOperation, withLabel = false) {
    const Icon = imageActionIcons[kind];
    return <button className="studio-action" type="button" key={kind} aria-label={imageOperationLabels[kind]}
      title={imageOperationLabels[kind]} onClick={() => onAction(kind)}>
      <Icon size={16} aria-hidden="true" />{withLabel && !compact && <span>{imageOperationLabels[kind]}</span>}
    </button>;
  }
  const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, Math.max(low, high)));
  const toolbarOffset = clamp(center - toolWidth / 2, margin, width - toolWidth - margin) + toolWidth / 2 - center;
  const above = top >= 64 || bottom > height - 64;
  const panelWidth = Math.min(656, width - 2 * margin);
  const maxPanelHeight = Math.max(110, Math.min(height * 0.75, height - 2 * margin, 680));
  const belowRoom = height - bottom - 2 * margin;
  const aboveRoom = top - 2 * margin - (node.asset?.type === "image" ? 55 : 0);
  const placeAbove = belowRoom < 295 && aboveRoom > belowRoom;
  const available = placeAbove ? aboveRoom : belowRoom;
  const hasRoom = available >= 270;
  const panelHeight = hasRoom ? Math.min(available, maxPanelHeight) : maxPanelHeight;
  const panelLeft = clamp(center - panelWidth / 2, margin, width - panelWidth - margin);
  const panelTop = placeAbove && hasRoom ? margin : clamp(bottom + margin, margin, height - panelHeight - margin);
  const inView = bottom > 0 && top < height && left + measuredWidth > 0 && left < width;

  return <>
    {!moving && inView && node.asset?.type === "image" && toolWidth > 0 &&
      <NodeToolbar nodeId={node.id} isVisible position={above ? Position.Top : Position.Bottom}
        offset={9} style={{ marginInlineStart: toolbarOffset, width: toolWidth }}
        className="canvas-image-toolbar nodrag nopan nowheel">
        <div role="group" aria-label="이미지 편집 도구">
          {actionButton("layers", true)}
          {actionButton("upscale", true)}
          {(condensed ? shortcuts.slice(0, 2) : shortcuts).map(([kind, label, Icon]) => (
            <button key={kind} type="button" className="studio-action" aria-label={imageEditKinds[kind]}
              title={imageEditKinds[kind]} onClick={() => onCreate(kind)}>
              <Icon size={16} aria-hidden="true" />{!compact && <span>{label}</span>}
            </button>
          ))}
          <button type="button" className="studio-action" aria-label="이미지 편집 더보기"
            title="이미지 편집 더보기" aria-haspopup="menu" onClick={(event) => onMore(event.currentTarget)}>
            <MoreHorizontal size={17} aria-hidden="true" />{!compact && <span>더보기</span>}
          </button>
          {!condensed && <div className="canvas-image-utilities">
            {(["annotate", "rotate", "download", "preview"] as const).map((kind) => actionButton(kind))}
          </div>}
        </div>
      </NodeToolbar>}
    {editorOpen && (editorTitle ? <dialog ref={dialog} aria-label={editorTitle}
      className="canvas-image-editor canvas-image-editor-dialog nodrag nopan nowheel"
      onCancel={(event) => {
        event.preventDefault();
        event.currentTarget.close();
        onCloseEditor();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onPaste={(event) => event.stopPropagation()}>
      {editor}
    </dialog> : <div ref={panel} role="region" aria-label="선택 노드 연출 편집" tabIndex={-1}
      className="canvas-image-editor nodrag nopan nowheel"
      style={{ left: panelLeft, top: panelTop, width: panelWidth, maxHeight: panelHeight }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          onCloseEditor();
        }
      }} onPaste={(event) => event.stopPropagation()}>
      {editor}
    </div>)}
  </>;
}
