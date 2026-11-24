// 어깨 장착 다큐멘터리 예제를 만든다. 원본 사진 한 장에 호흡·걸음의 작은 움직임을 더한다.
// 사용: node scripts/director-shoulder-clip.mjs <원본 사진>
import { spawn } from "node:child_process";
import sharp from "sharp";

const input = process.argv[2];
const out = "public/director/examples/cam-documentary";
const fps = 24, frames = 96, width = 640, height = 640;
const { width: w, height: h } = await sharp(input).metadata();
const cropH = Math.round(h * 0.9), cropW = cropH;
const ffmpeg = spawn("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${width}x${height}`, "-r", String(fps), "-i", "-",
  "-an", "-c:v", "libx264", "-crf", "24", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${out}.mp4`], { stdio: ["pipe", "inherit", "inherit"] });
// 4초 주기의 사인만 써서 이어지는 반복 영상이 된다. 호흡, 몸의 흔들림, 걸음 순서다.
const wave = (t, cycles, phase = 0) => Math.sin((t * cycles + phase) * Math.PI * 2);
for (let i = 0; i < frames; i++) {
  const t = i / frames;
  const dx = (wave(t, 1, 0.1) * 9 + wave(t, 2, 0.35) * 5 + wave(t, 5) * 1.5) * h / 941;
  const dy = (wave(t, 1, 0.6) * 8 + wave(t, 3, 0.2) * 4 + wave(t, 7, 0.4) * 1.5) * h / 941;
  const angle = wave(t, 1, 0.25) * 0.35 + wave(t, 2, 0.7) * 0.2;
  const rotated = await sharp(input).removeAlpha().rotate(angle, { background: "#000" }).toBuffer({ resolveWithObject: true });
  const frame = await sharp(rotated.data).extract({
    left: Math.round(rotated.info.width / 2 - cropW / 2 - w * 0.09 + dx), top: Math.round(rotated.info.height / 2 - cropH / 2 + dy), width: cropW, height: cropH,
  }).resize(width, height, { fit: "fill" }).png().toBuffer();
  if (!i) await sharp(frame).webp({ quality: 86 }).toFile(`${out}.webp`);
  if (!ffmpeg.stdin.write(await sharp(frame).removeAlpha().raw().toBuffer())) await new Promise((resolve) => ffmpeg.stdin.once("drain", resolve));
}
ffmpeg.stdin.end();
await new Promise((resolve, reject) => ffmpeg.once("close", (code) => code ? reject(new Error(`ffmpeg ${code}`)) : resolve()));
