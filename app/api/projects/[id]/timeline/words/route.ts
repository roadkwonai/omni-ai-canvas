import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getProject } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { localAssetPath } from "@/lib/media";
import { wordsFromWhisper } from "@/lib/timeline-captions";
import { TIMELINE_MAX_FRAMES } from "@/lib/timeline-spec";

export const runtime = "nodejs";
const exec = promisify(execFile);
const active = new Set<string>();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const { nodeId, version, startFrame, inFrame, durationFrames } =
      await jsonObject(request);
    const frame = (value: unknown): value is number =>
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= TIMELINE_MAX_FRAMES;
    if (
      !uuid(id) ||
      typeof nodeId !== "string" ||
      !Number.isSafeInteger(version) ||
      !frame(startFrame) ||
      !frame(inFrame) ||
      !frame(durationFrames) ||
      !durationFrames ||
      startFrame + durationFrames > TIMELINE_MAX_FRAMES
    )
      return bad("음향 노드와 받아쓸 구간을 확인해 주세요.");
    const project = await getProject(id);
    if (!project) return bad("프로젝트를 찾을 수 없습니다.", 404);
    if (project.version !== version)
      return bad("변경한 프로젝트를 저장한 뒤 다시 시도해 주세요.", 409);
    const asset = project.graph.nodes.find((node) => node.id === nodeId)?.asset;
    if (asset?.type !== "audio")
      return bad("저장된 음향 파일을 선택해 주세요.");
    const model =
      process.env.WHISPER_MODEL_PATH ||
      path.join(process.cwd(), ".scene-room", "models", "ggml-base-q5_1.bin");
    if (
      !path.isAbsolute(model) ||
      !(await access(model).then(
        () => true,
        () => false,
      ))
    )
      return bad(
        "로컬 Whisper 모델을 찾지 못했습니다. WHISPER_MODEL_PATH를 설정하거나 단어 시각을 직접 입력하세요.",
        422,
      );
    if (active.has(id))
      return bad("이 프로젝트의 음향을 이미 받아쓰고 있습니다.", 409);
    active.add(id);
    let directory: string | undefined;
    try {
      directory = await mkdtemp(path.join(tmpdir(), "scene-room-word-"));
      const wav = path.join(directory, "audio.wav");
      const output = path.join(directory, "transcript");
      await exec(
        "ffmpeg",
        [
          "-v",
          "error",
          "-nostdin",
          "-protocol_whitelist",
          "file,pipe",
          "-ss",
          String(inFrame / 30),
          "-i",
          localAssetPath(asset),
          "-t",
          String(durationFrames / 30),
          "-vn",
          "-ar",
          "16000",
          "-ac",
          "1",
          "-c:a",
          "pcm_s16le",
          wav,
        ],
        { timeout: 30_000, maxBuffer: 65536, signal: request.signal },
      );
      await exec(
        "whisper-cli",
        [
          "-m",
          model,
          "-f",
          wav,
          "-l",
          "auto",
          "-sow",
          "-ojf",
          "-of",
          output,
          "-np",
        ],
        {
          cwd: directory,
          timeout: 600_000,
          maxBuffer: 1024 * 1024,
          signal: request.signal,
        },
      );
      const name = output + ".json";
      if ((await stat(name)).size > 4 * 1024 * 1024)
        return bad("받아쓴 내용이 너무 깁니다. 음향 구간을 나눠 주세요.", 422);
      const words = wordsFromWhisper(
        JSON.parse(await readFile(name, "utf8")),
        durationFrames,
        startFrame,
      );
      return Response.json(
        { words },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return bad(
        "단어 시각을 추출하지 못했습니다. 음향 파일과 로컬 Whisper 실행 상태를 확인해 주세요.",
        422,
      );
    } finally {
      active.delete(id);
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  });
}
