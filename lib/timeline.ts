import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { localAssetPath, MAX_MEDIA_BYTES, storeMedia } from "./media";
import { validateTimeline, type TimelineSpec } from "./timeline-spec";
import type { Asset, Graph } from "./types";
import { serializeTimelineWords } from "./timeline-captions";

const exec = promisify(execFile);
const options = { timeout: 600_000, maxBuffer: 1024 * 1024 };
export class TimelineError extends Error {}
const seconds = (frames: number) => String(frames / 30);

async function runMedia(program: string, args: string[], deadline: number) {
  if (Date.now() >= deadline)
    throw new TimelineError(
      "영상 합성 제한 시간 30분을 초과했습니다. 컷을 나누어 다시 시도해 주세요.",
    );
  try {
    return await exec(program, args, {
      ...options,
      timeout: Math.max(1, Math.min(options.timeout, deadline - Date.now())),
    });
  } catch (error) {
    if (error && typeof error === "object" && "killed" in error && error.killed)
      throw new TimelineError(
        "영상 처리 시간이 초과됐습니다. 컷을 나누거나 원본 길이를 줄여 다시 시도해 주세요.",
      );
    throw error;
  }
}

type Media = { file: string; duration: number; audio: boolean };
export type TimelineMode = "preview" | "final";
export function timelineWarnings(graph: Graph, spec: TimelineSpec): string[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const warnings: string[] = [];
  spec.clips.forEach((clip, index) => {
    const node = clip.nodeId ? nodes.get(clip.nodeId) : undefined;
    if (!clip.nodeId || (node && !node.asset))
      warnings.push(
        `컷 ${index + 1} ‘${node?.title || "빈 카드"}’은 슬레이트로 표시됩니다.`,
      );
  });
  spec.audio.forEach((track) => {
    const node = nodes.get(track.nodeId);
    if (node && !node.asset)
      warnings.push(`음향 ‘${node.title}’은 파일이 없어 무음으로 처리됩니다.`);
  });
  return warnings;
}

export function slateLines(title: string, body: string): string[] {
  const content = body
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [
    title.replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 40) || "빈 프리비즈 카드",
    ...Array.from({ length: 4 }, (_, index) =>
      content.slice(index * 32, index * 32 + 32),
    ).filter(Boolean),
  ];
}

