"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import type { Asset } from "@/lib/types";
import "./image-preview-dialog.css";

export default function ImagePreviewDialog({ asset, title, onClose, trigger }: {
  asset: Asset;
  title: string;
  onClose: () => void;
  trigger?: HTMLButtonElement;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>();
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const modal = dialog.current;
    if (modal && !modal.open) modal.showModal();
  }, []);

  return (
    <dialog ref={dialog} className="image-preview-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onCancel={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}
      onClose={(event) => {
        event.stopPropagation();
        trigger?.focus({ preventScroll: true });
        onClose();
      }}>
      <header className="image-preview-header">
        <div>
          <h2 id={`${id}-title`}>이미지 미리보기</h2>
          <p id={`${id}-description`}>{title}{dimensions && ` · ${dimensions.width} × ${dimensions.height}`}</p>
        </div>
        <button type="button" className="studio-action" data-tone="quiet" data-size="icon" aria-label="이미지 미리보기 닫기"
          onClick={() => dialog.current?.close()}><X size={18} aria-hidden="true" /></button>
      </header>
      <div className="image-preview-viewport" role="region" aria-label="미리보기 이미지" tabIndex={zoom > 1 ? 0 : undefined}>
        {failed ? <p role="alert">이미지를 불러오지 못했습니다.</p> :
          <Image src={asset.url} alt={title} width={dimensions?.width ?? 640} height={dimensions?.height ?? 480}
            unoptimized loading="eager" draggable={false} onError={() => setFailed(true)}
            onLoad={({ currentTarget: img }) => setDimensions({ width: img.naturalWidth, height: img.naturalHeight })}
            style={{
              "--preview-aspect": dimensions ? dimensions.width / dimensions.height : 4 / 3,
              "--preview-zoom": zoom,
            } as CSSProperties} />}
      </div>
      <footer className="image-preview-controls">
        <label>
          <span>확대</span>
          <input type="range" min="0.5" max="3" step="0.25" value={zoom} disabled={!dimensions}
            aria-valuetext={`${Math.round(zoom * 100)}%`} onChange={(event) => setZoom(Number(event.target.value))} />
        </label>
        <output aria-hidden="true">{Math.round(zoom * 100)}%</output>
        <button type="button" className="studio-action" disabled={zoom === 1} onClick={() => setZoom(1)}>화면 맞춤</button>
      </footer>
    </dialog>
  );
}
