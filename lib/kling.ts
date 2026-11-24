import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { localAssetPath, MAX_MEDIA_BYTES, storeMedia } from "./media";
import type { MediaOperation, MediaOption, MediaProfile, MediaSlot, MediaValue, ResolvedMedia } from "./media-model-types";
import type { ProviderInfo, ProviderModel, RunInput, RunResult } from "./types";
import { parseProviderAccount } from "./provider-account";

const cli = path.join(process.cwd(), "node_modules/.bin/kling");
const cliEnv = Object.fromEntries(
  [
    "PATH",
    "HOME",
    "USER",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "XDG_CONFIG_HOME",
  ].flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
) as NodeJS.ProcessEnv;

async function invoke(args: string[], timeout = 30_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(cli, [...args, "--quiet"], {
      env: { ...cliEnv, KLING_NONINTERACTIVE: "1" },
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform !== "win32" && child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      } else child.kill("SIGKILL");
    }, timeout);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 2_000_000) child.kill("SIGKILL");
    });
    child.stderr.resume();
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("Kling CLI를 실행할 수 없습니다."));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 || timedOut) {
        reject(
          new Error(
            timedOut
              ? "Kling 응답 시간이 초과됐습니다."
              : "Kling 요청이 실패했습니다. 계정 연결과 작업 상태를 확인하세요.",
          ),
        );
        return;
      }
      try {
        const result: unknown = JSON.parse(stdout);
        if (result && typeof result === "object" && "ok" in result && result.ok === false)
          throw new Error("Kling 요청이 실패했습니다. 계정 연결과 작업 상태를 확인하세요.");
        resolve(result);
      } catch {
        reject(new Error("Kling 응답을 읽을 수 없습니다."));
      }
    });
  });
}

function findValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  if (key in value) return (value as Record<string, unknown>)[key];
  for (const nested of Object.values(value)) {
    const found = findValue(nested, key);
    if (found !== undefined) return found;
  }
}

const commands: Record<MediaOperation, { command: string; label: string }[]> = {
  image: [
    { command: "text_to_image", label: "텍스트로 이미지 생성" },
    { command: "image_to_image", label: "이미지 참조 생성" },
  ],
  video: [
    { command: "text_to_video", label: "텍스트로 영상 생성" },
    { command: "image_to_video", label: "이미지·키프레임 영상" },
    { command: "omni_ref_video", label: "복합 참조 영상" },
  ],
};

type KlingModel = {
  model?: unknown;
  alias?: unknown;
  arguments?: unknown;
  inputs?: unknown;
};

function modelEntries(body: unknown, command: string): KlingModel[] {
  const catalog = findValue(body, "availableModels") ?? findValue(body, "available_models");
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) return [];
  const entry = (catalog as Record<string, unknown>)[command];
  const models = Array.isArray(entry) ? entry : entry && typeof entry === "object" ? (entry as Record<string, unknown>).models : undefined;
  return Array.isArray(models) ? models.filter((item): item is KlingModel => !!item && typeof item === "object") : [];
}

const safeName = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(value);
const safeModel = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
const primitive = (value: unknown): value is MediaValue => typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
const outputCount = (name: string) => /^(?:(?:image|video)_?)?count$|^batch_?size$|^n$/i.test(name);

