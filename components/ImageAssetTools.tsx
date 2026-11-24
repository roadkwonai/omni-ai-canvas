"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, RotateCw, Undo2, Redo2, X } from "lucide-react";
import type { Asset } from "../lib/types";
import type { RotationOptions } from "../lib/image-operation";
import "./image-asset-tools.css";

type ImageAssetTool = "annotate" | "rotate";
type Point = { x: number; y: number };
type Stroke = { kind: "pen" | "rectangle" | "text"; color: string; width: number; points: Point[]; text?: string };

export default function ImageAssetTools({ tool, asset, title, initialRotation, onClose, onSave }: {
  tool: ImageAssetTool;
  asset: Asset;
  title: string;
  onClose: () => void;
  initialRotation?: RotationOptions;
  onSave: (file: File, rotation?: RotationOptions) => Promise<boolean>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const active = useRef<Stroke | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [angle, setAngle] = useState(initialRotation?.angle ?? 0);
  const [flipX, setFlipX] = useState(initialRotation?.flipX ?? false);
  const [flipY, setFlipY] = useState(initialRotation?.flipY ?? false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redo, setRedo] = useState<Stroke[]>([]);
  const [color, setColor] = useState("#e14d00");
  const [drawingTool, setDrawingTool] = useState<Stroke["kind"]>("pen");
  const [text, setText] = useState("");
  const [width, setWidth] = useState(4);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const modal = dialog.current;
    modal?.showModal();
    return () => {
      modal?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      image.current = img;
      setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => setError("이미지를 불러오지 못했습니다.");
    img.src = asset.url;
    return () => { img.onload = null; img.onerror = null; image.current = null; };
  }, [asset.url]);
  useEffect(() => {
    const target = canvas.current;
    const img = image.current;
    if (!target || !img) return;
    const radians = angle * Math.PI / 180;
    const sin = Math.abs(Math.sin(radians));
    const cos = Math.abs(Math.cos(radians));
    target.width = Math.ceil(img.naturalWidth * cos + img.naturalHeight * sin - 1e-10);
    target.height = Math.ceil(img.naturalWidth * sin + img.naturalHeight * cos - 1e-10);
    const ctx = target.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.translate(target.width / 2, target.height / 2);
    ctx.rotate(radians);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();
    for (const stroke of strokes) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (stroke.kind === "text") {
        ctx.font = `${Math.max(18, stroke.width * 5)}px sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillStyle = stroke.color;
        ctx.fillText(stroke.text ?? "", stroke.points[0].x, stroke.points[0].y);
        continue;
      }
      if (stroke.kind === "rectangle") {
        const [first, last = first] = stroke.points;
        ctx.setLineDash([stroke.width * 3, stroke.width * 2]);
        ctx.strokeRect(first.x, first.y, last.x - first.x, last.y - first.y);
        ctx.setLineDash([]);
        continue;
      }
      ctx.beginPath();
      stroke.points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      if (stroke.points.length === 1) ctx.lineTo(stroke.points[0].x + 0.01, stroke.points[0].y);
      ctx.stroke();
    }
  }, [angle, flipX, flipY, strokes, dimensions, tool]);

  function point(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * event.currentTarget.width / rect.width, y: (event.clientY - rect.top) * event.currentTarget.height / rect.height };
  }
  function addPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!active.current) return;
    const next = { ...active.current, points: active.current.kind === "rectangle"
      ? [active.current.points[0], point(event)] : [...active.current.points, point(event)] };
    active.current = next;
    setStrokes(items => [...items.slice(0, -1), next]);
  }
  async function save() {
    const target = canvas.current;
    if (!target) return;
    setSaving(true);
    setError("");
    try {
      const blob = await new Promise<Blob | null>(resolve => target.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("이미지를 저장할 수 없습니다.");
      const name = asset.name.replace(/\.[^.]+$/, "") || "image";
      if (await onSave(new File([blob], name + (tool === "rotate" ? "-회전.png" : "-주석.png"), { type: "image/png" }), tool === "rotate" ? { angle, flipX, flipY } : undefined)) onClose();
      else setError("이미지를 저장하지 못했습니다. 다시 시도해 주세요.");
    } catch {
      setError("이미지를 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally { setSaving(false); }
  }
  const heading = tool === "annotate" ? "이미지 주석" : "이미지 회전";
  return <dialog className="image-asset-dialog" aria-label={heading} ref={dialog}
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="image-asset-dialog-content">
      <header><h2>{heading}</h2><button type="button" className="studio-action" data-size="icon" aria-label="닫기" onClick={onClose}><X size={18} /></button></header>
      <p>{title} {dimensions.width > 0 && `· ${dimensions.width} × ${dimensions.height}`}</p>
      <div className="image-asset-view">
        <canvas ref={canvas} aria-label={tool === "annotate" ? "주석 그리기" : "회전 미리보기"}
          className={tool === "annotate" ? "image-asset-draw" : undefined}
          onPointerDown={event => {
            if (tool !== "annotate" || event.button !== 0) return;
            if (drawingTool === "text" && !text.trim()) { setError("추가할 주석을 입력해 주세요."); return; }
            setError("");
            const stroke: Stroke = { kind: drawingTool, color, width: width * event.currentTarget.width / Math.max(1, event.currentTarget.clientWidth), points: [point(event)], ...(drawingTool === "text" ? { text: text.trim() } : {}) };
            if (drawingTool !== "text") {
              event.currentTarget.setPointerCapture(event.pointerId);
              active.current = stroke;
            }
            setStrokes(items => [...items, stroke]);
            setRedo([]);
          }}
          onPointerMove={event => addPoint(event)}
          onPointerUp={event => { addPoint(event); active.current = null; }}
          onPointerCancel={() => { active.current = null; }} />
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="image-asset-actions">
        {tool === "annotate" && <>
          <div className="image-asset-tool-select" role="group" aria-label="주석 도구">
            {([["pen", "펜"], ["rectangle", "사각형"], ["text", "텍스트"]] as const).map(([value, label]) =>
              <button key={value} type="button" className="studio-action" aria-pressed={drawingTool === value}
                onClick={() => setDrawingTool(value)}>{label}</button>)}
          </div>
          {drawingTool === "text" && <label>주석 내용 <input type="text" maxLength={200} value={text}
            onChange={event => setText(event.target.value)} placeholder="입력 후 이미지 위치 선택" /></label>}
          <label>색상 <input type="color" value={color} onChange={event => setColor(event.target.value)} /></label>
          <label>굵기 <input type="range" min="1" max="24" value={width} onChange={event => setWidth(Number(event.target.value))} /> {width}</label>
          <button type="button" className="studio-action" disabled={!strokes.length} onClick={() => { const last = strokes.at(-1); if (last) { setRedo(items => [...items, last]); setStrokes(items => items.slice(0, -1)); } }}><Undo2 size={16} /> 실행 취소</button>
          <button type="button" className="studio-action" disabled={!redo.length} onClick={() => { const last = redo.at(-1); if (last) { setStrokes(items => [...items, last]); setRedo(items => items.slice(0, -1)); } }}><Redo2 size={16} /> 다시 실행</button>
        </>}
        {tool === "rotate" && <>
          <button type="button" className="studio-action" onClick={() => setAngle(value => (value + 270) % 360)}><RotateCcw size={16} /> 왼쪽</button>
          <button type="button" className="studio-action" onClick={() => setAngle(value => (value + 90) % 360)}><RotateCw size={16} /> 오른쪽</button>
          <label>각도 <input type="range" min="0" max="360" step="1" value={angle} onChange={event => setAngle(Number(event.target.value))} />
            <input className="image-asset-angle" type="number" min="0" max="360" step="1" value={angle}
              onChange={event => setAngle(Math.max(0, Math.min(360, Math.round(Number(event.target.value)))))} />°</label>
          <button type="button" className="studio-action" aria-pressed={flipX} onClick={() => setFlipX(value => !value)}>가로 반전</button>
          <button type="button" className="studio-action" aria-pressed={flipY} onClick={() => setFlipY(value => !value)}>세로 반전</button>
          <button type="button" className="studio-action" onClick={() => { setAngle(0); setFlipX(false); setFlipY(false); }}>초기화</button>
        </>}
        <button type="button" className="studio-action" data-tone="primary" disabled={saving || !dimensions.width || (tool === "annotate" && !strokes.length)} onClick={() => void save()}>{saving ? "저장 중" : "적용"}</button>
      </div>
    </div>
  </dialog>;
}
