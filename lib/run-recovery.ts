import { recoverRunOutcome } from "./db";
import { replayRunOutcomes } from "./run-outbox";

export async function recoverPendingRuns(projectId?: string) {
  return replayRunOutcomes(recoverRunOutcome, projectId);
}