/** 공식 who_am_i 응답의 모델·입력 슬롯을 화면 계약으로 변환한다. */
export function klingCatalog(body: unknown): { models: ProviderModel[]; profiles: MediaProfile[] } {
  const modelMap = new Map<string, ProviderModel>();
  const profiles: MediaProfile[] = [];
  for (const operation of ["image", "video"] as const) {
    for (const { command, label } of commands[operation]) {
      for (const entry of modelEntries(body, command)) {
        if (!safeModel(entry.model)) continue;
        const model = entry.model;
        const options: MediaOption[] = [];
        let unsupportedCount = false;
        for (const raw of Array.isArray(entry.arguments) ? entry.arguments : []) {
          if (!raw || typeof raw !== "object") continue;
          const arg = raw as Record<string, unknown>;
          if (!safeName(arg.name) || ["prompt", "model", "input", "image", "video", "poll", "quiet"].includes(arg.name)) continue;
          const rawValues = arg.allowedValues ?? arg.allowed_values;
          const values = Array.isArray(rawValues) && rawValues.every(primitive) ? rawValues : undefined;
          const count = outputCount(arg.name);
          if (count && values?.length && !values.some((value) => String(value) === "1")) {
            unsupportedCount = true;
            continue;
          }
          options.push({
            id: arg.name,
            label: typeof arg.description === "string" && arg.description.length <= 160 ? `${arg.name} · ${arg.description}` : arg.name,
            type: "string",
            ...(count ? { values: ["1"], default: "1" } : {
              ...(values?.length ? { values: values.map(String) } : {}),
              ...(primitive(arg.default) ? { default: String(arg.default) } : {}),
            }),
            ...(arg.required === true ? { required: true } : {}),
          });
        }
        const slots: MediaSlot[] = [];
        let unsupportedRequired = false;
        for (const raw of Array.isArray(entry.inputs) ? entry.inputs : []) {
          if (!raw || typeof raw !== "object") continue;
          const slot = raw as Record<string, unknown>;
          if (!safeName(slot.name)) { if (slot.required === true) unsupportedRequired = true; continue; }
          const name = slot.name;
          const type = command === "image_to_image" || command === "image_to_video" || /image|frame/i.test(name) ? "image" : /video/i.test(name) ? "video" : null;
          if (!type) { if (slot.required === true) unsupportedRequired = true; continue; }
          slots.push({
            id: name,
            label: typeof slot.description === "string" && slot.description.length <= 160 ? `${name} · ${slot.description}` : name,
            type,
            max: 1,
            ...(slot.required === true ? { min: 1 } : {}),
            ...(/tail|last|end/i.test(name) ? { roles: ["end" as const] } : /first|start|head/i.test(name) ? { roles: ["start" as const] } : type === "video" ? { roles: ["motion" as const] } : {}),
          });
        }
        if (unsupportedRequired || unsupportedCount || ((command === "image_to_image" || command === "image_to_video") && slots.length === 0)) continue;
        const known = modelMap.get(model);
        if (known && !known.operations.includes(operation)) known.operations.push(operation);
        else if (!known) modelMap.set(model, { id: model, label: typeof entry.alias === "string" && entry.alias.trim() ? entry.alias : model, operations: [operation] });
        profiles.push({ model, mode: command, label, operation, options, slots, ...((command === "image_to_image" || command === "image_to_video") ? { requiresMedia: true } : {}) });
      }
    }
  }
  return { models: [...modelMap.values()], profiles };
}

type Catalog = ReturnType<typeof klingCatalog>;
let cachedCatalog: { identity: string; expires: number; catalog: Catalog } | undefined;
let pendingCatalog: { identity: string | null; result: Promise<Catalog> } | undefined;

