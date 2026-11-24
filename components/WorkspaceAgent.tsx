"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowUp, Film, MessageCirclePlus, Paperclip, Settings, X } from "lucide-react";
import AgentAttachments from "./AgentAttachments";
import { guidanceRecipes } from "../lib/node-guidance";
import type { AttachmentRecord } from "../lib/attachments-types";
import { effortLabels, effortOptions, isAgentEffort, type AgentEffort } from "../lib/agent-effort";
import type { AgentDefaults } from "../lib/agent-preferences";
import { kindLabels, type Project, type Provider, type ProviderInfo, type Run } from "../lib/types";
import "./workspace-agent.css";

export type WorkspaceAgentRequest = {
  threadId: string;
  nodeIds: string[];
  recipeIds: string[];
  provider: Provider;
  model?: string;
  effort?: AgentEffort;
  prompt: string;
  attachmentIds: string[];
};

type Props = {
  activeStyle?: string;
  onPreset?: () => void;
  project: Project;
  runs: Run[];
  providers: ProviderInfo[];
  defaults: AgentDefaults;
  onSend: (request: WorkspaceAgentRequest) => Promise<void>;
  onPlan: (prefill?: string) => void;
  onVideo: () => void;
  onSettings?: () => void;
  onProjectSettings?: () => void;
};

