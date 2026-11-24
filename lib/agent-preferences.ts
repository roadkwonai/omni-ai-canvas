import { isAgentEffort, type AgentEffort } from "./agent-effort";
import type { Operation, Provider, ProviderInfo } from "./types";

export type AgentDefault = { provider: Provider; model: string; effort?: AgentEffort };
export type AgentDefaults = Partial<Record<Operation, AgentDefault>>;
export type AgentChoice = { provider: Provider | ""; models: Record<string, string>; effort?: AgentEffort };

export const agentDefaultsKey = "scene-room-agent-defaults-v1";
export const agentOperations: Operation[] = ["plan", "text", "image", "video", "audio"];
export const agentOperationLabels: Record<Operation, string> = {
  plan: "기획·감독 검토",
  text: "텍스트 작업",
  image: "이미지 생성",
  video: "영상 생성",
  audio: "음악·효과음",
};

export function supportsOperation(provider: ProviderInfo, operation: Operation): boolean {
  return provider.operations.includes(operation) ||
    (provider.id === "topview" && (operation === "image" || operation === "video")) ||
    (provider.id === "agy" && (operation === "image" ||
      ((operation === "text" || operation === "plan") && provider.operations.length === 0)));
}

export function parseAgentDefaults(value: unknown): AgentDefaults {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: AgentDefaults = {};
  const knownProviders: Provider[] = [
    "codex", "claude", "agy", "higgsfield", "topview", "kling",
    "openai-image", "gemini-image", "seedream", "road-music",
  ];
  for (const operation of agentOperations) {
    const item = (value as Record<string, unknown>)[operation];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const { provider, model, effort } = item as Record<string, unknown>;
    if (
      typeof provider === "string" &&
      knownProviders.includes(provider as Provider) &&
      typeof model === "string" && model.length <= 128 && !/[\u0000-\u001f\u007f]/.test(model)
    ) {
      const supportedWork = (operation === "plan" || operation === "text") &&
        (provider === "codex" || provider === "claude" || provider === "agy");
      result[operation] = { provider: provider as Provider, model,
        ...(supportedWork && isAgentEffort(effort) ? { effort } : {}) };
    }
  }
  return result;
}

export function selectedAgent(
  explicit: AgentChoice | undefined,
  defaults: AgentDefaults,
  operation: Operation,
): AgentChoice | undefined {
  if (explicit) return explicit;
  const fallback = defaults[operation];
  return fallback && {
    provider: fallback.provider,
    models: { [fallback.provider]: fallback.model },
    ...(fallback.effort ? { effort: fallback.effort } : {}),
  };
}
