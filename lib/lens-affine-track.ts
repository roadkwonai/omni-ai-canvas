export type LensAffineFrame = { centerX: number; centerY: number; a: number; b: number; c: number; d: number };
type Point = { x: number; y: number };
type Match = { from: Point; to: Point; score: number };

function solve(matches: Match[]): number[] | null {
  const matrix = Array.from({ length: 3 }, () => [0, 0, 0, 0, 0]);
  for (const { from, to } of matches) {
    const v = [from.x, from.y, 1];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) matrix[r][c] += v[r] * v[c];
      matrix[r][3] += v[r] * to.x;
      matrix[r][4] += v[r] * to.y;
    }
  }
  for (let col = 0; col < 3; col++) {
    const pivot = Math.max(...[col, col + 1, col + 2].filter(i => i < 3).map(i => Math.abs(matrix[i][col])));
    if (pivot < 1e-8) return null;
    const row = matrix.findIndex((value, index) => index >= col && Math.abs(value[col]) === pivot);
    [matrix[col], matrix[row]] = [matrix[row], matrix[col]];
    const div = matrix[col][col];
    for (let k = col; k < 5; k++) matrix[col][k] /= div;
    for (let r = 0; r < 3; r++) if (r !== col) {
      const factor = matrix[r][col];
      for (let k = col; k < 5; k++) matrix[r][k] -= factor * matrix[col][k];
    }
  }
  return [matrix[0][3], matrix[1][3], matrix[2][3], matrix[0][4], matrix[1][4], matrix[2][4]];
}

export function trackLensAffine(grays: readonly Uint8Array[], width: number, height: number,
  mask: { x: number; y: number; width: number; height: number; angle?: number }):
  { frames: LensAffineFrame[]; minimumConfidence: number } {
  if (!grays.length || grays.some(g => g.length !== width * height)) throw new Error("렌즈 추적 영상을 확인해 주세요.");
  const cx = (mask.x + mask.width / 2) * width, cy = (mask.y + mask.height / 2) * height;
  const rx = mask.width * width / 2, ry = mask.height * height / 2;
  const angle = (mask.angle ?? 0) * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const extentX = Math.hypot(rx * cos, ry * sin) * 1.17;
  const extentY = Math.hypot(rx * sin, ry * cos) * 1.17;
  const points: Point[] = [];
  const first = grays[0];
  for (let y = Math.ceil(cy - extentY); y <= cy + extentY; y += 3) for (let x = Math.ceil(cx - extentX); x <= cx + extentX; x += 3) {
    if (x < 7 || y < 7 || x >= width - 7 || y >= height - 7) continue;
    const nx = ((x - cx) * cos + (y - cy) * sin) / rx;
    const ny = (-(x - cx) * sin + (y - cy) * cos) / ry;
    if (nx * nx + ny * ny > 1.35) continue;
    let sum = 0, squared = 0;
    for (let py = -2; py <= 2; py++) for (let px = -2; px <= 2; px++) {
      const v = first[(y + py) * width + x + px]; sum += v; squared += v * v;
    }
    if (squared / 25 - (sum / 25) ** 2 > 100) points.push({ x, y });
  }
  if (points.length < 6) throw new Error("렌즈 가장자리의 무늬가 부족합니다. 테두리를 포함해 다시 지정해 주세요.");
  const chosen = points.filter((_, i) => i % Math.max(1, Math.ceil(points.length / 120)) === 0);
  let previous = chosen.map(p => ({ ...p }));
  let active = chosen.map(p => ({ ...p }));
  const frames: LensAffineFrame[] = [{ centerX: cx, centerY: cy, a: 1, b: 0, c: 0, d: 1 }];
  let minimumConfidence = 1;
  for (let frame = 1; frame < grays.length; frame++) {
    const before = grays[frame - 1], after = grays[frame];
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
          error += Math.abs(before[(py + yy) * width + px + xx] - after[(y + yy) * width + x + xx]);
        error = error / 25 + (dx * dx + dy * dy) * 0.015;
        if (error < best) { best = error; bx = x; by = y; }
      }
      if (best < 32) matches.push({ from: active[i], to: { x: bx, y: by }, score: best });
    }
    if (matches.length < 6) throw new Error("렌즈 추적이 끊겼습니다. 렌즈 영역이나 전환 구간을 다시 선택해 주세요.");
    let fit = solve(matches);
    if (!fit) throw new Error("렌즈 추적 위치를 확인할 수 없습니다.");
    for (let pass = 0; pass < 3; pass++) {
      const current: number[] = fit;
      const distances = matches.map(({ from, to }) => Math.hypot(current[0] * from.x + current[1] * from.y + current[2] - to.x, current[3] * from.x + current[4] * from.y + current[5] - to.y));
      const sorted = [...distances].sort((a, b) => a - b);
      const limit = Math.max(1.6, sorted[Math.floor(sorted.length / 2)] * 2.4);
      const retained = matches.filter((_, i) => distances[i] <= limit);
      if (retained.length < 6) break;
      fit = solve(retained) ?? fit;
    }
    const [a, c, tx, b, d, ty] = fit;
    const determinant = a * d - b * c;
    if (determinant < 0.25 || determinant > 4) throw new Error("렌즈 변형이 너무 커서 추적할 수 없습니다. 영역을 다시 지정해 주세요.");
    minimumConfidence = Math.min(minimumConfidence, 1 - matches.reduce((s, m) => s + m.score, 0) / matches.length / 255);
    frames.push({ centerX: a * cx + c * cy + tx, centerY: b * cx + d * cy + ty, a, b, c, d });
    active = matches.map(m => m.from);
    previous = matches.map(m => m.to);
  }
  return { frames, minimumConfidence };
}
