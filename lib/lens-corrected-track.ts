import { trackLensOutline } from "./lens-projective-track";
import { isLensOutline, type LensPoint, type LensCorrection } from "./lens-transition-spec";

type Frame = { outline: LensPoint[]; centerX: number; centerY: number };

export function trackCorrectedLensOutline(
  grays: readonly Uint8Array[], width: number, height: number,
  outline: readonly LensPoint[], corrections: readonly LensCorrection[] = [],
): { frames: Frame[]; minimumConfidence: number } {
  if (!isLensOutline(outline) || corrections.length > grays.length - 1)
    throw new Error("렌즈 윤곽과 보정 프레임을 확인해 주세요.");
  const anchors = [...corrections].sort((a, b) => a.frame - b.frame);
  if (anchors.some((anchor, index) => !Number.isInteger(anchor.frame) || anchor.frame < 1 ||
      anchor.frame >= grays.length || (index > 0 && anchors[index - 1].frame === anchor.frame) ||
      !isLensOutline(anchor.outline) || anchor.outline.length !== outline.length))
    throw new Error("보정 프레임과 윤곽점의 순서를 확인해 주세요.");

  const frames: Frame[] = [];
  let minimumConfidence = 1;
  let start = 0;
  let current = outline;
  const endFrame = grays.length - 1;
  const segments = anchors.at(-1)?.frame === endFrame ? anchors : [...anchors, { frame: endFrame, outline: null }];
  for (const anchor of segments) {
    const end = anchor.frame;
    const target = anchor.outline;
    let segment;
    let reverse = false;
    try {
      segment = trackLensOutline(grays.slice(start, end + 1), width, height, current);
    } catch (forwardError) {
      if (!target) throw forwardError;
      try {
        const backward = trackLensOutline(grays.slice(start, end + 1).reverse(), width, height, target);
        segment = { ...backward, frames: backward.frames.reverse() };
        reverse = true;
      } catch {
        throw new Error("보정 구간의 렌즈를 양방향으로 추적하지 못했습니다. 중간 프레임을 추가로 보정해 주세요.");
      }
    }
    minimumConfidence = Math.min(minimumConfidence, segment.minimumConfidence);
    const last = segment.frames.at(-1)!;
    const first = segment.frames[0];
    for (let index = 0; index < segment.frames.length; index++) {
      if (start && index === 0) continue;
      const original = segment.frames[index];
      const progress = target && end > start ? index / (end - start) : 0;
      const smooth = progress * progress * (3 - 2 * progress);
      const points = target && index === segment.frames.length - 1 ? [...target] : original.outline.map((point, i) => {
        if (reverse) return {
          x: point.x + (current[i].x - first.outline[i].x) * (1 - smooth),
          y: point.y + (current[i].y - first.outline[i].y) * (1 - smooth),
        };
        return target
          ? { x: point.x + (target[i].x - last.outline[i].x) * smooth,
              y: point.y + (target[i].y - last.outline[i].y) * smooth }
          : { ...point };
      });
      if (!isLensOutline(points)) throw new Error("보정된 렌즈 윤곽이 겹칩니다. 수정한 점을 확인해 주세요.");
      frames.push({
        outline: points,
        centerX: points.reduce((sum, point) => sum + point.x, 0) * width / points.length,
        centerY: points.reduce((sum, point) => sum + point.y, 0) * height / points.length,
      });
    }
    start = end;
    if (target) current = target;
  }
  return { frames, minimumConfidence };
}
