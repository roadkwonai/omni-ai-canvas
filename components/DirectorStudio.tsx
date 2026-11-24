"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  addEditedImage,
  addStagingGuide,
  applyStaging,
  defaultStaging,
  projectPoint,
  type Staging,
} from "../lib/staging";
import type { Asset, Graph, Project } from "../lib/types";
import "./director-studio.css";

type Props = {
  project: Project;
  selected: string | null;
  onGraphChange: (
    projectId: string,
    update: (graph: Graph) => Graph,
  ) => boolean;
  onClose: () => void;
};
type ImageEdit = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  rotation: number;
  brightness: number;
  contrast: number;
  saturation: number;
};
const initialEdit: ImageEdit = {
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  rotation: 0,
  brightness: 100,
  contrast: 100,
  saturation: 100,
};
const uid = () => crypto.randomUUID();
const cameraPresets: Record<string, Partial<Staging>> = {
  와이드: { framing: "와이드", focal: 24, yaw: 0, pitch: 0 },
  미디엄: { framing: "미디엄", focal: 50, yaw: 0, pitch: 0 },
  오버숄더: { framing: "오버숄더", focal: 50, yaw: -10, pitch: 0 },
  인서트: { framing: "인서트", focal: 85, yaw: 0, pitch: 10 },
};

function paint(canvas: HTMLCanvasElement, stage: Staging) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width,
    h = canvas.height;
  ctx.fillStyle = "#e9edf0";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#c9d0d1";
  ctx.fillRect(0, h / 2, w, h / 2);
  ctx.strokeStyle = "#aab3b2";
  ctx.lineWidth = 1;
  for (let z = 0; z <= 12; z += 2) {
    const a = projectPoint(-7, z, 0, stage),
      b = projectPoint(7, z, 0, stage);
    if (a && b) {
      ctx.beginPath();
      ctx.moveTo(a.x * w, a.y * h);
      ctx.lineTo(b.x * w, b.y * h);
      ctx.stroke();
    }
  }
  if (stage.framing === "오버숄더") {
    ctx.fillStyle = "#555d6d";
    ctx.beginPath();
    ctx.arc(w * 0.05, h * 0.7, h * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(0, h * 0.78, w * 0.13, h * 0.22);
  }
  const prop = projectPoint(stage.propX, stage.propZ, 0.5, stage);
  if (prop) {
    const size = Math.max(8, prop.scale * w * 0.55);
    ctx.fillStyle = "#7f95a2";
    ctx.fillRect(prop.x * w - size / 2, prop.y * h - size / 2, size, size);
    ctx.fillStyle = "#25333c";
    ctx.font = "13px sans-serif";
    ctx.fillText("소품", prop.x * w + size / 2 + 4, prop.y * h);
  }
  const feet = projectPoint(stage.actorX, stage.actorZ, 0, stage),
    head = projectPoint(stage.actorX, stage.actorZ, 1.7, stage);
  if (feet && head) {
    const x = feet.x * w,
      fy = feet.y * h,
      hy = head.y * h,
      radius = Math.max(5, Math.abs(fy - hy) * 0.09);
    ctx.strokeStyle = "#a34819";
    ctx.fillStyle = "#f47c3c";
    ctx.lineWidth = Math.max(3, radius / 2);
    ctx.beginPath();
    ctx.arc(x, hy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const gazeOffset =
      stage.gaze === "left"
        ? -radius * 0.2
        : stage.gaze === "right"
          ? radius * 0.2
          : 0;
    ctx.fillStyle = "#25333c";
    for (const eye of [-0.35, 0.35]) {
      ctx.beginPath();
      ctx.arc(
        x + radius * eye + gazeOffset,
        hy - radius * 0.15,
        Math.max(1.5, radius * 0.12),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(x, hy + radius);
    ctx.lineTo(x, fy - radius * 2);
    ctx.moveTo(x - radius * 1.4, hy + radius * 2.4);
    ctx.lineTo(x + radius * 1.4, hy + radius * 2.4);
    ctx.moveTo(x, fy - radius * 2);
    ctx.lineTo(x - radius, fy);
    ctx.moveTo(x, fy - radius * 2);
    ctx.lineTo(x + radius, fy);
    ctx.stroke();
    ctx.fillStyle = "#333";
    ctx.font = "13px sans-serif";
    ctx.fillText("배우", x + radius + 6, hy);
  }
}

function renderEdit(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  edit: ImageEdit,
) {
  const sx = (image.naturalWidth * edit.left) / 100,
    sy = (image.naturalHeight * edit.top) / 100;
  const sw = (image.naturalWidth * (100 - edit.left - edit.right)) / 100,
    sh = (image.naturalHeight * (100 - edit.top - edit.bottom)) / 100;
  if (sw <= 0 || sh <= 0) return;
  const scale = Math.min(1, 2048 / Math.max(sw, sh));
  const rw = Math.round(sw * scale),
    rh = Math.round(sh * scale);
  const sideways = Math.abs(edit.rotation) % 180 === 90;
  canvas.width = sideways ? rh : rw;
  canvas.height = sideways ? rw : rh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((edit.rotation * Math.PI) / 180);
  ctx.filter = `brightness(${edit.brightness}%) contrast(${edit.contrast}%) saturate(${edit.saturation}%)`;
  ctx.drawImage(image, sx, sy, sw, sh, -rw / 2, -rh / 2, rw, rh);
  ctx.filter = "none";
}

async function upload(canvas: HTMLCanvasElement, name: string): Promise<Asset> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(new Error("이미지를 만들지 못했습니다.")),
      "image/png",
    ),
  );
  const form = new FormData();
  form.append("file", blob, name);
  const response = await fetch("/api/assets", { method: "POST", body: form });
  const data = await response.json();
  if (!response.ok || !data.asset)
    throw new Error(data.error || "이미지를 저장하지 못했습니다.");
  return data.asset as Asset;
}

