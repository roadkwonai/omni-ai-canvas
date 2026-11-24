"use client";

import { useEffect, useState } from "react";
import { BookOpen, RotateCcw, Sparkles } from "lucide-react";
import { effectiveGuidance, guidanceRecipes } from "../lib/node-guidance";
import ProductionGuidePicker from "./ProductionGuidePicker";
import type { ProductionGuideId } from "../lib/higgsfield-guidance-kit";
import type { AgentDefaults } from "../lib/agent-preferences";
import type { CanvasNode, Provider, ProviderInfo, Run } from "../lib/types";
import { effortOptions, type AgentEffort } from "../lib/agent-effort";
import "./node-guidance.css";

type Props = {
  node: CanvasNode;
  runs: Run[];
  providers: ProviderInfo[];
  defaults: AgentDefaults;
  onChange: (nodeId: string, guidance: CanvasNode["guidance"]) => void;
  onRevise: (request: {
    nodeId: string;
    provider: Provider;
    model?: string;
    effort?: AgentEffort;
    prompt: string;
  }) => Promise<void>;
};

type Draft = { recipeId: string; text: string; skillIds?: ProductionGuideId[]; baseline: string };

function draftSignature(value: Pick<Draft, "recipeId" | "text" | "skillIds">) {
  return JSON.stringify({ recipeId: value.recipeId, text: value.text,
    ...(value.skillIds ? { skillIds: value.skillIds } : {}) });
}

function signature(node: CanvasNode) {
  const current = effectiveGuidance(node);
  return draftSignature({ recipeId: current.recipe.id, text: current.text, skillIds: node.guidance?.skillIds });
}

export default function NodeGuidancePanel(props: Props) {
  return <GuidanceEditor key={props.node.id} {...props} />;
}

