"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, Plus, Settings, SlidersHorizontal, X } from "lucide-react";
import type { ClassificationKind, ProjectClassification } from "@/lib/project-classifications";
import type { ProjectSummary } from "@/lib/types";
import { productionProfiles } from "@/lib/style-preset-core";
import "./project-library.css";

type View = "active" | "archive" | "trash";
type SelectedClassification = { id: string | null; name: string };
type Metadata = { title: string; category: string; tags: string[]; categoryId: string | null; tagIds: (string | null)[] };
type EditDraft = {
  project: ProjectSummary;
  title: string;
  category: SelectedClassification | null;
  tags: SelectedClassification[];
  originalCategory: SelectedClassification | null;
  originalTags: SelectedClassification[];
};
export type ProjectAction =
  | { action: "metadata"; settings: Metadata }
  | { action: "duplicate" | "archive" | "restore" | "trash" };

const views: Record<View, string> = { active: "작업 중", archive: "보관함", trash: "휴지통" };
const collator = new Intl.Collator("ko", { numeric: true });
const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });
const normalize = (text: string) => text.normalize("NFKC").toLowerCase();
const activity = (project: ProjectSummary) => Math.max(Date.parse(project.updatedAt), Date.parse(project.lastOpenedAt ?? "") || 0);
function editDraft(item: ProjectSummary, classifications: ProjectClassification[]): EditDraft {
  const findId = (kind: ClassificationKind, name: string) => classifications.find((value) => value.kind === kind && value.name === name)?.id ?? null;
  const category = item.category ? { id: findId("category", item.category), name: item.category } : null;
  const tags = (item.tags ?? []).map((name) => ({ id: findId("tag", name), name }));
  return { project: item, title: item.title, category, tags, originalCategory: category, originalTags: tags };
}

function latestSelection(selection: SelectedClassification | null, kind: ClassificationKind, classifications: ProjectClassification[]): SelectedClassification | null {
  if (!selection) return null;
  const item = classifications.find((value) =>
    value.kind === kind && (selection.id ? value.id === selection.id : value.name === selection.name),
  );
  return item ? { id: item.id, name: item.name } : null;
}

function canUseLatestProject(draft: EditDraft, latest: ProjectSummary, classifications: ProjectClassification[]): boolean {
  if (latest.id !== draft.project.id || latest.title !== draft.project.title ||
      latest.archivedAt !== draft.project.archivedAt || latest.deletedAt !== draft.project.deletedAt) return false;
  const category = latestSelection(draft.originalCategory, "category", classifications);
  const tags = draft.originalTags.flatMap((tag) => {
    const item = latestSelection(tag, "tag", classifications);
    return item ? [item.name] : [];
  });
  return (latest.category ?? null) === (category?.name ?? null) &&
    JSON.stringify(latest.tags ?? []) === JSON.stringify(tags);
}

