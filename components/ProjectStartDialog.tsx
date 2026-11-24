"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { productionProfiles } from "@/lib/style-preset-core";
import { addMissingStarter, productionDefaults, productionToolLabels, starterGraph } from "@/lib/production-start";
import { productionGuides } from "@/lib/higgsfield-guidance-kit";
import type { BoardPreset } from "@/lib/board-preset-store";
import { MAX_SCENE_COUNT, type Project, type ProductionWorkflow, type SceneCount } from "@/lib/types";
import "./project-start.css";

type Aspect = "16:9" | "9:16" | "1:1";
export type ProductionStartInput = { title: string; profileId?: string | null; presetId?: string; sceneCount?: SceneCount; aspect?: Aspect; workflow?: ProductionWorkflow };
export type ProductionChange = { profileId: string | null; sceneCount?: SceneCount; aspect?: Aspect; workflow?: ProductionWorkflow; addMissing?: boolean };
type Props = {
  project?: Project;
  onClose: () => void;
  onCreate: (input: ProductionStartInput) => Promise<void>;
  onChangeFormat?: (input: ProductionChange) => Promise<void>;
};

export default function ProjectStartDialog({ project, onClose, onCreate, onChangeFormat }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("새 프로젝트");
  const [mode, setMode] = useState<"blank" | "format" | "preset">(project?.productionProfileId ? "format" : "blank");
  const [profileId, setProfileId] = useState(project?.productionProfileId ?? "short-drama");
  const [workflow, setWorkflow] = useState<ProductionWorkflow | undefined>(project?.productionSettings?.workflow);
  const defaults = productionDefaults(profileId, workflow);
  const [sceneCount, setSceneCount] = useState<SceneCount>(project?.productionSettings?.sceneCount ?? defaults.sceneCount);
  const [aspect, setAspect] = useState<Aspect>(project?.productionSettings?.aspect ?? defaults.aspect);
  const [addMissing, setAddMissing] = useState(false);
  const [presets, setPresets] = useState<Omit<BoardPreset, "graph">[]>([]);
  const [presetId, setPresetId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (mode !== "preset") return;
    const controller = new AbortController();
    void fetch("/api/board-presets", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("프리셋을 불러오지 못했습니다.");
      const data = await response.json() as { presets: Omit<BoardPreset, "graph">[] };
      setPresets(data.presets);
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "프리셋을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [mode]);

  const profile = productionProfiles.find((item) => item.id === profileId)!;
  const preview = useMemo(() => {
    if (mode !== "format") return null;
    try {
      const graph = project && addMissing ? addMissingStarter(project.graph, profileId, sceneCount, aspect, workflow) : starterGraph(profileId, sceneCount, aspect, workflow);
      return {
        label: project && addMissing
          ? `노드 ${graph.nodes.length - project.graph.nodes.length}개와 연결 ${graph.edges.length - project.graph.edges.length}개 추가`
          : `기본 노드 ${graph.nodes.length}개 · 연결 ${graph.edges.length}개`,
        nodes: graph.nodes.slice(project && addMissing ? project.graph.nodes.length : 0, project && addMissing ? project.graph.nodes.length + 6 : 6),
      };
    } catch (cause) {
      return { label: cause instanceof Error ? cause.message : "구성을 확인해 주세요.", nodes: [], invalid: true };
    }
  }, [mode, project, addMissing, profileId, sceneCount, aspect, workflow]);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (project && onChangeFormat) await onChangeFormat(mode === "blank" ? { profileId: null } : { profileId, sceneCount, aspect, workflow, addMissing });
      else await onCreate({ title: title.trim(), ...(mode === "format" ? { profileId, sceneCount, aspect, workflow } : mode === "preset" ? { presetId } : { profileId: null }) });
      dialog.current?.close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "프로젝트를 준비하지 못했습니다.");
    } finally { setBusy(false); }
  }

  return <dialog ref={dialog} className="project-library project-start" aria-labelledby="project-start-title"
    onCancel={(event) => { if (busy) event.preventDefault(); }} onClose={onClose}>
    <header><h2 id="project-start-title">{project ? "제작 형식 설정" : "새 프로젝트 시작"}</h2>
      <button type="button" className="studio-action" data-tone="quiet" data-size="icon" aria-label="닫기" disabled={busy} onClick={() => dialog.current?.close()}><X size={20} aria-hidden="true" /></button></header>
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div className="project-library-body project-start-body">
        {!project && <label>프로젝트 이름<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required /></label>}
        <fieldset><legend>{project ? "적용 방식" : "시작 방식"}</legend>
          <label><input type="radio" name="start-mode" checked={mode === "blank"} onChange={() => setMode("blank")} /> {project ? "무형식으로 변경" : "무형식으로 시작"}</label>
          <label><input type="radio" name="start-mode" checked={mode === "format"} onChange={() => setMode("format")} /> 제작 형식 지정</label>
          {!project && <label><input type="radio" name="start-mode" checked={mode === "preset"} onChange={() => setMode("preset")} /> 내 보드 프리셋</label>}
        </fieldset>
        {mode === "blank" && <p>{project ? "형식을 해제하고 현재 보드를 유지합니다." : "빈 캔버스에서 노드와 자료를 직접 추가합니다."}</p>}
        {mode === "format" && <>
          <label>제작 형식<select value={profileId} onChange={(event) => {
            const id = event.target.value; const next = productionDefaults(id);
            setProfileId(id);
            setWorkflow(undefined);
            setSceneCount((current) => current === defaults.sceneCount ? next.sceneCount : current);
            setAspect((current) => current === defaults.aspect ? next.aspect : current);
          }}>{productionProfiles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <p>{profile.description}</p>
          {profileId === "ad" && <label>광고 워크플로우
            <select value={workflow ?? ""} onChange={(event) => {
              const selection = event.target.value === "fashion-ad" ? "fashion-ad" : undefined;
              const next = productionDefaults(profileId, selection);
              setWorkflow(selection);
              setSceneCount((current) => current === defaults.sceneCount ? next.sceneCount : current);
              setAspect((current) => current === defaults.aspect ? next.aspect : current);
            }}>
              <option value="">기본 광고</option>
              <option value="fashion-ad">Higgsfield 패션 광고</option>
            </select>
          </label>}
          <div className="project-start-fields"><label>씬 수<select value={sceneCount === "auto" ? "auto" : "manual"} onChange={(event) => setSceneCount(event.target.value === "auto" ? "auto" : defaults.sceneCount)}><option value="auto">시나리오에 맞춰 자동 결정</option><option value="manual">직접 입력</option></select>
            {sceneCount !== "auto" && <input aria-label="직접 지정할 씬 수" type="number" min={1} max={MAX_SCENE_COUNT} required value={Number.isFinite(sceneCount) ? sceneCount : ""} onChange={(event) => setSceneCount(event.target.value === "" ? Number.NaN : Number(event.target.value))} />}</label>
            <label>화면비<select value={aspect} onChange={(event) => setAspect(event.target.value as Aspect)}><option>9:16</option><option>16:9</option><option>1:1</option></select></label></div>
          {project && <label><input type="checkbox" checked={addMissing} onChange={(event) => setAddMissing(event.target.checked)} /> 빠진 기본 노드와 연결 추가</label>}
          <p aria-live="polite">{project && !addMissing ? "현재 노드와 연결을 유지하고 추천 설정을 변경합니다." : preview?.label}{sceneCount === "auto" ? " · 감독 기획 요청 시 시나리오와 자료를 바탕으로 결정합니다." : ""}</p>
          <details>
            <summary>추천 제작 도구와 지침</summary>
            <p>{productionToolLabels[defaults.tool]} · 권장 시작 길이 {defaults.seconds}초</p>
            <ul>{defaults.guides.map((id) => {
              const guide = productionGuides.find((item) => item.id === id);
              return guide && <li key={id}>{guide.label} · {guide.summary}</li>;
            })}</ul>
            {preview?.nodes.length ? <p>{preview.nodes.map((node) => node.title).join(" → ")}</p> : null}
          </details>
        </>}
        {mode === "preset" && <label>보드 프리셋<select value={presetId} onChange={(event) => setPresetId(event.target.value)} required><option value="">프리셋 선택</option>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>}
        {error && <p role="alert">{error}</p>}
      </div>
      <footer><button type="button" className="studio-action" disabled={busy} onClick={() => dialog.current?.close()}>취소</button>
        <button type="submit" className="studio-action" data-tone="primary" disabled={busy || preview?.invalid || (!project && (!title.trim() || (mode === "preset" && !presetId)))}>{busy ? "저장 중" : project ? "설정 적용" : "시작하기"}</button></footer>
    </form>
  </dialog>;
}
