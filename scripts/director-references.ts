// CineGuide 예제를 이 컴퓨터의 보관함(.scene-room/research/cineguide)으로 가져온다.
// 사용: npx tsx scripts/director-references.ts [--from 이미 받은 원본 폴더]
// 권리: © Sputlab x Ainspire. All Rights Reserved. 개인 로컬 열람에만 쓰고 저장소·배포본에 넣지 않는다.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { directorReferenceRoot, type DirectorReference } from "../lib/director-references";

const exec = promisify(execFile);
const base = "https://materials.ainspire.co.kr/cineguide/img/";
// 한 파일에 여러 기법이 있으면 [시작초, 길이초]로 나눈다.
const sources: [id: string, file: string, range?: [number, number]][] = [
  ["wide", "1_long_wide_shot.png"], ["medium", "2_medium_shot.png"], ["close-up", "3_close_up.png"],
  ["over-shoulder", "5_over_shoulder_shot.png"], ["two-group", "6_two_group_shot.png"],
  ["insert", "11_insert_shot.png"], ["cutaway", "12_cutaway_shot.png"], ["reaction", "reaction.mp4"],
  ["pov", "4_pov.mp4"], ["top-view", "7_top_view.png"], ["dutch-tilt", "21_dutch_tilt_shot.png"],
  ["high-angle", "19_high_low_angle.mp4", [0, 2.3]], ["low-angle", "19_high_low_angle.mp4", [2.5, 2.7]],
  ["front", "20_camera_positions.mp4", [0, 3.4]], ["side", "20_camera_positions.mp4", [3.6, 3.3]], ["back", "20_camera_positions.mp4", [7.2, 3.3]],
  ["rule-of-thirds", "chapter_3-1_golden_ratio.png"],
  ["diagonal", "chapter_3-2_vanishing_point.mp4", [0, 1.6]], ["horizontal-line", "chapter_3-2_vanishing_point.mp4", [3.6, 1.6]],
  ["gaze-lens", "chapter_3-3_gaze_line.mp4", [2.1, 1.8]], ["gaze-side", "chapter_3-3_gaze_line.mp4", [4.2, 1.8]],
  ["silhouette", "chapter_3-4_contrast_silhouette.mp4", [2.8, 2.4]],
  ["dolly-in", "dolly_in_v2.mp4"], ["dolly-out", "dolly_out_v2.mp4"], ["tracking", "tracking_v2.mp4"], ["crane", "23_crane_shot.mp4"],
  ["robot-arm", "robot_arm.mp4"], ["arc", "arc.mp4"], ["drone", "drone.mp4"], ["steadicam", "13_steadicam_shot.mp4"],
  ["handheld", "handheld.mp4"], ["zoom", "15_zoom_in_out.mp4"], ["pan", "pan_v2.mp4"], ["tilt", "17_tilt.mp4"],
  ["roll", "roll_dutch.mp4"], ["orbit", "orbit.mp4"], ["dolly-zoom", "dolly_zoom.mp4"], ["rack-focus", "rack_focus.mp4"],
  ["whip-pan", "whip_pan.mp4"], ["slow-motion", "8_slow_motion.mp4"], ["time-lapse", "9_time_lapse.mp4"],
];

async function main() {
  const root = directorReferenceRoot();
  const from = process.argv.indexOf("--from");
  const originals = from > 0 ? path.resolve(process.argv[from + 1]) : await mkdtemp(path.join(os.tmpdir(), "cineguide-"));
  await mkdir(root, { recursive: true });

  async function original(file: string) {
    const target = path.join(originals, file);
    if (await readFile(target).then(() => true, () => false)) return target;
    const response = await fetch(base + file);
    if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
    return target;
  }
  const ffmpeg = (...args: string[]) => exec("ffmpeg", ["-v", "error", "-y", ...args], { timeout: 120_000 });
  const entry = async (file: string) =>
    ({ file, sha256: createHash("sha256").update(await readFile(path.join(root, file))).digest("hex") });

  const items: DirectorReference[] = [];
  for (const [id, file, range] of sources) {
    const input = await original(file);
    const still = `${id}.webp`, video = `${id}.mp4`;
    const cut = range ? ["-ss", String(range[0]), "-t", String(range[1])] : [];
    const moving = file.endsWith(".mp4");
    if (moving) await ffmpeg(...cut, "-i", input, "-an", "-vf", "fps=24,scale=640:-2", "-c:v", "libx264", "-crf", "29", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(root, video));
    const frame = moving ? (await exec("ffmpeg", ["-v", "error", "-i", path.join(root, video), "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "-"],
      { encoding: "buffer", maxBuffer: 20_000_000, timeout: 60_000 })).stdout : input;
    await sharp(frame).resize({ width: 640 }).webp({ quality: 82 }).toFile(path.join(root, still));
    items.push({ id, still: await entry(still), ...(moving ? { video: await entry(video) } : {}), source: base + file });
  }
  await writeFile(path.join(root, "manifest.json"), JSON.stringify({
    copyright: "© 2026 Sputlab x Ainspire. All Rights Reserved.", page: "https://materials.ainspire.co.kr/api/open?id=cineguide-v2",
    fetchedAt: new Date().toISOString(), items,
  }, null, 2));
  if (from < 0) await rm(originals, { recursive: true, force: true });
  console.log(`${items.length}개 예제를 ${root}에 저장했습니다.`);
}

void main();