function GuidanceEditor({ node, runs, providers, defaults, onChange, onRevise }: Props) {
  const effective = effectiveGuidance(node);
  const currentSignature = signature(node);
  const [draftState, setDraftState] = useState<Draft>(() => ({
    recipeId: effective.recipe.id,
    text: effective.text,
    skillIds: node.guidance?.skillIds,
    baseline: currentSignature,
  }));
  const savedDraft = draftSignature(draftState);
  const dirty = savedDraft !== draftState.baseline;
  const changedOutside = draftState.baseline !== currentSignature;
  const draft = changedOutside && !dirty
    ? { recipeId: effective.recipe.id, text: effective.text, skillIds: node.guidance?.skillIds, baseline: currentSignature }
    : draftState;
  const [providerChoice, setProviderChoice] = useState<Provider | "" | null>(null);
  const [modelChoice, setModelChoice] = useState<string | null>(null);
  const [request, setRequest] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [commonOpen, setCommonOpen] = useState(false);
  const [commonGuidance, setCommonGuidance] = useState("");
  const [commonError, setCommonError] = useState("");
  useEffect(() => {
    if (!commonOpen || commonGuidance) return;
    const controller = new AbortController();
    fetch("/api/guidance", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("공통 지침을 불러오지 못했습니다.");
        const value: unknown = await response.json();
        if (!value || typeof value !== "object" || !("common" in value) || typeof value.common !== "string")
          throw new Error("공통 지침을 읽을 수 없습니다.");
        setCommonGuidance(value.common);
        setCommonError("");
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setCommonError(cause instanceof Error ? cause.message : "공통 지침을 불러오지 못했습니다.");
      });
    return () => controller.abort();
  }, [commonOpen, commonGuidance]);
  const recipe = guidanceRecipes.find((item) => item.id === draft.recipeId) ?? effective.recipe;
  const recipeSource = "skill" in recipe ? recipe.skill : undefined;
  const compatible = providers.filter((item) => item.operations.includes("text"));
  const providerId = providerChoice ?? defaults.text?.provider ?? "";
  const provider = compatible.find((item) => item.id === providerId);
  const models = provider?.models?.filter((item) => item.operations.includes("text")) ?? [];
  const model = modelChoice ?? (providerChoice === null ? defaults.text?.model ?? "" : "");
  const preferredEffort = modelChoice === null && providerChoice === null ? defaults.text?.effort : undefined;
  const effort = preferredEffort && effortOptions(provider, model).includes(preferredEffort) ? preferredEffort : undefined;
  const modelMissing = !!model && !models.some((item) => item.id === model);
  const latest = runs
    .filter((run) => run.input.guidanceEdit === true && run.input.nodeId === node.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const proposal = latest?.status === "succeeded" ? latest.result?.text?.trim() : undefined;
  const original = latest?.input.target?.guidance;
  const stale = !!proposal && (
    !original ||
    original.recipeId !== effective.recipe.id ||
    original.text !== effective.text ||
    JSON.stringify(original.skillIds ?? null) !== JSON.stringify(node.guidance?.skillIds ?? null) ||
    latest?.input.target?.title !== node.title ||
    latest?.input.target?.body !== node.body
  );
  const applied = !!proposal && proposal === effective.text;
  const pendingDraft = draftSignature(draft) !== currentSignature;
  const running = submitting || latest?.status === "queued" || latest?.status === "running";

  function updateDraft(value: Partial<Pick<Draft, "recipeId" | "text" | "skillIds">>) {
    setDraftState({ ...draft, ...value });
  }

  function saveDraft() {
    if (changedOutside && dirty) {
      setError("다른 곳에서 지침이 변경됐습니다. 현재 저장된 지침을 불러온 뒤 다시 수정해 주세요.");
      return;
    }
    onChange(node.id, { recipeId: draft.recipeId, text: draft.text, ...(draft.skillIds ? { skillIds: draft.skillIds } : {}) });
    setDraftState({ ...draft, baseline: draftSignature(draft) });
    setError("");
  }

  async function revise() {
    if (!provider || !provider.available || modelMissing || !request.trim() || pendingDraft || running) return;
    setSubmitting(true);
    setError("");
    try {
      await onRevise({ nodeId: node.id, provider: provider.id, ...(model ? { model } : {}), ...(effort ? { effort } : {}), prompt: request.trim() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "지침 수정 요청에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="node-guidance" aria-label="노드 제작 지침">
      <div className="node-guidance-heading">
        <span className="node-guidance-icon"><BookOpen size={17} aria-hidden="true" /></span>
        <div>
          <h3>제작 지침</h3>
          <p>이 노드의 작업에 사용할 지침을 확인하고 조정합니다.</p>
        </div>
      </div>

      <label htmlFor="guidance-recipe">지침과 워크플로우</label>
      <select
        id="guidance-recipe"
        value={draft.recipeId}
        title="이 노드의 지침과 작업 단계를 선택합니다."
        onChange={(event) => {
          const next = guidanceRecipes.find((item) => item.id === event.target.value);
          if (next) updateDraft({ recipeId: next.id, text: next.instructions });
        }}
      >
        {guidanceRecipes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <p className="node-guidance-summary">{recipe.summary}</p>
      <ol className="node-guidance-steps">
        {recipe.workflow.map((step) => <li key={step}>{step}</li>)}
      </ol>
      {recipeSource && (
        <p className="node-guidance-source">
          참고 스킬 <a href={recipeSource.url} target="_blank" rel="noreferrer">{recipeSource.name}</a>
        </p>
      )}
      <ProductionGuidePicker kind={node.kind} selected={draft.skillIds} onChange={(skillIds) => updateDraft({ skillIds })} />
      <details className="node-guidance-common" onToggle={(event) => setCommonOpen(event.currentTarget.open)}>
        <summary data-help="기존 텍스트 작업의 공통 지침 원문과 이 노드에 적용되는 범위를 확인합니다.">기존 텍스트 작업의 공통 Higgsfield 지침 보기</summary>
        <p>{draft.skillIds === undefined
          ? "선택한 스킬 목록이 없는 노드의 텍스트 작업에 적용됩니다."
          : "이 노드는 선택한 지침과 노드 레시피를 사용합니다. 아래 내용은 기존 노드의 공통 지침입니다."}</p>
        {commonGuidance ? <pre>{commonGuidance}</pre> : <p role="status">{commonError || "공통 지침을 불러오는 중입니다."}</p>}
      </details>
      <label htmlFor="guidance-text">이 노드에 적용할 지침</label>
      <textarea
        id="guidance-text"
        value={draft.text}
        maxLength={4000}
        rows={6}
        title="노드 작업에 적용할 지침을 직접 편집합니다."
        onChange={(event) => updateDraft({ text: event.target.value })}
      />
      <div className="node-guidance-actions">
        <span>{draft.text.length} / 4,000자</span>
        <button
          type="button"
          title="노드의 지침을 종류별 기본값으로 되돌립니다."
          onClick={() => {
            onChange(node.id, undefined);
            const next = effectiveGuidance({ ...node, guidance: undefined });
            setDraftState({ recipeId: next.recipe.id, text: next.text, baseline: draftSignature({ recipeId: next.recipe.id, text: next.text }) });
            setError("");
          }}
        ><RotateCcw size={14} aria-hidden="true" /> 기본 지침</button>
        <button type="button" className="node-guidance-primary" data-help="선택한 워크플로우, 스킬과 편집한 지침을 노드에 저장합니다. 이후 해당 노드의 요청에 사용됩니다." disabled={!pendingDraft} onClick={saveDraft}>
          지침 저장
        </button>
      </div>
      {changedOutside && dirty && (
        <p role="alert" className="node-guidance-alert">
          저장된 지침이 변경됐습니다. <button type="button" onClick={() => setDraftState({ recipeId: effective.recipe.id, text: effective.text, skillIds: node.guidance?.skillIds, baseline: currentSignature })}>현재 지침 불러오기</button>
        </p>
      )}
      {error && <p role="alert" className="node-guidance-alert">{error}</p>}

      <details className="node-guidance-revise">
        <summary data-help="저장된 지침을 바탕으로 새 문구를 제안받습니다. 결과를 읽은 뒤 적용할 수 있습니다."><Sparkles size={16} aria-hidden="true" /> 에이전트와 지침 수정</summary>
        <p>저장된 지침과 요청을 바탕으로 수정안을 만듭니다. 검토 후 적용할 수 있습니다.</p>
        <label htmlFor="guidance-provider">에이전트</label>
        <select id="guidance-provider" data-help="지침을 읽고 수정안을 작성할 에이전트 계정을 선택합니다." value={providerId} onChange={(event) => { setProviderChoice(event.target.value as Provider | ""); setModelChoice(""); }}>
          <option value="">에이전트를 선택해 주세요</option>
          {providerId && !provider && <option value={providerId}>{providerId} · 연결 확인 필요</option>}
          {compatible.map((item) => <option key={item.id} value={item.id}>{item.label}{item.available ? "" : " · 연결 확인 필요"}</option>)}
        </select>
        {provider && (
          <>
            <label htmlFor="guidance-model">모델</label>
            <select id="guidance-model" data-help="수정안에 사용할 모델을 고릅니다. 기본 모델로 요청할 수도 있습니다." value={model} onChange={(event) => setModelChoice(event.target.value)}>
              <option value="">기본 모델</option>
              {modelMissing && <option value={model}>{model} · 확인 필요</option>}
              {models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <p className="node-guidance-billing">{provider.billing}</p>
          </>
        )}
        <label htmlFor="guidance-request">수정 요청</label>
        <textarea id="guidance-request" rows={3} maxLength={12000} value={request} data-help="현재 지침에서 보강하거나 바꾸고 싶은 부분을 구체적으로 적습니다." placeholder="예를 들어 인물의 감정 변화와 카메라 움직임을 더 구체화해 주세요." onChange={(event) => setRequest(event.target.value)} />
        {pendingDraft && <p className="node-guidance-alert">수정 요청 전에 편집한 지침을 저장해 주세요.</p>}
        {modelMissing && <p className="node-guidance-alert">선택한 모델을 현재 사용할 수 없습니다.</p>}
        <button type="button" className="node-guidance-primary" data-help="저장된 지침과 수정 요청을 선택한 에이전트로 보냅니다." disabled={!provider?.available || modelMissing || !request.trim() || pendingDraft || running} onClick={() => void revise()}>
          {running ? "수정안 작성 중" : "지침 수정안 요청"}
        </button>
        {latest?.status === "failed" && <p role="alert" className="node-guidance-alert">{latest.error || "수정안을 가져오지 못했습니다."}</p>}
        {proposal && (
          <div className="node-guidance-proposal">
            <strong>에이전트 수정안</strong>
            <p>{proposal}</p>
            {stale && !applied && <p className="node-guidance-alert">요청 이후 노드나 지침이 변경돼 이 수정안을 적용할 수 없습니다. 새 수정안을 요청해 주세요.</p>}
            {proposal.length > 4000 && <p className="node-guidance-alert">수정안이 4,000자를 초과했습니다. 내용을 줄여 다시 요청해 주세요.</p>}
            {applied && <p>이 수정안이 적용되어 있습니다.</p>}
            <button
              type="button"
              data-help="검토한 수정안으로 이 노드의 지침 본문을 바꿉니다. 이후 작업부터 반영됩니다."
              disabled={stale || applied || pendingDraft || proposal.length > 4000}
              onClick={() => {
                if (stale || applied || pendingDraft || proposal.length > 4000) return;
                const next = { recipeId: effective.recipe.id, text: proposal, ...(node.guidance?.skillIds ? { skillIds: node.guidance.skillIds } : {}) };
                onChange(node.id, next);
                setDraftState({ ...next, baseline: draftSignature(next) });
              }}
            >수정안 적용</button>
          </div>
        )}
      </details>
    </section>
  );
}
