import { bindImageEditSource } from "@/lib/image-edit-server";
import { spawn } from "node:child_process";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { AttachmentError, bindAttachments } from "@/lib/attachment-store";
import {
  enqueueRun,
  expireRuns,
  getProject,
  getProjectRun,
  getRunStatus,
  listRecentChatRuns,
  readRunPage,
} from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { getProvider, verifyHiggsfieldVoice } from "@/lib/runner";
import { MediaInputError } from "@/lib/media-request";
import { PaidImageAccessError, requirePaidImageAccess } from "@/lib/workspace-settings-store";
import { prepareMedia } from "@/lib/provider-media";
import {
  buildRunInput,
  chatHistory,
  resolveProviderInput,
  RunInputError,
} from "@/lib/run-input";
import type { RunInput } from "@/lib/types";
import { encodeRunCursor, parseRunCursor } from "@/lib/run-cursor";
import { recoverPendingRuns } from "@/lib/run-recovery";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    if (!uuid(id)) return bad("프로젝트 주소를 확인해 주세요.", 404);
    const params = new URL(request.url).searchParams;
    const runId = params.get("runId");
    if (runId !== null) {
      if (!uuid(runId)) return bad("실행 번호를 확인해 주세요.");
      const run = await getProjectRun(id, runId);
      return run
        ? Response.json({ run }, { headers: { "Cache-Control": "private, no-store" } })
        : bad("이 프로젝트의 실행 기록을 찾을 수 없습니다.", 404);
    }
    const requestedLimit = params.get("limit") ?? "30";
    const limit = Number(requestedLimit);
    if (!/^\d{1,2}$/.test(requestedLimit) || limit < 1 || limit > 60)
      return bad("한 페이지에는 실행 이력을 1~60개 표시할 수 있습니다.");
    const encodedCursor = params.get("cursor");
    const cursor = encodedCursor === null ? null : parseRunCursor(encodedCursor, id);
    if (encodedCursor !== null && !cursor) return bad("실행 이력의 페이지 위치를 확인해 주세요.");
    const tracked = params.getAll("track");
    if (tracked.length > 100 || !tracked.every(uuid)) return bad("추적할 실행 번호를 확인해 주세요.");
    const tag = /^(?:W\/)?"([a-f0-9]{32})"$/.exec(
      request.headers.get("if-none-match") ?? "",
    )?.[1];
    let snapshot = await readRunPage(id, limit, cursor, tracked, tag);
    if (snapshot.expired) {
      await recoverPendingRuns(id).catch(() => {});
      await expireRuns(id);
      snapshot = await readRunPage(id, limit, cursor, tracked, tag);
    }
    const headers = {
      ETag: `"${snapshot.tag}"`,
      "Cache-Control": "private, no-cache",
    };
    return snapshot.runs === null
      ? new Response(null, { status: 304, headers })
      : Response.json({
        runs: snapshot.runs,
        activeRuns: snapshot.activeRuns,
        nextCursor: snapshot.next ? encodeRunCursor(snapshot.next) : null,
      }, { headers });
  });
}

async function startWorker(projectId: string) {
  // 로컬 웹 서버 재시작과 생성 작업의 수명을 분리한다.
  const child = spawn(
    process.execPath,
    [
      "--env-file-if-exists=.env",
      "--import",
      "tsx",
      path.join(process.cwd(), "scripts/worker.ts"),
      "--drain",
      projectId,
    ],
    {
      cwd: process.cwd(),
      shell: false,
      detached: true,
      stdio: "ignore",
    },
  );
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("spawn", resolve);
  });
  child.unref();
}

export async function POST(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const body = await jsonObject(request);
    if (!uuid(id) || !uuid(body.requestId))
      return bad("요청 내용과 프로젝트 주소를 확인해 주세요.");
    const project = await getProject(id);
    if (!project) return bad("프로젝트를 찾을 수 없습니다.", 404);
    let input: RunInput;
    try {
      input = buildRunInput(project, body, body.requestId);
    } catch (error) {
      if (error instanceof RunInputError)
        return bad(error.message, error.status);
      throw error;
    }
    try {
      await requirePaidImageAccess(input.provider);
      const account = await getProvider(input.provider);
      input = resolveProviderInput(input, account);
      input = await bindAttachments(id, input, body.attachmentIds);
      if (
        input.presetDesign?.mode === "analyze" &&
        (!input.attachments?.length ||
          input.attachments.some((attachment) => attachment.kind !== "video") ||
          !input.references.some((ref) => ref.asset?.type === "image"))
      )
        return bad("분석할 영상 파일과 대표 화면을 확인해 주세요.");
      try { input = await bindImageEditSource(input); } catch (error) {
        return bad(error instanceof Error ? error.message : "편집 원본을 확인해 주세요.", 422);
      }
      await prepareMedia(input);
      await verifyHiggsfieldVoice(input);
      if (input.chat) {
        const prior = await listRecentChatRuns(id, input.chat.threadId, input.requestId);
        input = {
          ...input,
          chat: { ...input.chat, history: chatHistory(prior, input) },
        };
      }
    } catch (error) {
      if (error instanceof RunInputError)
        return bad(error.message, error.status);
      if (error instanceof AttachmentError) return bad(error.message);
      if (error instanceof MediaInputError) return bad(error.message, 422);
      if (error instanceof PaidImageAccessError) return bad(error.message, 403);
      throw error;
    }
    const run = await enqueueRun(input);
    if (!isDeepStrictEqual(run.input, input))
      return bad(
        "이미 사용한 요청 번호입니다. 실행 기록을 확인해 주세요.",
        409,
      );
    if (run.status === "queued") {
      try {
        await startWorker(id);
      } catch {
        return Response.json(
          {
            run,
            warning:
              "대기열에 저장했습니다. 실행 기록에서 대기 작업을 시작해 주세요.",
          },
          { status: 202 },
        );
      }
    }
    return Response.json({ run }, { status: 202 });
  });
}

export async function PATCH(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const { runId } = await jsonObject(request);
    if (!uuid(id) || !uuid(runId))
      return bad("프로젝트와 실행 번호를 확인해 주세요.");
    const status = await getRunStatus(id, runId);
    if (!status) return bad("이 프로젝트의 실행 기록을 찾을 수 없습니다.", 404);
    if (status !== "queued")
      return bad("대기 중인 작업만 다시 시작할 수 있습니다.", 409);
    await startWorker(id);
    return new Response(null, { status: 202 });
  });
}