export default function WorkspaceAgent({ project, runs, providers, defaults, onSend, onPlan, onVideo, onSettings, onProjectSettings, activeStyle, onPreset }: Props) {
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [selectedRecipes, setSelectedRecipes] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState<{ provider: Provider | ""; model: string; effort?: AgentEffort } | null>(null);
  const [showNodes, setShowNodes] = useState(false);
  const [showRecipes, setShowRecipes] = useState(false);
  const [nodeQuery, setNodeQuery] = useState("");
  const [mention, setMention] = useState<{ start: number; end: number; query: string } | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const chatRuns = runs.filter((run) => run.input.chat?.threadId);
  const threads = useMemo(() => {
    const result = new Map<string, Run>();
    for (const run of chatRuns) {
      const id = run.input.chat?.threadId;
      if (id && !result.has(id)) result.set(id, run);
    }
    return [...result.entries()];
  }, [chatRuns]);
  const threadId = selectedThread ?? threads[0]?.[0] ?? null;
  const messages = chatRuns.filter((run) => run.input.chat?.threadId === threadId).reverse();
  const waiting = messages.some((run) => run.status === "queued" || run.status === "running");
  const compatible = providers.filter((provider) => provider.operations.includes("text"));
  const activeChoice = choice ?? defaults.text ?? { provider: "" as const, model: "" };
  const provider = compatible.find((item) => item.id === activeChoice.provider);
  const models = provider?.models?.filter((item) => item.operations.includes("text")) ?? [];
  const efforts = effortOptions(provider, activeChoice.model);
  const effort = activeChoice.effort && efforts.includes(activeChoice.effort) ? activeChoice.effort : undefined;
  const missingModel = !!activeChoice.model && !models.some((item) => item.id === activeChoice.model);
  const usable = !!provider?.available && !missingModel;
  const nodeMatches = project.graph.nodes.filter((node) =>
    `${node.title} ${kindLabels[node.kind]}`.toLocaleLowerCase().includes(nodeQuery.toLocaleLowerCase()),
  );
  const mentionMatches = mention
    ? project.graph.nodes.filter((node) =>
        `${node.title} ${kindLabels[node.kind]}`.toLocaleLowerCase().includes(mention.query.toLocaleLowerCase()),
      ).slice(0, 8)
    : [];
  const selectedNodeItems = project.graph.nodes.filter((node) => selectedNodes.includes(node.id));

  function changeThread(id: string) {
    setSelectedThread(id);
    setSelectedNodes([]);
    setSelectedRecipes([]);
    setAttachments([]);
    setPrompt("");
    setMention(null);
    setError("");
  }

  function insertMention(nodeId: string) {
    if (!mention) return;
    if (!selectedNodes.includes(nodeId) && selectedNodes.length >= 12) {
      setError("참조 노드는 최대 12개까지 선택할 수 있습니다.");
      return;
    }
    setSelectedNodes((current) => current.includes(nodeId) ? current : [...current, nodeId]);
    const next = prompt.slice(0, mention.start) + prompt.slice(mention.end);
    setPrompt(next);
    setMention(null);
    textarea.current?.focus();
  }

  function updatePrompt(value: string, position: number) {
    setPrompt(value);
    const match = /@([^@\n]*)$/.exec(value.slice(0, position));
    setMention(match ? { start: position - match[0].length, end: position, query: match[1] } : null);
  }

  async function send() {
    if (!provider || !usable || sending || waiting || attachmentBusy || (!prompt.trim() && !attachments.length)) return;
    const submittedPrompt = prompt.trim() || "첨부 자료를 살펴보고 내용에 맞게 도와주세요.";
    const activeThread = threadId ?? crypto.randomUUID();
    setSelectedThread(activeThread);
    setSending(true);
    setError("");
    try {
      await onSend({
        threadId: activeThread,
        provider: provider.id,
        ...(activeChoice.model ? { model: activeChoice.model } : {}),
        ...(effort ? { effort } : {}),
        prompt: submittedPrompt,
        nodeIds: selectedNodeItems.map((node) => node.id),
        recipeIds: selectedRecipes,
        attachmentIds: attachments.map((attachment) => attachment.id),
      });
      setPrompt("");
      setSelectedNodes([]);
      setSelectedRecipes([]);
      setAttachments([]);
      setMention(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "요청을 전송하지 못했습니다.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="workspace-agent" aria-label="프로젝트 에이전트">
      <header className="workspace-agent-header">
        <div>
          <h2>프로젝트 대화</h2>
          <p>{project.title}</p>
        </div>
        <div className="workspace-agent-header-actions">
          {onProjectSettings && <button className="studio-action" data-tone="quiet" type="button" aria-label="프로젝트 설정"
            aria-haspopup="dialog" data-help="현재 프로젝트의 이름, 카테고리와 태그를 관리합니다."
            onClick={onProjectSettings}><Settings size={15} aria-hidden="true" /> 설정</button>}
          <button className="studio-action" data-size="icon" data-tone="quiet" type="button" disabled={sending || attachmentBusy}
            onClick={() => changeThread(crypto.randomUUID())} data-help="새 주제로 대화를 시작합니다. 이전 대화는 대화 목록에서 다시 열 수 있습니다." aria-label="새 대화">
            <MessageCirclePlus size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="workspace-agent-controls">
        <label>
          대화
          <select aria-label="대화 기록" data-help="이전에 나눈 대화를 선택해 이어서 질문합니다." disabled={sending || attachmentBusy} value={threadId ?? ""} onChange={(event) => changeThread(event.target.value)}>
            {!threadId && <option value="">새 대화</option>}
            {selectedThread && !threads.some(([id]) => id === selectedThread) && <option value={selectedThread}>새 대화</option>}
            {threads.map(([id, run]) => <option key={id} value={id}>{run.input.prompt.slice(0, 42)}</option>)}
          </select>
        </label>
        <button type="button" className="studio-action" onClick={onVideo}><Film size={16} aria-hidden="true" /> 씬별 영상 만들기</button>
      </div>
      <details className="workspace-agent-preferences" open={!usable || undefined}>
        <summary data-help="이 대화에서 사용할 에이전트, 모델과 추론 강도를 펼칩니다.">{provider ? `대화 설정 · ${provider.label}` : "대화에 사용할 에이전트"}</summary>
        <div className="workspace-agent-controls">
          <label>
          에이전트
          <select aria-label="프로젝트 에이전트 계정" data-help="질문을 보낼 계정입니다. 연결 상태와 계정의 이용 조건을 확인하세요." value={activeChoice.provider} onChange={(event) => setChoice({ provider: event.target.value as Provider | "", model: "" })}>
            <option value="">선택해 주세요</option>
            {activeChoice.provider && !provider && <option value={activeChoice.provider}>{activeChoice.provider} · 연결 확인 필요</option>}
            {compatible.map((item) => <option key={item.id} value={item.id}>{item.label}{item.available ? "" : " · 연결 필요"}</option>)}
          </select>
        </label>
        {provider && (
          <label>
            모델
            <select aria-label="프로젝트 에이전트 모델" data-help="선택한 계정에서 대화에 사용할 모델을 고릅니다." value={activeChoice.model} onChange={(event) => setChoice({ provider: provider.id, model: event.target.value })}>
              <option value="">기본 설정</option>
              {missingModel && <option value={activeChoice.model}>{activeChoice.model} · 확인 필요</option>}
              {models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
            </select>
          </label>
        )}
        {provider && efforts.length > 0 && <label>추론 강도
          <select aria-label="프로젝트 에이전트 추론 강도" data-help="지원하는 모델에서 이 요청의 추론 강도를 정합니다. 정하지 않으면 모델 기본값을 씁니다." value={effort ?? ""} onChange={(event) => {
            const value = event.target.value;
            setChoice({ provider: provider.id, model: activeChoice.model, effort: isAgentEffort(value) ? value : undefined });
          }}>
            <option value="">CLI 기본값</option>
            {efforts.map((value) => <option key={value} value={value}>{effortLabels[value]} · {value}</option>)}
          </select>
        </label>}
        {provider && <p className="workspace-agent-billing">{provider.billing}</p>}
        {choice && defaults.text && <button className="workspace-agent-reset" type="button" data-help="대화에서 직접 고른 값을 지우고 저장된 텍스트 작업 기본값을 다시 씁니다." onClick={() => setChoice(null)}>기본 에이전트 사용</button>}
        {onSettings && <button className="workspace-agent-reset" type="button" data-help="작업실 설정에서 작업 종류별로 기본 에이전트와 모델을 선택합니다." onClick={onSettings}>기본값 설정</button>}
        {activeChoice.provider && !usable && <p className="workspace-agent-error" role="status">선택한 계정의 연결 상태와 모델을 확인해 주세요.</p>}
        </div>
      </details>

      <div className="workspace-agent-messages" aria-live="polite">
        {!messages.length && (
          <div className="workspace-agent-empty">
            <h3>무엇을 만들까요?</h3>
            <p>대본을 준비하거나, 캔버스의 씬을 골라 영상 클립을 만드세요.</p>
            <button type="button" className="studio-action" data-help="제작 탭에서 작품의 형식과 씬 구성을 정합니다. 입력 중인 아이디어가 있으면 가져갑니다." onClick={() => onPlan(prompt.trim() || undefined)}>제작안 만들기</button>
          </div>
        )}
        {messages.map((run) => (
          <div key={run.id} className="workspace-agent-turn">
            <div className="workspace-agent-user">
              <span>나</span>
              <p>{run.input.prompt}</p>
              {!!run.input.attachments?.length && <small>첨부 {run.input.attachments.map((item) => item.name).join(", ")}</small>}
              {!!run.input.chat?.nodeIds.length && <small>참조 {run.input.references.filter((item) => item.nodeId && run.input.chat?.nodeIds.includes(item.nodeId)).map((item) => item.title).join(", ")}</small>}
            </div>
            <div className="workspace-agent-reply">
              <span>{run.input.provider}</span>
              {run.status === "queued" && <p role="status">대기 중입니다.</p>}
              {run.status === "running" && <p role="status">응답을 작성하고 있습니다.</p>}
              {run.status === "failed" && <p role="alert">{run.error || "요청을 완료하지 못했습니다."}</p>}
              {run.status === "succeeded" && <p>{run.result?.text || "응답 내용이 없습니다."}</p>}
            </div>
          </div>
        ))}
      </div>

      <div className="workspace-agent-composer">
        <div className="workspace-agent-picker-buttons">
          {onPreset && <button type="button" onClick={onPreset} title="대화와 감독 기획에 사용할 제작 프리셋을 설정합니다.">{activeStyle ? `프리셋 · ${activeStyle}` : "제작 프리셋"}</button>}
          <button type="button" aria-expanded={showNodes} data-help="이 질문에 함께 전달할 캔버스 자료를 선택합니다. 입력란에서 @를 쳐서 찾을 수도 있습니다." onClick={() => { setShowNodes(!showNodes); setShowRecipes(false); }}>@ 노드 참조</button>
          <button type="button" aria-expanded={showRecipes} data-help="대화에 참고할 제작 지침을 선택합니다. 선택한 지침은 입력란 위에 표시됩니다." onClick={() => { setShowRecipes(!showRecipes); setShowNodes(false); }}>제작 지침</button>
        </div>
        {showNodes && (
          <div className="workspace-agent-picker">
            <input aria-label="참조 노드 검색" placeholder="노드 검색" value={nodeQuery} onChange={(event) => setNodeQuery(event.target.value)} />
            <div className="workspace-agent-picker-list">
              {nodeMatches.map((node) => <label key={node.id}><input type="checkbox" checked={selectedNodes.includes(node.id)} disabled={!selectedNodes.includes(node.id) && selectedNodes.length >= 12} onChange={(event) => setSelectedNodes((current) => event.target.checked ? [...current, node.id] : current.filter((id) => id !== node.id))} /><span>{node.title || kindLabels[node.kind]}</span><small>{kindLabels[node.kind]}</small></label>)}
              {!nodeMatches.length && <p>찾은 노드가 없습니다.</p>}
            </div>
          </div>
        )}
        {showRecipes && (
          <div className="workspace-agent-picker">
            <div className="workspace-agent-picker-list">
              {guidanceRecipes.map((recipe) => <label key={recipe.id}><input type="checkbox" checked={selectedRecipes.includes(recipe.id)} onChange={(event) => setSelectedRecipes((current) => event.target.checked ? [...current, recipe.id] : current.filter((id) => id !== recipe.id))} /><span title={recipe.summary}>{recipe.label}</span></label>)}
            </div>
          </div>
        )}
        {(selectedNodeItems.length > 0 || selectedRecipes.length > 0) && (
          <div className="workspace-agent-chips" aria-label="선택한 참조">
            {selectedNodeItems.map((node) => <button key={node.id} type="button" title="참조 노드를 제거합니다." onClick={() => setSelectedNodes((ids) => ids.filter((id) => id !== node.id))}>{node.title || kindLabels[node.kind]} <X size={12} /></button>)}
            {guidanceRecipes.filter((recipe) => selectedRecipes.includes(recipe.id)).map((recipe) => <button key={recipe.id} type="button" title="제작 지침을 제거합니다." onClick={() => setSelectedRecipes((ids) => ids.filter((id) => id !== recipe.id))}>{recipe.label} <X size={12} /></button>)}
          </div>
        )}
        {selectedNodeItems.some((node) => node.asset?.type === "video") && (
          <p className="workspace-agent-hint">참조 영상 노드는 본문을 전달합니다. 영상 장면은 파일 첨부로 전달해 주세요.</p>
        )}
        {mention && mentionMatches.length > 0 && (
          <div className="workspace-agent-mention" aria-label="노드 검색 결과">
            {mentionMatches.map((node) => <button type="button" key={node.id} onClick={() => insertMention(node.id)}>{node.title || kindLabels[node.kind]} <small>{kindLabels[node.kind]}</small></button>)}
          </div>
        )}
        <textarea
          ref={textarea}
          aria-label="프로젝트 대화 요청"
          data-help="작품에 관해 묻거나 피드백을 요청하세요. Enter로 보내고 Shift+Enter로 줄을 바꿉니다."
          placeholder="작품에 관해 물어보거나 @로 노드를 참조하세요"
          value={prompt}
          maxLength={12000}
          onChange={(event) => updatePrompt(event.target.value, event.target.selectionStart)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setMention(null);
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && (!mention || !mentionMatches.length)) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <details className="workspace-agent-attachments">
          <summary data-help="질문에 파일이나 공개 링크를 첨부합니다. 전달 범위는 자료 종류와 에이전트에 따라 달라집니다."><Paperclip size={15} aria-hidden="true" /> 자료 첨부 {attachments.length > 0 && `(${attachments.length})`}</summary>
          <AgentAttachments projectId={project.id} items={attachments} onChange={setAttachments} onBusyChange={setAttachmentBusy} provider={provider?.id} operation="text" />
        </details>
        {error && <p className="workspace-agent-error" role="alert">{error}</p>}
        <div className="workspace-agent-send-row">
          <small>Enter 전송 · Shift+Enter 줄바꿈</small>
          <button className="workspace-agent-send" type="button" onClick={() => void send()} disabled={!usable || sending || waiting || attachmentBusy || (!prompt.trim() && !attachments.length)} title="선택한 계정으로 대화를 요청합니다." aria-label="프로젝트 대화 전송">
            <ArrowUp size={19} />
          </button>
        </div>
      </div>
    </section>
  );
}
