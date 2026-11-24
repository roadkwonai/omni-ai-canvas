"use client";

import { useRef, useState } from "react";
import type { Asset } from "../lib/types";
import "./image-layer-studio.css";

type Point = { x: number; y: number };
type Layer = { label: string; file: File } | { label: string; asset: Asset };
type Props = {
  projectId: string;
  sourceId: string;
  asset: Asset;
  title: string;
  onClose: () => void;
  onSave: (layers: Layer[], description: string) => Promise<boolean>;
};

export default function ImageLayerStudio({ projectId, sourceId, asset, title, onClose, onSave }: Props) {
  const image = useRef<HTMLImageElement>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [redo, setRedo] = useState<Point[]>([]);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      let layers: Layer[];
      if (points.length >= 3) {
        const source = image.current;
        if (!source?.naturalWidth || !source.naturalHeight) throw new Error("이미지를 불러오지 못했습니다.");
        if (source.naturalWidth * source.naturalHeight > 40000000) throw new Error("이미지가 너무 커서 분리할 수 없습니다.");
        const canvas = document.createElement("canvas");
        canvas.width = source.naturalWidth;
        canvas.height = source.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("이미지 편집을 시작할 수 없습니다.");
        const make = async (outside: boolean) => {
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.save();
          context.beginPath();
          if (outside) context.rect(0, 0, canvas.width, canvas.height);
          points.forEach((point, index) => {
            const x = point.x * canvas.width;
            const y = point.y * canvas.height;
            if (index === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          });
          context.closePath();
          context.clip("evenodd");
          context.drawImage(source, 0, 0);
          context.restore();
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
          if (!blob) throw new Error("레이어 파일을 만들지 못했습니다.");
          return new File([blob], outside ? "background.png" : "selection.png", { type: "image/png" });
        };
        layers = [
          { label: description.trim() || "선택 영역", file: await make(false) },
          { label: "나머지 영역", file: await make(true) },
        ];
      } else {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/image-layers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId, sourceUrl: asset.url, description }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "자동 분리에 실패했습니다.");
        if (!Array.isArray(result.layers) || result.layers.length < 2) throw new Error("분리된 레이어가 없습니다.");
        layers = result.layers;
      }
      if (!await onSave(layers, description.trim())) throw new Error("레이어를 저장하지 못했습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "레이어를 분리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="image-layer-studio" aria-label="레이어 편집">
    <header><div><h3 data-image-editor-heading tabIndex={-1}>레이어 편집</h3><p>{title}</p></div>
      <button type="button" className="studio-action" onClick={onClose} aria-label="레이어 편집 닫기">닫기</button></header>
    <p>이미지에서 분리할 영역을 순서대로 세 점 이상 선택하세요. 선택하지 않으면 전경을 자동으로 분리합니다.</p>
    <div className="image-layer-stage" onClick={(event) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      setPoints((current) => [...current, { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) }]);
      setRedo([]);
    }}>
      {/* The SVG viewBox uses normalized points so it follows the rendered image size. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={image} src={asset.url} alt="레이어를 선택할 원본 이미지" draggable={false} />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polygon points={points.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")} />
        {points.map((point, index) => <circle key={index} cx={point.x * 100} cy={point.y * 100} r="0.8" />)}
      </svg>
    </div>
    <div className="image-layer-actions">
      <button type="button" className="studio-action" disabled={!points.length || busy} onClick={() => { setRedo((current) => [...current, points[points.length - 1]]); setPoints((current) => current.slice(0, -1)); }}>실행 취소</button>
      <button type="button" className="studio-action" disabled={!redo.length || busy} onClick={() => { setPoints((current) => [...current, redo[redo.length - 1]]); setRedo((current) => current.slice(0, -1)); }}>다시 실행</button>
      <button type="button" className="studio-action" disabled={!points.length || busy} onClick={() => { setPoints([]); setRedo([]); }}>선택 지우기</button>
    </div>
    <label>레이어 이름 또는 설명<textarea value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} placeholder="예: 앞쪽 인물" /></label>
    <p>설명은 저장할 레이어 이름에 사용됩니다.</p>
    {error && <p role="alert">{error}</p>}
    <footer><button type="button" className="studio-action" onClick={onClose} disabled={busy}>취소</button>
      <button type="button" className="studio-action" data-tone="primary" disabled={busy || (points.length > 0 && points.length < 3)} onClick={() => void submit()}>{busy ? "분리 중" : points.length ? "선택 영역 분리" : "자동 분리"}</button></footer>
  </section>;
}
