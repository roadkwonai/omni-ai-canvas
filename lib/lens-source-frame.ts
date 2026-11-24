import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import { localAssetPath, MAX_MEDIA_BYTES } from "./media";
import { TIMELINE_MAX_FRAMES, type TimelineSpec } from "./timeline-spec";
import type { Asset } from "./types";

type Aspect = TimelineSpec["aspect"];
const exec = promisify(execFile);
export const lensVideoSizes: Record<Aspect, [number, number]> = { "16:9": [1280, 720], "9:16": [720, 1280], "1:1": [720, 720] };
export async function lensVideoPath(asset: Asset) {
  if (asset.type !== "video") throw new Error("영상 테이크를 선택해 주세요.");
  const file = localAssetPath(asset);
  const info = await stat(file).catch(() => null);
  if (!info?.isFile() || info.size < 1 || info.size > MAX_MEDIA_BYTES) throw new Error("영상 파일과 용량을 확인해 주세요.");
  return file;
}
export function fitLensVideo(aspect: Aspect, divisor = 1) {
  const [w, h] = lensVideoSizes[aspect] ?? [];
  if (!w || !h) throw new Error("화면 비율을 확인해 주세요.");
  const width = w / divisor, height = h / divisor;
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
}

export const lensFrameRate = "fps=30";
const previewProcess = { timeout: 20_000, maxBuffer: 1024 * 1024 };

export async function lensSourceBounds(asset: Asset, signal: AbortSignal) {
  const file = await lensVideoPath(asset);
  const options = { ...previewProcess, signal };
  const { stdout } = await exec("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe",
    "-select_streams", "v:0", "-show_entries", "stream=start_time,duration:format=start_time,duration", "-of", "json", file], options);
  const { streams, format } = JSON.parse(stdout) as {
    streams?: { start_time?: string; duration?: string }[];
    format?: { start_time?: string; duration?: string };
  };
  const video = streams?.[0];
  const videoDuration = Number(video?.duration);
  const start = Number(format?.start_time) || 0;
  let duration = Number.isFinite(videoDuration)
    ? videoDuration + (Number(video?.start_time) || 0) - start
    : Number(format?.duration);
  if (!video || !Number.isFinite(duration) || duration <= 0) throw new Error("원본 영상의 길이를 확인해 주세요.");
  const tailStart = Number.isFinite(videoDuration) ? Math.max(0, duration - 2) : 0;
  const { stdout: packets } = await exec("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe",
    "-read_intervals", `${tailStart}%`, "-select_streams", "v:0", "-show_entries", "packet=pts_time,duration_time",
    "-of", "csv=p=0", file], options);
  let packetEnd = 0;
  for (const line of packets.trim().split("\n")) {
    const [time, length] = line.split(",").map(Number);
    if (Number.isFinite(time) && length > 0) packetEnd = Math.max(packetEnd, time + length - start);
  }
  if (packetEnd > 0) duration = packetEnd;
  return { file, lastFrame: Math.max(0, Math.round(duration * 30) - 1) };
}

export async function previewLensSourceFrame(asset: Asset, aspect: Aspect, requestedFrame: number, signal: AbortSignal) {
  const source = await lensSourceBounds(asset, signal);
  const lastFrame = Math.min(TIMELINE_MAX_FRAMES, source.lastFrame);
  const frame = Math.min(lastFrame, requestedFrame);
  const { stdout: image } = await exec("ffmpeg", ["-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe",
    "-i", source.file, "-map", "0:v:0", "-vf", `${lensFrameRate},select=eq(n\\,${frame}),${fitLensVideo(aspect, 2)}`,
    "-frames:v", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "-q:v", "3", "pipe:1"], { ...previewProcess, signal, encoding: "buffer" });
  if (!image.length) throw new Error("선택한 프레임의 영상이 없습니다. 앞쪽 프레임을 선택해 주세요.");
  return { image, frame, lastFrame };
}

