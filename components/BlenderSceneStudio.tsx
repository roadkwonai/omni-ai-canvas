"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Box, Clapperboard, Film, Save, Upload, X } from "lucide-react";
import {
  defaultBlenderScene,
  parseBlenderScene,
  type BlenderSceneSpec,
} from "../lib/blender-scene-spec";
import type { Asset, CanvasNode, Project } from "../lib/types";
import "./blender-scene-studio.css";

import { lipCuesFromWords, parseTimedWords } from "../lib/blender-lip-cues";

function LipCueGenerator({
  project,
  keys,
  duration,
  onApply,
}: {
  project: Project;
  keys: string[];
  duration: number;
  onApply: (cues: { key: string; time: number; value: number }[]) => void;
}) {
  const listId = useId();
  const [timelineId, setTimelineId] = useState("");
  const [key, setKey] = useState("");
  const [offset, setOffset] = useState(0);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const timelines = project.graph.nodes.filter(
    (node) => node.timeline?.words?.length,
  );
  return (
    <details>
      <summary>단어 시각에 맞춰 입 모양 큐 만들기</summary>
      <p>
        단어 시작·중간·끝에 입 모양을 배치합니다. 생성 후 시각과 강도를
        수정하세요.
      </p>
      <label>
        단어 자막 타임라인
        <select
          value={timelineId}
          onChange={(e) => setTimelineId(e.target.value)}
        >
          <option value="">직접 붙여넣기</option>
          {timelines.map((node) => (
            <option key={node.id} value={node.id}>
              {node.title}
            </option>
          ))}
        </select>
      </label>
      {!timelineId && (
        <label>
          단어 시각 JSON (30fps 프레임)
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={'[{"text":"안녕","startFrame":0,"endFrame":15}]'}
          />
        </label>
      )}
      <label>
        입 벌림 shape key
        <input
          list={listId}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <datalist id={listId}>
        {keys.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <label>
        샷의 타임라인 시작 시각(초)
        <input
          type="number"
          min="0"
          step="0.1"
          value={offset}
          onChange={(e) => setOffset(Number(e.target.value))}
        />
      </label>
      <button
        type="button"
        onClick={() => {
          try {
            const words = timelineId
              ? (project.graph.nodes.find((node) => node.id === timelineId)
                  ?.timeline?.words ?? [])
              : parseTimedWords(input);
            const cues = lipCuesFromWords(words, key, duration, offset);
            if (!cues.length)
              throw new Error("샷 시간 안에 사용할 단어가 없습니다.");
            onApply(cues);
            setError("");
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "큐를 만들지 못했습니다.",
            );
          }
        }}
      >
        기존 입 큐를 새 큐로 교체
      </button>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}

type ModelAsset = {
  id: string;
  name: string;
  source: string;
  credit: string;
  meshes: string[];
  bones: string[];
  animations: string[];
  shapeKeys?: string[];
};

type PendingRender = {
  asset: Asset;
  sceneId: string;
  spec: BlenderSceneSpec;
  quality: "preview" | "final";
  createdAt: string;
};

type Props = {
  project: Project;
  initialNode?: CanvasNode;
  onClose: () => void;
  onSave: (spec: BlenderSceneSpec, nodeId?: string) => Promise<string>;
  onTake: (
    sceneId: string,
    spec: BlenderSceneSpec,
    asset: Asset,
    mode: "preview" | "final",
    acceptPrevious?: boolean,
  ) => Promise<string>;
  onTimeline: (takeId: string, timelineId?: string) => Promise<void>;
  onBlockingFrame?: (takeId: string, seconds: number) => Promise<void>;
  prepareProject: () => Promise<number>;
};

type Vector = [number, number, number];

function VectorFields({
  label,
  value,
  onChange,
  step = 0.1,
}: {
  label: string;
  value: Vector;
  onChange: (value: Vector) => void;
  step?: number;
}) {
  return (
    <fieldset className="blender-vector">
      <legend>{label}</legend>
      {(["X", "Y", "Z"] as const).map((axis, index) => (
        <label key={axis}>
          {axis}
          <input
            type="number"
            step={step}
            value={Number.isFinite(value[index]) ? value[index] : ""}
            onChange={(event) => {
              const next: Vector = [...value];
              next[index] =
                event.target.value === "" ? NaN : Number(event.target.value);
              onChange(next);
            }}
          />
        </label>
      ))}
    </fieldset>
  );
}

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data as T;
}

