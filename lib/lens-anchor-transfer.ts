import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { trackLensOutline } from "./lens-projective-track";
import { fitLensVideo, lensFrameRate, lensSourceBounds, lensVideoSizes } from "./lens-source-frame";
import { isLensAnchorCheckpoints, isLensCorrections, isLensMask, isLensOutline, isLensTransitionRecipe,
  type LensAnchorCheckpoint, type LensAnchorTransfer, type LensMask, type LensPoint, type LensTransitionRecipe } from "./lens-transition-spec";
import { TIMELINE_MAX_FRAMES } from "./timeline-spec";

const exec = promisify(execFile);
const MAX_TRACKING_SAMPLES = 90;

function ellipseOutline(mask: LensMask, aspect: LensTransitionRecipe["aspect"]): LensPoint[] {
  const [width, height] = lensVideoSizes[aspect];
  const angle = (mask.angle ?? 0) * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const outline = Array.from({ length: 32 }, (_, index) => {
    const theta = index * 2 * Math.PI / 32;
    const x = Math.cos(theta) * mask.width * width / 2;
    const y = Math.sin(theta) * mask.height * height / 2;
    return {
      x: Math.max(0, Math.min(1, mask.x + mask.width / 2 + (cos * x - sin * y) / width)),
      y: Math.max(0, Math.min(1, mask.y + mask.height / 2 + (sin * x + cos * y) / height)),
    };
  });
  if (isLensOutline(outline)) return outline;
  return Array.from({ length: 32 }, (_, index) => ({
    x: mask.x + mask.width * (1 + Math.cos(index * 2 * Math.PI / 32)) / 2,
    y: mask.y + mask.height * (1 + Math.sin(index * 2 * Math.PI / 32)) / 2,
  }));
}

function outlineMask(outline: LensPoint[]): LensMask | null {
  if (!isLensOutline(outline)) return null;
  const xs = outline.map(point => point.x), ys = outline.map(point => point.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  const mask = { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y, outline };
  return isLensMask(mask) ? mask : null;
}


export async function transferLensAnchor(
  recipe: LensTransitionRecipe, nextFrame: number, signal: AbortSignal,
  draftCheckpoints: readonly LensAnchorCheckpoint[] = [],
): Promise<LensAnchorTransfer> {
  if (!isLensTransitionRecipe(recipe) || !Number.isSafeInteger(nextFrame) || nextFrame < 0 || nextFrame > TIMELINE_MAX_FRAMES)
    throw new Error("렌즈 전환의 원본 범위를 확인해 주세요.");
  signal.throwIfAborted();
  const originalOutline = recipe.mask.outline ?? ellipseOutline(recipe.mask, recipe.aspect);
  if (!isLensAnchorCheckpoints(draftCheckpoints))
    throw new Error("보정한 원본 프레임과 윤곽을 확인해 주세요.");

  const checkpoints: LensAnchorCheckpoint[] = [
    { sourceFrame: recipe.outgoing.startFrame, outline: originalOutline },
    ...recipe.corrections.map(correction => ({
      sourceFrame: recipe.outgoing.startFrame + correction.frame, outline: correction.outline,
    })),
    ...(recipe.anchorCheckpoints ?? []),
  ];
  const seed = draftCheckpoints.at(-1) ?? checkpoints.reduce((best, item) =>
    Math.abs(item.sourceFrame - nextFrame) < Math.abs(best.sourceFrame - nextFrame) ? item : best);
  const { file, lastFrame } = await lensSourceBounds(recipe.outgoing.asset, signal);
  if (nextFrame > lastFrame || seed.sourceFrame > lastFrame || draftCheckpoints.some(point => point.sourceFrame > lastFrame))
    throw new Error("선택한 프레임이 원본 영상의 끝을 벗어났습니다.");

  const dimensions = lensVideoSizes[recipe.aspect];
  const divisor = Math.max(...dimensions) / 320;
  const [width, height] = dimensions.map(value => value / divisor);
  const size = width * height;
  const direction = Math.sign(nextFrame - seed.sourceFrame);
  let currentFrame = seed.sourceFrame;
  let outline = structuredClone(seed.outline);
  let interruptedFrame: number | undefined;

  while (currentFrame !== nextFrame) {
    signal.throwIfAborted();
    const end = currentFrame + direction * Math.min(Math.abs(nextFrame - currentFrame), MAX_TRACKING_SAMPLES - 1);
    const first = Math.min(currentFrame, end), last = Math.max(currentFrame, end);
    const count = last - first + 1;
    const { stdout } = await exec("ffmpeg", ["-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe",
      "-i", file, "-map", "0:v:0", "-vf", `${lensFrameRate},select=between(n\\,${first}\\,${last}),${fitLensVideo(recipe.aspect, divisor)}`,
      "-frames:v", String(count), "-fps_mode", "passthrough", "-pix_fmt", "gray", "-f", "rawvideo", "pipe:1"],
    { encoding: "buffer", maxBuffer: size * MAX_TRACKING_SAMPLES + 1024, timeout: 120_000, signal });
    if (stdout.length !== count * size) throw new Error("선택한 프레임을 원본 영상에서 읽지 못했습니다.");
    const images = Array.from({ length: count }, (_, index) => stdout.subarray(index * size, (index + 1) * size));
    if (direction < 0) images.reverse();

    // A prefix either succeeds entirely or stops at its first untrackable frame.
    let low = 1, high = count;
    let best: ReturnType<typeof trackLensOutline> | undefined;
    while (low <= high) {
      signal.throwIfAborted();
      const length = best === undefined && high === count ? count : Math.floor((low + high) / 2);
      try {
        const tracked = trackLensOutline(images.slice(0, length), width, height, outline);
        const candidate = tracked.frames.at(-1)?.outline;
        if (!candidate || !outlineMask(candidate)) throw new Error("추적 윤곽을 확인해 주세요.");
        best = tracked;
        low = length + 1;
      } catch {
        high = length - 1;
      }
    }
    if (!best) {
      interruptedFrame = currentFrame;
      break;
    }
    outline = best.frames.at(-1)!.outline;
    if (best.frames.length !== count) {
      interruptedFrame = currentFrame + direction * best.frames.length;
      break;
    }
    currentFrame = end;
  }

  const mask = outlineMask(outline);
  if (!mask) throw new Error("렌즈 윤곽을 불러오지 못했습니다. 기존 윤곽을 확인해 주세요.");
  const correctionsByFrame = new Map<number, LensPoint[]>();
  const available = [
    ...(recipe.anchorCheckpoints ?? []),
    ...recipe.corrections.map(correction => ({
      sourceFrame: recipe.outgoing.startFrame + correction.frame, outline: correction.outline,
    })),
    ...draftCheckpoints,
  ];
  for (const checkpoint of available) {
    const frame = checkpoint.sourceFrame - nextFrame;
    if (frame > 0 && frame < Math.ceil(recipe.frames / 2) && checkpoint.outline.length === outline.length)
      correctionsByFrame.set(frame, structuredClone(checkpoint.outline));
  }
  const corrections = [...correctionsByFrame].sort(([a], [b]) => a - b)
    .map(([frame, points]) => ({ frame, outline: points }));
  if (!isLensCorrections(corrections, recipe.frames, mask)) throw new Error("보정 프레임을 확인해 주세요.");
  return { mask, corrections, ...(interruptedFrame !== undefined
    ? { needsAdjustment: true as const, interruptedFrame } : {}) };
}
