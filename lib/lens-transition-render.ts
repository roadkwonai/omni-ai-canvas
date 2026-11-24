import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { trackLensAffine } from "./lens-affine-track";
import { trackCorrectedLensOutline } from "./lens-corrected-track";
import { trackLensOutline } from "./lens-projective-track";
import { contourPushIn } from "./lens-contour-zoom";
import { isLensCorrections, isLensMask, LENS_MIN_FRAMES, LENS_MAX_FRAMES, type LensCorrection, type LensMask, type LensPoint, type LensReview, type LensTracking } from "./lens-transition-spec";
import { storeMedia } from "./media";
import type { Asset } from "./types";
import { TIMELINE_MAX_FRAMES, type TimelineSpec } from "./timeline-spec";
import { fitLensVideo, lensFrameRate, lensVideoPath, lensVideoSizes } from "./lens-source-frame";

type Aspect = TimelineSpec["aspect"];
type TrackingOptions = { outgoing: Asset; aspect: Aspect; outgoingStart: number; frames: number; mask: LensMask; corrections?: LensCorrection[] };
type Options = TrackingOptions & { incoming: Asset; incomingStart: number };
const exec = promisify(execFile);
async function run(command: string, args: string[]) {
  return exec(command, args, { timeout: 180_000, maxBuffer: 1024 * 1024 });
}
export async function lensAnchorFrame(asset: Asset, aspect: Aspect, frame: number): Promise<Uint8Array> {
  if (!Number.isInteger(frame) || frame < 0 || frame > TIMELINE_MAX_FRAMES + LENS_MAX_FRAMES) throw new Error("프레임 위치를 확인해 주세요.");
  const file = await lensVideoPath(asset);
  const directory = await mkdtemp(path.join(tmpdir(), "lens-anchor-"));
  try {
    const output = path.join(directory, "frame.png");
    await run("ffmpeg", ["-v", "error", "-protocol_whitelist", "file,pipe", "-i", file, "-vf", `${fitLensVideo(aspect)},${lensFrameRate},select=eq(n\\,${frame})`, "-frames:v", "1", output]);
    return await readFile(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
function traceContour(grayscale: Uint8Array[], width: number, height: number, mask: LensMask, corrections: LensCorrection[]) {
  if (mask.outline) {
    return corrections.length ? trackCorrectedLensOutline(grayscale, width, height, mask.outline, corrections)
      : trackLensOutline(grayscale, width, height, mask.outline);
  }
  const legacy = trackLensAffine(grayscale, width, height, mask);
  const angle = (mask.angle ?? 0) * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rim = Array.from({ length: 32 }, (_, index) => {
    const angle = (index / 32) * 2 * Math.PI;
    const px = Math.cos(angle) * mask.width * width / 2;
    const py = Math.sin(angle) * mask.height * height / 2;
    return { x: cos * px - sin * py, y: sin * px + cos * py };
  });
  return {
    minimumConfidence: legacy.minimumConfidence,
    frames: legacy.frames.map((frame) => ({
      centerX: frame.centerX, centerY: frame.centerY,
      outline: rim.map(({ x, y }) => ({
        x: (frame.centerX + frame.a * x + frame.c * y) / width,
        y: (frame.centerY + frame.b * x + frame.d * y) / height,
      })),
    })),
  };
}

async function extractFrames(file: string, filter: string, start: number, count: number, directory: string, prefix: string) {
  await run("ffmpeg", ["-v", "error", "-protocol_whitelist", "file,pipe", "-i", file, "-vf", `${filter},select=between(n\\,${start}\\,${start + count - 1})`, "-frames:v", String(count), "-fps_mode", "passthrough", path.join(directory, prefix + "%03d.png")]);
  return Promise.all(Array.from({ length: count }, (_, index) => readFile(path.join(directory, prefix + String(index + 1).padStart(3, "0") + ".png")).catch(() => {
    throw new Error("선택한 구간이 원본 영상의 끝을 벗어났습니다.");
  })));
}

async function trackingFrames(images: Buffer[], width: number, height: number) {
  const factor = 320 / Math.max(width, height);
  const trackedWidth = Math.round(width * factor);
  const trackedHeight = Math.round(height * factor);
  const grayscale = await Promise.all(images.map((frame) =>
    sharp(frame).resize(trackedWidth, trackedHeight, { fit: "fill" }).grayscale().raw().toBuffer(),
  ));
  return { grayscale, trackedWidth, trackedHeight };
}

function validateTracking({ outgoingStart, frames, mask, corrections = [] }: TrackingOptions) {
  if (![outgoingStart, frames].every(Number.isInteger) || outgoingStart < 0 ||
    frames < LENS_MIN_FRAMES || frames > LENS_MAX_FRAMES || !isLensMask(mask) || !isLensCorrections(corrections, frames, mask))
    throw new Error("렌즈 영역과 전환 길이 및 보정 프레임을 확인해 주세요.");
}

export async function reviewLensTransition(options: TrackingOptions): Promise<LensReview> {
  validateTracking(options);
  const { outgoing, aspect, outgoingStart, frames, mask, corrections = [] } = options;
  const file = await lensVideoPath(outgoing);
  const filter = `${fitLensVideo(aspect)},${lensFrameRate}`;
  const [width, height] = lensVideoSizes[aspect];
  const directory = await mkdtemp(path.join(tmpdir(), "lens-review-"));
  try {
    const images = await extractFrames(file, filter, outgoingStart, Math.ceil(frames / 2), directory, "review");
    const { grayscale, trackedWidth, trackedHeight } = await trackingFrames(images, width, height);
    const trace = (length: number) => traceContour(grayscale.slice(0, length), trackedWidth, trackedHeight, mask,
      corrections.filter(({ frame }) => frame < length));
    let tracked: ReturnType<typeof traceContour> | undefined;
    try {
      tracked = trace(images.length);
    } catch (error) {
      if (!mask.outline) throw error;
      let low = 1, high = images.length - 1;
      while (low <= high) {
        const length = Math.floor((low + high) / 2);
        try {
          tracked = trace(length);
          low = length + 1;
        } catch {
          high = length - 1;
        }
      }
    }
    const prefix = tracked?.frames ?? [];
    const fallback = prefix.at(-1)?.outline ?? mask.outline!;
    const reviewFrames = await Promise.all(images.map(async (frame, index) => {
      const jpeg = await sharp(frame).resize(640, 640, { fit: "inside" }).jpeg({ quality: 82 }).toBuffer();
      const needsCorrection = index > 0 && index >= prefix.length;
      return {
        frame: index, sourceFrame: outgoingStart + index,
        outline: prefix[index]?.outline ?? corrections.find((item) => item.frame === index)?.outline ?? fallback,
        image: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
        ...(needsCorrection ? { needsCorrection: true } : {}),
      };
    }));
    return { frames: reviewFrames, minimumConfidence: tracked?.minimumConfidence ?? 0 };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function lensContourAlpha(outline: readonly LensPoint[], width: number, height: number, opacity: number) {
  const points = outline.map(({ x, y }) => `${x * width},${y * height}`).join(" ");
  const polygon = `<polygon points="${points}"/>`;
  const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="rim">${polygon}</clipPath><filter id="feather" filterUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}"><feGaussianBlur stdDeviation="1.5"/></filter></defs><g clip-path="url(#rim)" fill="white" opacity="${opacity}"><g filter="url(#feather)">${polygon}</g></g></svg>`);
  return sharp(svg).extractChannel("alpha").raw().toBuffer();
}

export async function renderLensTransition(options: Options): Promise<{asset: Asset; tracking: LensTracking}> {
  validateTracking(options);
  const { outgoing, incoming, aspect, outgoingStart, incomingStart, frames, mask, corrections = [] } = options;
  if (!Number.isInteger(incomingStart) || incomingStart < 0) throw new Error("뒤 영상 시작 위치를 확인해 주세요.");
  const [a, b] = await Promise.all([lensVideoPath(outgoing), lensVideoPath(incoming)]);
  const [width, height] = lensVideoSizes[aspect] ?? [];
  const filter = `${fitLensVideo(aspect)},${lensFrameRate}`;
  const directory = await mkdtemp(path.join(tmpdir(), "lens-transition-"));
  const half = Math.ceil(frames / 2), rest = frames - half;
  try {
    const [aa, bb] = await Promise.all([
      extractFrames(a, filter, outgoingStart, half, directory, "a"),
      extractFrames(b, filter, incomingStart, rest, directory, "b"),
    ]);
    const { grayscale, trackedWidth, trackedHeight } = await trackingFrames(aa, width, height);
    const tracked = traceContour(grayscale, trackedWidth, trackedHeight, mask, corrections);
    const last = tracked.frames[half - 1];
    const pushFrames = Math.max(1, frames - 3 - half);
    for (let i = 0; i < frames; i++) {
      const first = aa[Math.min(i, half - 1)];
      const nextIndex = Math.floor((rest - 1) * (i / (frames - 1)) ** 2);
      const second = bb[nextIndex];
      let png: Buffer;
      if (i === 0) png = first;
      else if (i >= frames - 3) png = second;
      else {
        const frame = tracked.frames[Math.min(i, half - 1)];
        const progress = Math.min(1, Math.max(0, (i - half + 1) / pushFrames));
        const { crop, outline } = progress === 0
          ? { crop: { left: 0, top: 0, width, height }, outline: frame.outline }
          : contourPushIn(frame.outline, width, height, progress);
        const opacity = Math.min(1, i / 5) * (0.91 + 0.09 * progress);
        const alpha = await lensContourAlpha(outline, width, height, opacity);
        const outgoingImage = sharp(first);
        if (progress > 0) outgoingImage.extract(crop).resize(width, height, { fit: "fill" });
        const [base, overlay] = await Promise.all([outgoingImage.removeAlpha().raw().toBuffer(), sharp(second).removeAlpha().raw().toBuffer()]);
        for (let p = 0; p < alpha.length; p++) {
          if (!alpha[p]) continue;
          const q = alpha[p] / 255;
          for (let c = 0; c < 3; c++) base[p * 3 + c] = Math.round(base[p * 3 + c] * (1 - q) + overlay[p * 3 + c] * q);
        }
        png = await sharp(base, { raw: { width, height, channels: 3 } }).png().toBuffer();
      }
      await writeFile(path.join(directory, `o${String(i + 1).padStart(3, "0")}.png`), png);
    }
    const output = path.join(directory, "transition.mp4");
    async function hasAudio(file: string) {
      const result = await run("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-select_streams", "a:0", "-show_entries", "stream=codec_type", "-of", "csv=p=0", file]);
      return result.stdout.trim() === "audio";
    }
    const [audioA, audioB] = await Promise.all([hasAudio(a), hasAudio(b)]);
    const durationA = half / 30;
    const durationB = rest / 30;
    const audioInputs = (audioA ? ["-ss", String(outgoingStart / 30), "-i", a] : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"])
      .concat(audioB ? ["-ss", String(incomingStart / 30), "-i", b] : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]);
    const audioFilter = `[1:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${durationA},asetpts=PTS-STARTPTS,afade=t=out:st=${Math.max(0, durationA - 0.04)}:d=0.04[a];[2:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${durationB},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.04[b];[a][b]concat=n=2:v=0:a=1[sound]`;
    await run("ffmpeg", ["-v", "error", "-framerate", "30", "-i", path.join(directory, "o%03d.png"), ...audioInputs,
      "-filter_complex", audioFilter, "-map", "0:v:0", "-map", "[sound]", "-frames:v", String(frames),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-t", String(frames / 30), "-movflags", "+faststart", output]);
    return {
      asset: await storeMedia(await readFile(output), "렌즈 전환.mp4", "video"),
      tracking: {
        minimumConfidence: tracked.minimumConfidence, trackedFrames: half,
        finalCenter: { x: last.centerX / trackedWidth, y: last.centerY / trackedHeight },
        finalOutline: last.outline,
      },
    };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