export default function ProjectLibrary({ projects, currentId, title, onOpen, onCreate, onManage, onProductionSettings, classifications = [], classificationsLoading = false, classificationsError = "", onTaxonomy, settingsId, onSettingsClose }: {
  projects: ProjectSummary[];
  currentId?: string;
  title?: string;
  onOpen: (id: string) => Promise<void>;
  onCreate: () => Promise<void>;
  onManage: (project: ProjectSummary, action: ProjectAction) => Promise<void>;
  onProductionSettings: (projectId: string) => Promise<void>;
  classifications?: ProjectClassification[];
  classificationsLoading?: boolean;
  classificationsError?: string;
  onTaxonomy?: (kind?: ClassificationKind) => void;
  settingsId?: string | null;
  onSettingsClose?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const settingsOpener = useRef<HTMLElement | null>(null);
  const lastExternalSettings = useRef<string | null>(null);
  const [view, setView] = useState<View>("active");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [editing, setEditing] = useState<EditDraft>();
  const [editError, setEditError] = useState("");
  const [confirm, setConfirm] = useState<ProjectSummary>();
  const [settingsConfirmation, setSettingsConfirmation] = useState<"archive" | "restore" | "trash">();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!settingsId) { lastExternalSettings.current = null; return; }
    if (lastExternalSettings.current === settingsId || classificationsLoading) return;
    const item = projects.find((project) => project.id === settingsId);
    if (!item) return;
    lastExternalSettings.current = settingsId;
    settingsOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditing(editDraft(item, classifications));
    setConfirm(undefined);
    setSettingsConfirmation(undefined);
    setEditError("");
    settingsDialog.current?.showModal();
  }, [settingsId, projects, classifications, classificationsLoading]);

  const inView = projects.filter((project) => {
    const state = project.deletedAt ? "trash" : project.archivedAt ? "archive" : "active";
    return state === view;
  });
  const categories = [...new Set(inView.flatMap((item) => item.category ? [item.category] : []))].sort(collator.compare);
  const tags = [...new Set(inView.flatMap((item) => item.tags ?? []))].sort(collator.compare);
  const activeCategory = categories.includes(category) ? category : "";
  const activeTag = tags.includes(tag) ? tag : "";
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
  const visible = inView.filter((item) => {
    const searchable = normalize([item.title, item.category, ...(item.tags ?? [])].join(" "));
    return (!activeCategory || item.category === activeCategory) && (!activeTag || item.tags?.includes(activeTag)) &&
      terms.every((term) => searchable.includes(term));
  }).sort((left, right) => activity(right) - activity(left) || right.id.localeCompare(left.id));
  const selectedCategory = latestSelection(editing?.category ?? null, "category", classifications);
  const selectedTags = (editing?.tags ?? []).flatMap((tag) => {
    const item = latestSelection(tag, "tag", classifications);
    return item ? [item] : [];
  });
  const latestProject = editing && projects.find((project) => project.id === editing.project.id);
  const settingsProject = editing && latestProject && latestProject.version !== editing.project.version &&
    canUseLatestProject(editing, latestProject, classifications) ? latestProject : editing?.project;
  const productionLabel = productionProfiles.find((entry) => entry.id === settingsProject?.productionProfileId)?.label ?? "무형식";
  const classificationPending = classificationsLoading || !!classificationsError;

  function openSettings(item: ProjectSummary, trigger: HTMLElement) {
    settingsOpener.current = trigger;
    setEditing(editDraft(item, classifications));
    setConfirm(undefined);
    setSettingsConfirmation(undefined);
    setEditError("");
    settingsDialog.current?.showModal();
  }

  function selectedTag(name: string) {
    const item = classifications.find((value) => value.kind === "tag" && value.id === name);
    if (!item || !editing) return;
    if (selectedTags.some((tag) => tag.id === item.id)) {
      setEditError("이미 선택한 태그입니다.");
      return;
    }
    if (selectedTags.length >= 20) {
      setEditError("태그는 최대 20개까지 선택할 수 있습니다.");
      return;
    }
    setEditError("");
    setEditing({ ...editing, tags: [...selectedTags, { id: item.id, name: item.name }] });
  }

  async function perform(task: () => Promise<void>, success?: string) {
    setBusy(true);
    setMessage("");
    try {
      await task();
      setEditing(undefined);
      setConfirm(undefined);
      if (success) setMessage(success);
      else dialog.current?.close();
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="project-picker">
      <button ref={opener} type="button" className="project-button" aria-haspopup="dialog" aria-label={title ? `프로젝트 관리 · ${title}` : "프로젝트 관리"}
        title="프로젝트를 검색하거나 이름·분류를 관리합니다."
        onClick={() => { setMessage(""); dialog.current?.showModal(); }}>
        <span>{title || "프로젝트"}</span><ChevronDown size={15} />
      </button>
      <dialog ref={dialog} className="project-library" aria-labelledby="project-library-title"
        onCancel={(event) => { if (busy) event.preventDefault(); }}
        onClose={() => { setEditing(undefined); setConfirm(undefined); opener.current?.focus(); }}>
        <header>
          <h2 id="project-library-title">프로젝트 관리</h2>
          <button type="button" className="studio-action" data-tone="quiet" data-size="icon" aria-label="프로젝트 관리 닫기"
            disabled={busy} onClick={() => dialog.current?.close()}><X size={20} /></button>
        </header>
        <nav aria-label="프로젝트 상태">
          {(Object.keys(views) as View[]).map((state) => (
            <button key={state} type="button" className="studio-action" data-tone="quiet" disabled={busy} aria-pressed={state === view} onClick={() => {
              setView(state); setCategory(""); setTag(""); setEditing(undefined); setConfirm(undefined); setMessage("");
            }}>{views[state]}</button>
          ))}
          {onTaxonomy && <button type="button" className="studio-action" disabled={busy} onClick={() => onTaxonomy()}>카테고리·태그 전체 관리</button>}
          <button type="button" className="studio-action project-library-create" data-tone="primary" disabled={busy} onClick={() => void perform(onCreate)}>
            <Plus size={15} /> 새 프로젝트
          </button>
        </nav>
        <div className="project-library-body">
          <div className="project-library-filters">
            <label>검색<input type="search" placeholder="이름, 카테고리, 태그 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <label>카테고리<select value={activeCategory} onChange={(event) => setCategory(event.target.value)}>
              <option value="">전체 카테고리</option>
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select></label>
            <label>태그<select value={activeTag} onChange={(event) => setTag(event.target.value)}>
              <option value="">전체 태그</option>
              {tags.map((item) => <option key={item}>{item}</option>)}
            </select></label>
          </div>
          {message && <p className="project-library-notice" role="status">{message}</p>}
          {!visible.length && <p className="project-library-notice">{inView.length ? "검색 조건에 맞는 프로젝트가 없습니다." : `${views[view]}에 프로젝트가 없습니다.`}</p>}
          <ul>
            {visible.map((item) => <li key={item.id} className="project-library-card" data-active={currentId === item.id}>
              <div className="project-library-summary">
                <div>
                  <h3>{item.title}{currentId === item.id && <small>열려 있음</small>}</h3>
                  <p>최근 활동 <time dateTime={new Date(activity(item)).toISOString()}>{dateFormat.format(activity(item))}</time></p>
                  {(item.category || !!item.tags?.length) && <p className="project-library-tags">
                    {item.category && <button type="button" className="studio-action" aria-pressed={category === item.category} onClick={() => setCategory(category === item.category ? "" : item.category!)}>{item.category}</button>}
                    {item.tags?.map((name) => <button type="button" key={name} className="studio-action" aria-pressed={tag === name} onClick={() => setTag(tag === name ? "" : name)}>#{name}</button>)}
                  </p>}
                </div>
                <div className="project-library-actions">
                  {view === "active" && <button type="button" className="studio-action" disabled={busy} onClick={() => void perform(() => onOpen(item.id))}>열기 <ArrowUpRight size={14} aria-hidden="true" /></button>}
                  {view !== "trash" && <>
                    <button type="button" className="studio-action" data-tone="quiet" disabled={busy || classificationsLoading} aria-haspopup="dialog"
                      title={classificationsLoading ? "분류를 불러오는 중입니다." : "프로젝트 설정을 엽니다."}
                      onClick={(event) => openSettings(item, event.currentTarget)}>설정</button>
                    <button type="button" className="studio-action" data-tone="quiet" disabled={busy} onClick={() => void perform(() => onManage(item, { action: "duplicate" }), "프로젝트를 복제했습니다. 작업 중 목록에서 열 수 있습니다.")}>복제</button>
                  </>}
                  {view === "active"
                    ? <button type="button" className="studio-action" data-tone="quiet" disabled={busy} onClick={() => void perform(() => onManage(item, { action: "archive" }), "보관함으로 이동했습니다.")}>보관</button>
                    : <button type="button" className="studio-action" disabled={busy} onClick={() => void perform(() => onManage(item, { action: "restore" }), "프로젝트를 복구했습니다.")}>복구</button>}
                  {view !== "trash" && <button type="button" className="studio-action" data-tone="quiet" disabled={busy} onClick={() => { setEditing(undefined); setMessage(""); setConfirm(item); }}>삭제</button>}
                </div>
              </div>
              {confirm?.id === item.id && <div className="project-library-edit">
                <p><strong>이 프로젝트를 휴지통으로 옮길까요?</strong> 캔버스와 결과는 휴지통에서 복구할 수 있습니다.</p>
                <div className="project-library-actions">
                  <button type="button" className="studio-action" data-tone="quiet" disabled={busy} onClick={() => setConfirm(undefined)}>취소</button>
                  <button type="button" disabled={busy} className="studio-action" data-tone="danger" onClick={() => void perform(() => onManage(confirm, { action: "trash" }), "휴지통으로 이동했습니다.")}>휴지통으로 이동</button>
                </div>
              </div>}
            </li>)}
          </ul>
        </div>
        <footer><a href="/guide#guide-projects" target="_blank" rel="noreferrer">프로젝트 관리 가이드 ↗</a><span>최근 활동순 · {visible.length}개</span></footer>
      </dialog>
      <dialog ref={settingsDialog} className="project-library project-settings-dialog" aria-labelledby="project-settings-title"
        onCancel={(event) => { if (busy) event.preventDefault(); }}
        onClose={() => { setEditing(undefined); setSettingsConfirmation(undefined); setEditError(""); onSettingsClose?.(); settingsOpener.current?.focus(); }}>
        {editing && settingsProject && <>
          <header><div><h2 id="project-settings-title">프로젝트 설정</h2><p>{editing.project.title}</p></div>
            <button type="button" className="studio-action" data-tone="quiet" data-size="icon" aria-label="프로젝트 설정 닫기" disabled={busy} onClick={() => settingsDialog.current?.close()}><X size={20} /></button>
          </header>
          <form className="project-settings-body" onSubmit={(event) => {
            event.preventDefault();
            if (classificationPending) return;
            const settings: Metadata = { title: editing.title, category: selectedCategory?.name ?? "", categoryId: selectedCategory?.id ?? null,
              tags: selectedTags.map((tag) => tag.name), tagIds: selectedTags.map((tag) => tag.id) };
            setBusy(true);
            setEditError("");
            void onManage(settingsProject, { action: "metadata", settings }).then(() => {
              setMessage("프로젝트 설정을 저장했습니다.");
              settingsDialog.current?.close();
            }).catch((error: Error) => setEditError(error.message)).finally(() => setBusy(false));
          }}>
            <label>프로젝트 이름<input required disabled={busy} maxLength={120} value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} /></label>
            <fieldset><legend>제작 형식</legend>
              <div className="project-format-setting">
                <div>
                  <strong>{productionLabel}</strong>
                  {settingsProject.productionSettings && <p>
                    {settingsProject.productionSettings.aspect} · {settingsProject.productionSettings.sceneCount === "auto" ? "씬 수 자동" : `씬 ${settingsProject.productionSettings.sceneCount}개`}
                  </p>}
                </div>
                {!settingsProject.deletedAt && <button type="button" className="studio-action" aria-haspopup="dialog"
                  disabled={busy} onClick={() => {
                    setBusy(true);
                    setEditError("");
                    void onProductionSettings(settingsProject.id)
                      .catch((error: Error) => setEditError(error.message))
                      .finally(() => setBusy(false));
                  }}><SlidersHorizontal size={16} aria-hidden="true" /> 제작 형식 변경</button>}
              </div>
            </fieldset>
            <fieldset><legend>카테고리</legend>
              <p>이 프로젝트에 사용할 카테고리를 선택하세요.</p>
              <div className="project-classification-picker">
                <label>카테고리 선택<select disabled={busy || classificationPending} value={selectedCategory?.id ?? ""} onChange={(event) => {
                  const item = classifications.find((value) => value.kind === "category" && value.id === event.target.value);
                  setEditing({ ...editing, category: item ? { id: item.id, name: item.name } : null });
                }}><option value="">카테고리 없음</option>
                  {classifications.filter((item) => item.kind === "category").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select></label>
                {onTaxonomy && <button type="button" className="studio-action" disabled={busy} aria-haspopup="dialog"
                  title="모든 프로젝트에서 사용하는 카테고리를 추가하거나 관리합니다."
                  onClick={() => onTaxonomy("category")}><Settings size={15} aria-hidden="true" />카테고리 설정</button>}
              </div>
            </fieldset>
            <fieldset><legend>태그</legend><p>등록된 태그를 선택하세요. 최대 20개까지 선택할 수 있습니다.</p>
              <div className="project-library-tag-list">{selectedTags.map((tag) =>
                <span key={tag.id ?? tag.name} className="project-library-tag-row">#{tag.name}
                  <button type="button" className="studio-action" data-tone="quiet" data-size="icon" disabled={busy || classificationPending}
                    aria-label={`${tag.name} 태그를 이 프로젝트에서 제거`} title="이 프로젝트에서 태그 제거"
                    onClick={() => setEditing({ ...editing, tags: selectedTags.filter((item) => item.id !== tag.id) })}><X size={15} aria-hidden="true" /></button>
                </span>
              )}{!selectedTags.length && <p>선택한 태그가 없습니다.</p>}</div>
              <div className="project-classification-picker">
                <label>기존 태그 선택<select value="" disabled={busy || classificationPending} onChange={(event) => selectedTag(event.target.value)}><option value="">태그 선택</option>
                  {classifications.filter((item) => item.kind === "tag" && !selectedTags.some((tag) => tag.id === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select></label>
                {onTaxonomy && <button type="button" className="studio-action" disabled={busy} aria-haspopup="dialog"
                  title="모든 프로젝트에서 사용하는 태그를 추가하거나 관리합니다."
                  onClick={() => onTaxonomy("tag")}><Settings size={15} aria-hidden="true" />태그 설정</button>}
              </div>
            </fieldset>
            {classificationsError && <p className="project-library-error" role="alert">분류 목록을 읽지 못했습니다. 카테고리나 태그 설정에서 다시 읽어 주세요.</p>}
            {editError && <p className="project-library-error" role="alert">{editError}</p>}
            <div className="project-settings-actions"><button type="button" className="studio-action" disabled={busy} onClick={() => {
              setBusy(true); setEditError("");
              void onManage(settingsProject, { action: "duplicate" }).then(() => { setMessage("프로젝트를 복제했습니다."); settingsDialog.current?.close(); }).catch((error: Error) => setEditError(error.message)).finally(() => setBusy(false));
            }}>복제</button>
            {!editing.project.deletedAt && <button type="button" className="studio-action" disabled={busy} onClick={() => setSettingsConfirmation(editing.project.archivedAt ? "restore" : "archive")}>{editing.project.archivedAt ? "보관 해제" : "보관"}</button>}
            {!editing.project.deletedAt && <button type="button" className="studio-action" data-tone="quiet" disabled={busy} onClick={() => setSettingsConfirmation("trash")}>삭제</button>}</div>
            {settingsConfirmation && <div className="project-settings-confirm"><p>{settingsConfirmation === "trash" ? "이 프로젝트를 휴지통으로 옮길까요?" : editing.project.archivedAt ? "보관함에서 복구할까요?" : "이 프로젝트를 보관할까요?"}</p>
              <div className="project-library-actions"><button type="button" className="studio-action" disabled={busy} onClick={() => setSettingsConfirmation(undefined)}>취소</button>
                <button type="button" className="studio-action" data-tone={settingsConfirmation === "trash" ? "danger" : "primary"} disabled={busy} onClick={() => {
                  const action = settingsConfirmation;
                  setBusy(true); setEditError("");
                  void onManage(settingsProject, { action }).then(() => { setMessage(action === "trash" ? "휴지통으로 이동했습니다." : action === "restore" ? "프로젝트를 복구했습니다." : "보관함으로 이동했습니다."); settingsDialog.current?.close(); }).catch((error: Error) => setEditError(error.message)).finally(() => setBusy(false));
                }}>확인</button></div></div>}
            <footer><button type="button" className="studio-action" disabled={busy} onClick={() => settingsDialog.current?.close()}>취소</button><button type="submit" className="studio-action" data-tone="primary" disabled={busy || classificationPending}>설정 저장</button></footer>
          </form>
        </>}
      </dialog>
    </div>
  );
}
