import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { localAssetPath } from "./media";
import { fetchFishVoiceReference } from "./tts-provider";
import { assetId, localDefaultVoiceId, type TtsVoice } from "./tts-types";
import type { Asset, Graph } from "./types";

const exec = promisify(execFile);
const directory = () => path.join(process.cwd(), ".scene-room", "tts-references");
// 공개 중단·권리 제한이 바뀌면 다시 확인하도록 하루만 재사용한다.
const fishMaxAge = 24 * 60 * 60_000;

async function writeAtomic(file: string, content: string | Uint8Array) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}`;
  await writeFile(temp, content, { flag: "wx", mode: 0o600 });
  await rename(temp, file);
}

async function prune(root: string) {
  for (const name of await readdir(root).catch(() => [])) {
    if (!name.startsWith("fish-")) continue;
    const file = path.join(root, name);
    const saved = await stat(file).catch(() => null);
    if (saved && Date.now() - saved.mtimeMs >= fishMaxAge) await rm(file, { force: true });
  }
}

export async function fishReference(voiceId: string, fetchReference = fetchFishVoiceReference, root = directory()) {
  const file = path.join(root, `fish-${voiceId}.audio`);
  const textFile = path.join(root, `fish-${voiceId}.txt`);
  await prune(root);
  const saved = await readFile(textFile, "utf8").catch(() => "");
  if (saved && await exists(file)) return { file, text: saved };
  const reference = await fetchReference(voiceId);
  await writeAtomic(file, reference.audio);
  await writeAtomic(textFile, reference.text);
  return { file, text: reference.text };
}

export function localVoices(graph: Graph, search = ""): TtsVoice[] {
  const query = search.trim().toLocaleLowerCase();
  const samples = [
    ...graph.nodes.map((node) => ({ asset: node.characterIdentity?.voiceSample, title: node.title, description: "캐릭터 음성 샘플" })),
    ...graph.nodes.map((node) => ({ asset: node.asset, title: node.title, description: "프로젝트 음향" })),
  ];
  const voices: TtsVoice[] = [{ id: localDefaultVoiceId, name: "새 목소리 만들기", description: "참조 음성 없이 성별·나이·음색을 골라 만듭니다. 시드를 고정하지 않으면 만들 때마다 목소리가 달라집니다." }];
  for (const { asset, title, description } of samples) {
    if (asset?.type !== "audio" || voices.some((voice) => voice.id === assetId(asset))) continue;
    voices.push({ id: assetId(asset), name: title || asset.name, description, previewUrl: asset.url });
  }
  return query ? voices.filter((voice) => `${voice.name} ${voice.description}`.toLocaleLowerCase().includes(query)) : voices;
}

/** Whisper가 무음·효과음에 붙이는 괄호 표시를 뺀 말만 남긴다. */
export const spokenWords = (output: string) => output.replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

async function transcribe(file: string, id: string): Promise<string> {
  const cache = spokenFile(id);
  const saved = await readFile(cache, "utf8").catch(() => "");
  if (saved) return saved;
  const model = process.env.WHISPER_MODEL_PATH || path.join(process.cwd(), ".scene-room", "models", "ggml-base-q5_1.bin");
  const temp = await mkdtemp(path.join(os.tmpdir(), "scene-room-voice-"));
  let text = "";
  try {
    const audio = path.join(temp, "audio.wav");
    await exec("ffmpeg", ["-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe", "-i", file,
      "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-t", "61", "-y", audio], { timeout: 60_000 });
    const { stdout } = await exec("whisper-cli", ["-m", model, "-f", audio, "-l", "auto", "-np", "-nt"], { timeout: 120_000, maxBuffer: 256 * 1024 });
    text = spokenWords(stdout);
  } catch { /* 아래에서 직접 입력을 안내한다. */ } finally {
    await rm(temp, { recursive: true, force: true });
  }
  if (!text) throw new Error("샘플의 말을 받아쓰지 못했습니다. 샘플에서 말한 내용을 직접 입력해 주세요.");
  await writeAtomic(cache, text);
  return text;
}

const exists = (file: string) => access(file).then(() => true, () => false);
const spokenFile = (id: string) => path.join(directory(), `asset-${id}.txt`);
const takeFile = (projectId: string, id: string) => path.join(directory(), `take-${projectId}-${id}.txt`);

/** 만든 음성을 나중에 참조하거나 다시 연기할 때 다시 받아쓰지 않도록 실제로 읽은 말을 남긴다. */
export async function rememberSpoken(asset: Asset, spoken: string, projectId: string) {
  if (!spoken) return;
  const id = assetId(asset);
  await writeAtomic(spokenFile(id), spoken);
  await writeAtomic(takeFile(projectId, id), spoken);
}

/** 이 프로젝트에서 로컬 모델로 만든 음성만 다시 연기할 기준으로 쓴다. */
export async function takeReference(projectId: string, id: string) {
  const text = await readFile(takeFile(projectId, id), "utf8").catch(() => "");
  const file = localAssetPath({ url: `/api/assets/${id}.wav`, type: "audio", name: "take.wav" });
  if (!text || !await exists(file)) throw new Error("다시 연기할 음성을 찾지 못했습니다. 음성을 새로 만들어 주세요.");
  return { file, text };
}

export async function localReference(graph: Graph, voiceId: string, spoken: string) {
  const asset = graph.nodes.flatMap((node) => [node.characterIdentity?.voiceSample, node.asset])
    .find((item) => item?.type === "audio" && assetId(item) === voiceId);
  const file = asset && localAssetPath(asset);
  if (!file || !await exists(file)) throw new Error("프로젝트에서 참조할 음성을 찾지 못했습니다. 목록을 다시 불러와 주세요.");
  // 직접 적은 말은 다음 참조와 여러 화자 대화에서도 쓴다.
  if (spoken) await writeAtomic(spokenFile(voiceId), spoken);
  return { file, text: spoken || await transcribe(file, voiceId) };
}
