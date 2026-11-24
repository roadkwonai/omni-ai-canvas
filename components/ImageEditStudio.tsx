"use client";

import { useId, useRef, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import {
  defaultImageEditSettings,
  imageEditKinds,
  type ImageEditKind,
  type ImageEditSettings,
} from "../lib/image-edit";
import { directionEmotionIndex, directionEmotionNames } from "../lib/direction-face-poses";
import type { CanvasNode } from "../lib/types";
import DirectionPreview from "./DirectionPreview";
import "./image-edit-studio.css";

type Props = {
  source: CanvasNode;
  editNode?: CanvasNode;
  onCreate: (kind: ImageEditKind) => void;
  onUpdate: (instruction: string, settings: ImageEditSettings) => Promise<boolean>;
  onClose: () => void;
  generationControls?: React.ReactNode;
  onGenerate?: (instruction: string, settings: ImageEditSettings) => Promise<boolean>;
  generating?: boolean;
  generationAvailable?: boolean;
};

function EmotionMap({ warmth, arousal, onChange }: {
  warmth: number;
  arousal: number;
  onChange: (warmth: number, arousal: number) => void;
}) {
  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  const current = directionEmotionIndex(warmth, arousal);
  function update(event: React.PointerEvent<HTMLDivElement>) {
    const first = event.currentTarget.firstElementChild?.getBoundingClientRect();
    const last = event.currentTarget.lastElementChild?.getBoundingClientRect();
    if (!first || !last) return;
    const toAxis = (point: number, min: number, max: number) =>
      Math.max(-1, Math.min(1, 1 - 2 * (point - min) / (max - min)));
    onChange(
      toAxis(event.clientX, first.x + first.width / 2, last.x + last.width / 2),
      toAxis(event.clientY, first.y + first.height / 2, last.y + last.height / 2),
    );
  }
  return <div className="emotion-axis-panel">
    <p>위 흥분 · 아래 평온</p>
    <div className="emotion-map" role="group" aria-label="감정 좌표판"
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) return;
        start.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        if (!(event.target as HTMLElement).closest("button")) {
          event.currentTarget.setPointerCapture(event.pointerId);
          update(event);
        }
      }}
      onPointerMove={(event) => {
        const origin = start.current;
        if (origin?.id !== event.pointerId || (event.buttons & 1) === 0) return;
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
          if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < 4) return;
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        update(event);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) update(event);
        start.current = null;
      }}
      onPointerCancel={() => { start.current = null; }}>
      {directionEmotionNames.map((name, i) => <button key={name} type="button" title={name}
        aria-label={`감정 좌표 ${Math.floor(i / 5) + 1}행 ${i % 5 + 1}열 ${name}`}
        aria-pressed={i === current}
        onClick={() => onChange(1 - (i % 5) / 2, 1 - Math.floor(i / 5) / 2)} />)}
    </div>
    <p>왼쪽 친밀 · 오른쪽 거리감</p>
    <p aria-live="polite">선택한 감정 {directionEmotionNames[current]}</p>
  </div>;
}

