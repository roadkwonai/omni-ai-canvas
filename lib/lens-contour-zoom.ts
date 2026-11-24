type Point = { x: number; y: number };
type Crop = { left: number; top: number; width: number; height: number };

function inside(point: Point, polygon: readonly Point[]) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
        point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

function edgeDistance(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  if (!length) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

export function contourPushIn(
  outline: readonly Point[], width: number, height: number, progress: number,
): { crop: Crop; outline: Point[] } {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 40 || height < 40 ||
      !Number.isFinite(progress) || progress < 0 || progress > 1 || outline.length < 3 ||
      outline.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1))
    throw new Error("렌즈 윤곽과 확대 구간을 확인해 주세요.");
  const pixels = outline.map(({ x, y }) => ({ x: x * width, y: y * height }));
  const center = {
    x: pixels.reduce((sum, p) => sum + p.x, 0) / pixels.length,
    y: pixels.reduce((sum, p) => sum + p.y, 0) / pixels.length,
  };
  if (!inside(center, pixels)) throw new Error("렌즈 윤곽 중앙을 확인해 주세요.");
  const clearance = Math.min(...pixels.map((p, i) => edgeDistance(center, p, pixels[(i + 1) % pixels.length])));
  const scale = clearance * 1.8 / Math.hypot(width, height);
  const targetWidth = Math.floor(width * scale);
  const targetHeight = Math.floor(height * scale);
  if (targetWidth < 20 || targetHeight < 20) throw new Error("렌즈 영역이 너무 작습니다. 영역을 다시 지정해 주세요.");
  const eased = progress * progress * (3 - 2 * progress);
  const cropWidth = Math.max(targetWidth, Math.round(width + (targetWidth - width) * eased));
  const cropHeight = Math.max(targetHeight, Math.round(height + (targetHeight - height) * eased));
  const targetLeft = Math.min(width - targetWidth, Math.max(0, center.x - targetWidth / 2));
  const targetTop = Math.min(height - targetHeight, Math.max(0, center.y - targetHeight / 2));
  const left = Math.min(width - cropWidth, Math.round(targetLeft * eased));
  const top = Math.min(height - cropHeight, Math.round(targetTop * eased));
  const crop = { left, top, width: cropWidth, height: cropHeight };
  return { crop, outline: pixels.map((p) => ({ x: (p.x - left) / cropWidth, y: (p.y - top) / cropHeight })) };
}
