"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { Slider, SliderControl, SliderIndicator, SliderThumb, SliderTrack } from "@ui-sdk/react/slider";
import { Camera, Clapperboard, Palette, RotateCcw, Search, X } from "lucide-react";
import type { Asset } from "../lib/types";
import { directionWarnings, directorFields, directorFocalLayers, directorFocalOriginY, directorFocalRange, directorFocalView, directorMotionKeys, directorRequestText, emptyNodeDirection, nodeDirectionText, readDirectorFocalLength, readNodeDirection, type NodeDirection } from "../lib/node-director-direction";
import { directorPaletteSheet, directorPresets, type DirectorPreset } from "../lib/node-director-presets";
import "./node-director-studio.css";

const focalPresets = [
  { mm: 18, use: "좁은 실내나 넓은 장소의 전체 모습을 담을 때" },
  { mm: 24, use: "공간과 인물의 동선을 함께 보여줄 때" },
  { mm: 35, use: "인물과 주변 상황을 함께 담는 대화나 이동 장면에" },
  { mm: 50, use: "공간보다 인물의 행동에 시선을 모을 때" },
  { mm: 85, use: "인물의 표정과 반응을 가까이 담을 때" },
  { mm: 135, use: "멀리 있는 피사체나 작은 단서에 집중할 때" },
] as const;

type CardKey = keyof typeof directorPresets;
type Sheet = "lighting" | "palette" | "direction" | "gear" | "genre-rhythm";

const cardFields: Record<CardKey, { label: string; help: string; sheet?: Sheet; offset?: number; neutral?: string }> = {
  camera: { label: "카메라", help: "같은 장면을 그 카메라로 찍었을 때의 질감입니다. 선명함, 입자, 색과 노이즈를 비교해 고르세요." },
  lens: { label: "렌즈", help: "빛 번짐, 배경 흐림의 모양, 원근과 왜곡을 비교해 고르세요." },
  aperture: { label: "조리개", help: "값이 작을수록 초점이 얇아져 배경이 흐려지고, 클수록 앞뒤가 함께 선명해집니다." },
  framing: { label: "구도", help: "무엇을 얼마나 크게 보여줄지 정합니다. 공간을 소개할 때는 넓게, 반응이나 단서를 강조할 때는 가깝게 잡습니다." },
  angle: { label: "카메라 앵글", help: "카메라를 두는 높이와 방향입니다. 인물이 강해 보일지, 약하거나 궁금해 보일지를 정합니다." },
  composition: { label: "화면 배치", help: "인물을 화면 어디에 두고 어디를 비울지, 선과 틀로 시선을 어디에 보낼지 정합니다." },
  gaze: { label: "시선", help: "인물이 바라보는 곳입니다. 관객과의 거리와 인물 사이의 힘을 보여줍니다." },
  viewpoint: { label: "창의 시점", help: "소품과 틈, 반사를 이용한 특별한 카메라 위치입니다. 카메라 앵글과 이동은 비우거나 고정으로 두세요." },
  movement: { label: "카메라 이동", help: "카메라가 머물거나 움직이는 방식을 정합니다. 카드에 마우스를 올리거나 초점을 옮기면 움직임을 볼 수 있습니다." },
  tempo: { label: "시간 표현", help: "동작을 늦추거나 압축하고 멈춰 중요한 순간을 강조합니다." },
  palette: { label: "색감", sheet: "palette", help: "화면 전체를 지배하는 색과 채도를 선택합니다. 같은 장면이라도 관객이 느끼는 온도와 분위기가 달라집니다." },
  light: { label: "조명", sheet: "lighting", help: "빛이 오는 방향과 그림자의 강도를 정합니다. 숨길 정보와 먼저 보일 대상을 생각하며 고르세요." },
  art: { label: "스타일링과 미술", sheet: "direction", help: "의상·공간·소품의 모양과 소재를 정합니다. 시대나 인물의 생활을 한눈에 보여주고 싶을 때 쓰세요." },
  genre: { label: "장르", sheet: "genre-rhythm", neutral: "일반", help: "공포, 웃음, 설렘처럼 이 장면이 관객에게 전달할 인상을 고릅니다." },
  rhythm: { label: "편집 리듬", sheet: "genre-rhythm", offset: 10, neutral: "자동", help: "한 화면에 오래 머물지, 한 번에 따라갈지, 짧은 컷으로 시간을 압축할지 정합니다." },
  narrative: { label: "장면 전개", sheet: "direction", offset: 6, help: "관객이 무엇을 먼저 알아차리고 마지막에 무엇을 기억할지 정합니다." },
};
const opticsKeys: readonly CardKey[] = ["camera", "lens", "aperture"];
// 화면 범위가 달라 기준 사진과 반씩 나눠 비교할 수 없는 항목이다.
const reframedOptics = ["cam-documentary", "cam-cctv", "lens-telezoom", "lens-macro", "lens-fisheye"];
const movementGroups = ["전체", "이동", "회전", "렌즈", "시점"];
const cineGuideUrl = "https://materials.ainspire.co.kr/api/open?id=cineguide-v2";

