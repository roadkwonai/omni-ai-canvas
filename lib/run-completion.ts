import type { RunResult } from "./types";
import { setTimeout as delay } from "node:timers/promises";
import type { RunOutcome } from "./run-outbox";

export async function completeRun(
  execute: () => Promise<RunResult>,
  persist: (result: RunResult | null, error: string | null) => Promise<void>,
  durable?: { projectId: string; runId: string; write: (record: RunOutcome) => Promise<void> },
) {
  let outcome: [result: RunResult, error: null] | [result: null, error: string];
  try {
    outcome = [await execute(), null];
  } catch (error) {
    outcome = [null, (error instanceof Error ? error.message.slice(0, 500) : "") || "작업 실행에 실패했습니다."];
  }
  const [result, error] = outcome;
  if (durable) await durable.write({ projectId: durable.projectId, runId: durable.runId, result, error });
  for (const interval of [250, 1000]) {
    try {
      await persist(result, error);
      return;
    } catch {
      await delay(interval);
    }
  }
  await persist(result, error);
}
