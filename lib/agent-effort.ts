import type { Provider, ProviderInfo } from "./types";

export const agentEfforts = ["low", "medium", "high", "xhigh", "max", "ultra"] as const;
export type AgentEffort = typeof agentEfforts[number];
export const effortLabels: Record<AgentEffort, string> = {
  low: "낮음", medium: "보통", high: "높음", xhigh: "매우 높음",
  max: "최대", ultra: "울트라",
};
export function isAgentEffort(value: unknown): value is AgentEffort {
  return typeof value === "string" && agentEfforts.some((item) => item === value);
}

export function effortOptions(provider: ProviderInfo | undefined, model: string): AgentEffort[] {
  if (!provider) return [];
  if (model) {
    const found = provider.models?.find((item) => item.id === model);
    return found ? found.efforts ?? provider.efforts ?? [] : [];
  }
  return provider.efforts ?? [];
}

export function agentEffortArguments(provider: Provider, effort?: AgentEffort): string[] {
  if (effort === undefined) return [];
  if (!isAgentEffort(effort)) throw new Error("추론 강도를 확인해 주세요.");
  if (provider === "codex") return ["-c", `model_reasoning_effort="${effort}"`];
  if ((provider === "claude" || provider === "agy") && effort !== "ultra") return ["--effort", effort];
  throw new Error("이 에이전트는 선택한 추론 강도를 지원하지 않습니다.");
}
