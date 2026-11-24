"use client";

import { useRef, useState } from "react";
import ServiceSettings from "./ServiceSettings";
import ProviderConnections from "./ProviderConnections";
import { Settings, X } from "lucide-react";
import {
  agentOperationLabels,
  agentOperations,
  supportsOperation,
  type AgentDefaults,
} from "../lib/agent-preferences";
import { effortLabels, effortOptions, isAgentEffort, type AgentEffort } from "../lib/agent-effort";
import type { Operation, Provider, ProviderInfo } from "../lib/types";
import type { WorkspacePreferences } from "../lib/workspace-preferences";
import { allowsPaidImageProvider, paidImageProviders, type WorkspaceSettings, type PaidImageProvider } from "../lib/workspace-settings";
import "./agent-settings.css";

type Props = {
  providers: ProviderInfo[];
  settings: WorkspaceSettings;
  onRead: () => Promise<WorkspaceSettings>;
  onSave: (value: WorkspaceSettings) => Promise<void>;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
  snapshotAt: string | null;
  backgroundRefresh: boolean;
};

export default function AgentSettings({
  providers, settings, onRead, onSave, onRefresh, refreshing, snapshotAt, backgroundRefresh,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<AgentDefaults>({});
  const [layout, setLayout] = useState(settings.workspace);
  const [allowed, setAllowed] = useState<PaidImageProvider[]>(settings.paidImageProviders);
  const [version, setVersion] = useState(settings.version);
  const [busy, setBusy] = useState<"loading" | "saving" | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [section, setSection] = useState<"agents" | "layout" | "connections" | "keys">("agents");
  function applySettings(value: WorkspaceSettings) {
    setDraft(value.defaults);
    setLayout(value.workspace);
    setAllowed(value.paidImageProviders);
    setVersion(value.version);
  }
  async function loadSettings() {
    setBusy("loading");
    setLoadFailed(false);
    setError("");
    try {
      applySettings(await onRead());
    } catch (cause) {
      setLoadFailed(true);
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function saveSettings() {
    setBusy("saving");
    setError("");
    try {
      await onSave({ version, defaults: draft, workspace: layout, paidImageProviders: allowed });
      dialog.current?.close();
    } catch (cause) {
      setLoadFailed((cause as Error & { status?: number }).status === 409);
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  }
  function update(operation: Operation, provider: Provider | "", model = "", effort?: AgentEffort) {
    setDraft((current) => {
      const next = { ...current };
      if (provider) next[operation] = { provider, model, ...(effort ? { effort } : {}) };
      else delete next[operation];
      return next;
    });
  }
  return (
    <>
      <button
        ref={opener}
        id="scene-room-settings"
        type="button"
        className="guide-open"
        aria-label="설정"
        title="작업 종류별 기본 에이전트와 모델을 설정합니다."
        onClick={() => {
          applySettings(settings);
          setDialogOpen(true);
          dialog.current?.showModal();
          void loadSettings();
        }}
      >
        <Settings size={17} /> <span>설정</span>
      </button>
      <dialog
        ref={dialog}
        className="agent-settings-dialog"
        aria-labelledby="agent-settings-title"
        onClose={() => { setDialogOpen(false); opener.current?.focus(); }}
        onCancel={(event) => { if (busy) event.preventDefault(); }}
        onClick={(event) => { if (!busy && event.target === event.currentTarget) dialog.current?.close(); }}
      >
        <header>
          <div>
            <h2 id="agent-settings-title">작업실 설정</h2>
          </div>
          <button type="button" className="studio-action" data-tone="quiet" data-size="icon" aria-label="설정 닫기" title="설정을 닫습니다." disabled={!!busy} onClick={() => dialog.current?.close()}>
            <X size={20} />
          </button>
        </header>
        <nav className="agent-settings-nav" aria-label="설정 메뉴">
          <button type="button" className="studio-action" data-tone="quiet" aria-pressed={section === "agents"} onClick={() => setSection("agents")}>기본 에이전트</button>
          <button type="button" className="studio-action" data-tone="quiet" aria-pressed={section === "layout"} onClick={() => setSection("layout")}>작업 공간</button>
          <button type="button" className="studio-action" data-tone="quiet" aria-pressed={section === "connections"} onClick={() => setSection("connections")}>계정 연결</button>
          <button type="button" className="studio-action" data-tone="quiet" aria-pressed={section === "keys"} onClick={() => setSection("keys")}>API 키</button>
        </nav>
        {(section === "agents" || section === "layout") && (busy === "loading" || error) &&
          <div className="agent-settings-status" role={error ? "alert" : "status"}>
            <p>{error || "서버에서 작업실 설정을 불러오고 있습니다."}</p>
            {loadFailed && <button className="studio-action" type="button" onClick={() => void loadSettings()}>서버 설정 다시 불러오기</button>}
          </div>}
        {section === "agents" && <div className="agent-settings-body" inert={!!busy || loadFailed}>
          <p>기본값은 서버에 저장되어 다른 브라우저에도 적용됩니다. 노드에서 따로 고른 값이 있으면 그 값을 먼저 씁니다.</p>
          <fieldset>
            <legend>따로 결제하는 이미지 API</legend>
            <p>사용할 API를 선택하고 저장하면 제작 노드에서 선택할 수 있습니다. Codex 이미지는 ChatGPT 구독의 image_gen을 사용합니다.</p>
            {paidImageProviders.map((provider) => {
              const name = { "openai-image": "OpenAI 이미지 API", "gemini-image": "Gemini 이미지 API", seedream: "Seedream 이미지 API" }[provider];
              return <label className="agent-settings-check" key={provider}>
                <input type="checkbox" checked={allowed.includes(provider)} onChange={(event) => {
                  const next = event.target.checked ? [...allowed, provider] : allowed.filter((item) => item !== provider);
                  setAllowed(next);
                  if (draft.image?.provider === provider && !next.includes(provider)) update("image", "codex");
                }} /> {name} 허용
              </label>;
            })}
          </fieldset>
          {agentOperations.map((operation) => {
            const setting = draft[operation];
            const compatible = providers.filter((provider) => supportsOperation(provider, operation) && allowsPaidImageProvider(provider.id, allowed));
            const selected = compatible.find((provider) => provider.id === setting?.provider);
            const models = selected?.models?.filter((model) => model.operations.includes(operation)) ?? [];
            const modelMissing = !!setting?.model && !models.some((model) => model.id === setting.model);
            const efforts = operation === "plan" || operation === "text" ? effortOptions(selected, setting?.model ?? "") : [];
            const providerMissing = !!setting && !selected;
            return (
              <fieldset key={operation}>
                <legend>{agentOperationLabels[operation]}</legend>
                <div className={`agent-settings-fields${efforts.length ? " with-effort" : ""}`}>
                  <label>
                    계정
                    <select
                      value={setting?.provider ?? ""}
                      onChange={(event) => update(operation, event.target.value as Provider | "")}
                    >
                      {operation !== "image" && <option value="">설정하지 않음</option>}
                      {providerMissing && <option value={setting!.provider}>{setting!.provider} · 목록 확인 필요</option>}
                      {compatible.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}{provider.available ? "" : " · 연결 확인 필요"}
                        </option>
                      ))}
                    </select>
                  </label>
                  {setting && !(operation === "image" && setting.provider === "codex") && (
                    <label>
                      모델
                      <select
                        value={setting.model}
                        onChange={(event) => update(operation, setting.provider, event.target.value)}
                      >
                        <option value="">기본 모델 선택</option>
                        {modelMissing && <option value={setting.model}>{setting.model} · 확인 필요</option>}
                        {models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                      </select>
                    </label>
                  )}
                  {setting && efforts.length > 0 && <label>
                    추론 강도
                    <select value={setting.effort && efforts.includes(setting.effort) ? setting.effort : ""}
                      title="모델이 지원하면 얼마나 깊이 추론할지 정합니다. 기본값은 CLI 설정을 따릅니다."
                      onChange={(event) => {
                        const value = event.target.value;
                        update(operation, setting.provider, setting.model, isAgentEffort(value) ? value : undefined);
                      }}>
                      <option value="">CLI 기본값</option>
                      {efforts.map((value) => <option key={value} value={value}>{effortLabels[value]} · {value}</option>)}
                    </select>
                  </label>}
                </div>
                {setting && (!selected?.available || modelMissing) && (
                  <p className="agent-settings-notice">계정 연결과 모델 목록을 확인해 주세요.</p>
                )}
                {setting && ["higgsfield", "kling", "topview"].includes(setting.provider) && !setting.model && (
                  <p className="agent-settings-notice">이미지·영상 작업은 모델을 선택해야 실행할 수 있습니다.</p>
                )}
              </fieldset>
            );
          })}
          <p>이미지·영상 작업 방식과 참조는 각 노드에서 선택할 수 있습니다.</p>
        </div>}
        {section === "layout" && <div className="agent-settings-body" inert={!!busy || loadFailed}>
          <fieldset>
            <legend>왼쪽 제작 도구함</legend>
            <label className="agent-settings-check">
              <input type="checkbox" checked={layout.sidebarOpen}
                onChange={(event) => setLayout({ ...layout, sidebarOpen: event.target.checked })} />
              데스크톱에서 도구함을 펼쳐서 시작
            </label>
            <div className="agent-settings-fields">
              <label>
                시작 탭
                <select value={layout.sidebarTab} onChange={(event) => setLayout({ ...layout, sidebarTab: event.target.value as WorkspacePreferences["sidebarTab"] })}>
                  <option value="kit">제작 키트</option>
                  <option value="canvas">캔버스</option>
                  <option value="assets">자산</option>
                </select>
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>우측 작업 패널</legend>
            <div className="agent-settings-fields">
              <label>
                시작 화면
                <select value={layout.startPanel} onChange={(event) => setLayout({ ...layout, startPanel: event.target.value as WorkspacePreferences["startPanel"] })}>
                  <option value="workspace">프로젝트 대화</option>
                  <option value="agent">기획과 생성</option>
                </select>
              </label>
              <label>
                데스크톱 패널 너비
                <select value={layout.panelWidth} onChange={(event) => setLayout({ ...layout, panelWidth: event.target.value as WorkspacePreferences["panelWidth"] })}>
                  <option value="standard">기본</option>
                  <option value="wide">넓게</option>
                </select>
              </label>
            </div>
          </fieldset>
        </div>}
        {dialogOpen && section === "connections" && <ProviderConnections providers={providers} onRefresh={onRefresh} refreshing={refreshing} snapshotAt={snapshotAt} backgroundRefresh={backgroundRefresh} />}
        {dialogOpen && section === "keys" && <ServiceSettings onRefresh={onRefresh} />}
        <footer>
          {section === "connections" || section === "keys" ? (
            <button type="button" className="studio-action" disabled={!!busy} onClick={() => dialog.current?.close()}>닫기</button>
          ) : <>
            <button type="button" className="studio-action" disabled={!!busy} onClick={() => dialog.current?.close()}>취소</button>
            <button type="button" className="studio-action" data-tone="primary" disabled={!!busy || loadFailed}
              onClick={() => void saveSettings()}>{busy === "saving" ? "저장 중" : "저장"}</button>
          </>}
        </footer>
      </dialog>
    </>
  );
}
