type Point = { x: number; y: number };

export function detectLensOutline(rgb: Uint8Array, width: number, height: number, seed: Point): Point[] {
  if (rgb.length !== width * height * 3 || width < 64 || height < 64 ||
      !Number.isFinite(seed.x) || !Number.isFinite(seed.y) ||
      seed.x <= 0 || seed.x >= 1 || seed.y <= 0 || seed.y >= 1)
    throw new Error("렌즈가 보이는 위치를 선택해 주세요.");
  const cx = seed.x * width, cy = seed.y * height;
  const minRadius = Math.max(8, Math.round(Math.min(width, height) * 0.055));
  const maxRadius = Math.round(Math.min(width, height) * 0.39);
  const angles = 32, count = maxRadius - minRadius;
  const gray = (x: number, y: number) => {
    const ix = Math.round(x), iy = Math.round(y);
    if (ix < 1 || iy < 1 || ix >= width - 1 || iy >= height - 1) return 255;
    const i = (iy * width + ix) * 3;
    return rgb[i] * 0.299 + rgb[i + 1] * 0.587 + rgb[i + 2] * 0.114;
  };
  const costs: number[][] = [];
  for (let a = 0; a < angles; a++) {
    const theta = a * 2 * Math.PI / angles, dx = Math.cos(theta), dy = Math.sin(theta);
    costs[a] = [];
    for (let r = minRadius; r < maxRadius; r++) {
      const rim = gray(cx + dx * r, cy + dy * r);
      const inside = gray(cx + dx * (r - 4), cy + dy * (r - 4));
      const outside = gray(cx + dx * (r + 4), cy + dy * (r + 4));
      costs[a].push(rim * 0.28 - Math.max(0, inside - rim) * 0.8 - Math.max(0, outside - rim) * 0.3);
    }
  }
  let best = Infinity, bestPath: number[] = [];
  for (let start = 0; start < count; start += 2) {
    let prev = Array<number>(count).fill(Infinity); prev[start] = costs[0][start];
    const parents: number[][] = [];
    for (let a = 1; a < angles; a++) {
      const next = Array<number>(count).fill(Infinity), back = Array<number>(count).fill(0);
      for (let r = 0; r < count; r++) {
        for (let q = Math.max(0, r - 8); q <= Math.min(count - 1, r + 8); q++) {
          const score = prev[q] + Math.abs(r - q) * 2.3;
          if (score < next[r]) { next[r] = score; back[r] = q; }
        }
        next[r] += costs[a][r];
      }
      parents[a] = back; prev = next;
    }
    for (let r = Math.max(0, start - 8); r <= Math.min(count - 1, start + 8); r++) {
      const total = prev[r] + Math.abs(start - r) * 2.3;
      if (total < best) {
        best = total;
        let cursor = r;
        const path = Array<number>(angles); path[angles - 1] = r;
        for (let a = angles - 1; a > 0; a--) { cursor = parents[a][cursor]; path[a - 1] = cursor; }
        bestPath = path;
      }
    }
  }
  if (!bestPath.length || best / angles > 35) throw new Error("안경테를 찾지 못했습니다. 렌즈 중심을 다시 선택하거나 윤곽을 직접 수정해 주세요.");
  let supported = 0;
  const contrast = bestPath.reduce((sum, v, a) => {
    const angle = a * 2 * Math.PI / angles, dx = Math.cos(angle), dy = Math.sin(angle);
    const radius = minRadius + v;
    const inner = gray(cx + dx * (radius - 4), cy + dy * (radius - 4));
    const rim = gray(cx + dx * radius, cy + dy * radius);
    if (inner - rim > 8 && cx + dx * radius > 1 && cx + dx * radius < width - 2 && cy + dy * radius > 1 && cy + dy * radius < height - 2) supported++;
    return sum + inner - rim;
  }, 0) / angles;
  if (contrast < 7 || supported < angles * 0.45) throw new Error("안경테를 찾지 못했습니다. 렌즈 중심을 다시 선택하거나 윤곽을 직접 수정해 주세요.");
  const outline = bestPath.map((v, a) => {
    const angle = a * 2 * Math.PI / angles;
    const radius = Math.max(minRadius, minRadius + v - 2);
    return { x: (cx + Math.cos(angle) * radius) / width, y: (cy + Math.sin(angle) * radius) / height };
  });
  const area = Math.abs(outline.reduce((sum, point, index) => {
    const next = outline[(index + 1) % outline.length];
    return sum + point.x * next.y - point.y * next.x;
  }, 0)) / 2;
  if (area > 0.1 || outline.some(({ x, y }) => x < 0.01 || x > 0.99 || y < 0.01 || y > 0.99))
    throw new Error("안경테를 찾지 못했습니다. 렌즈 중심을 다시 선택하거나 윤곽을 직접 수정해 주세요.");
  return outline;
}
