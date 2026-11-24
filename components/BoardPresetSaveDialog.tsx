"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Project } from "@/lib/types";
import "./project-start.css";

type Props = {
  project: Project;
  selectedNodeIds?: string[];
  prepareProject: () => Promise<number>;
  onClose: () => void;
};

export default function BoardPresetSaveDialog({ project, selectedNodeIds, prepareProject, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const version = await prepareProject();
      const response = await fetch("/api/board-presets", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), projectId: project.id, version, ...(selectedNodeIds ? { nodeIds: selectedNodeIds } : {}) }),
      });
      if (!response.ok) { const data = await response.json() as { error?: string }; throw new Error(data.error ?? "프리셋을 저장하지 못했습니다."); }
      dialog.current?.close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "프리셋을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="project-library project-start" aria-labelledby="board-preset-title"
    onCancel={(event) => { if (busy) event.preventDefault(); }} onClose={onClose}>
    <header><h2 id="board-preset-title">보드 프리셋 저장</h2><button type="button" className="studio-action" data-tone="quiet" data-size="icon" aria-label="닫기" disabled={busy} onClick={() => dialog.current?.close()}><X size={20} aria-hidden="true" /></button></header>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className="project-library-body project-start-body"><label>프리셋 이름<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <p>{selectedNodeIds ? `선택한 노드 ${selectedNodeIds.length}개` : `전체 노드 ${project.graph.nodes.length}개`}의 종류와 연결, 지침 선택을 저장합니다. 작품 내용과 미디어는 입력 자리로 비웁니다.</p>
        {error && <p role="alert">{error}</p>}</div>
      <footer><button type="button" className="studio-action" disabled={busy} onClick={() => dialog.current?.close()}>취소</button><button type="submit" className="studio-action" data-tone="primary" disabled={busy || !name.trim() || !(selectedNodeIds?.length ?? project.graph.nodes.length)}>{busy ? "저장 중" : "프리셋 저장"}</button></footer>
    </form>
  </dialog>;
}