type Example = { still: string; video?: string; source?: string };

const focalImage = "/director/focal-platform.webp";

function DirectorFocalControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = readDirectorFocalLength(value);
  const length = selected ?? directorFocalRange.preview;
  const { cropRatio, horizontalAngle } = directorFocalView(length);
  const percent = cropRatio * 100;
  const format = (mm: number) => mm + "mm";
  const originY = directorFocalOriginY * 100;

  return (
    <fieldset className="node-director-card-group">
      <legend>초점 거리</legend>
      <p className="node-director-section-help">짧은 초점 거리는 주변을 넓게 담고, 긴 초점 거리는 프레임을 좁혀 피사체를 크게 보여줍니다.</p>
      <div className="node-director-focal-grid">
        <figure>
          <div className="node-director-focal-frame">
            <Image src={focalImage} alt="플랫폼 가운데 인물과 양옆의 기둥, 기차가 보이는 기준 장면" width={1672} height={941} loading="eager" unoptimized />
            <span className="node-director-focal-window" aria-hidden="true" style={{
              insetInlineStart: (100 - percent) / 2 + "%",
              insetBlockStart: (1 - cropRatio) * originY + "%",
              width: percent + "%",
              height: percent + "%",
            }} />
          </div>
          <figcaption>기준 장면 · 18mm</figcaption>
        </figure>
        <figure>
          <div className="node-director-focal-frame">
            <div className="node-director-focal-zoom" style={{
              transformOrigin: "50% " + originY + "%",
              transform: "scale(" + 1 / cropRatio + ")",
            }}>
              <Image src={focalImage} alt="같은 카메라 위치에서 선택한 화각의 예시" width={1672} height={941} loading="eager" unoptimized />
              {length >= 30 && directorFocalLayers.map(({ mm, file }) => {
                const ratio = directorFocalRange.min / mm;
                return <Image key={mm} src={file} alt="" width={1672} height={941} loading="eager" unoptimized style={{
                  insetInlineStart: (1 - ratio) * 50 + "%",
                  insetBlockStart: (1 - ratio) * originY + "%",
                  width: ratio * 100 + "%",
                  height: ratio * 100 + "%",
                }} />;
              })}
            </div>
          </div>
          <figcaption>{selected ? "선택한 화각" : "비교 예시"} · {length}mm · 가로 {horizontalAngle}°</figcaption>
        </figure>
      </div>
      <p className="node-director-section-help">풀프레임 36mm 폭을 기준으로 같은 예제 장면의 화각을 비교합니다. 선택값은 촬영 지시로 전달됩니다.</p>
      <div className="node-director-range">
        <div>
          <strong>{value ? "적용 · " + value : "적용 · 자동"}</strong>
          {value && <button type="button" className="studio-action" data-tone="quiet" onClick={() => onChange("")}>초점 거리 자동</button>}
        </div>
        <Slider
          value={length}
          min={directorFocalRange.min}
          max={directorFocalRange.max}
          step={1}
          onValueChange={(next) => onChange(format(next))}
        >
          <SliderControl className="node-director-slider-control">
            <SliderTrack className="node-director-slider-track">
              <SliderIndicator className="node-director-slider-indicator" />
              <SliderThumb className="node-director-slider-thumb" aria-label="초점 거리 조절" aria-valuetext={format(length)} />
            </SliderTrack>
          </SliderControl>
        </Slider>
      </div>
      <div className="node-director-focal-options">
        {focalPresets.map(({ mm, use }) => (
          <button type="button" key={mm} className="studio-action" aria-pressed={selected === mm} onClick={() => onChange(format(mm))}>
            <strong>{mm}mm</strong><span>{use}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

type Props = {
  title: string;
  value: string;
  preview?: Asset;
  onApply: (direction: string) => void;
  onClose: () => void;
};

export default function NodeDirectorStudio({ title, value, preview, onApply, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [direction, setDirection] = useState<NodeDirection>(() => readNodeDirection(value));
  const [section, setSection] = useState<"camera" | "style" | "performance">("camera");
  const [styleSection, setStyleSection] = useState<"palette" | "light" | "art">("palette");
  const [cameraSection, setCameraSection] = useState<"equipment" | "focal" | "shot" | "layout" | "movement" | "viewpoint">("equipment");
  const [performanceSection, setPerformanceSection] = useState<"narrative" | "genre" | "rhythm">("narrative");
  const [query, setQuery] = useState("");
  const [movementGroup, setMovementGroup] = useState("전체");
  const [references, setReferences] = useState<Record<string, Example>>({});
  const [playing, setPlaying] = useState("");
  const [compare, setCompare] = useState(false);
  const result = nodeDirectionText(direction);
  const request = directorRequestText(result, "video");
  const warnings = directionWarnings(direction);
  const selected = directorFields.filter(({ key }) => direction[key].trim());
  const dirty = result !== nodeDirectionText(readNodeDirection(value));
  const search = query.trim().toLowerCase();

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    const controller = new AbortController();
    // 로컬 참고 예제가 없거나 읽지 못하면 기본 예제를 그대로 쓴다.
    void fetch("/api/director-references", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : { items: {} })
      .then(({ items }: { items: Record<string, Example> }) => setReferences(items))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  function close() {
    if (!dirty || window.confirm("저장하지 않은 연출 변경을 취소하고 닫을까요?")) dialog.current?.close();
  }

  function update(key: keyof NodeDirection, next: string) {
    setDirection((current) => ({ ...current, [key]: next }));
  }

  function cards(key: CardKey) {
    const { label, help, sheet, offset = 0, neutral = "" } = cardFields[key];
    const value = direction[key];
    const choices = (directorPresets[key] as readonly DirectorPreset[]).map((preset, index) => ({ ...preset, index }))
      .filter(({ name, en = "", use, group }) => search
        ? `${label} ${name} ${en} ${use}`.toLowerCase().includes(search)
        : key !== "movement" || movementGroup === "전체" || group === movementGroup);
    if (!choices.length) return null;
    const moving = key === "movement" || key === "tempo";
    const optics = opticsKeys.includes(key);
    return <fieldset key={key} className="node-director-card-group">
      <legend>{label}</legend>
      {!search && <p className="node-director-section-help">{help}</p>}
      {key === "movement" && !search && <div className="node-director-subnav" role="group" aria-label="카메라 이동 종류">
        {movementGroups.map((group) => <button type="button" key={group} className="studio-action" aria-pressed={movementGroup === group}
          onClick={() => setMovementGroup(group)}>{group}</button>)}
      </div>}
      <div className="node-director-card-grid">
        {choices.map(({ name, use, id, en, video, index }) => {
          const shown = (value || neutral) === name;
          const describe = headingId + "-" + key + "-" + index;
          const example: Example | null = id ? references[id] ?? {
            still: `/director/examples/${id}.webp`,
            ...(moving || video ? { video: `/director/examples/${id}.mp4` } : {}),
          } : null;
          return <button type="button" key={name} className="node-director-card" aria-pressed={shown}
            aria-label={name} aria-describedby={describe}
            onPointerEnter={() => play(id, example)} onFocus={() => play(id, example)}
            onPointerLeave={() => setPlaying("")} onBlur={() => setPlaying("")}
            onClick={() => update(key, name === neutral || shown ? "" : name)}>
            {example && id ? <span className="node-director-example" data-moving={moving || undefined} aria-hidden="true">
              <Image src={example.still} alt="" width={512} height={384} loading="lazy" unoptimized onError={() => dropReference(id)} />
              {optics && compare && !reframedOptics.includes(id) && <Image className="node-director-base" src="/director/examples/optics-base.webp" alt="" width={512} height={512} loading="lazy" unoptimized />}
              {example.video && playing === id && <video src={example.video} autoPlay muted loop playsInline />}
            </span> : <span {...sheetImage(key, index, sheet ?? "gear", offset)} aria-hidden="true" />}
            <strong>{name}{en && <small lang="en">{en}</small>}</strong>
            <span id={describe} className="node-director-card-use">{use}</span>
            {example?.source && <span className="node-director-credit">예시 · CineGuide</span>}
          </button>;
        })}
      </div>
      {value && !search && <div className="node-director-current">
        <span>선택 · {value}</span>
        <button type="button" className="studio-action" data-tone="quiet" onClick={() => update(key, "")}>{label} 선택 해제</button>
      </div>}
    </fieldset>;
  }

  function play(id: string | undefined, example: Example | null) {
    if (id && example?.video && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(id);
  }

  function dropReference(id: string) {
    setReferences((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
  }

  function sheetImage(key: CardKey, index: number, sheet: Sheet, offset: number) {
    let imageSheet: string = sheet;
    let imageIndex = index + offset;
    if (key === "art" && index >= 6) {
      imageSheet = "gear";
      imageIndex = index + 2;
    }
    if (key === "light" && index >= 12) imageIndex = index === 12 ? 4 : 11;
    if (key === "narrative" && index >= 6) {
      imageSheet = index === 6 ? "hook" : "narrative";
      imageIndex = index - 6;
    }
    const columns = imageSheet === "palette" ? directorPaletteSheet.columns : imageSheet === "genre-rhythm" ? 5 : imageSheet === "narrative" ? 3 : 4;
    const rows = imageSheet === "palette" ? directorPaletteSheet.rows : imageSheet === "narrative" ? 2 : 3;
    const filter = key === "light" && index >= 12
      ? index === 12 ? "contrast(1.28) saturate(.72)" : "contrast(.83) brightness(1.15)"
      : undefined;
    const backgroundPosition = (imageIndex % columns) * 100 / (columns - 1) + "% " +
      Math.floor(imageIndex / columns) * 100 / (rows - 1) + "%";
    return {
      className: "node-director-card-image node-director-card-" + imageSheet,
      style: { backgroundPosition: imageSheet === "hook" ? "center" : backgroundPosition, filter },
    };
  }

  // 로컬 참고 예제가 보이는 목록에는 출처를 한 번 적는다.
  function credit(...keys: CardKey[]) {
    return keys.some((key) => (directorPresets[key] as readonly DirectorPreset[]).some(({ id }) => id && references[id])) &&
      <p className="node-director-section-help">예시 · CineGuide는 이 컴퓨터에만 보관한 참고 자료입니다. © Sputlab x Ainspire · <a href={cineGuideUrl} target="_blank" rel="noreferrer">원본 보기</a></p>;
  }

  const found = search ? (Object.keys(cardFields) as CardKey[]).map(cards).filter(Boolean) : [];

  return (
    <dialog ref={dialog} className="node-director-studio" aria-labelledby={headingId}
      onKeyDown={(event) => {
        // cancel만 막으면 브라우저가 두 번째 Esc에서 확인 없이 닫는다.
        if (event.key !== "Escape") return;
        event.preventDefault();
        if (search) setQuery("");
        else close();
      }}
      onCancel={(event) => { event.preventDefault(); close(); }} onClose={onClose}>
      <header className="node-director-header">
        <div>
          <p>{title || "선택한 노드"}</p>
          <h2 id={headingId}>디렉터 스튜디오</h2>
        </div>
        <button type="button" className="studio-action" data-tone="quiet" data-size="icon" aria-label="디렉터 스튜디오 닫기" onClick={close}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <nav className="node-director-nav" aria-label="연출 설정">
        <button type="button" className="studio-action" aria-pressed={section === "camera"} onClick={() => setSection("camera")}><Camera size={16} aria-hidden="true" /> 촬영</button>
        <button type="button" className="studio-action" aria-pressed={section === "style"} onClick={() => setSection("style")}><Palette size={16} aria-hidden="true" /> 비주얼 스타일</button>
        <button type="button" className="studio-action" aria-pressed={section === "performance"} onClick={() => setSection("performance")}><Clapperboard size={16} aria-hidden="true" /> 장면 연출</button>
        <label className="node-director-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="연출 기법 검색" placeholder="기법 검색 · 돌리, 여백, 긴장" maxLength={40} />
        </label>
      </nav>
      <div className="node-director-body">
        <div className="node-director-editor">
          {search && <section aria-label="검색 결과">
            <h3>검색 결과</h3>
            {found.length ? <>{found}{credit(...Object.keys(cardFields) as CardKey[])}</>
              : <p role="status">찾는 기법이 없습니다. 다른 낱말로 검색하세요.</p>}
          </section>}
          {!search && section === "camera" && <section aria-label="촬영 설정">
            <h3>촬영 설정</h3>
            <p>카메라와 렌즈로 영상의 질감을, 초점 거리와 구도·앵글로 화면에 들어올 범위를, 이동으로 시선의 흐름을 정합니다.</p>
            {cameraSection === "shot" && preview?.type === "image" && <figure className="node-director-preview">
              <Image src={preview.url} alt="선택한 참조 이미지" width={640} height={420} unoptimized />
              <figcaption>선택한 참조 이미지</figcaption>
            </figure>}
            <nav className="node-director-subnav" aria-label="촬영 항목">
              <button type="button" className="studio-action" aria-pressed={cameraSection === "equipment"} onClick={() => setCameraSection("equipment")}>카메라·렌즈</button>
              <button type="button" className="studio-action" aria-pressed={cameraSection === "focal"} onClick={() => setCameraSection("focal")}>초점 거리</button>
              <button type="button" className="studio-action" aria-pressed={cameraSection === "shot"} onClick={() => setCameraSection("shot")}>구도·앵글</button>
              <button type="button" className="studio-action" aria-pressed={cameraSection === "layout"} onClick={() => setCameraSection("layout")}>화면 배치·시선</button>
              <button type="button" className="studio-action" aria-pressed={cameraSection === "movement"} onClick={() => setCameraSection("movement")}>카메라 이동·시간</button>
              <button type="button" className="studio-action" aria-pressed={cameraSection === "viewpoint"} onClick={() => setCameraSection("viewpoint")}>창의 시점</button>
            </nav>
            {cameraSection === "equipment" ? <>
              <div className="node-director-compare">
                <p className="node-director-section-help">{compare ? "왼쪽은 기준, 오른쪽은 결과입니다. 화면 범위가 달라지는 항목은 결과만 보여줍니다." : "장비를 바꿨을 때 달라지는 화면의 효과 예시입니다. 실제 결과는 생성 모델에 따라 다릅니다."}</p>
                <button type="button" className="studio-action" aria-pressed={compare} onClick={() => setCompare(!compare)}>기준 사진과 비교</button>
              </div>
              {cards("camera")}
              {cards("lens")}
              {cards("aperture")}
              <div className="node-director-fields">
                <label>카메라 직접 입력<input value={direction.camera} onChange={(event) => update("camera", event.target.value)} maxLength={125} placeholder="예: 디지털 시네마 카메라" /></label>
                <label>렌즈 직접 입력<input value={direction.lens} onChange={(event) => update("lens", event.target.value)} maxLength={125} placeholder="예: 아나모픽 렌즈" /></label>
              </div>
            </> : cameraSection === "focal" ? (
              <DirectorFocalControl value={direction.focal} onChange={(value) => update("focal", value)} />
            ) : cameraSection === "shot" ? <>
              {cards("framing")}
              {cards("angle")}
              {credit("framing", "angle")}
            </> : cameraSection === "layout" ? <>
              {cards("composition")}
              {cards("gaze")}
              {credit("composition", "gaze")}
            </> : cameraSection === "movement" ? <>
              {cards("movement")}
              {cards("tempo")}
              {credit("movement", "tempo")}
            </> : cards("viewpoint")}
          </section>}
          {!search && section === "style" && <section aria-label="비주얼 스타일 설정">
            <h3>비주얼 스타일</h3>
            <p>색감으로 분위기를, 조명으로 시선과 명암을, 미술로 인물과 공간의 시대와 성격을 정합니다.</p>
            <nav className="node-director-subnav" aria-label="비주얼 스타일 항목">
              <button type="button" className="studio-action" aria-pressed={styleSection === "palette"} onClick={() => setStyleSection("palette")}>색감</button>
              <button type="button" className="studio-action" aria-pressed={styleSection === "light"} onClick={() => setStyleSection("light")}>조명</button>
              <button type="button" className="studio-action" aria-pressed={styleSection === "art"} onClick={() => setStyleSection("art")}>스타일링·미술</button>
            </nav>
            {styleSection === "palette" && cards("palette")}
            {styleSection === "light" && cards("light")}
            {styleSection === "art" && <>{cards("art")}
              <label className="node-director-note">스타일링과 미술 직접 입력<input value={direction.art} onChange={(event) => update("art", event.target.value)} maxLength={500} placeholder="의상, 세트, 소품과 질감" /></label></>}
          </section>}
          {!search && section === "performance" && <section aria-label="장면 연출 설정">
            <h3>장면 연출</h3>
            <p>전개는 사건을 보여주는 순서, 장르는 이야기의 분위기, 리듬은 화면에 머물고 넘어가는 속도를 정합니다.</p>
            <nav className="node-director-subnav" aria-label="장면 연출 항목">
              <button type="button" className="studio-action" aria-pressed={performanceSection === "narrative"} onClick={() => setPerformanceSection("narrative")}>장면 전개 {directorPresets.narrative.length}</button>
              <button type="button" className="studio-action" aria-pressed={performanceSection === "genre"} onClick={() => setPerformanceSection("genre")}>장르 {directorPresets.genre.length}</button>
              <button type="button" className="studio-action" aria-pressed={performanceSection === "rhythm"} onClick={() => setPerformanceSection("rhythm")}>편집 리듬 {directorPresets.rhythm.length}</button>
            </nav>
            {performanceSection === "narrative" && <>
              {cards("narrative")}
              <label className="node-director-note">장면 전개 직접 입력<input value={direction.narrative} onChange={(event) => update("narrative", event.target.value)} maxLength={500} placeholder="예: 평범한 대화로 시작해 상대가 감춘 사실을 공개한다" /></label>
            </>}
            {performanceSection === "genre" && cards("genre")}
            {performanceSection === "rhythm" && cards("rhythm")}
            <label className="node-director-note">행동과 감정
              <textarea value={direction.performance} onChange={(event) => update("performance", event.target.value)} maxLength={500} placeholder="예: 긴장한 표정으로 문을 바라보다 천천히 손을 뻗는다" />
            </label>
          </section>}
        </div>
      </div>
      <div className="node-director-summary">
        {selected.length ? <ul aria-label={`선택한 연출 ${selected.length}개`}>
          {selected.map(({ key, label }) => <li key={key}>
            <span>{label} · {direction[key]}</span>
            <button type="button" aria-label={`${label} 선택 해제`} onClick={() => update(key, "")}><X size={14} aria-hidden="true" /></button>
          </li>)}
        </ul> : <p>고른 연출이 여기에 모입니다.</p>}
        {warnings.map((warning) => <p key={warning} role="status" className="node-director-warning">{warning}</p>)}
        {result.length > 2000 && <p role="status" className="node-director-warning">연출 지시는 2,000자까지 저장할 수 있습니다. 직접 입력한 내용을 줄여주세요.</p>}
        {request && <details>
          <summary>생성 요청에 적용할 내용</summary>
          <pre>{request}</pre>
          {directorMotionKeys.some((key) => direction[key]) && <p>정지 이미지 요청에는 카메라 이동·시간 표현·편집 리듬을 보내지 않습니다.</p>}
        </details>}
      </div>
      <footer className="node-director-footer">
        <button type="button" className="studio-action" data-tone="quiet" onClick={() => setDirection({ ...emptyNodeDirection })}><RotateCcw size={16} aria-hidden="true" /> 초기화</button>
        <div>
          <button type="button" className="studio-action" onClick={close}>취소</button>
          <button type="button" className="studio-action" data-tone="primary" disabled={result.length > 2000} onClick={() => { onApply(result); dialog.current?.close(); }}>연출 적용</button>
        </div>
      </footer>
    </dialog>
  );
}
