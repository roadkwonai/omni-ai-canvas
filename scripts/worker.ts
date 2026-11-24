import {
  claimRun,
  expireRuns,
  recordExternalId,
  touchRunningRun,
} from "../lib/db";
import { execute } from "../lib/runner";
import { writeRunOutcome } from "../lib/run-outbox";
import { recoverPendingRuns } from "../lib/run-recovery";
import { completeRun } from "../lib/run-completion";

let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

async function main() {
  let lastExpiry = 0;
  const drain = process.argv[2] === "--drain";
  const projectId = drain ? process.argv[3] : undefined;
  if (drain && !projectId) throw new Error("프로젝트 ID가 필요합니다.");
  while (!stopping) {
    try {
      await recoverPendingRuns(projectId);
      if (Date.now() - lastExpiry > 60_000) {
        await expireRuns(projectId);
        lastExpiry = Date.now();
      }
      const run = await claimRun(projectId);
      if (!run) {
        if (drain) break;
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        continue;
      }
      let heartbeatBusy = false;
      const heartbeat = setInterval(() => {
        if (heartbeatBusy) return;
        heartbeatBusy = true;
        void touchRunningRun(run.id)
          .catch(() =>
            console.error("실행 중인 작업의 생존 신호를 기록하지 못했습니다."),
          )
          .finally(() => {
            heartbeatBusy = false;
          });
      }, 60_000);
      try {
        await completeRun(
          () => execute(run.input, (id) => recordExternalId(run.id, id)),
          async () => { await recoverPendingRuns(run.input.projectId); },
          { projectId: run.input.projectId, runId: run.id, write: writeRunOutcome },
        );
      } finally {
        clearInterval(heartbeat);
      }
    } catch {
      if (drain)
        throw new Error("실행기에서 데이터베이스에 연결하지 못했습니다.");
      console.error(
        "실행기에서 데이터베이스 연결을 확인하지 못했습니다. 잠시 후 다시 확인합니다.",
      );
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
}

main().catch(() => {
  process.exitCode = 1;
});