function Range({ label, value, min, max, step = 1, unit = "", onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const inputId = useId();
  return (
    <label htmlFor={inputId}>{label} <output aria-hidden="true">{value}{unit}</output>
      <input id={inputId} type="range" min={min} max={max} step={step} value={value}
        onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export default function ImageEditStudio({ source, editNode, onCreate, onUpdate, onClose, generationControls, onGenerate, generating, generationAvailable = true }: Props) {
  const edit = editNode?.imageEdit;
  const [instruction, setInstruction] = useState(edit?.instruction ?? "");
  const [settings, setSettings] = useState<ImageEditSettings | null>(() =>
    edit ? edit.settings ?? defaultImageEditSettings(edit.kind) : null,
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent, generate = false) {
    event.preventDefault();
    if (!settings) return;
    const combined = instruction.trim();
    if (!combined || combined.length > 5000) {
      setError("편집 지시를 1~5000자로 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await (generate && onGenerate ? onGenerate(combined, settings) : onUpdate(combined, settings));
      if (!saved) setError(generate ? "이미지 생성 요청이 접수되지 않았습니다." : "연출 설정을 저장하지 못했습니다. 다시 시도해 주세요.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "연출 설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (!edit || !settings) {
    return (
      <section className="image-edit-panel" aria-label="연출 추가">
        <div className="image-edit-header">
          <div><h3>연출 추가</h3><p>원본 이미지에 연결할 기능을 선택하세요.</p></div>
          <button className="studio-action" data-tone="quiet" data-size="icon" type="button" onClick={onClose} aria-label="연출 추가 닫기"><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="direction-options">
          {(Object.entries(imageEditKinds) as [ImageEditKind, string][]).map(([kind, label]) =>
            <button className="studio-action" type="button" key={kind} onClick={() => onCreate(kind)}>{label}</button>,
          )}
        </div>
      </section>
    );
  }

  const lighting = settings.kind === "light" || settings.kind === "cinematic";
  const spatial = lighting || settings.kind === "angle";
  const lightView = spatial ? settings.guideView ?? "perspective" : "front";
  const expressionIndex = settings.kind === "emotion"
    ? directionEmotionIndex(settings.warmth, settings.arousal)
    : -1;
  const sourcePreview = source.asset && <Image src={source.asset.url} alt={`편집할 원본: ${source.title}`}
    width={360} height={240} unoptimized className="image-edit-preview" draggable={false} />;
  return (
    <section className={settings.kind === "emotion" ? "image-edit-panel emotion-editor" : "image-edit-panel"} aria-label={imageEditKinds[edit.kind]}>
      <div className="image-edit-header">
        <div><h3 tabIndex={-1} data-image-editor-heading>{imageEditKinds[edit.kind]}</h3>
          {settings.kind !== "emotion" && <p>원본에서 이어진 연출 노드의 설정입니다.</p>}
        </div>
        <button className="studio-action" data-tone="quiet" data-size="icon" type="button" onClick={onClose} aria-label="연출 설정 닫기"><X size={18} aria-hidden="true" /></button>
      </div>
      {sourcePreview && !lighting && settings.kind !== "emotion" && <div className="image-edit-preview-wrap">
        <div className="image-edit-image">{sourcePreview}</div>
      </div>}
      <form onSubmit={(event) => void submit(event)}>
        {settings.kind === "emotion" && <>
          <div className="emotion-stage">
            <div className="emotion-previews" data-has-source={Boolean(sourcePreview)}>
              {sourcePreview && <figure className="direction-preview">
                {sourcePreview}
                <figcaption>원본 이미지</figcaption>
              </figure>}
              <figure className="direction-preview expression-reference">
                <Image src={`/rigs/expression-previews/r${Math.floor(expressionIndex / 5) + 1}c${expressionIndex % 5 + 1}.webp`}
                  width={588} height={368} unoptimized loading="eager" alt={`기준 표정 · ${directionEmotionNames[expressionIndex]}`} />
                <figcaption>기준 표정 사진</figcaption>
              </figure>
            </div>
            <EmotionMap warmth={settings.warmth} arousal={settings.arousal}
              onChange={(warmth, arousal) => setSettings({ ...settings, warmth, arousal })} />
          </div>
        </>}
        <div className={lighting ? "lighting-layout" : settings.kind === "angle" ? "angle-layout" : "direction-layout"}>
        {spatial && <div className="direction-stage">
          <div className="direction-preview-interaction">
            <DirectionPreview settings={settings} lightView={lightView}
              sourceUrl={source.asset?.url} onDirectionChange={(azimuth, elevation) => setSettings({ ...settings, azimuth, elevation })} />
            <p>미리보기를 드래그해 방향을 바꾸거나 아래 슬라이더를 사용하세요.</p>
          </div>
        </div>}
        <div className="direction-adjustments">
        {(settings.kind === "light" || settings.kind === "cinematic" || settings.kind === "angle") && <>
          <Range label={settings.kind === "angle" ? "카메라 수평 각도" : "주광 수평 방향"} value={settings.azimuth} min={-180} max={180} unit="°" onChange={(azimuth) => setSettings({ ...settings, azimuth })} />
          <Range label={settings.kind === "angle" ? "카메라 수직 각도" : "주광 높이"} value={settings.elevation} min={-90} max={90} unit="°" onChange={(elevation) => setSettings({ ...settings, elevation })} />
          <div className="direction-presets" aria-label="방향 프리셋">
            {[["정면", 0, 0], ["왼쪽", -60, 0], ["오른쪽", 60, 0], ["위", 0, 60], ["뒤", 180, 0]].map(([name, azimuth, elevation]) =>
              <button type="button" className="studio-action" key={name} onClick={() => setSettings({ ...settings, azimuth: Number(azimuth), elevation: Number(elevation) })}>{name}</button>,
            )}
          </div>
        </>}
        {settings.kind === "angle" && <>
          <div className="direction-presets" aria-label="다각도 가이드 보기">
            <button type="button" className="studio-action" aria-pressed={lightView === "perspective"} onClick={() => setSettings({ ...settings, guideView: "perspective" })}>궤도 보기</button>
            <button type="button" className="studio-action" aria-pressed={lightView === "shot"} onClick={() => setSettings({ ...settings, guideView: "shot" })}>샷 가이드</button>
          </div>
          <div className="direction-presets" aria-label="카메라 시점">
            {([["정면 부감", 0, 45], ["정면 앙각", 0, -45], ["후면 시점", 180, 0]] as const).map(([name, azimuth, elevation]) =>
              <button key={name} type="button" className="studio-action" onClick={() => setSettings({ ...settings, azimuth, elevation })}>{name}</button>,
            )}
          </div>
          <div className="direction-presets" aria-label="샷 크기">
            {([["원경", 8, 50], ["중경", 5, 50], ["클로즈업", 2.5, 50]] as const).map(([name, distance, fov]) =>
              <button key={name} type="button" className="studio-action" aria-pressed={settings.distance === distance && settings.fov === fov} onClick={() => setSettings({ ...settings, distance, fov })}>{name}</button>,
            )}
          </div>
          <Range label="카메라 거리" value={settings.distance} min={1} max={10} step={0.1} onChange={(distance) => setSettings({ ...settings, distance })} />
          <Range label="시야각" value={settings.fov} min={15} max={100} unit="°" onChange={(fov) => setSettings({ ...settings, fov })} />
          <Range label="카메라 롤" value={settings.roll ?? 0} min={-180} max={180} unit="°" onChange={(roll) => setSettings({ ...settings, roll, guideView: "shot" })} />
          <fieldset className="direction-controls"><legend>카메라가 보는 지점</legend>
            <p>인물 중심에서 바라보는 지점을 이동합니다. 카메라 위치는 유지됩니다.</p>
            {([["x", "주시점 좌우"], ["y", "주시점 높이"], ["z", "주시점 깊이"]] as const).map(([key, label]) =>
              <Range key={key} label={label} value={settings.target?.[key] ?? 0} min={-2} max={2} step={0.1}
                onChange={(value) => setSettings({ ...settings, target: { x: 0, y: 0, z: 0, ...settings.target, [key]: value } })} />,
            )}
            <button type="button" className="studio-action" onClick={() => setSettings({ ...settings, target: { x: 0, y: 0, z: 0 } })}>주시점 중앙으로</button>
          </fieldset>
        </>}
        {(settings.kind === "light" || settings.kind === "cinematic") && <>
          <div className="direction-presets" aria-label="조명 가이드 시점">
            {([["front", "정면 보기"], ["perspective", "투시 보기"], ["top", "위에서 보기"], ["lit", "조명 가이드 얼굴"]] as const).map(([guideView, label]) =>
              <button className="studio-action" type="button" key={guideView} aria-pressed={lightView === guideView}
                onClick={() => setSettings({ ...settings, guideView })}>{label}</button>)}
          </div>
          <Range label="밝기" value={settings.brightness} min={0} max={100} unit="%" onChange={(brightness) => setSettings({ ...settings, brightness })} />
          <label>빛 색상<input type="color" value={settings.color} onChange={(event) => setSettings({ ...settings, color: event.target.value })} /></label>
          <label className="image-edit-check"><input type="checkbox" checked={settings.rim} onChange={(event) => setSettings({ ...settings, rim: event.target.checked })} /> 림라이트</label>
          <label className="image-edit-check"><input type="checkbox" checked={settings.smart?.enabled ?? false} onChange={(event) => {
            const enabled = event.target.checked;
            const { azimuth, elevation, brightness, color, rim } = settings;
            const manual = enabled ? { azimuth, elevation, brightness, color, rim } : settings.smart?.manual;
            setSettings({ ...settings, ...(!enabled ? manual : undefined), smart: { enabled, instruction: settings.smart?.instruction ?? "", manual } });
          }} /> 스마트 조명</label>
          {settings.smart?.enabled && <>
            <label>원하는 조명 스타일<textarea maxLength={1000} value={settings.smart.instruction} onChange={(event) => setSettings({ ...settings, smart: { ...settings.smart, enabled: true, instruction: event.target.value } })} /></label>
            <div className="direction-presets" aria-label="조명 프리셋">
              {([["차가운 역광",180,20,"#b9d9ff"],["부드러운 창광",-45,25,"#fff1db"],["황혼 측광",60,10,"#ffbd78"]] as const).map(([name,azimuth,elevation,color]) =>
                <button type="button" className="studio-action" key={name} onClick={() => setSettings({ ...settings, azimuth, elevation, color, smart: { ...settings.smart, enabled: true, instruction: name } })}>{name}</button>,
              )}
            </div>
          </>}
        </>}
        </div>
        </div>
        {settings.kind === "cinematic" && <>
          <Range label="명암 대비" value={settings.contrast} min={0} max={100} onChange={(contrast) => setSettings({ ...settings, contrast })} />
          <Range label="색온도" value={settings.temperature} min={2000} max={10000} step={100} unit="K" onChange={(temperature) => setSettings({ ...settings, temperature })} />
          <Range label="필름 그레인" value={settings.grain} min={0} max={100} onChange={(grain) => setSettings({ ...settings, grain })} />
        </>}
        {settings.kind === "characterSheet" && <fieldset>
          <legend>설정도 구성</legend>
          {([["views", "정면·측면·후면 전신"], ["expressions", "얼굴과 표정"], ["details", "의상과 소품 세부"]] as const).map(([key, label]) =>
            <label className="image-edit-check" key={key}><input type="checkbox" checked={settings[key]} onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })} />{label}</label>)}
        </fieldset>}
        {settings.kind === "texture" && <>
          {source.asset && <div className="direction-texture-comparison" aria-label="원본과 질감 미리보기">
            <figure><Image src={source.asset.url} alt="원본 이미지" width={300} height={300} unoptimized /><figcaption>원본</figcaption></figure>
            <figure><div className="direction-texture-result"><Image src={source.asset.url} alt="질감 조정 참고 미리보기" width={300} height={300} unoptimized style={{
              filter: `contrast(${0.75 + settings.sharpness / 200}) saturate(${0.8 + settings.blend / 250}) blur(${Math.max(0, (50 - settings.skin) / 100)}px)`,
            }} /><span aria-hidden="true" className="direction-texture-grain" style={{ opacity: settings.grain / 400 }} /></div><figcaption>로컬 질감 참고</figcaption></figure>
          </div>}
          <Range label="피부 질감" value={settings.skin} min={0} max={100} onChange={(skin) => setSettings({ ...settings, skin })} />
          <Range label="인물과 배경 조화" value={settings.blend} min={0} max={100} onChange={(blend) => setSettings({ ...settings, blend })} />
          <Range label="입자 질감" value={settings.grain} min={0} max={100} onChange={(grain) => setSettings({ ...settings, grain })} />
          <Range label="선명도" value={settings.sharpness} min={0} max={100} onChange={(sharpness) => setSettings({ ...settings, sharpness })} />
        </>}
        {settings.kind === "story25" && <fieldset className="direction-beats">
          <legend>25컷 연출 메모</legend>
          <p>왼쪽 위부터 오른쪽으로 읽고 다음 줄로 이어집니다.</p>
          {Array.from({ length: 25 }, (_, index) => <label key={index}>{Math.floor(index / 5) + 1}-{index % 5 + 1} 컷
            <input value={settings.beats?.[index] ?? ""} maxLength={500} onChange={(event) => {
              const beats = Array.from({ length: 25 }, (_, item) => settings.beats?.[item] ?? "");
              beats[index] = event.target.value;
              setSettings({ ...settings, beats });
            }} placeholder="이 컷의 행동" />
          </label>)}
        </fieldset>}
        <label>추가 연출 지시<textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} maxLength={5000} rows={settings.kind === "emotion" ? 2 : 4} placeholder="유지할 요소나 바꾸고 싶은 부분을 입력하세요." /></label>
        {settings.kind !== "emotion" && <p>설정은 선택한 이미지 모델에 전달됩니다.</p>}
        {error && <p role="alert">{error}</p>}
        <footer>{generationControls}<button className="studio-action" type="submit" disabled={saving || generating}>{saving ? "저장 중" : "연출 설정 저장"}</button>
          {onGenerate && <button className="studio-action" data-tone="primary" type="button" disabled={saving || generating || !generationAvailable} onClick={(event) => void submit(event, true)}>{generating ? "생성 요청 중" : "이미지 생성"}</button>}</footer>
      </form>
    </section>
  );
}
