import { randomUUID } from "node:crypto";
import type { AgentDefault } from "./agent-preferences";
import { executePromptTranslation, executeVoiceTranslation } from "./runner";
import type { RunInput, RunResult } from "./types";
import { getWorkspaceSettings } from "./workspace-settings-store";

export type TranslationTarget = "en" | "ko";

type TextAgent = Pick<AgentDefault, "provider" | "model" | "effort">;
type TranslationDependencies = {
  getTextAgent: () => Promise<TextAgent | undefined>;
  execute: (input: RunInput, source: string, target: TranslationTarget) => Promise<RunResult>;
};

export function createPreviewTranslator(dependencies: TranslationDependencies) {
  const pending = new Map<string, Promise<string>>();
  return async function translate(text: string, target: TranslationTarget): Promise<string> {
    let agent: TextAgent;
    try {
      agent = await dependencies.getTextAgent() ?? { provider: "codex", model: "" };
    } catch {
      throw new Error("작업실 텍스트 에이전트 설정을 불러오지 못했습니다.");
    }
    if (agent.provider !== "codex" && agent.provider !== "claude" && agent.provider !== "agy") {
      throw new Error("작업실 설정에서 텍스트 에이전트를 확인해 주세요.");
    }
    const key = JSON.stringify([agent.provider, agent.model, agent.effort ?? null, target, text]);
    const existing = pending.get(key);
    if (existing) return existing;
    if (pending.size >= 3) throw new Error("번역이 진행 중입니다. 잠시 후 다시 시도해 주세요.");

    const input: RunInput = {
      projectId: "",
      requestId: randomUUID(),
      nodeId: null,
      provider: agent.provider,
      operation: "text",
      prompt: "",
      references: [],
      ...(agent.model ? { model: agent.model } : {}),
      ...(agent.effort ? { effort: agent.effort } : {}),
    };
    const task = dependencies.execute(input, text, target).then((result) => {
      const translation = result.text?.trim();
      if (!translation) throw new Error("번역 결과가 비어 있습니다. 다시 시도해 주세요.");
      if (translation.length > 24_000) throw new Error("번역 결과가 너무 깁니다.");
      return translation;
    }).finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  };
}

export const translateNodePreview = createPreviewTranslator({
  getTextAgent: async () => (await getWorkspaceSettings()).defaults.text,
  execute: executePromptTranslation,
});

export const translateVoicePreview = createPreviewTranslator({
  getTextAgent: async () => (await getWorkspaceSettings()).defaults.text,
  execute: (input, source) => executeVoiceTranslation(input, source),
});

// 사용자 설정과 무관하게 격리된 중첩 Claude Code 세션(`claude -p`)에서 번역한다.
const fishTranslationAgent: TextAgent = { provider: "claude", model: "claude-haiku-5-5" };

export const translateFishVoicePreview = createPreviewTranslator({
  getTextAgent: async () => fishTranslationAgent,
  execute: (input, source) => executeVoiceTranslation(input, source),
});

export const translateFishSearchQuery = createPreviewTranslator({
  getTextAgent: async () => fishTranslationAgent,
  execute: executePromptTranslation,
});
