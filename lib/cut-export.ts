import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { localAssetPath, MAX_MEDIA_BYTES, storeMedia } from "./media";
import { isCutSource, type Asset, type Graph } from "./types";

const exec = promisify(execFile);
const options = { timeout: 120_000, maxBuffer: 1024 * 1024 };
export class CutExportError extends Error {}

export async function exportCuts(
  graph: Graph,
  nodeIds: string[],
): Promise<Asset> {
  if (
    !Array.isArray(nodeIds) ||
    nodeIds.length < 1 ||
    nodeIds.length > 10 ||
    nodeIds.some((id) => typeof id !== "string" || id.length > 80) ||
    new Set(nodeIds).size !== nodeIds.length
  ) {
    throw new CutExportError(
      "영상은 중복 없이 1개부터 10개까지 선택해 주세요.",
    );
  }
  const inputs = nodeIds.map((id) =>
    graph.nodes.find((node) => node.id === id),
  );
  if (inputs.some((node) => !node || !isCutSource(node))) {
    throw new CutExportError("프로젝트에 저장된 영상 노드를 선택해 주세요.");
  }

  const directory = await mkdtemp(path.join(tmpdir(), "scene-room-export-"));
  try {
    const clips: { file: string; duration: number; audio: boolean }[] = [];
    for (const node of inputs) {
      const file = localAssetPath(node!.asset!);
      const info = await stat(file);
      if (!info.isFile() || info.size <= 0 || info.size > MAX_MEDIA_BYTES)
        throw new CutExportError("영상 파일 크기를 확인해 주세요.");
      const { stdout } = await exec(
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
      );
      const probe = JSON.parse(stdout) as {
        format?: { duration?: string };
        streams?: { codec_type?: string }[];
      };
      const duration = Number(probe.format?.duration);
      if (
        !Number.isFinite(duration) ||
        duration < 0.05 ||
        !probe.streams?.some((stream) => stream.codec_type === "video")
      )
        throw new CutExportError("영상 길이 또는 형식을 확인해 주세요.");
      clips.push({
        file,
        duration,
        audio: probe.streams.some((stream) => stream.codec_type === "audio"),
      });
    }
    if (clips.reduce((sum, clip) => sum + clip.duration, 0) > 120)
      throw new CutExportError("영상의 총 길이는 2분 이하여야 합니다.");

    const segments: string[] = [];
    for (const [index, clip] of clips.entries()) {
      const output = path.join(directory, `${index}.mp4`);
      const silentInput = clip.audio
        ? []
        : [
            "-f",
            "lavfi",
            "-i",
            "anullsrc=channel_layout=stereo:sample_rate=48000",
          ];
      await exec(
        "ffmpeg",
        [
          "-v",
          "error",
          "-nostdin",
          "-protocol_whitelist",
          "file,pipe",
          "-i",
          clip.file,
          ...silentInput,
          "-map",
          "0:v:0",
          "-map",
          clip.audio ? "0:a:0" : "1:a:0",
          "-t",
          String(clip.duration),
          "-vf",
          "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-pix_fmt",
          "yuv420p",
          "-af",
          "apad",
          "-c:a",
          "aac",
          "-ar",
          "48000",
          "-ac",
          "2",
          "-movflags",
          "+faststart",
          "-y",
          output,
        ],
        options,
      );
      segments.push(output);
    }
    const list = path.join(directory, "clips.txt");
    await writeFile(
      list,
      segments
        .map((file) => `file '${file.replace(/'/g, "'\\''")}'`)
        .join("\n"),
    );
    const output = path.join(directory, "export.mp4");
    await exec(
      "ffmpeg",
      [
        "-v",
        "error",
        "-nostdin",
        "-protocol_whitelist",
        "file,pipe",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        list,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        "-y",
        output,
      ],
      options,
    );
    const size = (await stat(output)).size;
    if (size <= 0 || size > MAX_MEDIA_BYTES)
      throw new CutExportError("완성 영상은 64 MiB 이하여야 합니다.");
    return await storeMedia(await readFile(output), "Omni AI Canvas-영상.mp4");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
