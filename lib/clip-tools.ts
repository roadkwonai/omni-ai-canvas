import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { localAssetPath, MAX_MEDIA_BYTES, storeMedia } from "./media";
import type { Asset, Graph, Kind } from "./types";

const exec = promisify(execFile);
const options = { timeout: 120_000, maxBuffer: 1024 * 1024 };
export class ClipToolError extends Error {}
export type ClipToolRequest = {
  nodeId: string;
  action: "inspect" | "frame" | "sheet" | "audio" | "trim";
  start?: number;
  end?: number;
  speed?: number;
  aspect?: "source" | "9:16" | "16:9";
};
export type ClipToolResult = {
  duration: number;
  hasAudio: boolean;
  asset?: Asset;
  kind?: Kind;
};

export async function runClipTool(
  graph: Graph,
  request: ClipToolRequest,
): Promise<ClipToolResult> {
  const node = graph.nodes.find((item) => item.id === request.nodeId);
  if (!node?.asset || !["audio", "video"].includes(node.asset.type))
    throw new ClipToolError("저장된 영상 또는 음향 노드를 선택해 주세요.");
  if (!["inspect", "frame", "sheet", "audio", "trim"].includes(request.action))
    throw new ClipToolError("편집 작업을 확인해 주세요.");
  const file = localAssetPath(node.asset);
  const input = await stat(file).catch(() => null);
  if (!input?.isFile() || input.size < 1 || input.size > MAX_MEDIA_BYTES)
    throw new ClipToolError("원본 파일이 없거나 크기 한도를 초과했습니다.");
  const probe = JSON.parse(
    (
      await exec(
        "ffprobe",
        [
          "-v",
          "error",
          "-protocol_whitelist",
          "file,pipe",
          "-show_entries",
          "format=duration:stream=codec_type",
          "-of",
          "json",
          file,
        ],
        options,
      )
    ).stdout,
  ) as { format?: { duration?: string }; streams?: { codec_type?: string }[] };
  const duration = Number(probe.format?.duration);
  const hasVideo = Boolean(
    probe.streams?.some((stream) => stream.codec_type === "video"),
  );
  const hasAudio = Boolean(
    probe.streams?.some((stream) => stream.codec_type === "audio"),
  );
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    (node.asset.type === "video" ? !hasVideo : !hasAudio)
  )
    throw new ClipToolError("원본 미디어 길이 또는 형식을 확인해 주세요.");
  if (request.action === "inspect") return { duration, hasAudio };
  if (["frame", "sheet", "audio"].includes(request.action) && !hasVideo)
    throw new ClipToolError("이 작업에는 영상이 필요합니다.");
  if (request.action === "audio" && !hasAudio)
    throw new ClipToolError("이 영상에는 추출할 오디오가 없습니다.");
  const start = request.start ?? 0;
  const end = request.action === "frame" ? duration : (request.end ?? duration);
  const speed = request.action === "trim" ? (request.speed ?? 1) : 1;
  const aspect =
    request.action === "trim" ? (request.aspect ?? "source") : "source";
  if (
    !Number.isFinite(start) ||
    start < 0 ||
    start >= duration ||
    !Number.isFinite(end) ||
    end <= start ||
    end > duration + 0.001
  )
    throw new ClipToolError("시작과 끝은 원본 길이 안에 있어야 합니다.");
  if (
    !Number.isFinite(speed) ||
    speed < 0.5 ||
    speed > 2 ||
    !["source", "9:16", "16:9"].includes(aspect)
  )
    throw new ClipToolError("속도와 화면 비율을 확인해 주세요.");
  const length = end - start;
  if (request.action !== "frame" && (length > 120 || length / speed > 120))
    throw new ClipToolError("선택 구간과 결과는 각각 2분 이하여야 합니다.");
  if (request.action === "sheet" && length < 0.3)
    throw new ClipToolError("콘택트 시트에는 0.3초 이상을 선택해 주세요.");
  const directory = await mkdtemp(path.join(os.tmpdir(), "scene-room-clip-"));
  try {
    const image = request.action === "frame" || request.action === "sheet";
    const audio =
      request.action === "audio" ||
      (request.action === "trim" && node.asset.type === "audio");
    const extension = image ? "png" : audio ? "wav" : "mp4";
    const output = path.join(directory, `result.${extension}`);
    const args = [
      "-v",
      "error",
      "-nostdin",
      "-protocol_whitelist",
      "file,pipe",
      "-ss",
      String(start),
      "-t",
      String(length),
      "-i",
      file,
    ];
    if (request.action === "frame")
      args.push("-map", "0:v:0", "-frames:v", "1");
    else if (request.action === "sheet")
      args.push(
        "-map",
        "0:v:0",
        "-vf",
        `fps=${9 / length},scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2,tile=3x3`,
        "-frames:v",
        "1",
      );
    else if (audio)
      args.push(
        "-map",
        "0:a:0",
        "-vn",
        "-af",
        `atempo=${speed}`,
        "-c:a",
        "pcm_s16le",
      );
    else {
      const sizing =
        aspect === "source"
          ? "scale=1280:1280:force_original_aspect_ratio=decrease:force_divisible_by=2"
          : aspect === "9:16"
            ? "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280"
            : "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720";
      args.push(
        "-map",
        "0:v:0",
        "-vf",
        `setpts=PTS/${speed},${sizing},setsar=1`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
      );
      if (hasAudio)
        args.push("-map", "0:a:0", "-af", `atempo=${speed}`, "-c:a", "aac");
      args.push("-movflags", "+faststart");
    }
    args.push("-fs", String(MAX_MEDIA_BYTES + 1), "-y", output);
    try {
      await exec("ffmpeg", args, options);
    } catch {
      throw new ClipToolError(
        "미디어 편집에 실패했습니다. 구간과 FFmpeg 설치를 확인해 주세요.",
      );
    }
    const size = (await stat(output).catch(() => null))?.size ?? 0;
    if (size < 1 || size > MAX_MEDIA_BYTES)
      throw new ClipToolError("결과 파일이 없거나 64 MiB 한도를 초과했습니다.");
    if (!image) {
      const resultProbe = JSON.parse(
        (
          await exec(
            "ffprobe",
            [
              "-v",
              "error",
              "-protocol_whitelist",
              "file,pipe",
              "-show_entries",
              "format=duration:stream=codec_type",
              "-of",
              "json",
              output,
            ],
            options,
          )
        ).stdout,
      ) as {
        format?: { duration?: string };
        streams?: { codec_type?: string }[];
      };
      const actualDuration = Number(resultProbe.format?.duration);
      const expectedDuration = length / speed;
      if (
        !resultProbe.streams?.some(
          (stream) => stream.codec_type === (audio ? "audio" : "video"),
        ) ||
        !Number.isFinite(actualDuration) ||
        Math.abs(actualDuration - expectedDuration) >
          Math.max(0.5, expectedDuration * 0.05)
      )
        throw new ClipToolError(
          "결과 길이나 형식이 올바르지 않습니다. 더 짧은 구간으로 다시 시도해 주세요.",
        );
    }
    const asset = await storeMedia(
      await readFile(output),
      `${node.title}-${request.action}.${extension}`,
      image ? "image" : audio ? "audio" : "video",
    );
    const kind: Kind =
      request.action === "frame"
        ? "keyframe"
        : request.action === "sheet"
          ? "referenceImage"
          : audio
            ? "audioCue"
            : "video";
    return { duration, hasAudio, asset, kind };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
