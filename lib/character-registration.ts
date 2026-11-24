import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { uuid } from "./http";
import { isAsset, localAssetPath } from "./media";
import type { Asset } from "./types";
import { registerCharacterAsset } from "./character-registration-receipt";

const exec = promisify(execFile);
const cli = path.join(process.cwd(), "node_modules/.bin/higgsfield");
const environment: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV, ...Object.fromEntries(
  ["PATH", "HOME", "USER", "TMPDIR", "LANG", "LC_ALL", "SHELL", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME"]
    .flatMap((key) => process.env[key] ? [[key, process.env[key]!]] : []),
) };

type Variant = "soul_2" | "soul_cinematic";
type Soul = { id: string; name: string; variant: Variant; status: "training" | "ready" | "failed" };
type Voice = { id: string; name: string; type: "preset" | "element" };
type Registration = { name: string; variant: Variant; images: Asset[]; nodeId: string; retryConfirmed: boolean };
function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function parseRegistration(value: unknown): Registration | null {
  const input = object(value);
  if (!input || input.confirmed !== true || typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 80 ||
      typeof input.nodeId !== "string" || !input.nodeId.trim() || input.nodeId.length > 200 ||
      (input.variant !== "soul_2" && input.variant !== "soul_cinematic") || !Array.isArray(input.images) ||
      input.images.length < 5 || input.images.length > 20 || !input.images.every((image) => isAsset(image) && image.type === "image") ||
      new Set(input.images.map((image: Asset) => image.url)).size !== input.images.length) return null;
  return { name: input.name.trim(), variant: input.variant, images: input.images as Asset[], nodeId: input.nodeId, retryConfirmed: input.retryConfirmed === true };
}

export function soulFromProvider(value: unknown, fallback?: { name?: string; variant: Variant }): Soul | null {
  const item = object(value);
  if (!item) return null;
  const nested = object(item.reference) ?? object(item.soul) ?? object(item.data);
  if (nested) return soulFromProvider(nested, fallback);
  const id = item.id ?? item.soul_id ?? item.reference_id;
  const name = item.name ?? fallback?.name;
  const variant = item.type ?? item.variant ?? item.model ?? fallback?.variant;
  const status = item.status;
  if (!uuid(id) || typeof name !== "string" || !name || (variant !== "soul_2" && variant !== "soul_cinematic")) return null;
  const state = status === "ready" || status === "completed" ? "ready" : status === "failed" || status === "error" || status === "canceled" ? "failed" : "training";
  return { id, name, variant, status: state };
}

export function voicesFromProvider(value: unknown): Voice[] {
  const list = Array.isArray(value) ? value : object(value)?.items;
  if (!Array.isArray(list)) throw new Error("Higgsfield 목소리 목록을 읽을 수 없습니다.");
  return list.flatMap((value) => {
    const item = object(value);
    const id = item?.id ?? item?.voice_id;
    const type = item?.voice_type ?? item?.type;
    if (!uuid(id) || typeof item?.name !== "string" || (type !== "preset" && type !== "element") ||
        (item.status !== undefined && item.status !== "completed" && item.status !== "ready")) return [];
    return [{ id, name: item.name, type }];
  });
}

async function command(args: string[], creation = false): Promise<unknown> {
  try {
    const { stdout } = await exec(cli, [...args, "--json"], { env: environment, timeout: creation ? 120_000 : 20_000, maxBuffer: 4 * 1024 * 1024 });
    return JSON.parse(stdout) as unknown;
  } catch {
    throw new Error(creation
      ? "Soul 등록 응답을 확인하지 못했습니다. 중복 등록 전에 Higgsfield 캐릭터 목록에서 결과를 확인해 주세요."
      : "Higgsfield CLI 연결 또는 응답을 확인하지 못했습니다. 계정 연결 상태를 확인해 주세요.");
  }
}

export async function createSoul(registration: Registration): Promise<Soul> {
  const imagePaths = registration.images.map(localAssetPath);
  try {
    await Promise.all(imagePaths.map(async (file) => {
      const stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error();
    }));
  } catch { throw new Error("등록할 이미지 파일을 찾을 수 없습니다."); }
  const result = await command(["soul-id", "create", "--name", registration.name,
    registration.variant === "soul_2" ? "--soul-2" : "--soul-cinematic",
    ...imagePaths.flatMap((file) => ["--image", file])], true);
  const soul = soulFromProvider(result, registration);
  if (!soul) throw new Error("등록 응답에서 Soul ID를 확인하지 못했습니다. 중복 등록 전에 Higgsfield 캐릭터 목록을 확인해 주세요.");
  return soul;
}

export async function createSoulOnce(projectId: string, registration: Registration,
  submit: (value: Registration) => Promise<Soul> = createSoul,
  directory = path.join(process.cwd(), ".scene-room", "character-registration")): Promise<Soul> {
  return registerCharacterAsset({
    directory, projectId, nodeId: registration.nodeId, retryConfirmed: registration.retryConfirmed, pendingMs: 135_000,
    input: { name: registration.name, variant: registration.variant, images: registration.images.map((image) => image.url) },
    inProgress: "이 캐릭터의 Soul 등록 요청을 처리하고 있습니다. 잠시 후 상태를 확인해 주세요.",
    reviewRequired: "이전 Soul 등록 결과를 확인해 주세요. Higgsfield 목록을 확인한 뒤 재등록을 선택할 수 있습니다.",
    parse: soulFromProvider, submit: () => submit(registration),
  });
}

export async function listSouls(): Promise<Soul[]> {
  const variants: Variant[] = ["soul_2", "soul_cinematic"];
  const lists = await Promise.all(variants.map(async (variant) => {
    const result = await command(["soul-id", "list", "--size", "100", variant === "soul_2" ? "--soul-2" : "--soul-cinematic"]);
    const items = Array.isArray(result) ? result : object(result)?.items;
    if (!Array.isArray(items)) throw new Error("Higgsfield 캐릭터 목록을 읽을 수 없습니다.");
    return items.flatMap((item) => { const soul = soulFromProvider(item, { variant }); return soul ? [soul] : []; });
  }));
  return lists.flat();
}

export async function getSoul(id: string): Promise<Soul> {
  const result = await command(["soul-id", "get", id]);
  let soul = soulFromProvider(result);
  if (!soul) {
    const existing = (await listSouls()).find((item) => item.id === id);
    if (existing) soul = soulFromProvider(result, existing);
  }
  if (!soul) throw new Error("Higgsfield 캐릭터 상태를 읽을 수 없습니다.");
  return soul;
}

export async function listVoices(): Promise<Voice[]> {
  const voices = new Map<string, Voice>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const result = await command(["voices", "list", "--size", "100", ...(cursor ? ["--cursor", cursor] : [])]);
    for (const voice of voicesFromProvider(result)) voices.set(`${voice.type}:${voice.id}`, voice);
    const next = object(result)?.cursor;
    cursor = typeof next === "string" && next ? next : undefined;
    if (cursor && cursors.has(cursor)) throw new Error("Higgsfield 목소리 목록의 다음 페이지를 확인하지 못했습니다.");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return [...voices.values()];
}

export async function getReadyVoice(id: string): Promise<Voice | null> {
  if (!uuid(id)) return null;
  const result = await command(["voices", "get", id]).catch(() => null);
  const item = object(result);
  if (item?.status !== "completed" && item?.status !== "ready") return null;
  const voice = voicesFromProvider([item])[0];
  return voice?.id === id ? voice : null;
}
