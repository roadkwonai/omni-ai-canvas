// 실사 사진으로 카메라 이동 예제를 만든다. node scripts/director-photo-moves.mjs [id…]
// 승강장을 바닥·지붕·양옆 벽의 상자로 보고 깊이를 계산해, 카메라가 움직일 때 가까운 곳이 더 크게 움직이게 한다.
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import sharp from "sharp";

const source = "generated-images/moves", target = "public/director/moves";
const W = 960, H = 540, FPS = 24;
const load = async (file) => {
  const { data, info } = await sharp(`${source}/${file}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};
const ease = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const hold = (t, from, to) => ease((t - from) / (to - from));

function sample(image, x, y, out) {
  x = Math.min(Math.max(x, 0), image.w - 1.001); y = Math.min(Math.max(y, 0), image.h - 1.001);
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = (y0 * image.w + x0) * 4, j = i + image.w * 4, d = image.data;
  for (let c = 0; c < 4; c++) out[c] = (d[i + c] * (1 - fx) + d[i + 4 + c] * fx) * (1 - fy) + (d[j + c] * (1 - fx) + d[j + 4 + c] * fx) * fy;
}

// 소실점과 상자의 크기. wide.png에서 잰 값이다.
const vx = 829, vy = 484, depth = (x, y) => Math.max((y - vy) / 461, (vy - y) / 793, Math.abs(x - vx) / 1037, 0.001);
const feet = { x: 836, y: 752 }, near = depth(feet.x, feet.y);

// crop: 화면에 담는 원본 비율, forward: 앞으로 간 거리, focal: 줌 배율, shift: 옆·위로 움직인 거리(픽셀), roll: 기울기
function space(bg, man, { crop = 1, forward = 0, focal = 1, shiftX = 0, shiftY = 0, roll = 0, centerY = 470 }) {
  const frame = Buffer.alloc(W * H * 3), px = [0, 0, 0, 0], k = bg.w * crop / W, cos = Math.cos(roll), sin = Math.sin(roll);
  const grow = 1 / (1 - forward * near);
  for (let oy = 0; oy < H; oy++) for (let ox = 0; ox < W; ox++) {
    const rx = (ox - W / 2) * k, ry = (oy - H / 2) * k;
    const dx = (rx * cos - ry * sin + vx - vx) / focal, dy = (rx * sin + ry * cos + centerY - vy) / focal;
    const z = depth(vx + dx, vy + dy), s = 1 / (1 + forward * z);
    sample(bg, vx + dx * s + shiftX * z, vy + dy * s + shiftY * z, px);
    let r = px[0], g = px[1], b = px[2];
    const mx = vx + dx / grow + shiftX * near, my = vy + dy / grow + shiftY * near;
    // 발밑의 옅은 그림자
    const ex = (mx - feet.x - 6) / 46, ey = (my - feet.y + 4) / 9, shade = Math.max(0, 1 - ex * ex - ey * ey) * 0.42;
    r *= 1 - shade; g *= 1 - shade; b *= 1 - shade;
    if (mx > 700 && mx < 960 && my > 360 && my < 790) {
      sample(man, mx, my, px);
      const a = px[3] / 255;
      r = px[0] * a + r * (1 - a); g = px[1] * a + g * (1 - a); b = px[2] * a + b * (1 - a);
    }
    const i = (oy * W + ox) * 3; frame[i] = r; frame[i + 1] = g; frame[i + 2] = b;
  }
  return frame;
}

function flat(image, { x, y, width }, blend, mix = 0) {
  const frame = Buffer.alloc(W * H * 3), a = [0, 0, 0, 0], b = [0, 0, 0, 0], k = width / W;
  for (let oy = 0; oy < H; oy++) for (let ox = 0; ox < W; ox++) {
    sample(image, x + ox * k, y + oy * k, a);
    if (blend && mix > 0) { sample(blend, x + ox * k, y + oy * k, b); for (let c = 0; c < 3; c++) a[c] += (b[c] - a[c]) * mix; }
    const i = (oy * W + ox) * 3; frame[i] = a[0]; frame[i + 1] = a[1]; frame[i + 2] = a[2];
  }
  return frame;
}

const wide = await load("wide-bg.png"), man = await load("man-raw.png"), pano = await load("pano.png"), tall = await load("tall.png"),
  rackNear = await load("rack-near.png"), rackFar = await load("rack-far.png");
// 경계의 옅은 테두리를 안쪽으로 당긴다.
for (let i = 3; i < man.data.length; i += 4) man.data[i] = Math.max(0, Math.min(255, (man.data[i] - 70) * 255 / 150));
const wobble = (t, seed) => Math.sin(t * 2.1 + seed) * 0.6 + Math.sin(t * 4.7 + seed * 2) * 0.28 + Math.sin(t * 9.3 + seed * 3) * 0.12;
const reach = 0.52 / near;

const moves = {
  "dolly-in": [4.6, (t) => space(wide, man, { forward: reach * hold(t, 0.3, 4.2) })],
  "dolly-out": [4.6, (t) => space(wide, man, { forward: reach * (1 - hold(t, 0.3, 4.2)) })],
  "dolly-zoom": [4.6, (t) => { const forward = 0.5 / near * hold(t, 0.4, 4); return space(wide, man, { crop: 0.5, forward, focal: 1 - forward * near, centerY: 560 }); }],
  zoom: [4.6, (t) => space(wide, man, { focal: 1 + 1.05 * hold(t, 0.4, 4.2) })],
  handheld: [5, (t) => space(wide, man, { crop: 0.56, centerY: 560, shiftX: wobble(t, 0.4) * 26, shiftY: wobble(t, 2.2) * 15, roll: wobble(t, 4) * 0.011 })],
  pan: [5, (t) => flat(pano, { x: 600 * hold(t, 0.4, 4.6), y: 130, width: 1072 })],
  tilt: [5, (t) => flat(tall, { x: 0, y: 20 + 1120 * hold(t, 0.4, 4.4), width: 941 })],
  "rack-focus": [4.8, (t) => { const mix = hold(t, 1.4, 2.6), grow = 1 - 0.018 * mix; return flat(rackNear, { x: 836 * (1 - grow), y: 470 * (1 - grow), width: 1672 * grow }, rackFar, mix); }],
  "whip-pan": [3.6, (t) => {
    const at = (time) => 640 * hold(time, 1.3, 1.72), speed = at(t + 1 / FPS) - at(t);
    if (speed < 4) return flat(pano, { x: at(t), y: 150, width: 1030 });
    const sum = new Float32Array(W * H * 3), steps = 14;
    for (let n = 0; n < steps; n++) { const part = flat(pano, { x: at(t) + speed * n / steps, y: 150, width: 1030 }); for (let i = 0; i < sum.length; i++) sum[i] += part[i] / steps; }
    return Buffer.from(sum);
  }],
};

const wanted = process.argv.slice(2);
for (const [id, [seconds, draw]] of Object.entries(moves)) {
  if (wanted.length && !wanted.includes(id)) continue;
  const ffmpeg = spawn("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", id === "tilt" ? "33" : "27", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${target}/${id}.mp4`], { stdio: ["pipe", "inherit", "inherit"] });
  for (let frame = 0; frame < seconds * FPS; frame++) if (!ffmpeg.stdin.write(draw(frame / FPS))) await once(ffmpeg.stdin, "drain");
  ffmpeg.stdin.end();
  const [code] = await once(ffmpeg, "close");
  if (code) throw new Error(`${id} 렌더 실패`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(id === "tilt" || id === "pan" ? seconds - 0.2 : 0), "-i", `${target}/${id}.mp4`, "-frames:v", "1", `${source}/poster.png`]);
  await sharp(`${source}/poster.png`).resize(640).webp({ quality: 82 }).toFile(`${target}/${id}.webp`);
  console.log(id);
}
