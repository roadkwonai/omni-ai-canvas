import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  lstat,
  mkdir,
  readdir,
  rename,
  copyFile,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { localAssetPath, MAX_MEDIA_BYTES, storeMedia } from "./media";
import {
  parseMotionShort,
  type MotionShortScene,
  type MotionShortSpec,
} from "./motion-short-spec";
import type { Asset } from "./types";

const exec = promisify(execFile);
const options = { timeout: 180_000, maxBuffer: 1024 * 1024 };
export class MotionShortError extends Error {}

function escapeXml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}
function wrapText(value: string, width: number) {
  return value.split(/\r?\n/).flatMap((paragraph) => {
    const characters = Array.from(paragraph);
    const lines: string[] = [];
    while (characters.length) lines.push(characters.splice(0, width).join(""));
    return lines.length ? lines : [""];
  });
}
function createLayers(
  spec: MotionShortSpec,
  scene: MotionShortScene,
  index: number,
  width: number,
  height: number,
  progress = 1,
) {
  const accent = spec.accent ?? "#ff6600";
  const recipe = scene.recipe ?? "type";
  const center = spec.layout === "center";
  const x =
    recipe === "character"
      ? width * 0.73
      : center
        ? width / 2
        : Math.round(width * 0.09);
  const anchor = recipe === "character" || center ? "middle" : "start";
  const lines = wrapText(
    scene.text,
    recipe === "character"
      ? spec.aspect === "9:16"
        ? 7
        : 12
      : spec.aspect === "9:16"
        ? 14
        : 24,
  );
  const fontSize = Math.min(
    recipe === "character" ? 32 : spec.aspect === "9:16" ? 56 : 64,
    Math.floor((height * 0.36) / Math.max(lines.length, 1) / 1.3),
  );
  const lineHeight = fontSize * 1.3;
  const firstY =
    recipe === "character"
      ? height * 0.22
      : recipe === "number" || recipe === "steps" || recipe === "cards"
        ? height * 0.23
        : height * 0.46 - ((lines.length - 1) * lineHeight) / 2;
  const textLines = lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${firstY + i * lineHeight}" text-anchor="${anchor}" dominant-baseline="middle">${escapeXml(line)}</text>`,
    )
    .join("");
  const detailLines = wrapText(
    scene.detail ?? "",
    spec.aspect === "9:16" ? 23 : 38,
  );
  const detail =
    scene.detail && recipe !== "steps"
      ? detailLines
          .map(
            (line, i) =>
              `<text x="${x}" y="${height * 0.79 + i * 30}" text-anchor="${anchor}" font-size="26" opacity=".86">${escapeXml(line)}</text>`,
          )
          .join("")
      : "";
  const frame = (contents: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${contents}</svg>`;
  const text = frame(
    `<g fill="${spec.foreground}" font-family="Pretendard, Apple SD Gothic Neo, Noto Sans CJK KR, sans-serif" font-size="${fontSize}" font-weight="700">${textLines}${detail}</g>`,
  );
  let graphic = "";
  if (recipe === "number") {
    const target = scene.value ?? 70;
    const eased =
      spec.easing === "snappy"
        ? 1 - (1 - progress) ** 3
        : progress * progress * (3 - 2 * progress);
    const value = Math.round(target * eased);
    const barX = width * 0.12,
      barWidth = width * 0.76,
      barY = height * 0.65;
    graphic = `<text x="${width / 2}" y="${height * 0.52}" text-anchor="middle" fill="${accent}" font-family="Pretendard, sans-serif" font-size="${Math.round(Math.min(width, height) * 0.19)}" font-weight="800">${value}%</text><rect x="${barX}" y="${barY}" width="${barWidth}" height="20" rx="10" fill="${spec.foreground}" opacity=".2"/><rect x="${barX}" y="${barY}" width="${(barWidth * value) / 100}" height="20" rx="10" fill="${accent}"/>`;
  } else if (recipe === "steps") {
    const labels = (scene.detail || "준비 / 실행 / 완성")
      .split(/\s*\/\s*/)
      .filter(Boolean)
      .slice(0, 3);
    graphic = labels
      .map((label, i) => {
        const cy = height * 0.38 + i * height * 0.11;
        if (progress < (i + 1) / (labels.length + 1)) return "";
        return `<circle cx="${width * 0.19}" cy="${cy}" r="25" fill="${accent}"/><text x="${width * 0.19}" y="${cy + 7}" text-anchor="middle" fill="${spec.background}" font-family="sans-serif" font-size="20" font-weight="700">${i + 1}</text><text x="${width * 0.27}" y="${cy + 8}" fill="${spec.foreground}" font-family="Pretendard, sans-serif" font-size="25">${escapeXml(label.slice(0, 22))}</text>`;
      })
      .join("");
  } else if (recipe === "cards") {
    graphic = `<rect x="${width * 0.14}" y="${height * 0.34}" width="${width * 0.65}" height="${height * 0.27}" rx="26" fill="${accent}" opacity=".25" transform="rotate(-5 ${width * 0.46} ${height * 0.48})"/><rect x="${width * 0.2}" y="${height * 0.38}" width="${width * 0.65}" height="${height * 0.27}" rx="26" fill="${accent}" opacity=".8"/><circle cx="${width * 0.32}" cy="${height * 0.48}" r="${Math.min(width, height) * 0.045}" fill="${spec.foreground}"/><rect x="${width * 0.4}" y="${height * 0.465}" width="${width * 0.3}" height="12" rx="6" fill="${spec.foreground}" opacity=".8"/><rect x="${width * 0.3}" y="${height * 0.57}" width="${width * 0.4}" height="8" rx="4" fill="${spec.foreground}" opacity=".55"/>`;
  } else if (recipe === "parallax") {
    graphic = `<rect x="${width * 0.08}" y="${height * 0.12}" width="${width * 0.84}" height="${height * 0.76}" rx="32" fill="none" stroke="${accent}" stroke-width="5" opacity=".85"/><circle cx="${width * 0.8}" cy="${height * 0.19}" r="15" fill="${accent}"/>`;
  } else if (recipe === "character") {
    graphic = `<rect x="${width * 0.49}" y="${height * 0.1}" width="${width * 0.46}" height="${height * 0.3}" rx="24" fill="${spec.background}" fill-opacity=".8" stroke="${accent}" stroke-width="4"/><path d="M ${width * 0.55} ${height * 0.4} l -18 28 l 44 -28" fill="${accent}"/>`;
  } else {
    graphic = `<rect x="${center ? width * 0.37 : width * 0.09}" y="${height * 0.62}" width="${width * 0.26}" height="7" rx="3.5" fill="${accent}"/><circle cx="${center ? width * 0.34 : width * 0.06}" cy="${height * 0.625}" r="6" fill="${accent}"/>`;
  }
  if (recipe !== "type")
    graphic += `<text x="${width * 0.08}" y="${height * 0.1}" fill="${spec.foreground}" font-family="sans-serif" font-size="18" opacity=".65">${String(index + 1).padStart(2, "0")}</text>`;
  return { text, graphic: frame(graphic) };
}

async function sceneImages(
  directory: string,
  spec: MotionShortSpec,
  scene: MotionShortScene,
  index: number,
  width: number,
  height: number,
) {
  const background = path.join(directory, `bg-${index}.png`);
  const dynamic = scene.recipe === "number" || scene.recipe === "steps";
  const graphic = path.join(
    directory,
    dynamic ? `graphic-${index}-%d.png` : `graphic-${index}.png`,
  );
  const text = path.join(directory, `text-${index}.png`);
  const character = path.join(directory, `character-${index}.png`);
  if (scene.image) {
    const file = localAssetPath(scene.image);
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_MEDIA_BYTES)
      throw new MotionShortError("장면 이미지를 찾지 못했습니다.");
    await sharp(file, { limitInputPixels: 80_000_000 })
      .resize(width, height, { fit: "cover" })
      .composite([
        {
          input: Buffer.from(
            `<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#000000" opacity=".48"/></svg>`,
          ),
        },
      ])
      .png()
      .toFile(background);
  } else {
    await sharp({
      create: { width, height, channels: 4, background: spec.background },
    })
      .png()
      .toFile(background);
  }
  const layers = createLayers(spec, scene, index, width, height);
  if (dynamic) {
    for (let frame = 0; frame <= 10; frame++) {
      const image = createLayers(spec, scene, index, width, height, frame / 10);
      await sharp(Buffer.from(image.graphic))
        .png()
        .toFile(graphic.replace("%d", String(frame)));
    }
  } else {
    await sharp(Buffer.from(layers.graphic)).png().toFile(graphic);
  }
  await sharp(Buffer.from(layers.text)).png().toFile(text);
  if (scene.character) {
    const file = localAssetPath(scene.character);
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_MEDIA_BYTES)
      throw new MotionShortError("캐릭터 이미지를 찾지 못했습니다.");
    await sharp(file, { limitInputPixels: 80_000_000 })
      .resize(Math.round(width * 0.42), Math.round(height * 0.74), {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(character);
  }
  return {
    background,
    graphic,
    text,
    dynamic,
    character: scene.character ? character : undefined,
  };
}