async function credentialIdentity(): Promise<string | null> {
  try {
    const info = await stat(path.join(os.homedir(), ".kling", ".credentials"));
    return `${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
  } catch {
    return null;
  }
}

async function currentCatalog(): Promise<Catalog> {
  const identity = await credentialIdentity();
  if (identity && cachedCatalog?.identity === identity && cachedCatalog.expires > Date.now())
    return cachedCatalog.catalog;
  if (pendingCatalog?.identity === identity) return pendingCatalog.result;
  const result = (async () => {
    const result = await invoke(["who_am_i"], 12_000);
    const catalog = klingCatalog(result);
    const currentIdentity = await credentialIdentity();
    if (identity && !currentIdentity) throw new Error("Kling 로그인 상태가 변경됐습니다.");
    if (currentIdentity && currentIdentity === identity)
      cachedCatalog = { identity: currentIdentity, expires: Date.now() + 30_000, catalog };
    return catalog;
  })();
  pendingCatalog = { identity, result };
  try {
    return await result;
  } finally {
    if (pendingCatalog?.result === result) pendingCatalog = undefined;
  }
}

export async function klingProfiles(model: string, operation: MediaOperation): Promise<MediaProfile[]> {
  if (!safeModel(model)) throw new Error("Kling 모델을 확인해 주세요.");
  return (await currentCatalog()).profiles.filter((profile) => profile.model === model && profile.operation === operation);
}

export function resultUrl(value: unknown): string | null {
  const works = findValue(value, "works");
  if (!Array.isArray(works) || !works.length) return null;
  const first = works[0];
  if (!first || typeof first !== "object") return null;
  const url = first.urlWithoutWatermark || first.url;
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      !/(^|\.)(klingai\.com|kling\.ai)$/.test(parsed.hostname)
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

export async function klingInfo(): Promise<ProviderInfo> {
  let available = false;
  let models: ProviderModel[] = [];
  let account: ProviderInfo["account"];
  try {
    const [catalog, accountResult] = await Promise.all([currentCatalog(), invoke(["account"], 12_000).catch(() => null)]);
    models = catalog.models;
    if (accountResult) account = parseProviderAccount("kling", accountResult);
    available = true;
  } catch {
    /* login or network unavailable */
  }
  return {
    id: "kling",
    label: "Kling",
    operations: ["image", "video"],
    available,
    detail: available ? "Kling 계정 연결됨" : "Kling CLI 로그인 필요",
    billing: "Kling 개인 계정 유료 크레딧",
    website: "https://kling.ai",
    models,
    account,
  };
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok || !response.body)
    throw new Error("Kling 결과 파일을 가져오지 못했습니다.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_MEDIA_BYTES)
        throw new Error("Kling 결과가 64 MiB를 초과했습니다.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}

export function klingReferences(input: RunInput) {
  const references = input.references.filter((reference) => reference.asset);
  for (const reference of input.references) {
    if (
      reference.role === "start" &&
      (input.operation !== "video" || reference.asset?.type !== "image")
    )
      throw new Error("Kling 시작 프레임에는 영상 작업의 이미지가 필요합니다.");
    if (reference.role === "end" || reference.role === "motion")
      throw new Error(
        `Kling은 ${reference.role} 역할의 미디어를 지원하지 않습니다.`,
      );
    if (
      reference.asset &&
      reference.role &&
      reference.role !== "context" &&
      reference.role !== "start"
    )
      throw new Error(
        `Kling은 ${reference.role} 역할의 미디어를 지원하지 않습니다.`,
      );
  }
  if (references.some((reference) => reference.asset?.type !== "image"))
    throw new Error("Kling 참조에는 이미지만 사용할 수 있습니다.");
  if (input.operation === "video" && references.length > 1)
    throw new Error("Kling 영상은 첫 프레임 이미지 하나를 지원합니다.");
  return references.map((reference) => reference.asset!);
}

export async function executeKling(
  input: RunInput,
  onSubmitted: (id: string) => Promise<void>,
  prompt: string,
  selection?: { profile: MediaProfile; resolved: ResolvedMedia },
): Promise<RunResult> {
  if (input.operation !== "image" && input.operation !== "video")
    throw new Error("Kling은 이미지와 영상을 지원합니다.");
  let args: string[];
  if (selection) {
    const { profile, resolved } = selection;
    if (profile.model !== input.model || profile.operation !== input.operation)
      throw new Error("Kling 모델과 작업 설정이 일치하지 않습니다.");
    args = klingArguments(profile, resolved, prompt);
  } else {
    const references = klingReferences(input);
    const command =
      input.operation === "image"
        ? references.length ? "image_to_image" : "text_to_image"
        : references.length ? "image_to_video" : "text_to_video";
    const model = input.operation === "image" ? "kling-image-v3_0" : "kling-video-v4_0";
    const capabilities = await invoke(["who_am_i", "--tools", command]);
    if (!modelEntries(capabilities, command).some((item) => item.model === model))
      throw new Error("현재 계정에서 기본 Kling 모델을 확인하지 못했습니다. 공식 앱의 사용 가능 모델을 확인하세요.");
    args = [command, "--model", model];
    for (const asset of references) args.push("--image", localAssetPath(asset));
    if (input.operation === "image") args.push("--imageCount", "1");
    else args.push("--duration", "5");
    args.push(`--prompt=${prompt}`);
  }
  const submitted = await invoke(args, 120_000);
  const id =
    findValue(submitted, "generationId") ??
    findValue(submitted, "generation_id");
  if (typeof id !== "string" || !/^[\w-]{1,128}$/.test(id))
    throw new Error(
      "Kling 작업 번호를 확인하지 못했습니다. 재시도 전에 Kling에서 작업 상태를 확인하세요.",
    );
  try {
    await onSubmitted(id);
  } catch {
    throw new Error(
      `Kling 작업 ${id}의 번호를 이력에 저장하지 못했습니다. Kling에서 상태를 확인하세요.`,
    );
  }
  let result: unknown;
  try {
    result = await invoke(["query_tasks", id, "--poll", "1200"], 1_210_000);
  } catch {
    throw new Error(
      `Kling 작업 ${id}의 결과를 확인하지 못했습니다. Kling에서 상태를 확인하세요.`,
    );
  }
  const url = resultUrl(result);
  if (!url)
    throw new Error(
      `Kling 작업 ${id}의 결과 파일을 확인하지 못했습니다. Kling에서 상태를 확인하세요.`,
    );
  const asset = await storeMedia(
    await download(url),
    input.operation === "image" ? "kling-image" : "kling-video",
  );
  if (asset.type !== input.operation)
    throw new Error("Kling이 요청과 다른 형식의 결과를 반환했습니다.");
  return { asset };
}

/** 명시적 슬롯 이름을 사용해 생략된 슬롯이 다른 이미지로 채워지지 않게 한다. */
export function klingArguments(profile: MediaProfile, resolved: ResolvedMedia, prompt: string): string[] {
  if (!commands[profile.operation].some((item) => item.command === profile.mode) || !safeModel(profile.model))
    throw new Error("지원하지 않는 Kling 모델 또는 작업입니다.");
  const args = [profile.mode, "--model", profile.model, `--prompt=${prompt}`];
  const options = new Map(profile.options.map((option) => [option.id, option]));
  for (const [key, value] of Object.entries(resolved.options)) {
    const option = options.get(key);
    if (!option || !safeName(key) || !primitive(value) || (outputCount(key) && String(value) !== "1") || (option.values && !option.values.includes(value)))
      throw new Error("Kling 모델의 생성 설정을 확인해 주세요.");
    args.push(`--${key}=${String(value)}`);
  }
  for (const option of profile.options) {
    if (outputCount(option.id) && !(option.id in resolved.options))
      args.push(`--${option.id}=1`);
  }
  const slots = new Map(profile.slots.map((slot) => [slot.id, slot]));
  for (const [key, assets] of Object.entries(resolved.media)) {
    const slot = slots.get(key);
    if (!slot || !safeName(key) || !Array.isArray(assets) || assets.length > slot.max || assets.some((asset) => asset.type !== slot.type))
      throw new Error("Kling 모델의 참조 슬롯을 확인해 주세요.");
    for (const asset of assets) args.push("--input", `${key}=${localAssetPath(asset)}`);
  }
  for (const slot of profile.slots) {
    if ((resolved.media[slot.id]?.length ?? 0) < (slot.min ?? 0))
      throw new Error(`Kling 필수 참조 ${slot.label}을 첨부해 주세요.`);
  }
  return args;
}
