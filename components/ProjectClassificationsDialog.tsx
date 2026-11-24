"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Pencil, Plus, Trash2, X } from "lucide-react";
import type { ClassificationKind, ProjectClassification } from "@/lib/project-classifications";
import "./project-classifications.css";

export type ClassificationTarget = "all" | ClassificationKind;
export type ClassificationAction =
  | { method: "POST"; kind: ClassificationKind; name: string }
  | { method: "PATCH"; id: string; name: string }
  | { method: "DELETE"; id: string };

type Props = {
  target: ClassificationTarget | null;
  classifications: ProjectClassification[];
  loading: boolean;
  loadError: string;
  onClose: (openProjectSettings: boolean) => void;
  canOpenProjectSettings: boolean;
  onReload: () => void;
  onChange: (action: ClassificationAction) => Promise<void>;
};

const labels: Record<ClassificationKind, string> = { category: "카테고리", tag: "태그" };

export default function ProjectClassificationsDialog({ target, classifications, loading, loadError, onClose, canOpenProjectSettings, onReload, onChange }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const openProjectSettings = useRef(false);
  const [tab, setTab] = useState<ClassificationKind>("category");
  const kind = target === "tag" || target === "category" ? target : tab;
  const [name, setName] = useState("");
  const [intent, setIntent] = useState<{ action: "rename" | "delete"; id: string }>();
  const [rename, setRename] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const items = classifications.filter((item) => item.kind === kind);
  const label = labels[kind];
  const maxLength = kind === "category" ? 60 : 40;

  useEffect(() => {
    const element = dialog.current;
    if (!element || !target || element.open) return;
    restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openProjectSettings.current = false;
    element.showModal();
  }, [target]);

  function clearFeedback() {
    setMessage("");
    setError("");
  }

  function close() {
    if (busy) return;
    dialog.current?.close();
  }

  async function apply(action: ClassificationAction, success: string) {
    if (busy) return;
    clearFeedback();
    setBusy(true);
    try {
      await onChange(action);
      if (action.method === "POST") setName("");
      else setIntent(undefined);
      setMessage(success);
    } catch (error) {
      setError(error instanceof Error ? error.message : "분류를 변경하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return <dialog ref={dialog} className="project-library project-classifications" aria-labelledby="project-classifications-title"
    onCancel={(event) => { if (busy) event.preventDefault(); }} onClose={() => {
      setIntent(undefined); setTab("category"); setName(""); clearFeedback();
      onClose(openProjectSettings.current);
      restoreFocus.current?.focus();
    }}>
    <header>
      <h2 id="project-classifications-title">{target === "all" ? "카테고리·태그 전체 관리" : `${label} 설정`}</h2>
      <button type="button" className="studio-action" data-tone="quiet" data-size="icon" aria-label={target === "all" ? "전체 관리 닫기" : `${label} 설정 닫기`}
        disabled={busy} onClick={close}><X size={20} aria-hidden="true" /></button>
    </header>
    {target === "all" && <nav aria-label="분류 종류">
      {(Object.keys(labels) as ClassificationKind[]).map((option) => <button key={option} className="studio-action" data-tone="quiet"
        type="button" aria-pressed={kind === option} disabled={busy} onClick={() => {
          setTab(option); setIntent(undefined); setName(""); clearFeedback();
        }}>{labels[option]}</button>)}
    </nav>}
    <div className="project-library-body">
      <p className="classification-help">등록한 분류는 모든 프로젝트 설정에서 선택할 수 있습니다. 여기에서 이름을 바꾸거나 삭제하면 사용 중인 프로젝트에도 반영됩니다.</p>
      <form className="classification-form" onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) void apply({ method: "POST", kind, name: name.trim() }, `${label}를 추가했습니다.`);
      }}>
        <label>새 {label}<input value={name} maxLength={maxLength} disabled={busy}
          onChange={(event) => setName(event.target.value)} required /></label>
        <button type="submit" className="studio-action" data-tone="primary" disabled={busy || !name.trim()}><Plus size={16} aria-hidden="true" />{label} 추가</button>
      </form>
      {error && <p className="classification-error" role="alert">{error}</p>}
      {message && <p className="classification-help" role="status">{message}</p>}
      {loading && <p className="classification-help" role="status">분류를 읽는 중입니다.</p>}
      {loadError && <div className="classification-report"><p role="alert">{loadError}</p>
        <button type="button" className="studio-action" onClick={onReload} disabled={loading || busy}>다시 읽기</button></div>}
      {!loading && !loadError && !items.length && <p className="classification-help">등록된 {label}가 없습니다.</p>}
      <ul aria-label={`등록된 ${label}`}>
        {items.map((item) => <li className="classification-row" key={item.id}>
          <div className="classification-row-summary">
            <div><strong>{item.name}</strong><p>사용 중인 프로젝트 {item.projectCount}개</p></div>
            <div className="project-library-actions">
              <button type="button" className="studio-action" data-tone="quiet" disabled={busy}
                aria-label={`${item.name} 이름 변경`} onClick={() => {
                  clearFeedback(); setRename(item.name); setIntent({ action: "rename", id: item.id });
                }}><Pencil size={15} aria-hidden="true" /> 이름 변경</button>
              <button type="button" className="studio-action" data-tone="quiet" disabled={busy}
                aria-label={`${item.name} 삭제`} onClick={() => {
                  clearFeedback(); setIntent({ action: "delete", id: item.id });
                }}><Trash2 size={15} aria-hidden="true" /> 삭제</button>
            </div>
          </div>
          {intent?.id === item.id && (intent.action === "rename" ? <form className="classification-form classification-change"
            onSubmit={(event) => {
              event.preventDefault();
              if (rename.trim() && rename.trim() !== item.name)
                void apply({ method: "PATCH", id: item.id, name: rename.trim() }, `${label} 이름을 변경했습니다.`);
            }}>
            <label>변경할 이름<input required value={rename} disabled={busy} maxLength={maxLength} onChange={(event) => setRename(event.target.value)} /></label>
            <div className="project-library-actions">
              <button type="button" className="studio-action" onClick={() => setIntent(undefined)} disabled={busy}>취소</button>
              <button type="submit" className="studio-action" data-tone="primary" disabled={busy || !rename.trim() || rename.trim() === item.name}>일괄 이름 변경</button>
            </div>
          </form> : <div className="classification-change">
            <p><strong>{item.name}</strong>을 전체 목록과 연결된 프로젝트에서 삭제할까요?</p>
            <div className="project-library-actions">
              <button type="button" className="studio-action" onClick={() => setIntent(undefined)} disabled={busy}>취소</button>
              <button type="button" className="studio-action" data-tone="danger" disabled={busy}
                onClick={() => void apply({ method: "DELETE", id: item.id }, `${label}를 삭제했습니다.`)}>전체에서 삭제</button>
            </div>
          </div>)}
        </li>)}
      </ul>
    </div>
    <footer>
      <span>보관함과 휴지통에 있는 프로젝트에도 적용됩니다.</span>
      <button type="button" className="studio-action" disabled={busy} onClick={() => {
        openProjectSettings.current = target === "all" && canOpenProjectSettings;
        close();
      }}><ArrowLeft size={16} aria-hidden="true" />
        {target !== "all" ? "프로젝트 설정으로 돌아가기" : canOpenProjectSettings ? "프로젝트 설정으로 이동" : "프로젝트 관리로 돌아가기"}
      </button>
    </footer>
  </dialog>;
}