export default function BlenderSceneStudio({
  project,
  initialNode,
  onClose,
  onSave,
  onTake,
  onTimeline,
  onBlockingFrame,
  prepareProject,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  const [assets, setAssets] = useState<ModelAsset[]>([]);
  const [spec, setSpec] = useState<BlenderSceneSpec>(
    () =>
      parseBlenderScene(initialNode?.blenderScene) ??
      defaultBlenderScene("", ""),
  );
  const [sceneId, setSceneId] = useState(initialNode?.id);
  const [source, setSource] = useState("");
  const [credit, setCredit] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{
    asset: Asset;
    spec: BlenderSceneSpec;
    mode: "preview" | "final";
    sceneId: string;
    takeId?: string;
  } | null>(null);
  const [recoverable, setRecoverable] = useState<PendingRender[]>([]);
  const [previewSignature, setPreviewSignature] = useState("");
  const [selectedTimeline, setSelectedTimeline] = useState("");
  const [historyTake, setHistoryTake] = useState("");
  const [frameTime, setFrameTime] = useState(0);
  const character = assets.find((item) => item.id === spec.characterId);
  const environment = assets.find((item) => item.id === spec.environmentId);
  const legacyPose = spec.bone
    ? [{ bone: spec.bone, rotation: spec.boneRotation }]
    : [];
  const poses = [
    ...legacyPose.filter(
      (pose) => !spec.poses?.some((item) => item.bone === pose.bone),
    ),
    ...(spec.poses ?? []),
  ];
  const availableBones =
    character?.bones.filter(
      (bone) => !poses.some((pose) => pose.bone === bone),
    ) ?? [];
  const valid =
    !!parseBlenderScene(spec) &&
    !!character &&
    !!environment &&
    (!spec.action || character.animations.includes(spec.action)) &&
    poses.every((pose) => character.bones.includes(pose.bone));
  const timelines = project.graph.nodes.filter(
    (node) => node.kind === "previs" && node.timeline,
  );
  const takeIds = new Set(
    project.graph.edges
      .filter((edge) => edge.source === sceneId)
      .map((edge) => edge.target),
  );
  const previousTakes = project.graph.nodes.filter(
    (node) =>
      takeIds.has(node.id) && node.asset?.type === "video" && node.blenderTake,
  );
  const unregistered = recoverable.filter(
    (render) =>
      !project.graph.nodes.some((node) => node.asset?.url === render.asset.url),
  );

  useEffect(() => {
    const element = dialog.current;
    active.current = true;
    element?.showModal();
    const controller = new AbortController();
    fetch(`/api/projects/${project.id}/blender/assets`, {
      signal: controller.signal,
    })
      .then((response) => readResponse<{ assets: ModelAsset[] }>(response))
      .then((data) => setAssets(data.assets))
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "3D 자산을 불러오지 못했습니다.",
          );
      });
    return () => {
      active.current = false;
      controller.abort();
      element?.close();
    };
  }, [project.id]);

  useEffect(() => {
    if (!sceneId) return;
    const controller = new AbortController();
    fetch(
      `/api/projects/${project.id}/blender/render?sceneId=${encodeURIComponent(sceneId)}`,
      { signal: controller.signal },
    )
      .then((response) => readResponse<{ renders: PendingRender[] }>(response))
      .then((data) => setRecoverable(data.renders))
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "이전 렌더 결과를 불러오지 못했습니다.",
          );
      });
    return () => controller.abort();
  }, [project.id, sceneId]);

  function update(next: BlenderSceneSpec) {
    if (next.actors?.length) {
      const primary = next.actors[0];
      next = {
        ...next,
        actors: [
          {
            ...primary,
            characterId: next.characterId,
            action: next.action,
            loop: next.loop,
            poses: next.poses ?? [],
            position: next.characterPosition,
            rotation: next.characterRotation,
          },
          ...next.actors.slice(1),
        ],
      };
    }
    setSpec(next);
    setMessage("");
  }

  async function upload(file: File) {
    setBusy("3D 모델을 읽고 있습니다.");
    setError("");
    setMessage("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("source", source.trim());
      body.append("credit", credit.trim());
      const response = await fetch(
        `/api/projects/${project.id}/blender/assets`,
        {
          method: "POST",
          body,
        },
      );
      const data = await readResponse<{ asset: ModelAsset }>(response);
      if (!active.current) return;
      setAssets((current) => [
        data.asset,
        ...current.filter((item) => item.id !== data.asset.id),
      ]);
      setMessage(
        `‘${data.asset.name}’을 자산 목록에 추가했습니다. 캐릭터 또는 배경으로 선택하세요.`,
      );
      setSource("");
      setCredit("");
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "모델을 불러오지 못했습니다.",
        );
    } finally {
      if (active.current) setBusy("");
    }
  }

  async function saveScene() {
    const parsed = parseBlenderScene(spec);
    if (!parsed || !character || !environment) {
      setError("캐릭터와 배경, 장면 설정을 확인해 주세요.");
      return;
    }
    setBusy("장면 노드를 저장하고 있습니다.");
    setError("");
    try {
      const id = await onSave(parsed, sceneId);
      if (!active.current) return;
      setSceneId(id);
      setMessage("장면 노드를 저장했습니다.");
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "장면을 저장하지 못했습니다.",
        );
    } finally {
      if (active.current) setBusy("");
    }
  }

  async function render(mode: "preview" | "final") {
    const parsed = parseBlenderScene(spec);
    if (!parsed || !character || !environment || busy) {
      setError("캐릭터와 배경, 장면 설정을 확인해 주세요.");
      return;
    }
    setBusy(
      mode === "preview"
        ? "프리비즈를 렌더하고 있습니다."
        : "최종 영상을 렌더하고 있습니다.",
    );
    setError("");
    setMessage("");
    try {
      const id = await onSave(parsed, sceneId);
      if (!active.current) return;
      setSceneId(id);
      const version = await prepareProject();
      const response = await fetch(
        `/api/projects/${project.id}/blender/render`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version,
            sceneId: id,
            spec: parsed,
            quality: mode,
          }),
        },
      );
      const data = await readResponse<{ asset: Asset }>(response);
      if (!active.current) return;
      setFrameTime(0);
      setResult({ asset: data.asset, spec: parsed, mode, sceneId: id });
      const takeId = await onTake(id, parsed, data.asset, mode);
      if (!active.current) return;
      if (mode === "preview") setPreviewSignature(JSON.stringify(parsed));
      setResult({ asset: data.asset, spec: parsed, mode, sceneId: id, takeId });
      setMessage(
        mode === "preview"
          ? "프리비즈를 영상 노드에 추가했습니다."
          : "최종 영상을 영상 노드에 추가했습니다.",
      );
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "영상을 렌더하지 못했습니다.",
        );
    } finally {
      if (active.current) setBusy("");
    }
  }

  const selectCharacter = (id: string) =>
    update({
      ...spec,
      characterId: id,
      action: null,
      bone: null,
      boneRotation: [0, 0, 0],
      poses: [],
    });

  function cameraPreset(preset: "top" | "eye" | "side") {
    const [x, y, z] = spec.characterPosition;
    if (![x, y, z].every(Number.isFinite)) {
      setError("캐릭터 위치를 먼저 확인해 주세요.");
      return;
    }
    const limit = (value: number) => Math.max(-100, Math.min(100, value));
    const target: Vector = [x, y, Math.min(99, limit(z + 1))];
    const position: Vector =
      preset === "top"
        ? [x, y, limit(z + 8)]
        : preset === "eye"
          ? [x, limit(y - 6), limit(z + 1.65)]
          : [limit(x + 6), y, limit(z + 1.65)];
    update({
      ...spec,
      camera: { ...spec.camera, position, endPosition: [...position], target },
    });
    setError("");
  }

  return (
    <dialog
      ref={dialog}
      className="blender-scene"
      aria-labelledby="blender-scene-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="blender-scene-header">
        <div>
          <span className="blender-scene-eyebrow">
            <Box size={15} /> 3D 장면
          </span>
          <h2 id="blender-scene-title">장면 만들기</h2>
          <p>캐릭터와 배경을 배치하고 카메라와 조명을 조정합니다.</p>
        </div>
        <button
          type="button"
          className="blender-icon"
          aria-label="3D 장면 닫기"
          title="3D 장면 편집기를 닫습니다."
          onClick={onClose}
          disabled={!!busy}
        >
          <X size={20} />
        </button>
      </header>
      <div className="blender-scene-content">
        <fieldset disabled={!!busy} className="blender-scene-form">
          <section
            className="blender-section"
            aria-labelledby="blender-assets-title"
          >
            <div className="blender-heading">
              <div>
                <h3 id="blender-assets-title">캐릭터와 배경</h3>
                <p>프로젝트의 GLB 파일을 불러옵니다.</p>
              </div>
            </div>
            <details className="blender-upload">
              <summary>
                <Upload size={16} /> GLB 파일 추가
              </summary>
              <div className="blender-fields blender-upload-details">
                <label>
                  출처 주소 또는 이름
                  <input
                    value={source}
                    maxLength={500}
                    onChange={(event) => setSource(event.target.value)}
                    placeholder="예: Kenney Nature Kit"
                  />
                </label>
                <label>
                  저작자·라이선스
                  <input
                    value={credit}
                    maxLength={500}
                    onChange={(event) => setCredit(event.target.value)}
                    placeholder="예: Kenney · CC0"
                  />
                </label>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept=".glb,model/gltf-binary"
                hidden
                aria-label="GLB 파일 선택"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.currentTarget.value = "";
                }}
              />
              <button type="button" onClick={() => fileInput.current?.click()}>
                <Upload size={15} /> 파일 선택
              </button>
            </details>
            <div className="blender-fields">
              <label>
                캐릭터
                <select
                  value={spec.characterId}
                  onChange={(event) => selectCharacter(event.target.value)}
                >
                  <option value="">캐릭터 선택</option>
                  {assets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                배경
                <select
                  value={spec.environmentId}
                  onChange={(event) =>
                    update({ ...spec, environmentId: event.target.value })
                  }
                >
                  <option value="">배경 선택</option>
                  {assets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {(character || environment) && (
              <div className="blender-asset-summary">
                {character && (
                  <p>
                    <strong>캐릭터</strong> 메시 {character.meshes.length}개 ·
                    뼈 {character.bones.length}개 · 애니메이션{" "}
                    {character.animations.length}개
                  </p>
                )}
                {environment && (
                  <p>
                    <strong>배경</strong> 메시 {environment.meshes.length}개{" "}
                    {environment.credit ? `· ${environment.credit}` : ""}
                  </p>
                )}
              </div>
            )}
            {spec.characterId && !character && (
              <p className="blender-error">
                저장된 캐릭터 파일을 찾을 수 없습니다. 다시 불러와 주세요.
              </p>
            )}
            {spec.environmentId && !environment && (
              <p className="blender-error">
                저장된 배경 파일을 찾을 수 없습니다. 다시 불러와 주세요.
              </p>
            )}
          </section>

          <section
            className="blender-section"
            aria-labelledby="blender-performance-title"
          >
            <h3 id="blender-performance-title">캐릭터 동작과 배치</h3>
            <p>
              배역별 포즈와 표정, 입 모양을 설정합니다. 입 모양은 시각마다 직접 지정합니다.
            </p>
            {(spec.actors ?? []).map((actor, index) => {
              const asset = assets.find(
                (item) => item.id === actor.characterId,
              );
              const change = (patch: Partial<typeof actor>) =>
                update({
                  ...spec,
                  actors: spec.actors!.map((item, position) =>
                    position === index ? { ...item, ...patch } : item,
                  ),
                });
              return (
                <fieldset key={index}>
                  <legend>
                    {index === 0
                      ? "주 배역 표정·입 모양"
                      : `추가 배역 ${index}`}
                  </legend>
                  {index > 0 && (
                    <>
                      <label>
                        캐릭터
                        <select
                          value={actor.characterId}
                          onChange={(event) =>
                            change({
                              characterId: event.target.value,
                              action: null,
                              poses: [],
                              expressions: [],
                              lipCues: [],
                            })
                          }
                        >
                          {assets.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        애니메이션
                        <select
                          value={actor.action ?? ""}
                          onChange={(event) =>
                            change({ action: event.target.value || null })
                          }
                        >
                          <option value="">기본 자세</option>
                          {asset?.animations.map((name) => (
                            <option key={name}>{name}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={actor.loop}
                          onChange={(e) => change({ loop: e.target.checked })}
                        />
                        동작 반복
                      </label>
                      <VectorFields
                        label="배역 위치"
                        value={actor.position}
                        onChange={(position) => change({ position })}
                      />
                      <label>
                        회전
                        <input
                          type="number"
                          value={actor.rotation}
                          onChange={(event) =>
                            change({ rotation: Number(event.target.value) })
                          }
                        />
                      </label>
                      {actor.poses.map((pose, i) => (
                        <div key={i}>
                          <VectorFields
                            label={pose.bone + " 회전"}
                            value={pose.rotation}
                            onChange={(rotation) =>
                              change({
                                poses: actor.poses.map((v, j) =>
                                  j === i ? { ...v, rotation } : v,
                                ),
                              })
                            }
                          />
                          <button
                            type="button"
                            onClick={() =>
                              change({
                                poses: actor.poses.filter((_, j) => j !== i),
                              })
                            }
                          >
                            포즈 삭제
                          </button>
                        </div>
                      ))}
                      <label>
                        포즈 본 추가
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value)
                              change({
                                poses: [
                                  ...actor.poses,
                                  { bone: e.target.value, rotation: [0, 0, 0] },
                                ],
                              });
                          }}
                        >
                          <option value="">본 선택</option>
                          {asset?.bones
                            .filter(
                              (bone) =>
                                !actor.poses.some((p) => p.bone === bone),
                            )
                            .map((bone) => (
                              <option key={bone}>{bone}</option>
                            ))}
                        </select>
                      </label>
                    </>
                  )}
                  {actor.expressions.map((expression, i) => (
                    <div key={i}>
                      <label>
                        표정 키
                        <input
                          list={`shapes-${index}`}
                          value={expression.key}
                          onChange={(e) =>
                            change({
                              expressions: actor.expressions.map((v, j) =>
                                j === i ? { ...v, key: e.target.value } : v,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        강도
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.1"
                          value={expression.value}
                          onChange={(e) =>
                            change({
                              expressions: actor.expressions.map((v, j) =>
                                j === i
                                  ? { ...v, value: Number(e.target.value) }
                                  : v,
                              ),
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          change({
                            expressions: actor.expressions.filter(
                              (_, j) => j !== i,
                            ),
                          })
                        }
                      >
                        표정 삭제
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={actor.expressions.length >= 32}
                    onClick={() =>
                      change({
                        expressions: [
                          ...actor.expressions,
                          { key: asset?.shapeKeys?.[0] ?? "표정", value: 0.5 },
                        ],
                      })
                    }
                  >
                    표정 추가
                  </button>
                  <LipCueGenerator
                    project={project}
                    keys={asset?.shapeKeys ?? []}
                    duration={spec.seconds}
                    onApply={(lipCues) => change({ lipCues })}
                  />
                  {actor.lipCues.map((cue, i) => (
                    <div key={i}>
                      <label>
                        입 모양 키
                        <input
                          list={`shapes-${index}`}
                          value={cue.key}
                          onChange={(e) =>
                            change({
                              lipCues: actor.lipCues.map((v, j) =>
                                j === i ? { ...v, key: e.target.value } : v,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        시각(초)
                        <input
                          type="number"
                          min="0"
                          max={spec.seconds}
                          step="0.1"
                          value={cue.time}
                          onChange={(e) =>
                            change({
                              lipCues: actor.lipCues.map((v, j) =>
                                j === i
                                  ? { ...v, time: Number(e.target.value) }
                                  : v,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        강도
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.1"
                          value={cue.value}
                          onChange={(e) =>
                            change({
                              lipCues: actor.lipCues.map((v, j) =>
                                j === i
                                  ? { ...v, value: Number(e.target.value) }
                                  : v,
                              ),
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          change({
                            lipCues: actor.lipCues.filter((_, j) => j !== i),
                          })
                        }
                      >
                        큐 삭제
                      </button>
                    </div>
                  ))}
                  <datalist id={`shapes-${index}`}>
                    {asset?.shapeKeys?.map((key) => (
                      <option key={key} value={key} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    disabled={actor.lipCues.length >= 120}
                    onClick={() =>
                      change({
                        lipCues: [
                          ...actor.lipCues,
                          {
                            key: asset?.shapeKeys?.[0] ?? "입",
                            time: 0,
                            value: 1,
                          },
                        ],
                      })
                    }
                  >
                    입 모양 큐 추가
                  </button>
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        update({
                          ...spec,
                          actors: spec.actors!.filter(
                            (_, position) => position !== index,
                          ),
                        })
                      }
                    >
                      배역 삭제
                    </button>
                  )}
                </fieldset>
              );
            })}
            {!spec.actors?.length && (
              <button
                type="button"
                disabled={!character}
                onClick={() =>
                  update({
                    ...spec,
                    actors: [
                      {
                        characterId: spec.characterId,
                        action: spec.action,
                        loop: spec.loop,
                        poses,
                        position: spec.characterPosition,
                        rotation: spec.characterRotation,
                        expressions: [],
                        lipCues: [],
                      },
                    ],
                  })
                }
              >
                배역 표정·입 모양 설정
              </button>
            )}
            <button
              type="button"
              disabled={!character || (spec.actors?.length ?? 1) >= 4}
              onClick={() => {
                const main = spec.actors?.[0] ?? {
                  characterId: spec.characterId,
                  action: spec.action,
                  loop: spec.loop,
                  poses,
                  position: spec.characterPosition,
                  rotation: spec.characterRotation,
                  expressions: [],
                  lipCues: [],
                };
                update({
                  ...spec,
                  actors: [
                    ...(spec.actors ?? [main]),
                    {
                      ...main,
                      position: [
                        main.position[0] + 2,
                        main.position[1],
                        main.position[2],
                      ],
                      expressions: [],
                      lipCues: [],
                    },
                  ],
                });
              }}
            >
              배역 추가
            </button>
            <div className="blender-fields">
              <label>
                애니메이션
                <select
                  value={spec.action ?? ""}
                  onChange={(event) =>
                    update({ ...spec, action: event.target.value || null })
                  }
                >
                  <option value="">기본 자세</option>
                  {character?.animations.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="blender-check">
              <input
                type="checkbox"
                checked={spec.loop}
                onChange={(event) =>
                  update({ ...spec, loop: event.target.checked })
                }
              />{" "}
              애니메이션 반복
            </label>
            <div className="blender-poses">
              <strong>포즈 조정</strong>
              <p>리그에서 뼈를 추가해 여러 부위를 회전할 수 있습니다.</p>
              {poses.map((pose) => (
                <div className="blender-pose" key={pose.bone}>
                  <VectorFields
                    label={`${pose.bone} 회전 · 도`}
                    value={pose.rotation}
                    step={1}
                    onChange={(rotation) =>
                      update({
                        ...spec,
                        bone: null,
                        boneRotation: [0, 0, 0],
                        poses: poses.map((item) =>
                          item.bone === pose.bone
                            ? { ...item, rotation }
                            : item,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    aria-label={`${pose.bone} 포즈 삭제`}
                    onClick={() =>
                      update({
                        ...spec,
                        bone: null,
                        boneRotation: [0, 0, 0],
                        poses: poses.filter((item) => item.bone !== pose.bone),
                      })
                    }
                  >
                    삭제
                  </button>
                </div>
              ))}
              <label>
                뼈 추가
                <select
                  value=""
                  disabled={!availableBones.length || poses.length >= 32}
                  onChange={(event) => {
                    if (!event.target.value) return;
                    update({
                      ...spec,
                      bone: null,
                      boneRotation: [0, 0, 0],
                      poses: [
                        ...poses,
                        { bone: event.target.value, rotation: [0, 0, 0] },
                      ],
                    });
                  }}
                >
                  <option value="">
                    {character?.bones.length
                      ? "조정할 뼈 선택"
                      : "선택한 모델에 뼈가 없습니다"}
                  </option>
                  {availableBones.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="blender-grid">
              <VectorFields
                label="캐릭터 위치"
                value={spec.characterPosition}
                onChange={(value) =>
                  update({ ...spec, characterPosition: value })
                }
              />
              <VectorFields
                label="배경 위치"
                value={spec.environmentPosition}
                onChange={(value) =>
                  update({ ...spec, environmentPosition: value })
                }
              />
              <label>
                캐릭터 회전 · 도
                <input
                  type="number"
                  step={1}
                  value={
                    Number.isFinite(spec.characterRotation)
                      ? spec.characterRotation
                      : ""
                  }
                  onChange={(event) =>
                    update({
                      ...spec,
                      characterRotation:
                        event.target.value === ""
                          ? NaN
                          : Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                배경 크기
                <input
                  type="number"
                  min="0.01"
                  step="0.1"
                  value={
                    Number.isFinite(spec.environmentScale)
                      ? spec.environmentScale
                      : ""
                  }
                  onChange={(event) =>
                    update({
                      ...spec,
                      environmentScale:
                        event.target.value === ""
                          ? NaN
                          : Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
          </section>

          <section
            className="blender-section"
            aria-labelledby="blender-camera-title"
          >
            <h3 id="blender-camera-title">카메라와 조명</h3>
            <p>
              카메라가 시작 위치에서 끝 위치로 이동하며 목표 지점을 바라봅니다.
            </p>
            <div
              className="blender-camera-presets"
              role="group"
              aria-label="카메라 위치 시작점"
            >
              <button
                type="button"
                title="캐릭터 위에서 공간 배치를 내려다보는 정지 카메라로 시작합니다."
                onClick={() => cameraPreset("top")}
              >
                탑뷰 블로킹
              </button>
              <button
                type="button"
                title="캐릭터 앞쪽 눈높이에서 바라보는 카메라로 시작합니다."
                onClick={() => cameraPreset("eye")}
              >
                눈높이
              </button>
              <button
                type="button"
                title="캐릭터 측면에서 바라보는 카메라로 시작합니다."
                onClick={() => cameraPreset("side")}
              >
                측면
              </button>
            </div>
            <div className="blender-grid">
              <VectorFields
                label="카메라 시작 위치"
                value={spec.camera.position}
                onChange={(value) =>
                  update({
                    ...spec,
                    camera: { ...spec.camera, position: value },
                  })
                }
              />
              <VectorFields
                label="카메라 끝 위치"
                value={spec.camera.endPosition}
                onChange={(value) =>
                  update({
                    ...spec,
                    camera: { ...spec.camera, endPosition: value },
                  })
                }
              />
              <VectorFields
                label="카메라 목표 지점"
                value={spec.camera.target}
                onChange={(value) =>
                  update({ ...spec, camera: { ...spec.camera, target: value } })
                }
              />
              <label>
                렌즈 · mm
                <input
                  type="number"
                  min="10"
                  max="150"
                  step="1"
                  value={
                    Number.isFinite(spec.camera.lens) ? spec.camera.lens : ""
                  }
                  onChange={(event) =>
                    update({
                      ...spec,
                      camera: {
                        ...spec.camera,
                        lens:
                          event.target.value === ""
                            ? NaN
                            : Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
              <VectorFields
                label="조명 위치"
                value={spec.light.position}
                onChange={(value) =>
                  update({ ...spec, light: { ...spec.light, position: value } })
                }
              />
              <label>
                조명 밝기
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={
                    Number.isFinite(spec.light.power) ? spec.light.power : ""
                  }
                  onChange={(event) =>
                    update({
                      ...spec,
                      light: {
                        ...spec.light,
                        power:
                          event.target.value === ""
                            ? NaN
                            : Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
              <label>
                조명 색
                <input
                  type="color"
                  value={spec.light.color}
                  onChange={(event) =>
                    update({
                      ...spec,
                      light: { ...spec.light, color: event.target.value },
                    })
                  }
                />
              </label>
              <label>
                환경광
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={
                    Number.isFinite(spec.light.ambient)
                      ? spec.light.ambient
                      : ""
                  }
                  onChange={(event) =>
                    update({
                      ...spec,
                      light: {
                        ...spec.light,
                        ambient:
                          event.target.value === ""
                            ? NaN
                            : Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
            </div>
          </section>

          <section
            className="blender-section"
            aria-labelledby="blender-output-title"
          >
            <h3 id="blender-output-title">출력 설정</h3>
            <div className="blender-fields blender-output">
              <label>
                화면비
                <select
                  value={spec.aspect}
                  onChange={(event) =>
                    update({
                      ...spec,
                      aspect: event.target.value as BlenderSceneSpec["aspect"],
                    })
                  }
                >
                  <option value="16:9">가로 16:9</option>
                  <option value="9:16">세로 9:16</option>
                  <option value="1:1">정사각형 1:1</option>
                </select>
              </label>
              <label>
                길이 · 초
                <input
                  type="number"
                  min="1"
                  max="30"
                  step="0.5"
                  value={Number.isFinite(spec.seconds) ? spec.seconds : ""}
                  onChange={(event) =>
                    update({
                      ...spec,
                      seconds:
                        event.target.value === ""
                          ? NaN
                          : Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                프레임
                <select
                  value={spec.fps}
                  onChange={(event) =>
                    update({
                      ...spec,
                      fps: Number(
                        event.target.value,
                      ) as BlenderSceneSpec["fps"],
                    })
                  }
                >
                  <option value={24}>24 fps</option>
                  <option value={30}>30 fps</option>
                </select>
              </label>
            </div>
          </section>
        </fieldset>
        {busy && (
          <p className="blender-status" role="status">
            {busy} Blender 작업은 장면 길이에 따라 시간이 걸립니다.
          </p>
        )}
        {message && (
          <p className="blender-status" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="blender-error" role="alert">
            {error}
          </p>
        )}
        {unregistered.length > 0 && (
          <section className="blender-result">
            <h3>보드에 저장되지 않은 렌더</h3>
            <p>
              렌더 당시의 장면 설정을 확인하고 기존 파일을 영상 노드로 추가할 수
              있습니다.
            </p>
            <ul className="blender-recover-list">
              {unregistered.map((render) => (
                <li key={render.asset.url}>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => {
                      setResult({
                        asset: render.asset,
                        sceneId: render.sceneId,
                        spec: render.spec,
                        mode: render.quality,
                      });
                      setFrameTime(0);
                      setError("");
                      setMessage(
                        "선택한 렌더를 확인하고 영상 노드로 보관하세요.",
                      );
                    }}
                  >
                    {render.quality === "preview" ? "프리비즈" : "최종 렌더"} ·{" "}
                    {render.spec.seconds}초 ·{" "}
                    {new Date(render.createdAt).toLocaleString("ko-KR")}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {previousTakes.length > 0 && (
          <section className="blender-result">
            <label>
              이 장면의 렌더 이력
              <select
                value={historyTake}
                onChange={(event) => {
                  const take = previousTakes.find(
                    (item) => item.id === event.target.value,
                  );
                  setHistoryTake(event.target.value);
                  if (take?.asset && take.blenderTake) setFrameTime(0);
                  if (take?.asset && take.blenderTake)
                    setResult({
                      asset: take.asset,
                      spec: take.blenderTake.scene,
                      mode: take.blenderTake.quality,
                      sceneId: sceneId!,
                      takeId: take.id,
                    });
                }}
              >
                <option value="">기존 테이크 선택</option>
                {previousTakes.map((take) => (
                  <option key={take.id} value={take.id}>
                    {take.title}
                  </option>
                ))}
              </select>
            </label>
          </section>
        )}
        {result && (
          <section className="blender-result">
            <h3>{result.mode === "preview" ? "프리비즈" : "완성 영상"}</h3>
            {JSON.stringify(spec) !== JSON.stringify(result.spec) && (
              <p>아래 영상은 이전 설정으로 렌더했습니다.</p>
            )}
            <video controls playsInline src={result.asset.url} />
            {onBlockingFrame && (
              <div className="blender-blocking">
                <strong>블로킹 참조</strong>
                <p>
                  현재 테이크의 한 프레임을 다음 샷의 연출 확인용 참조로
                  연결합니다. 위에서 본 배치가 필요하면 탑뷰로 렌더한 테이크를
                  선택하세요.
                </p>
                <div className="blender-blocking-actions">
                  <label>
                    프레임 시각 · 초
                    <input
                      type="number"
                      min="0"
                      max={Math.max(
                        0,
                        result.spec.seconds - 1 / result.spec.fps,
                      )}
                      step="0.1"
                      value={Number.isFinite(frameTime) ? frameTime : ""}
                      onChange={(event) =>
                        setFrameTime(
                          event.target.value === ""
                            ? NaN
                            : Number(event.target.value),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={
                      !!busy ||
                      !result.takeId ||
                      !Number.isFinite(frameTime) ||
                      frameTime < 0 ||
                      frameTime >= result.spec.seconds
                    }
                    onClick={async () => {
                      if (!result.takeId) return;
                      setError("");
                      setBusy("블로킹 참조를 연결하고 있습니다.");
                      try {
                        await onBlockingFrame(result.takeId, frameTime);
                        if (active.current)
                          setMessage(
                            "프레임을 연출 확인용 블로킹 참조로 연결했습니다.",
                          );
                      } catch (cause) {
                        if (active.current)
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : "블로킹 참조를 연결하지 못했습니다.",
                          );
                      } finally {
                        if (active.current) setBusy("");
                      }
                    }}
                    title="렌더한 테이크의 선택 시각을 이미지로 추출해 새 샷에 연출 확인용으로 연결합니다."
                  >
                    블로킹 참조로 연결
                  </button>
                </div>
              </div>
            )}
            <div className="blender-result-actions">
              <a href={result.asset.url} download={result.asset.name}>
                영상 다운로드
              </a>
              {!result.takeId && (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={async () => {
                    setError("");
                    setBusy("영상 노드를 저장하고 있습니다.");
                    try {
                      const takeId = await onTake(
                        result.sceneId,
                        result.spec,
                        result.asset,
                        result.mode,
                        true,
                      );
                      if (active.current) setResult({ ...result, takeId });
                    } catch (cause) {
                      if (active.current)
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : "영상 노드를 저장하지 못했습니다.",
                        );
                    } finally {
                      if (active.current) setBusy("");
                    }
                  }}
                >
                  렌더 당시 설정의 테이크로 보관
                </button>
              )}
              <label>
                타임라인
                <select
                  value={selectedTimeline}
                  onChange={(event) => setSelectedTimeline(event.target.value)}
                >
                  <option value="">새 타임라인</option>
                  {timelines.map((timeline) => (
                    <option key={timeline.id} value={timeline.id}>
                      {timeline.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!!busy || !result.takeId}
                onClick={async () => {
                  setError("");
                  setBusy("타임라인에 연결하고 있습니다.");
                  try {
                    if (result.takeId)
                      await onTimeline(
                        result.takeId,
                        selectedTimeline || undefined,
                      );
                  } catch (cause) {
                    if (active.current)
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "타임라인에 연결하지 못했습니다.",
                      );
                  } finally {
                    if (active.current) setBusy("");
                  }
                }}
                title="선택한 타임라인에 이 영상의 길이로 클립을 추가합니다."
              >
                <Clapperboard size={15} /> 타임라인에 넣기
              </button>
            </div>
          </section>
        )}
      </div>
      <footer className="blender-scene-footer">
        <span>{sceneId ? "장면 노드에 연결됨" : "새 장면 노드"}</span>
        <div>
          <button
            type="button"
            disabled={!!busy || !valid}
            onClick={async () => {
              const parsed = parseBlenderScene(spec);
              if (!parsed) return;
              setBusy("장면 인계 파일을 만들고 있습니다.");
              setError("");
              try {
                const id = await onSave(parsed, sceneId);
                setSceneId(id);
                const version = await prepareProject();
                const response = await fetch(
                  `/api/projects/${project.id}/blender/export`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ version, sceneId: id }),
                  },
                );
                if (!response.ok) {
                  const body = await response.json();
                  throw new Error(
                    body.error || "인계 파일을 만들지 못했습니다.",
                  );
                }
                const url = URL.createObjectURL(await response.blob());
                const link = document.createElement("a");
                link.href = url;
                link.download = "scene-room-blender.zip";
                link.click();
                window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                setMessage("장면 인계 파일을 내려받았습니다.");
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "인계 파일을 만들지 못했습니다.",
                );
              } finally {
                if (active.current) setBusy("");
              }
            }}
          >
            장면 인계 ZIP
          </button>
          <button
            type="button"
            disabled={!!busy || !valid}
            onClick={() => void saveScene()}
            title="현재 장면 설정을 샷 노드에 저장합니다."
          >
            <Save size={15} /> 장면 저장
          </button>
          <button
            type="button"
            disabled={!!busy || !valid}
            onClick={() => void render("preview")}
            title="낮은 해상도로 배치와 움직임을 확인합니다."
          >
            <Film size={15} /> 프리비즈
          </button>
          <button
            type="button"
            className="blender-primary"
            disabled={!!busy || !valid}
            onClick={() => void render("final")}
            title="현재 설정으로 이 컴퓨터에서 최종 MP4를 렌더합니다."
          >
            최종 렌더
          </button>
        </div>
      </footer>
      {previewSignature && previewSignature !== JSON.stringify(spec) && (
        <p className="blender-preview-note">
          장면을 바꿨습니다. 프리비즈를 새로 렌더해 결과를 확인하세요.
        </p>
      )}
    </dialog>
  );
}
