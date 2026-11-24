"use client";

import { useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Camera,
  Clapperboard,
  Copy,
  FileText,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Lightbulb,
  Music,
  Plus,
  Search,
  Sparkles,
  Upload,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import { kindLabels, type CanvasNode, type Kind, type Project, type Run } from "../lib/types";
import type { LibraryItem } from "./AssetLibrary";
import "./workspace-sidebar.css";

type Props = {
  project: Project | null;
  runs: Run[];
  selected: string | null;
  onSelect: (nodeId: string) => void;
  onAdd: (kind: Kind, template?: { title: string; body: string; guidance?: CanvasNode["guidance"] }) => void;
  onTool: (tool: "assets" | "timeline" | "director" | "contest" | "clip" | "preset" | "motion" | "portrait" | "blender" | "higgs-workflow" | "tripo" | "tts-sample", trigger?: HTMLElement) => void;
  onFiles: (files: File[]) => Promise<void>;
  onUseAsset: (item: LibraryItem, usage: "copy" | "input" | "guide") => void;
  onClose: () => void;
  initialTab?: "kit" | "canvas" | "assets";
};

type Tab = "kit" | "canvas" | "assets";
type Template = {
  title: string;
  description: string;
  kind: Kind;
  body: string;
  icon: typeof Camera;
};

const templates: { title: string; items: Template[] }[] = [
  {
    title: "캐스팅",
    items: [
      {
        title: "새 캐릭터",
        description: "등장인물과 외형",
        kind: "character",
        icon: UserRound,
        body: "이름과 역할\n\n인물의 목표와 갈등\n\n얼굴, 헤어, 의상\n\n표정과 몸짓\n\n장면별 유지할 외형",
      },
      {
        title: "캐릭터 상태",
        description: "씬별 변화와 연속성",
        kind: "character",
        icon: Sparkles,
        body: "기준 인물\n\n이 장면의 감정과 목표\n\n의상과 헤어 상태\n\n상처, 소품, 위치 변화\n\n유지할 특징",
      },
    ],
  },
  {
    title: "스타일",
    items: [
      {
        title: "자연광 드라마",
        description: "부드러운 창가 빛",
        kind: "shot",
        icon: Lightbulb,
        body: "장소와 시간\n\n광원은 창에서 들어오는 부드러운 자연광. 피부 질감과 주변 공간의 실제 색을 유지한다.\n\n카메라 앵글과 렌즈\n\n인물의 시선과 동작",
      },
      {
        title: "야간 필름",
        description: "어두운 실내와 빛",
        kind: "shot",
        icon: Camera,
        body: "장소와 시간\n\n주광원과 실내 실용광의 위치를 정한다. 어두운 부분의 정보와 인물의 표정이 유지되는 저조도 필름 룩.\n\n카메라 움직임\n\n인물과 소품 상태",
      },
    ],
  },
  {
    title: "움직임",
    items: [
      {
        title: "인물 따라가기",
        description: "행동에 맞춘 트래킹",
        kind: "video",
        icon: Film,
        body: "인물이 시작 위치에서 목표 지점으로 움직인다. 카메라는 인물과 일정한 거리를 유지하며 부드럽게 따라간다. 시작과 종료 동작, 속도와 방향을 장면에 맞게 정한다.",
      },
      {
        title: "감정 클로즈업",
        description: "표정과 시선의 변화",
        kind: "shot",
        icon: Clapperboard,
        body: "인물의 목표와 숨겨진 감정\n\n클로즈업 구도와 시선 방향\n\n시작 표정 → 미세한 변화 → 마지막 표정\n\n카메라와 조명",
      },
    ],
  },
];

const tabs: { id: Tab; label: string }[] = [
  { id: "kit", label: "제작 키트" },
  { id: "canvas", label: "캔버스" },
  { id: "assets", label: "자산" },
];

function assetIcon(item: LibraryItem) {
  if (item.asset?.type === "image") return ImageIcon;
  if (item.asset?.type === "video") return Film;
  if (item.asset?.type === "audio") return Music;
  return FileText;
}

export default function WorkspaceSidebar({
  project,
  runs,
  selected,
  onSelect,
  onAdd,
  onTool,
  onFiles,
  onUseAsset,
  onClose,
  initialTab = "kit",
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [nodeQuery, setNodeQuery] = useState("");
  const [kind, setKind] = useState<Kind | "all">("all");
  const [assetQuery, setAssetQuery] = useState("");
  const [assetType, setAssetType] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const nodes = project?.graph.nodes ?? [];
  const visibleNodes = nodes.filter((node) =>
    (kind === "all" || node.kind === kind) &&
    `${node.title} ${node.body} ${kindLabels[node.kind]}`
      .toLocaleLowerCase().includes(nodeQuery.trim().toLocaleLowerCase()),
  );
  const nodeKinds = [...new Set(nodes.map((node) => node.kind))];
  const assets = useMemo<LibraryItem[]>(() => [
    ...(project?.graph.nodes ?? []).flatMap((node) =>
      node.asset || node.kind === "note" || node.kind === "script"
        ? [{ id: `node-${node.id}`, title: node.title, body: node.body, asset: node.asset, sourceNodeId: node.id }]
        : [],
    ),
    ...runs.flatMap((run) =>
      run.status === "succeeded" && run.result?.asset
        ? [{ id: `run-${run.id}`, title: run.result.asset.name, body: run.input.prompt, asset: run.result.asset }]
        : [],
    ),
  ], [project, runs]);
  const visibleAssets = assets.filter((item) =>
    (assetType === "all" || (item.asset?.type ?? "text") === assetType) &&
    `${item.title} ${item.asset?.name ?? ""}`.toLocaleLowerCase().includes(assetQuery.trim().toLocaleLowerCase()),
  );

  async function addFiles(files: FileList | File[]) {
    if (!files.length || uploading) return;
    setUploading(true);
    setError("");
    try {
      await onFiles(Array.from(files));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "파일을 가져오지 못했습니다.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <aside className="workspace-sidebar" aria-label="프로젝트 탐색">
      <header className="workspace-sidebar-heading">
        <div>
          <strong>작업실</strong>
          <span title={project?.title}>{project?.title || "캔버스"}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="작업실 사이드바 닫기" title="작업실 사이드바를 닫습니다.">
          <X size={18} />
        </button>
      </header>
      <div className="workspace-sidebar-tabs" aria-label="작업실 영역">
        {tabs.map((item) => (
          <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="workspace-sidebar-content">
        {tab === "kit" && (
          <div className="workspace-kit">
            <div className="workspace-kit-intro">
              <Sparkles size={17} aria-hidden="true" />
              <p>장면을 만들 때 무엇부터 시작할지 골라 보세요.</p>
            </div>
            {templates.map((section) => (
              <section key={section.title} className="workspace-kit-section">
                <h3>{section.title}</h3>
                <div className="workspace-kit-grid">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        type="button"
                        key={item.title}
                        className="workspace-kit-card"
                        title={`${item.title} 노드를 캔버스에 추가합니다.`}
                        onClick={() => onAdd(item.kind, { title: item.title, body: item.body })}
                        disabled={!project}
                      >
                        <span className="workspace-kit-icon"><Icon size={21} aria-hidden="true" /></span>
                        <strong>{item.title}</strong>
                        <small>{item.description}</small>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            <section className="workspace-kit-section">
              <h3>제작 도구</h3>
              <button type="button" className="outline-button" title="타입별 보드를 구성하고 레퍼런스에서 개인 스타일을 저장합니다." onClick={() => onTool("preset")}><Sparkles size={16} /> 제작 프리셋 · 레퍼런스 분석</button>
              <div className="workspace-tool-list">
                <button type="button" aria-haspopup="dialog" disabled={!project}
                  onClick={(event) => onTool("tts-sample", event.currentTarget)}>
                  <AudioLines size={16} aria-hidden="true" /> TTS 등록 샘플 만들기
                </button>
                <button type="button" onClick={() => onTool("director")}><Camera size={16} /> 감독 도구</button>
                <button type="button" title="GLB 캐릭터와 배경을 배치하고 로컬 장면을 렌더합니다." onClick={() => onTool("blender")}><Camera size={16} /> Blender 3D 장면</button>
                <button type="button" title="Tripo 작업의 리깅을 검사하고 동작을 적용합니다." onClick={() => onTool("tripo")}><UserRound size={16} /> Tripo 3D 리깅·동작</button>
                <button type="button" title="장르별 제작 순서와 선택 자료를 검토해 노드로 배치합니다." onClick={() => onTool("higgs-workflow")}><Clapperboard size={16} /> Higgsfield 워크플로우</button>
                <button type="button" title="장면을 조합해 이 컴퓨터에서 모션그래픽 MP4를 렌더합니다." onClick={() => onTool("motion")}><Film size={16} /> 모션그래픽</button>
                <button type="button" title="포즈·의상·표정과 조명을 정하고 캐릭터 연출 보드를 만듭니다." onClick={() => onTool("portrait")}><UserRound size={16} /> 캐릭터 연출 키트</button>
                <button type="button" onClick={() => onTool("timeline")}><Clapperboard size={16} /> 타임라인</button>
                <button type="button" onClick={() => onTool("clip")}><WandSparkles size={16} /> 클립 편집</button>
                <button type="button" onClick={() => onTool("contest")}><FileText size={16} /> 공모전 기획</button>
              </div>
            </section>
          </div>
        )}
        {tab === "canvas" && (
          <div className="workspace-list">
            <div className="workspace-search">
              <Search size={16} aria-hidden="true" />
              <input aria-label="캔버스 노드 검색" placeholder="노드 검색" value={nodeQuery} onChange={(event) => setNodeQuery(event.target.value)} />
            </div>
            <select aria-label="노드 유형 필터" value={kind} onChange={(event) => setKind(event.target.value as Kind | "all")}>
              <option value="all">모든 노드</option>
              {nodeKinds.map((item) => <option value={item} key={item}>{kindLabels[item]}</option>)}
            </select>
            <div className="workspace-list-header">
              <strong>캔버스 노드</strong><span>{visibleNodes.length}개</span>
            </div>
            {visibleNodes.length ? (
              <ul className="workspace-node-list">
                {visibleNodes.map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      aria-current={selected === node.id ? "true" : undefined}
                      title={`${node.title} 노드를 선택합니다.`}
                      onClick={() => onSelect(node.id)}
                    >
                      <span className="workspace-node-icon"><FileText size={16} aria-hidden="true" /></span>
                      <span><strong>{node.title || kindLabels[node.kind]}</strong><small>{kindLabels[node.kind]}</small></span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="workspace-empty">표시할 노드가 없습니다.</p>}
            <button className="workspace-secondary" type="button" onClick={() => onAdd("note")} disabled={!project}>
              <Plus size={16} /> 작업 메모 추가
            </button>
          </div>
        )}
        {tab === "assets" && (
          <div
            className="workspace-list"
            onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
            onDrop={(event) => { if (event.dataTransfer.files.length) { event.preventDefault(); event.stopPropagation(); void addFiles(event.dataTransfer.files); } }}
          >
            <div className="workspace-search">
              <Search size={16} aria-hidden="true" />
              <input aria-label="작업실 자산 검색" placeholder="자산 검색" value={assetQuery} onChange={(event) => setAssetQuery(event.target.value)} />
            </div>
            <select aria-label="작업실 자산 유형" value={assetType} onChange={(event) => setAssetType(event.target.value)}>
              <option value="all">모든 자산</option><option value="image">이미지</option><option value="video">영상</option><option value="audio">음향</option><option value="text">텍스트</option>
            </select>
            <div className="workspace-asset-actions">
              <input ref={input} type="file" multiple hidden accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,audio/wav,audio/x-wav,audio/mpeg,.txt,.md,text/plain,text/markdown" onChange={(event) => {
                if (event.target.files) void addFiles(event.target.files);
                event.target.value = "";
              }} />
              <button type="button" disabled={!project || uploading} onClick={() => input.current?.click()} title="파일을 가져와 캔버스에 추가합니다.">
                <Upload size={15} /> {uploading ? "가져오는 중" : "업로드"}
              </button>
              <button type="button" disabled={!project} onClick={() => onTool("assets")} title="자산 보관함과 보드 가져오기를 엽니다.">
                <FolderOpen size={15} /> 관리
              </button>
            </div>
            {error && <p className="workspace-error" role="alert">{error}</p>}
            <div className="workspace-list-header"><strong>프로젝트 자산</strong><span>{visibleAssets.length}개</span></div>
            {visibleAssets.length ? (
              <ul className="workspace-asset-list">
                {visibleAssets.map((item) => {
                  const Icon = assetIcon(item);
                  return (
                    <li key={item.id}>
                      <div className="workspace-asset-info">
                        <span className="workspace-asset-icon"><Icon size={17} aria-hidden="true" /></span>
                        <span><strong title={item.title}>{item.title || "제목 없는 자산"}</strong><small>{item.asset?.type === "image" ? "이미지" : item.asset?.type === "video" ? "영상" : item.asset?.type === "audio" ? "음향" : "텍스트"}</small></span>
                      </div>
                      <div className="workspace-asset-buttons">
                        <button type="button" onClick={() => onUseAsset(item, "copy")} title={`${item.title}을 새 노드로 추가합니다.`}><Copy size={13} /> 노드로</button>
                        <button type="button" disabled={!selected} onClick={() => onUseAsset(item, "input")} title={selected ? "선택한 노드의 생성 입력으로 연결합니다." : "먼저 연결할 노드를 선택하세요."}>참조 연결</button>
                        <button type="button" disabled={!selected} onClick={() => onUseAsset(item, "guide")} title={selected ? "선택한 노드에 연출 확인용으로 연결합니다." : "먼저 연결할 노드를 선택하세요."}>연출 참고</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="workspace-empty">조건에 맞는 자산이 없습니다.</p>}
          </div>
        )}
      </div>
      <footer className="workspace-sidebar-footer">
        <span>노드 {nodes.length}개</span>
        <button type="button" onClick={() => onAdd("brief")} disabled={!project} title="기획 문서 노드를 추가합니다."><Plus size={15} /> 노드 추가</button>
      </footer>
    </aside>
  );
}
