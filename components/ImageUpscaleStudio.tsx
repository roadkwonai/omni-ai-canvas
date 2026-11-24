"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import type { Asset } from "../lib/types";
import { upscaleDimensions, upscaleImage, type UpscaleOptions } from "../lib/image-upscale";
import "./image-upscale-studio.css";

type Props = {
  asset: Asset;
  title: string;
  output?: Asset;
  initialScale?: UpscaleOptions["scale"];
  initialStyle?: UpscaleOptions["style"];
  onClose: () => void;
  onSave: (file: File, options: UpscaleOptions) => Promise<boolean>;
};

export default function ImageUpscaleStudio({ asset, title, output, initialScale = 2, initialStyle = "natural", onClose, onSave }: Props) {
  const image = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>();
  const [scale, setScale] = useState<UpscaleOptions["scale"]>(initialScale);
  const [style, setStyle] = useState<UpscaleOptions["style"]>(initialStyle);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string>();
  const [result, setResult] = useState<File>();
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  let dimensions: { width: number; height: number } | undefined;
  try { if (size) dimensions = upscaleDimensions(size.width, size.height, scale); } catch { /* displayed below */ }

  function clearResult() { setResult(undefined); setPreview(undefined); setError(""); }
  async function render() {
    if (!image.current || !dimensions) return;
    setBusy(true);
    setError("");
    try {
      const file = await upscaleImage(image.current, { scale, style });
      setResult(file);
      setPreview(URL.createObjectURL(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "이미지를 확대하지 못했습니다.");
    } finally { setBusy(false); }
  }

  async function save() {
    if (!result) return;
    setBusy(true);
    try {
      if (!await onSave(result, { scale, style })) setError("확대 결과를 저장하지 못했습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "확대 결과를 저장하지 못했습니다.");
    } finally { setBusy(false); }
  }

  return <section className="image-upscale" aria-label="이미지 확대">
    <header><h3 data-image-editor-heading tabIndex={-1}>이미지 확대</h3><button type="button" className="studio-action" data-size="icon" aria-label="확대 편집 닫기" onClick={onClose}><X size={18} aria-hidden="true" /></button></header>
    <p>기기에서 이미지를 확대합니다.</p>
    <div className="image-upscale-compare">
      <figure><Image ref={image} src={asset.url} alt={`원본 · ${title}`} width={320} height={240} unoptimized onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setError("원본 이미지를 불러오지 못했습니다.")} /><figcaption>원본 {size && `${size.width} × ${size.height}`}</figcaption></figure>
      {(preview || output) && <figure><Image src={preview ?? output!.url} alt="확대 결과" width={320} height={240} unoptimized /><figcaption>확대 결과</figcaption></figure>}
    </div>
    <fieldset><legend>배율</legend>{([2, 4, 6] as const).map((value) => <button className="studio-action" type="button" key={value} aria-pressed={scale === value} onClick={() => { setScale(value); clearResult(); }}>{value}배</button>)}</fieldset>
    <fieldset><legend>표현</legend>{([["natural", "자연스럽게"], ["detail", "선명하게"]] as const).map(([value, label]) => <button className="studio-action" type="button" key={value} aria-pressed={style === value} onClick={() => { setStyle(value); clearResult(); }}>{label}</button>)}</fieldset>
    <p>{dimensions ? `출력 크기 ${dimensions.width} × ${dimensions.height}` : size ? "이 배율은 이미지 처리 한도를 넘습니다." : "원본 크기를 확인하고 있습니다."}</p>
    {error && <p role="alert">{error}</p>}
    <footer><button className="studio-action" type="button" disabled={busy || !dimensions} onClick={() => void render()}>확대 미리보기</button><button className="studio-action" data-tone="primary" type="button" disabled={busy || !result} onClick={() => void save()}>{busy ? "처리 중" : "결과 저장"}</button></footer>
  </section>;
}
