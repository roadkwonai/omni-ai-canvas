type Point = { x: number; y: number };
type Match = { from: Point; to: Point; score: number };
type Frame = { outline: Point[]; centerX: number; centerY: number };

function project(h: number[], p: Point): Point {
  const denominator = h[6] * p.x + h[7] * p.y + 1;
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / denominator,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / denominator };
}

function solve(matches: Match[]): number[] | null {
  const rows = Array.from({ length: 8 }, () => Array<number>(9).fill(0));
  for (const { from: { x, y }, to } of matches) {
    const equations = [
      { row: [x, y, 1, 0, 0, 0, -to.x * x, -to.x * y], value: to.x },
      { row: [0, 0, 0, x, y, 1, -to.y * x, -to.y * y], value: to.y },
    ];
    for (const { row, value } of equations) for (let i = 0; i < 8; i++) {
      rows[i][8] += row[i] * value;
      for (let j = 0; j < 8; j++) rows[i][j] += row[i] * row[j];
    }
  }
  // Prefer a stable planar estimate when limited rim features do not constrain perspective.
  const regularization = matches.length * 0.00008;
  rows[6][6] += regularization;
  rows[7][7] += regularization;
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let i = col + 1; i < 8; i++) if (Math.abs(rows[i][col]) > Math.abs(rows[pivot][col])) pivot = i;
    if (Math.abs(rows[pivot][col]) < 1e-10) return null;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const divisor = rows[col][col];
    for (let j = col; j <= 8; j++) rows[col][j] /= divisor;
    for (let i = 0; i < 8; i++) if (i !== col) {
      const factor = rows[i][col];
      for (let j = col; j <= 8; j++) rows[i][j] -= factor * rows[col][j];
    }
  }
  return rows.map(row => row[8]);
}