async function makeSlate(
  file: string,
  width: number,
  height: number,
  title: string,
  body: string,
) {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    throw new TimelineError(
      "슬레이트를 만들려면 sharp 이미지 처리 모듈이 필요합니다. 설치 상태를 확인해 주세요.",
    );
  }
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  const lines = slateLines(title, body);
  const size = Math.round(width / 25);
  const content = lines
    .map(
      (line, index) =>
        `<text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.32 + index * size * 1.6)}" font-size="${index ? Math.round(size * 0.65) : size}" fill="${index ? "#dddde3" : "#ffffff"}">${escape(line)}</text>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#242531"/><g font-family="Pretendard, Apple SD Gothic Neo, sans-serif">${content}</g></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}
async function probe(asset: Asset, deadline: number): Promise<Media> {
  const file = localAssetPath(asset);
  let info;
  try {
    info = await stat(file);
  } catch {
    throw new TimelineError(
      "첨부된 원본 파일을 찾을 수 없습니다. 파일을 다시 첨부해 주세요.",
    );
  }
  if (!info.isFile() || info.size < 1 || info.size > MAX_MEDIA_BYTES)
    throw new TimelineError("파일이 없거나 64 MiB 한도를 초과했습니다.");
  const { stdout } = await runMedia(
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
    deadline,
  );
  const data = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: { codec_type?: string }[];
  };
  const streams = data.streams ?? [];
  if (
    !streams.some(
      (stream) =>
        stream.codec_type === (asset.type === "audio" ? "audio" : "video"),
    )
  )
    throw new TimelineError("파일 형식을 확인해 주세요.");
  const duration =
    asset.type === "image" ? Infinity : Number(data.format?.duration);
  if (!(duration > 0)) throw new TimelineError("파일 길이를 확인해 주세요.");
  return {
    file,
    duration,
    audio: streams.some((stream) => stream.codec_type === "audio"),
  };
}

export async function renderTimeline(
  graph: Graph,
  spec: TimelineSpec,
  mode: TimelineMode = "preview",
): Promise<Asset> {
  if (!validateTimeline(spec) || !spec.clips.length)
    throw new TimelineError("타임라인의 컷과 시간을 확인해 주세요.");
  if (mode !== "preview" && mode !== "final")
    throw new TimelineError("출력 방식을 확인해 주세요.");
  if (mode === "final" && timelineWarnings(graph, spec).length)
    throw new TimelineError(
      "납품본에는 빈 컷이나 파일이 없는 음향을 사용할 수 없습니다.",
    );
  const deadline = Date.now() + 1_800_000;
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const cache = new Map<string, Media>();
  async function getMedia(
    nodeId: string,
    type: "visual" | "audio",
  ): Promise<Media> {
    const node = nodes.get(nodeId);
    const asset = node?.asset;
    if (
      !asset ||
      (type === "visual"
        ? !["image", "video"].includes(asset.type)
        : asset.type !== "audio")
    )
      throw new TimelineError(
        `선택한 ${type === "audio" ? "음향" : "화면"} 파일을 확인해 주세요.`,
      );
    if (!cache.has(nodeId)) cache.set(nodeId, await probe(asset, deadline));
    return cache.get(nodeId)!;
  }
  const visual = await Promise.all(
    spec.clips.map(async (clip) => {
      if (!clip.nodeId) return null;
      const node = nodes.get(clip.nodeId);
      if (!node)
        throw new TimelineError("컷에 연결된 노드를 찾을 수 없습니다.");
      if (!node.asset && ["shot", "keyframe", "video"].includes(node.kind))
        return null;
      const media = await getMedia(clip.nodeId, "visual");
      if (node?.asset?.type === "image" && clip.inFrame)
        throw new TimelineError("이미지의 시작 프레임은 0이어야 합니다.");
      if ((clip.inFrame + clip.durationFrames) / 30 > media.duration + 1 / 30)
        throw new TimelineError("컷의 선택 구간이 원본 길이를 초과합니다.");
      return media;
    }),
  );
  const audio = await Promise.all(
    spec.audio.map(async (track) => {
      const node = nodes.get(track.nodeId);
      if (!node)
        throw new TimelineError("음향에 연결된 노드를 찾을 수 없습니다.");
      if (!node.asset && node.kind === "audioCue") return null;
      const media = await getMedia(track.nodeId, "audio");
      if ((track.inFrame + track.durationFrames) / 30 > media.duration + 1 / 30)
        throw new TimelineError("음향의 선택 구간이 원본 길이를 초과합니다.");
      return media;
    }),
  );
  const [width, height] =
    spec.aspect === "16:9"
      ? [1280, 720]
      : spec.aspect === "9:16"
        ? [720, 1280]
        : [720, 720];
  const directory = await mkdtemp(path.join(tmpdir(), "scene-room-timeline-"));
  try {
    const segments: string[] = [];
    for (const [index, clip] of spec.clips.entries()) {
      const media = visual[index];
      const asset = clip.nodeId ? nodes.get(clip.nodeId)?.asset : undefined;
      const args = ["-v", "error", "-nostdin"];
      if (!media) {
        const node = clip.nodeId ? nodes.get(clip.nodeId) : undefined;
        const slate = path.join(directory, `slate-${index}.png`);
        await makeSlate(
          slate,
          width,
          height,
          node?.title || "빈 프리비즈 카드",
          node?.body || "",
        );
        args.push(
          "-loop",
          "1",
          "-protocol_whitelist",
          "file,pipe",
          "-i",
          slate,
        );
      } else if (asset?.type === "image")
        args.push(
          "-loop",
          "1",
          "-protocol_whitelist",
          "file,pipe",
          "-i",
          media.file,
        );
      else
        args.push(
          "-protocol_whitelist",
          "file,pipe",
          "-ss",
          seconds(clip.inFrame),
          "-i",
          media.file,
        );
      if (!media?.audio || asset?.type === "image")
        args.push(
          "-f",
          "lavfi",
          "-i",
          "anullsrc=channel_layout=stereo:sample_rate=48000",
        );
      const output = path.join(directory, `${index}.mp4`);
      args.push(
        "-map",
        "0:v:0",
        "-map",
        media?.audio && asset?.type === "video" ? "0:a:0" : "1:a:0",
        "-t",
        seconds(clip.durationFrames),
        "-vf",
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`,
        "-af",
        "apad",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-b:v",
        "900k",
        "-maxrate",
        "1000k",
        "-bufsize",
        "2000k",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-y",
        output,
      );
      await runMedia("ffmpeg", args, deadline);
      segments.push(output);
    }
    const args = ["-v", "error", "-nostdin"];
    for (const segment of segments)
      args.push("-protocol_whitelist", "file,pipe", "-i", segment);
    const tracks = spec.audio.flatMap((track, index) =>
      audio[index] ? [{ track, media: audio[index]! }] : [],
    );
    for (const { media } of tracks)
      args.push("-protocol_whitelist", "file,pipe", "-i", media.file);
    const hasWords = !!spec.words?.length;
    if (hasWords) {
      const subtitles = path.join(directory, "words.srt");
      await writeFile(subtitles, serializeTimelineWords(spec.words!, "srt"), { mode: 0o600 });
      args.push("-protocol_whitelist", "file,pipe", "-i", subtitles);
    }
    const filters: string[] = [];
    segments.forEach((_, index) => {
      filters.push(`[${index}:v]settb=AVTB,setpts=PTS-STARTPTS[v${index}]`);
      filters.push(
        `[${index}:a]aresample=48000,asetpts=PTS-STARTPTS[a${index}]`,
      );
    });
    let videoLabel = "v0",
      audioLabel = "a0",
      total = spec.clips[0].durationFrames;
    for (let index = 1; index < spec.clips.length; index++) {
      const clip = spec.clips[index];
      if (clip.transition === "dissolve") {
        filters.push(
          `[${videoLabel}][v${index}]xfade=transition=fade:duration=${seconds(clip.transitionFrames)}:offset=${seconds(total - clip.transitionFrames)}[vjoin${index}]`,
        );
        filters.push(
          `[${audioLabel}][a${index}]acrossfade=d=${seconds(clip.transitionFrames)}[ajoin${index}]`,
        );
      } else {
        filters.push(
          `[${videoLabel}][${audioLabel}][v${index}][a${index}]concat=n=2:v=1:a=1[vjoin${index}][ajoin${index}]`,
        );
      }
      videoLabel = `vjoin${index}`;
      audioLabel = `ajoin${index}`;
      total += clip.durationFrames - clip.transitionFrames;
    }
    tracks.forEach(({ track }, index) => {
      const fades = [
        track.fadeInFrames
          ? `afade=t=in:st=0:d=${seconds(track.fadeInFrames)}`
          : "",
        track.fadeOutFrames
          ? `afade=t=out:st=${seconds(track.durationFrames - track.fadeOutFrames)}:d=${seconds(track.fadeOutFrames)}`
          : "",
      ].filter(Boolean);
      filters.push(
        `[${segments.length + index}:a]atrim=start=${seconds(track.inFrame)}:duration=${seconds(track.durationFrames)},asetpts=PTS-STARTPTS,aresample=48000,volume=${track.gain}${fades.map((fade) => `,${fade}`).join("")},adelay=${track.startFrame * 1600}S:all=1[track${index}]`,
      );
    });
    if (tracks.length) {
      filters.push(
        `[${audioLabel}]${tracks.map((_, index) => `[track${index}]`).join("")}amix=inputs=${tracks.length + 1}:duration=first:normalize=0,alimiter=limit=0.98[mix]`,
      );
      audioLabel = "mix";
    }
    const output = path.join(directory, "result.mp4");
    args.push(
      "-filter_complex",
      filters.join(";"),
      "-map",
      `[${videoLabel}]`,
      "-map",
      `[${audioLabel}]`,
      ...(hasWords ? ["-map", `${segments.length + tracks.length}:s:0`, "-c:s", "mov_text", "-disposition:s:0", "default"] : []),
      "-t",
      seconds(total),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-b:v",
      "900k",
      "-maxrate",
      "1000k",
      "-bufsize",
      "2000k",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      "-y",
      output,
    );
    await runMedia("ffmpeg", args, deadline);
    const info = await stat(output);
    if (info.size < 1 || info.size > MAX_MEDIA_BYTES)
      throw new TimelineError("완성 영상은 64 MiB 이하여야 합니다.");
    return await storeMedia(
      await readFile(output),
      mode === "final" ? "Omni AI Canvas-납품본.mp4" : "Omni AI Canvas-프리비즈.mp4",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