export default function DirectorStudio({
  project,
  selected,
  onGraphChange,
  onClose,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const edited = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [stage, setStage] = useState<Staging>(
    () =>
      project.graph.nodes.find(
        (node) => node.id === selected && node.kind === "shot",
      )?.staging ?? defaultStaging,
  );
  const [edit, setEdit] = useState<ImageEdit>(initialEdit);
  const [tab, setTab] = useState<"camera" | "image">("camera");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedNode = project.graph.nodes.find((node) => node.id === selected);
  const shot = selectedNode?.kind === "shot" ? selectedNode : null;
  const source = selectedNode?.asset?.type === "image" ? selectedNode : null;
  const setStageValue = <K extends keyof Staging>(key: K, value: Staging[K]) =>
    setStage((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (preview.current) paint(preview.current, stage);
  }, [stage, tab]);
  const updateImage = useCallback(() => {
    if (
      edited.current &&
      imageRef.current?.complete &&
      imageRef.current.naturalWidth
    )
      renderEdit(edited.current, imageRef.current, edit);
  }, [edit]);
  useEffect(() => {
    updateImage();
  }, [updateImage, source?.asset?.url, tab]);

  function updateGraph(update: (graph: Graph) => Graph) {
    if (!onGraphChange(project.id, update))
      throw new Error(
        "프로젝트가 바뀌었습니다. 원래 프로젝트에서 다시 시도해 주세요.",
      );
  }
  async function saveGuide() {
    if (!shot || !preview.current) return;
    setBusy(true);
    setError("");
    try {
      const asset = await upload(preview.current, "blocking-guide.png");
      updateGraph((graph) => addStagingGuide(graph, shot.id, uid(), asset));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  async function saveEdited() {
    if (!source?.asset || !edited.current) return;
    setBusy(true);
    setError("");
    try {
      const asset = await upload(edited.current, "edited-image.png");
      updateGraph((graph) =>
        addEditedImage(graph, source.id, source.asset!.url, uid(), asset),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const rangeHelp: Record<string, string> = {
    "좌우 회전": "카메라의 좌우 회전 각도를 도 단위로 조정합니다.",
    "상하 각도": "카메라의 상하 각도를 도 단위로 조정합니다.",
    초점거리: "렌즈의 초점거리를 mm 단위로 조정합니다.",
    "배우 좌우": "배우의 좌우 위치를 미터 단위로 조정합니다.",
    "배우 깊이": "배우와 카메라 사이의 거리를 미터 단위로 조정합니다.",
    "소품 좌우": "소품의 좌우 위치를 미터 단위로 조정합니다.",
    "소품 깊이": "소품과 카메라 사이의 거리를 미터 단위로 조정합니다.",
    "왼쪽 자르기": "이미지 왼쪽에서 잘라낼 비율을 퍼센트로 정합니다.",
    "오른쪽 자르기": "이미지 오른쪽에서 잘라낼 비율을 퍼센트로 정합니다.",
    "위 자르기": "이미지 위쪽에서 잘라낼 비율을 퍼센트로 정합니다.",
    "아래 자르기": "이미지 아래쪽에서 잘라낼 비율을 퍼센트로 정합니다.",
    밝기: "원본 대비 이미지 밝기를 퍼센트로 조정합니다.",
    대비: "원본 대비 이미지 명암을 퍼센트로 조정합니다.",
    채도: "원본 대비 이미지 채도를 퍼센트로 조정합니다.",
  };
  const range = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    change: (value: number) => void,
    suffix = "",
  ) => (
    <label className="director-control">
      <span>
        {label}{" "}
        <output>
          {value}
          {suffix}
        </output>
      </span>
      <input
        type="range"
        title={rangeHelp[label]}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => change(Number(event.target.value))}
      />
    </label>
  );
  return (
    <dialog
      ref={dialog}
      className="director-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="director-title"
    >
      <div className="director-header">
        <div>
          <h2 id="director-title">연출 스튜디오</h2>
          <p>카메라와 동선을 계획하고 이미지를 다듬습니다.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="연출 스튜디오 닫기"
          title="연출 스튜디오를 닫고 캔버스로 돌아갑니다."
        >
          닫기
        </button>
      </div>
      <div className="director-tabs" role="tablist" aria-label="연출 도구">
        <button
          role="tab"
          title="카메라 구도와 배우·소품 배치 화면을 엽니다."
          aria-selected={tab === "camera"}
          onClick={() => setTab("camera")}
        >
          카메라와 배치
        </button>
        <button
          role="tab"
          title="선택한 이미지의 자르기와 색상 조정 화면을 엽니다."
          aria-selected={tab === "image"}
          onClick={() => setTab("image")}
        >
          이미지 편집
        </button>
      </div>
      {tab === "camera" ? (
        <div className="director-layout">
          <div className="director-view">
            <canvas
              ref={preview}
              width={720}
              height={405}
              aria-label="카메라 원근 프리비즈"
            />
            <p>
              단순한 도형으로 보는 카메라 시점입니다. 인물의 눈으로 시선 방향을
              표시합니다. 오버숄더는 전경 실루엣으로 표시합니다.
            </p>
            <div className="director-presets">
              {Object.entries(cameraPresets).map(([name, value]) => (
                <button
                  key={name}
                  title={`${name} 구도와 초점거리 설정을 적용합니다.`}
                  onClick={() =>
                    setStage((current) => ({ ...current, ...value }))
                  }
                >
                  {name}
                </button>
              ))}
            </div>
            <p>선택 샷: {shot?.title || "새 샷으로 추가"}</p>
            <div className="director-actions">
              <button
                title="현재 촬영 설정을 선택한 샷에 적용하거나 새 샷을 만듭니다."
                onClick={() => {
                  try {
                    setError("");
                    updateGraph((graph) =>
                      applyStaging(graph, shot?.id ?? null, uid(), stage),
                    );
                  } catch (cause) {
                    setError((cause as Error).message);
                  }
                }}
              >
                촬영 지시 {shot ? "적용" : "새 샷 추가"}
              </button>
              <button
                title="배치도 이미지를 선택한 샷의 연출 확인용 가이드로 저장합니다."
                disabled={!shot || busy}
                onClick={() => void saveGuide()}
              >
                배치도 가이드 저장
              </button>
            </div>
            <p>배치도는 연출 확인용 가이드 연결로 저장됩니다.</p>
          </div>
          <div className="director-controls">
            {range(
              "좌우 회전",
              stage.yaw,
              -40,
              40,
              1,
              (value) => setStageValue("yaw", value),
              "°",
            )}
            {range(
              "상하 각도",
              stage.pitch,
              -25,
              25,
              1,
              (value) => setStageValue("pitch", value),
              "°",
            )}
            {range(
              "초점거리",
              stage.focal,
              18,
              85,
              1,
              (value) => setStageValue("focal", value),
              "mm",
            )}
            {range(
              "배우 좌우",
              stage.actorX,
              -4,
              4,
              0.1,
              (value) => setStageValue("actorX", value),
              "m",
            )}
            {range(
              "배우 깊이",
              stage.actorZ,
              0,
              10,
              0.1,
              (value) => setStageValue("actorZ", value),
              "m",
            )}
            {range(
              "소품 좌우",
              stage.propX,
              -4,
              4,
              0.1,
              (value) => setStageValue("propX", value),
              "m",
            )}
            {range(
              "소품 깊이",
              stage.propZ,
              0,
              10,
              0.1,
              (value) => setStageValue("propZ", value),
              "m",
            )}
            <label>
              카메라 앵글
              <select
                title="촬영 지시에 사용할 카메라 앵글을 선택합니다."
                value={stage.angle}
                onChange={(event) => setStageValue("angle", event.target.value)}
              >
                {["눈높이", "하이 앵글", "로우 앵글", "탑샷"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              카메라 이동
              <select
                title="촬영 지시에 사용할 카메라 이동을 선택합니다."
                value={stage.movement}
                onChange={(event) =>
                  setStageValue("movement", event.target.value)
                }
              >
                {["고정", "돌리 인", "트래킹", "핸드헬드", "팬"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              배우 시선
              <select
                title="배우가 바라볼 화면 방향을 선택합니다."
                value={stage.gaze ?? "camera"}
                onChange={(event) =>
                  setStageValue("gaze", event.target.value as Staging["gaze"])
                }
              >
                <option value="camera">카메라</option>
                <option value="left">화면 왼쪽</option>
                <option value="right">화면 오른쪽</option>
              </select>
            </label>
            <label>
              표정 프리셋
              <select
                title="배우의 표정과 행동 예시를 적용합니다."
                value=""
                onChange={(event) => {
                  if (event.target.value)
                    setStageValue("expression", event.target.value);
                }}
              >
                <option value="">선택</option>
                {[
                  "차분하게 상대를 바라본다",
                  "놀라 눈을 크게 뜨고 숨을 멈춘다",
                  "걱정스럽게 시선을 내린다",
                  "미소를 감추며 고개를 끄덕인다",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              표정과 행동
              <textarea
                value={stage.expression}
                onChange={(event) =>
                  setStageValue("expression", event.target.value)
                }
                maxLength={500}
              />
            </label>
            <label>
              필름 룩 프리셋
              <select
                title="필름 룩 예시를 선택해 촬영 지시에 적용합니다."
                value=""
                onChange={(event) => {
                  if (event.target.value)
                    setStageValue("look", event.target.value);
                }}
              >
                <option value="">선택</option>
                {[
                  "자연스러운 필름",
                  "저채도 느와르",
                  "따뜻한 빈티지 필름",
                  "선명한 현대 드라마",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              필름 룩
              <input
                value={stage.look}
                onChange={(event) => setStageValue("look", event.target.value)}
                maxLength={160}
              />
            </label>
            <label>
              광원 프리셋
              <select
                title="광원 예시를 선택해 촬영 지시에 적용합니다."
                value=""
                onChange={(event) => {
                  if (event.target.value)
                    setStageValue("light", event.target.value);
                }}
              >
                <option value="">선택</option>
                {[
                  "창가의 부드러운 빛",
                  "따뜻한 측면 조명",
                  "강한 역광",
                  "흐린 날의 확산광",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              광원
              <input
                value={stage.light}
                onChange={(event) => setStageValue("light", event.target.value)}
                maxLength={160}
              />
            </label>
          </div>
        </div>
      ) : (
        <div className="director-layout">
          {source?.asset ? (
            <>
              <div className="director-view">
                <div className="director-compare">
                  <figure>
                    <figcaption>원본</figcaption>
                    <Image
                      ref={imageRef}
                      src={source.asset.url}
                      alt={source.asset.name}
                      width={1024}
                      height={1024}
                      unoptimized
                      onLoad={updateImage}
                    />
                  </figure>
                  <figure>
                    <figcaption>편집 미리보기</figcaption>
                    <canvas ref={edited} aria-label="이미지 편집 미리보기" />
                  </figure>
                </div>
                <button
                  title="원본은 그대로 두고 편집한 PNG를 새 참조 노드로 저장합니다."
                  disabled={busy}
                  onClick={() => void saveEdited()}
                >
                  편집본을 새 참조로 저장
                </button>
                <p>원본은 그대로 두고 최대 2048px PNG 복사본을 만듭니다.</p>
              </div>
              <div className="director-controls">
                {(["left", "right", "top", "bottom"] as const).map((key) =>
                  range(
                    {
                      left: "왼쪽 자르기",
                      right: "오른쪽 자르기",
                      top: "위 자르기",
                      bottom: "아래 자르기",
                    }[key],
                    edit[key],
                    0,
                    45,
                    1,
                    (value) =>
                      setEdit((current) => ({ ...current, [key]: value })),
                    "%",
                  ),
                )}
                {(["brightness", "contrast", "saturation"] as const).map(
                  (key) =>
                    range(
                      {
                        brightness: "밝기",
                        contrast: "대비",
                        saturation: "채도",
                      }[key],
                      edit[key],
                      0,
                      200,
                      1,
                      (value) =>
                        setEdit((current) => ({ ...current, [key]: value })),
                      "%",
                    ),
                )}
                <label>
                  회전
                  <select
                    title="이미지를 시계 방향으로 회전할 각도를 도 단위로 선택합니다."
                    value={edit.rotation}
                    onChange={(event) =>
                      setEdit((current) => ({
                        ...current,
                        rotation: Number(event.target.value),
                      }))
                    }
                  >
                    {[0, 90, 180, 270].map((value) => (
                      <option value={value} key={value}>
                        {value}°
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  title="자르기, 회전과 색상 조정을 초기값으로 되돌립니다."
                  onClick={() => setEdit(initialEdit)}
                >
                  조정 초기화
                </button>
              </div>
            </>
          ) : (
            <p className="director-empty">
              이미지가 첨부된 노드를 선택하고 이미지 편집을 열어 주세요.
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="director-error">
          {error}
        </p>
      )}
      <p className="director-note">
        이 컴퓨터에서 촬영을 계획하고 이미지를 간단히 조정합니다.
      </p>
    </dialog>
  );
}