export function trackLensOutline(grays: readonly Uint8Array[], width: number, height: number,
  outline: readonly Point[]): { frames: Frame[]; minimumConfidence: number } {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 20 || height < 20 ||
      !grays.length || grays.some(frame => frame.length !== width * height) ||
      outline.length < 4 || outline.length > 80 ||
      outline.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1))
    throw new Error("렌즈 윤곽과 추적 영상을 확인해 주세요.");
  const minX = Math.max(4, Math.floor(Math.min(...outline.map(p => p.x)) * width) - 4);
  const maxX = Math.min(width - 5, Math.ceil(Math.max(...outline.map(p => p.x)) * width) + 4);
  const minY = Math.max(4, Math.floor(Math.min(...outline.map(p => p.y)) * height) - 4);
  const maxY = Math.min(height - 5, Math.ceil(Math.max(...outline.map(p => p.y)) * height) + 4);
  const center = { x: outline.reduce((sum, p) => sum + p.x, 0) / outline.length,
    y: outline.reduce((sum, p) => sum + p.y, 0) / outline.length };
  const chosen: Point[] = [];
  for (let y = minY; y <= maxY; y += 3) for (let x = minX; x <= maxX; x += 3) {
    const nearRim = outline.some((point, index) => {
      const next = outline[(index + 1) % outline.length];
      const ax = point.x * width, ay = point.y * height;
      const dx = (next.x - point.x) * width, dy = (next.y - point.y) * height;
      const fraction = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(x - ax - fraction * dx, y - ay - fraction * dy) <= 6;
    });
    if (!nearRim) continue;
    let sum = 0, squared = 0;
    for (let yy = -2; yy <= 2; yy++) for (let xx = -2; xx <= 2; xx++) {
      const v = grays[0][(y + yy) * width + x + xx]; sum += v; squared += v * v;
    }
    if (squared / 25 - (sum / 25) ** 2 > 100) chosen.push({ x, y });
  }
  if (chosen.length < 8) throw new Error("렌즈 가장자리의 무늬가 부족합니다. 테두리를 포함해 다시 지정해 주세요.");
  const originals = chosen.filter((_, i) => i % Math.max(1, Math.ceil(chosen.length / 100)) === 0);
  let active = originals.map(p => ({ ...p }));
  let previous = originals.map(p => ({ ...p }));
  const frames: Frame[] = [{ outline: outline.map(p => ({ ...p })), centerX: center.x * width, centerY: center.y * height }];
  let minimumConfidence = 1;
  for (let frame = 1; frame < grays.length; frame++) {
    const matches: Match[] = [];
    for (let i = 0; i < previous.length; i++) {
      const px = Math.round(previous[i].x), py = Math.round(previous[i].y);
      if (px < 6 || py < 6 || px >= width - 6 || py >= height - 6) continue;
      let best = Infinity, bx = px, by = py;
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
        const x = px + dx, y = py + dy;
        if (x < 3 || y < 3 || x >= width - 3 || y >= height - 3) continue;
        let error = 0;
        for (let yy = -2; yy <= 2; yy++) for (let xx = -2; xx <= 2; xx++)
          error += Math.abs(grays[frame - 1][(py + yy) * width + px + xx] - grays[frame][(y + yy) * width + x + xx]);
        error = error / 25 + (dx * dx + dy * dy) * 0.015;
        if (error < best) { best = error; bx = x; by = y; }
      }
      if (best < 32) matches.push({ from: { x: active[i].x / width, y: active[i].y / height },
        to: { x: bx / width, y: by / height }, score: best });
    }
    if (matches.length < 8) throw new Error("렌즈 추적이 끊겼습니다. 렌즈 윤곽이나 전환 구간을 다시 선택해 주세요.");
    let fit = solve(matches);
    if (!fit) throw new Error("렌즈 원근 추적을 계산하지 못했습니다.");
    let retained = matches;
    for (let pass = 0; pass < 3; pass++) {
      const current: number[] = fit;
      const distances = matches.map(({ from, to }) => {
        const p = project(current, from);
        return Math.hypot((p.x - to.x) * width, (p.y - to.y) * height);
      });
      const sorted = [...distances].sort((a, b) => a - b);
      const limit = Math.max(1.6, sorted[Math.floor(sorted.length / 2)] * 2.4);
      retained = matches.filter((_, i) => distances[i] <= limit);
      if (retained.length < 8) throw new Error("렌즈 경계 추적이 불안정합니다. 윤곽을 다시 지정해 주세요.");
      fit = solve(retained) ?? fit;
    }
    if (Math.abs(fit[6]) > 1 || Math.abs(fit[7]) > 1)
      throw new Error("렌즈 원근 추적이 불안정합니다. 더 짧은 구간이나 선명한 렌즈 윤곽을 선택해 주세요.");
    const transformed = outline.map(point => project(fit!, point));
    const c = project(fit, center);
    if ([...transformed, c].some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < -0.1 || p.x > 1.1 || p.y < -0.1 || p.y > 1.1))
      throw new Error("렌즈가 화면을 벗어나 추적할 수 없습니다.");
    const area = (points: readonly Point[]) => Math.abs(points.reduce((sum, p, i) => {
      const next = points[(i + 1) % points.length]; return sum + p.x * next.y - next.x * p.y;
    }, 0) / 2);
    const ratio = area(transformed) / area(outline);
    if (!Number.isFinite(ratio) || ratio < 0.25 || ratio > 4)
      throw new Error("렌즈 원근 변형이 너무 커서 추적할 수 없습니다.");
    frames.push({ outline: transformed, centerX: c.x * width, centerY: c.y * height });
    minimumConfidence = Math.min(minimumConfidence, 1 - retained.reduce((sum, match) => sum + match.score, 0) / retained.length / 255);
    active = retained.map(match => ({ x: match.from.x * width, y: match.from.y * height }));
    previous = retained.map(match => ({ x: match.to.x * width, y: match.to.y * height }));
  }
  return { frames, minimumConfidence };
}
