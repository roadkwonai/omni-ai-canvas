import { constants } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const bundledFiles = [
  "AGENTS.md",
  ".env.example",
  ".agents/mcp_config.json",
  ".codex/config.toml",
  ".mcp.json",
  ".agents/skills/gpt-image/SKILL.md",
  ".agents/skills/gpt-image/scripts/gpt_image.mjs",
  ".agents/skills/higgsfield-generate/references/prompt-engineering.md",
  ".agents/skills/higgsfield-soul-id/SKILL.md",
  ".agents/skills/higgsfield-product-photoshoot/SKILL.md",
  ".agents/skills/higgsfield-faceless-video/SKILL.md",
  ".agents/skills/higgsfield-video-explainer/SKILL.md",
  ".agents/skills/topview-generate/SKILL.md",
  ".agents/skills/yue-music/SKILL.md",
  ".agents/skills/blender-production-guide/SKILL.md",
  "docs/production-agent-guide.md",
  "lib/higgsfield-guidance-kit.ts",
  "lib/production-template.ts",
  "db/001_initial.sql",
  "scripts/blender_scene.py",
  "scripts/canvas-mcp.ts",
  "scripts/migrate.mjs",
  "scripts/worker.ts",
  "public/fonts/PretendardVariable.woff2",
  "public/rigs/direction-face.glb",
  "public/sample/preview.mp4",
];

const isFile = (file) => stat(file).then((info) => info.isFile(), () => false);
const includesFile = (file) => isFile(join(root, file));
const canExecute = async (file) => (await isFile(file)) &&
  access(file, constants.X_OK).then(() => true, () => false);

const searchPaths = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
async function hasCommand(name) {
  const names = process.platform === "win32" ? [`${name}.exe`, `${name}.cmd`] : [name];
  const found = await Promise.all(searchPaths.flatMap((dir) => names.map((file) => canExecute(join(dir, file)))));
  return found.some(Boolean);
}

const missing = (await Promise.all(bundledFiles.map(async (file) => await includesFile(file) ? null : file))).filter(Boolean);
const skillsRoot = ".agents/skills";
const skills = await readdir(join(root, skillsRoot), { withFileTypes: true }).catch(() => []);
const skillCount = (await Promise.all(skills.filter((entry) => entry.isDirectory())
  .map(({ name }) => includesFile(join(skillsRoot, name, "SKILL.md"))))).filter(Boolean).length;
console.log(`프로젝트 스킬 ${skillCount}개`);
for (const file of missing) console.error(`필수 프로젝트 파일 누락: ${file}`);

const dependencies = await Promise.all(["next", "tsx"].map(async (name) => {
  const present = await includesFile(`node_modules/${name}/package.json`);
  if (!present) console.error(`npm 모듈 누락: ${name} · npm ci를 실행하세요.`);
  return present;
}));

const envText = await readFile(join(root, ".env"), "utf8").catch((error) => {
  if (error.code === "ENOENT") return "";
  throw new Error("프로젝트 .env 파일을 읽을 수 없습니다.");
});
const localEnv = parseEnv(envText);
const env = (key) => (process.env[key] ?? localEnv[key] ?? "").trim();
const localPath = (value) => resolve(root, value);
const roadHome = env("ROAD_MUSIC_HOME");
const blenderBin = env("BLENDER_BIN");
const whisperModel = env("WHISPER_MODEL_PATH");
const chrome = env("NODE_DOCUMENT_CHROME_PATH");
const suffix = process.platform === "win32" ? ".cmd" : "";

const checks = await Promise.all([
  ["Neon 작업실과 마이그레이션 주소", Boolean(env("DATABASE_URL") && env("DATABASE_URL_UNPOOLED"))],
  ["FFmpeg와 ffprobe · 영상 편집", Promise.all([hasCommand("ffmpeg"), hasCommand("ffprobe")]).then((values) => values.every(Boolean))],
  ["Codex CLI · ChatGPT 구독 이미지와 텍스트", hasCommand("codex")],
  ["Claude CLI · Claude 구독 텍스트", hasCommand("claude")],
  ["Higgsfield CLI", canExecute(join(root, `node_modules/.bin/higgsfield${suffix}`))],
  ["Kling CLI", canExecute(join(root, `node_modules/.bin/kling${suffix}`))],
  ["Road Music CLI · 음악과 효과음", Boolean(roadHome) && isFile(join(localPath(roadHome), "cli/road-music.js"))],
  ["Blender · 3D 렌더", blenderBin ? canExecute(localPath(blenderBin)) : Promise.all([
    hasCommand("blender"), canExecute("/Applications/Blender.app/Contents/MacOS/Blender"),
  ]).then((values) => values.some(Boolean))],
  ["yt-dlp · YouTube 자료 가져오기", hasCommand("yt-dlp")],
  ["whisper-cli와 모델 · 말소리 받아쓰기", Boolean(whisperModel) && Promise.all([
    hasCommand("whisper-cli"), isFile(localPath(whisperModel)),
  ]).then((values) => values.every(Boolean))],
  ...[["Fish S2 Pro", "s2-pro-8bit"], ["Fish Drama 3", "drama-3-4bit"]].map(([label, folder]) => [`로컬 TTS · ${label}`, Promise.all([
    canExecute(join(root, ".scene-room/local-tts/.venv/bin/python")), includesFile(`.scene-room/local-tts/models/${folder}/.ready`),
  ]).then((values) => values.every(Boolean))]),
  ["pdftotext · PDF 읽기", hasCommand("pdftotext")],
  ["python3 · DOCX 및 PPTX 읽기", hasCommand("python3")],
  ["Chrome 또는 Chromium · PDF 내보내기", Promise.all([
    Boolean(chrome) && canExecute(localPath(chrome)),
    canExecute("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    canExecute("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
    canExecute("/usr/bin/chromium"), canExecute("/usr/bin/chromium-browser"), canExecute("/usr/bin/google-chrome"),
    ...[process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean)
      .map((base) => canExecute(join(base, "Google/Chrome/Application/chrome.exe"))),
  ]).then((values) => values.some(Boolean))],
  ["macOS Swift · 화면 문자 인식과 이미지 분리", process.platform === "darwin" && canExecute("/usr/bin/swift")],
].map(async ([label, present]) => [label, await present]));

for (const [label, present] of checks) console.log(`${present ? "확인" : "설정 필요"}  ${label}`);
console.log("연결 상태, 모델 엔진과 계정 권한은 작업실에서 확인하세요.");
if (missing.length || dependencies.some((present) => !present)) process.exitCode = 1;
