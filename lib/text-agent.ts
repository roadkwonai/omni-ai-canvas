import { randomUUID } from "node:crypto";
import type { RunInput } from "./types";
import { getWorkspaceSettings } from "./workspace-settings-store";

/** 작업실 설정의 텍스트 에이전트로 글 하나를 요청하는 입력. */
export async function textAgentInput(): Promise<RunInput> {
  const agent = (await getWorkspaceSettings()).defaults.text ?? { provider: "codex" as const, model: "" };
  if (agent.provider !== "codex" && agent.provider !== "claude" && agent.provider !== "agy")
    throw new Error("작업실 텍스트 에이전트 설정을 확인해 주세요.");
  return {
    projectId: "", requestId: randomUUID(), nodeId: null, provider: agent.provider, operation: "text", prompt: "", references: [],
    ...(agent.model ? { model: agent.model } : {}), ...(agent.effort ? { effort: agent.effort } : {}),
  };
}