export async function renderMotionShort(
  input: MotionShortSpec,
  cache?: { projectId: string; report: (result: { reused: number[]; rendered: number[] }) => void },
): Promise<Asset> {
  const spec = parseMotionShort(input);
  if (!spec)
    throw new MotionShortError("장면과 색상, 영상 설정을 확인해 주세요.");
  const width = spec.aspect === "9:16" ? 720 : 1280;
  const height = spec.aspect === "9:16" ? 1280 : 720;
  const directory = await mkdtemp(path.join(tmpdir(), "scene-room-motion-"));
  try {
    const segments: string[] = [];
    const reused: number[] = [], rendered: number[] = [];
    const cacheDir = cache && /^[0-9a-f-]{36}$/i.test(cache.projectId)
      ? path.join(process.cwd(), ".scene-room", "motion-cache", cache.projectId) : undefined;
    if (cacheDir) await mkdir(cacheDir, { recursive: true, mode: 0o700 });
    for (const [index, scene] of spec.scenes.entries()) {
      let cachePath: string | undefined;
      if (cacheDir) {
        const imageHashes = await Promise.all([scene.image, scene.character].map(async (asset) => {
          if (!asset) return null;
          const filename = localAssetPath(asset);
          const info = await lstat(filename);
          if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_MEDIA_BYTES) throw new MotionShortError("장면 이미지를 찾지 못했습니다.");
          return createHash("sha256").update(await readFile(filename)).digest("hex");
        }));
        const style = { aspect: spec.aspect, background: spec.background, foreground: spec.foreground, layout: spec.layout, motion: spec.motion, accent: spec.accent, easing: spec.easing };
        const key = createHash("sha256").update(JSON.stringify({ version: 1, style, scene, index, imageHashes })).digest("hex");
        cachePath = path.join(cacheDir, key + ".mp4");
        const info = await lstat(cachePath).catch(() => null);
        if (info?.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= MAX_MEDIA_BYTES) {
          try {
            const { stdout } = await exec("ffprobe", [
              "-v", "error", "-protocol_whitelist", "file,pipe",
              "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height:format=duration",
              "-of", "json", cachePath,
            ], { timeout: 10000, maxBuffer: 65536 });
            const metadata = JSON.parse(stdout) as {
              streams?: { codec_name?: string; width?: number; height?: number }[];
              format?: { duration?: string };
            };
            const video = metadata.streams?.[0];
            if (video?.codec_name === "h264" && video.width === width && video.height === height &&
                Math.abs(Number(metadata.format?.duration) - scene.seconds) <= 0.15) {
              segments.push(cachePath); reused.push(index + 1); continue;
            }
          } catch {
            // 재생할 수 없는 캐시는 아래에서 새 장면으로 교체한다.
          }
        }
      }
      const { background, graphic, text, dynamic, character } =
        await sceneImages(directory, spec, scene, index, width, height);
      const output = path.join(directory, `${index}.mp4`);
      const fade = spec.easing === "snappy" ? 0.18 : 0.45;
      const backgroundMotion =
        spec.motion === "zoom" ||
        scene.recipe === "parallax" ||
        (scene.recipe === "character" && scene.image)
          ? `zoompan=z='min(1.08,1+on*0.00025)':d=1:s=${width}x${height}:fps=30`
          : "fps=30";
      const entry =
        spec.motion === "rise" ||
        scene.recipe === "steps" ||
        scene.recipe === "cards"
          ? `if(lt(t,${fade}),${Math.round(height * 0.08)}*pow(1-t/${fade},2),0)`
          : "0";
      // FFmpeg 9.1부터 fade는 프레임 크기가 바뀌면 실패하므로, 크기를 바꾸는 scale은 overlay 바로 앞에 둔다.
      const characterLayer = character
        ? `[3:v]format=rgba,fade=t=in:st=0.08:d=${fade}:alpha=1,scale=w='iw*(1+0.012*sin(t*2))':h='ih*(1+0.012*sin(t*2))':eval=frame[actor];[tmp][actor]overlay=x='${Math.round(width * 0.04)}+4*sin(t*1.5)':y='${Math.round(height * 0.19)}+5*sin(t*2)':shortest=1[withactor];`
        : "";
      const filter = `[0:v]${backgroundMotion}[bg];[1:v]${dynamic ? `tpad=stop_mode=clone:stop_duration=${scene.seconds},` : ""}format=rgba,fade=t=in:st=0:d=${fade}:alpha=1[graphic];[2:v]format=rgba,fade=t=in:st=0.12:d=${fade}:alpha=1[text];[bg][graphic]overlay=x=0:y='${entry}':shortest=1[tmp];${characterLayer}[${character ? "withactor" : "tmp"}][text]overlay=x=0:y=0:shortest=1,fade=t=in:st=0:d=0.15,fade=t=out:st=${Math.max(0, scene.seconds - 0.2)}:d=0.2,format=yuv420p[out]`;
      await exec(
        "ffmpeg",
        [
          "-v",
          "error",
          "-nostdin",
          "-loop",
          "1",
          "-framerate",
          "30",
          "-i",
          background,
          ...(dynamic
            ? ["-framerate", "10", "-start_number", "0", "-i", graphic]
            : ["-loop", "1", "-framerate", "30", "-i", graphic]),
          "-loop",
          "1",
          "-framerate",
          "30",
          "-i",
          text,
          ...(character
            ? ["-loop", "1", "-framerate", "30", "-i", character]
            : []),
          "-filter_complex",
          filter,
          "-map",
          "[out]",
          "-t",
          String(scene.seconds),
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "25",
          "-threads",
          "2",
          "-fs",
          String(MAX_MEDIA_BYTES + 1),
          "-y",
          output,
        ],
        options,
      );
      rendered.push(index + 1);
      if (cachePath && cacheDir) {
        const names = await readdir(cacheDir);
        const entries = await Promise.all(names.filter((name) => /^[0-9a-f]{64}\.mp4$/.test(name)).map((name) => stat(path.join(cacheDir, name)).catch(() => null)));
        const total = entries.reduce((sum, entry) => sum + (entry?.size ?? 0), 0);
        const size = (await stat(output)).size;
        if (total + size <= 512 * 1024 * 1024) {
          const staged = path.join(cacheDir, crypto.randomUUID() + ".tmp");
          try { await copyFile(output, staged); await rename(staged, cachePath); }
          finally { await rm(staged, { force: true }); }
        }
      }
      segments.push(output);
    }
    const list = path.join(directory, "segments.txt");
    await writeFile(
      list,
      segments
        .map((file) => `file '${file.replace(/'/g, "'\\''")}'`)
        .join("\n"),
    );
    const output = path.join(directory, "motion-short.mp4");
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
        "-fs",
        String(MAX_MEDIA_BYTES + 1),
        "-y",
        output,
      ],
      options,
    );
    const size = (await stat(output)).size;
    if (size < 1 || size > MAX_MEDIA_BYTES)
      throw new MotionShortError("결과 영상이 64 MiB 한도를 초과했습니다.");
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
        output,
      ],
      options,
    );
    const probe = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: { codec_type?: string }[];
    };
    const actualDuration = Number(probe.format?.duration);
    const expectedDuration = spec.scenes.reduce(
      (total, scene) => total + scene.seconds,
      0,
    );
    if (
      !probe.streams?.some((stream) => stream.codec_type === "video") ||
      !Number.isFinite(actualDuration) ||
      Math.abs(actualDuration - expectedDuration) > 0.4
    )
      throw new MotionShortError(
        "결과 영상의 길이 또는 형식이 올바르지 않습니다.",
      );
    const result = await storeMedia(await readFile(output), "모션그래픽.mp4", "video");
    cache?.report({ reused, rendered });
    return result;
  } catch (error) {
    if (error instanceof MotionShortError) throw error;
    throw new MotionShortError(
      "모션 영상을 만들지 못했습니다. FFmpeg와 이미지 파일 상태를 확인해 주세요.",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
