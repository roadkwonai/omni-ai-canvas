import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export const secretNames = ["OPENAI_API_KEY", "GEMINI_API_KEY", "ARK_API_KEY", "TRIPO_API_KEY",
  "FISH_AUDIO_API_KEY", "ELEVENLABS_API_KEY", "TYPECAST_API_KEY", "GEMINI_TTS_API_KEY"] as const;
export type SecretName = typeof secretNames[number];
const defaultRoot = () => path.join(process.cwd(), ".scene-room", "service-settings");
const validSecret = (name: string): name is SecretName => secretNames.some((item) => item === name);
async function read(file: string) {
  try { return await readFile(/* turbopackIgnore: true */ file, "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}
async function store(root: string, filename: string, value: string | null) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const target = path.join(root, filename);
  if (value === null) { await unlink(target).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; }); return; }
  const temp = path.join(root, `.${randomUUID()}.tmp`);
  try { await writeFile(temp, value, { mode: 0o600, flag: "wx" }); await rename(temp, target); }
  finally { await unlink(temp).catch(() => {}); }
}
export async function saveSecret(name: string, value: string | null, root = defaultRoot()) {
  if (!validSecret(name) || (value !== null && (!value.trim() || value.length > 4096 || /[\x00-\x20\x7f]/.test(value)))) throw new Error("API 키를 확인해 주세요.");
  await store(root, name, value);
}
export async function readSecret(name: SecretName, root = defaultRoot()) {
  return (await read(path.join(/* turbopackIgnore: true */ root, name))).trim() || process.env[name]?.trim() || "";
}
export async function settingsStatus(root = defaultRoot()) {
  const keys = Object.fromEntries(await Promise.all(secretNames.map(async (name) => {
    const local = Boolean((await read(path.join(/* turbopackIgnore: true */ root, name))).trim());
    const environment = Boolean(process.env[name]?.trim());
    return [name, { configured: local || environment, source: local ? "local" : environment ? "environment" : "none" }];
  })));
  return { keys };
}

export function readSecretSync(name: SecretName, root = defaultRoot()) {
  try {
    const value = readFileSync(path.join(/* turbopackIgnore: true */ root, name), "utf8").trim();
    if (value) return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return process.env[name]?.trim() || "";
}
