import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { localAssetPath, MAX_MEDIA_BYTES, storeMedia } from "./media";
import { TopviewOAuth, TOPVIEW_URL } from "./topview-auth";
import type { MediaOperation, MediaProfile, MediaValue, ResolvedMedia } from "./media-model-types";
import { providerModelId } from "./media-model-types";
import type { Asset, ProviderInfo, RunInput, RunResult } from "./types";
import { parseProviderAccount } from "./provider-account";

type ObjectValue = Record<string, unknown>;
const obj = (v: unknown): ObjectValue => v && typeof v === "object" && !Array.isArray(v) ? v as ObjectValue : {};
const scalar = (v: unknown): v is MediaValue => typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));
const taskModes: Record<MediaOperation, string[]> = { image: ["text_to_image", "image_edit"], video: ["text_to_video", "image_to_video", "omni_reference"] };
const labels: Record<string, string> = { text_to_image: "텍스트로 이미지", image_edit: "이미지 편집", text_to_video: "텍스트로 영상", image_to_video: "이미지로 영상", omni_reference: "복합 참조 영상" };
const optionLabels: Record<string, string> = {
  aspectRatio: "화면비",
  duration: "길이 (초)",
  resolution: "해상도",
  quality: "품질",
  omniReferenceTaskType: "참조 처리 방식",
};
const countField = (id: string) => /^(generateCount|generatingCount|imageCount|videoCount|batchSize|batch_size|count|numOutputs|num_images|num_videos)$/i.test(id);
const timedFetch: typeof fetch = (url, init) => fetch(url, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) });

async function connect() {
  const provider = new TopviewOAuth();
  if (!(await provider.tokens())) throw new Error("Topview 계정 연결이 필요합니다.");
  const client = new Client({ name: "scene-room", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(TOPVIEW_URL), { authProvider: provider, fetch: timedFetch }), { timeout: 20_000, signal: AbortSignal.timeout(20_000) });
  return client;
}

async function call(client: Client, name: string, req: ObjectValue): Promise<unknown> {
  const result = await client.callTool({ name, arguments: { req } }, undefined, { timeout: 30_000 });
  if (result.isError) throw new Error(`Topview ${name} 요청을 처리하지 못했습니다.`);
  if (result.structuredContent) return checkResponse(result.structuredContent);
  for (const item of Array.isArray(result.content) ? result.content : []) {
    if (item.type === "text" && typeof item.text === "string") {
      if (item.text.length > 2_000_000) throw new Error("Topview 응답이 너무 큽니다.");
      let parsed: unknown;
      try { parsed = JSON.parse(item.text); } catch { continue; }
      return checkResponse(parsed);
    }
  }
  throw new Error(`Topview ${name} 응답을 확인하지 못했습니다.`);
}

function checkResponse(value: unknown): unknown {
  const data = obj(value);
  const code = data.code;
  if (data.success === false || ((typeof code === "string" || typeof code === "number") && !["0", "200"].includes(String(code)))) {
    const reason = String(code) === "4100" ? "크레딧이 부족합니다." : "요청을 처리하지 못했습니다.";
    throw new Error(`Topview ${reason}`);
  }
  return value;
}

function find(value: unknown, key: string, depth = 0): unknown {
  if (depth > 8 || !value || typeof value !== "object") return undefined;
  if (!Array.isArray(value) && key in value) return (value as ObjectValue)[key];
  for (const nested of Object.values(value)) {
    const result = find(nested, key, depth + 1);
    if (result !== undefined) return result;
  }
}

function modelEntries(value: unknown): ObjectValue[] {
  const models = find(value, "models");
  return Array.isArray(models) ? models.map(obj).filter((model) => typeof model.submitModel === "string") : [];
}

function modelOptions(model: ObjectValue): MediaProfile["options"] {
  const choices = obj(model.submitParameterOptions);
  const defaults = obj(model.defaultSubmitParameters);
  const required = Array.isArray(model.requiredSubmitFields) ? model.requiredSubmitFields : [];
  const skip = new Set(["model", "prompt", "taskType", "boardId", "firstFrameFileId", "endFrameFileId", "inputImageFileIds", "referenceImageFileIds", "inputImages", "inputVideos"]);
  const options: MediaProfile["options"] = [];
  const fields = new Set([...Object.keys(choices), ...Object.keys(defaults)]);
  for (const id of fields) {
    const entry = choices[id];
    if (skip.has(id) || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(id)) continue;
    const spec = obj(entry);
    const raw = Array.isArray(entry) ? entry : Array.isArray(spec.values) ? spec.values : Array.isArray(spec.options) ? spec.options : [];
    let values = raw.map((value) => scalar(value) ? value : obj(value).value).filter(scalar);
    let initial = defaults[id];
    if (countField(id)) {
      if (values.length && !values.some((value) => value === 1 || value === "1")) continue;
      const one = values.includes("1") || initial === "1" ? "1" : 1;
      values = [one];
      initial = one;
    }
    const example = values[0] ?? initial;
    if (!scalar(example)) continue;
    options.push({ id, label: Object.hasOwn(optionLabels, id) ? optionLabels[id] : id, type: typeof example === "boolean" ? "boolean" : typeof example === "number" ? Number.isInteger(example) ? "integer" : "number" : "string", ...(values.length ? { values } : {}), ...(scalar(initial) ? { default: initial } : {}), ...(required.includes(id) || countField(id) ? { required: true } : {}) });
  }
  return options;
}

function slots(mode: string, model: ObjectValue): MediaProfile["slots"] {
  if (mode === "image_edit") return [{ id: "inputImageFileIds", label: "참조 이미지", type: "image", min: 1, max: 12 }];
  if (mode === "image_to_video") {
    const capabilities = obj(model.capabilities);
    const modeOptions = Array.isArray(model.inputModes)
      ? model.inputModes
      : [model.inputImageMode];
    const startEnd = capabilities.supportsStartEndFrame === true || modeOptions.includes("startEndFrame");
    const single = capabilities.supportsSingleImage === true || modeOptions.includes("singleImage");
    const multiple = capabilities.supportsMultiImage === true || modeOptions.includes("multiImage");
    if (multiple && !startEnd && !single)
      return [{
        id: "referenceImageFileIds", label: "참조 이미지", type: "image",
        min: capabilities.isInputImagesOptional === true ? 0 : 1, max: 12, roles: ["context"],
      }];
    const frames: MediaProfile["slots"] = [{
      id: "firstFrameFileId", label: single && !startEnd ? "입력 이미지" : "시작 프레임",
      type: "image", min: 1, max: 1, roles: ["start", "context"],
    }];
    if (startEnd)
      frames.push({ id: "endFrameFileId", label: "끝 프레임", type: "image", max: 1, roles: ["end"] });
    return frames;
  }
  if (mode === "omni_reference") return [{ id: "inputImages", label: "참조 이미지", type: "image", max: 8 }, { id: "inputVideos", label: "참조 영상", type: "video", max: 4 }];
  return [];
}

export function parseTopviewProfiles(config: unknown, model: string, operation: MediaOperation, mode: string): MediaProfile[] {
  return modelEntries(config).filter((item) => item.submitModel === model).flatMap((item) => {
    const options = modelOptions(item);
    const mediaSlots = slots(mode, item);
    const countFields = new Set([...Object.keys(obj(item.submitParameterOptions)), ...Object.keys(obj(item.defaultSubmitParameters))].filter(countField));
    if ([...countFields].some((field) => !options.some((option) => option.id === field))) return [];
    const supported = new Set(["model", "prompt", "taskType", "boardId", ...options.map((option) => option.id), ...mediaSlots.map((slot) => slot.id)]);
    // Current config repeats a generic first-frame requirement for multi-image
    // models; the tool contract uses referenceImageFileIds for that input mode.
    if (mediaSlots.some((slot) => slot.id === "referenceImageFileIds"))
      supported.add("firstFrameFileId");
    if (Array.isArray(item.requiredSubmitFields) && item.requiredSubmitFields.some((field) => typeof field !== "string" || !supported.has(field))) return [];
    return [{ model, operation, mode, label: labels[mode] ?? mode, options, slots: mediaSlots, ...(mode === "omni_reference" ? { requiresMedia: true } : {}) }];
  });
}

async function config(client: Client, operation: MediaOperation, mode: string) {
  return call(client, "topview_get_generation_config", { type: operation, taskType: mode, refresh: true });
}

type ConfigResult = { operation: MediaOperation; mode: string; response: unknown };
let cache: { key: string; until: number; results: ConfigResult[]; total: number } | undefined;
let pending: { key: string; promise: Promise<NonNullable<typeof cache>> } | undefined;

async function catalog(): Promise<NonNullable<typeof cache>> {
  const token = (await new TopviewOAuth().tokens())?.access_token;
  if (!token) throw new Error("Topview 계정 연결이 필요합니다.");
  const key = createHash("sha256").update(token).digest("hex");
  if (cache?.key === key && cache.until > Date.now()) return cache;
  if (pending?.key === key) return pending.promise;
  const promise = (async () => {
    const client = await connect();
    try {
      const requests = (["image", "video"] as const).flatMap((operation) =>
        taskModes[operation].map(async (mode) => ({ operation, mode, response: await config(client, operation, mode) })),
      );
      const responses = await Promise.allSettled(requests);
      const results = responses.flatMap((response) => response.status === "fulfilled" ? [response.value] : []);
      if (!results.length) throw new Error("Topview 모델 설정을 확인하지 못했습니다.");
      const current = { key, until: Date.now() + 30_000, results, total: requests.length };
      cache = current;
      return current;
    } finally { await client.close().catch(() => {}); }
  })();
  pending = { key, promise };
  try { return await promise; }
  finally { if (pending?.promise === promise) pending = undefined; }
}

export async function topviewInfo(): Promise<ProviderInfo> {
  const base: ProviderInfo = { id: "topview", label: "TopView", operations: ["image", "video"], available: false, detail: "Topview 계정 연결이 필요합니다.", billing: "Topview MCP 사용량", website: "https://www.topview.ai" };
  try {
    const currentCatalog = await catalog();
    const models = new Map<string, { id: string; label: string; operations: MediaOperation[] }>();
    for (const response of currentCatalog.results) {
        for (const entry of modelEntries(response.response)) {
          const id = entry.submitModel;
          if (!providerModelId("topview", id)) continue;
          if (!parseTopviewProfiles(response.response, id, response.operation, response.mode).length) continue;
          const current = models.get(id) ?? { id, label: typeof entry.displayName === "string" ? entry.displayName : id, operations: [] };
          if (!current.operations.includes(response.operation)) current.operations.push(response.operation);
          models.set(id, current);
        }
    }
    let account: ProviderInfo["account"];
    try {
      const client = await connect();
      try { account = parseProviderAccount("topview", await call(client, "topview_get_credit", {})); }
      finally { await client.close().catch(() => {}); }
    } catch { /* The model catalog can remain available when balance lookup fails. */ }
    return { ...base, available: true, detail: currentCatalog.results.length < currentCatalog.total ? "Topview 계정 연결됨 · 일부 작업 설정을 확인하지 못했습니다." : "Topview 계정 연결됨", models: [...models.values()], account };
  } catch { return base; }
}

export async function topviewProfiles(model: string, operation: MediaOperation): Promise<MediaProfile[]> {
  const currentCatalog = await catalog();
  return currentCatalog.results.filter((result) => result.operation === operation).flatMap((result) => parseTopviewProfiles(result.response, model, operation, result.mode));
}

function trustedFileUrl(value: unknown): URL {
  if (typeof value !== "string") throw new Error("Topview 파일 주소를 확인하지 못했습니다.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port || !/(^|\.)(topview\.ai|amazonaws\.com|cloudfront\.net)$/.test(url.hostname)) throw new Error("Topview 파일 주소를 확인하지 못했습니다.");
  return url;
}

async function upload(client: Client, asset: Asset): Promise<string> {
  const file = localAssetPath(asset);
  const info = await stat(file);
  if (!info.isFile() || info.size < 1 || info.size > MAX_MEDIA_BYTES) throw new Error("참조 파일 크기를 확인해 주세요.");
  const format = path.extname(file).slice(1).toLowerCase();
  const credential = await call(client, "ta_upload_credential", { format });
  const fileId = find(credential, "fileId");
  const uploadUrl = trustedFileUrl(find(credential, "uploadUrl"));
  const required = obj(find(credential, "requiredHeaders"));
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(required)) if (typeof value === "string" && /^(content-type|x-amz-[a-z0-9-]+)$/i.test(key)) headers[key] = value;
  if (typeof fileId !== "string" || !fileId || fileId.length > 512) throw new Error("Topview 업로드 식별자를 확인하지 못했습니다.");
  const response = await fetch(uploadUrl, { method: "PUT", headers, body: await readFile(file), redirect: "error", signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error("Topview 참조 파일 업로드에 실패했습니다.");
  const check = await call(client, "ta_upload_check_file", { fileId });
  if (check !== true && check !== "true" && find(check, "success") !== true && find(check, "exists") !== true && find(check, "data") !== true) throw new Error("Topview 참조 파일을 확인하지 못했습니다.");
  return fileId;
}

async function download(value: unknown): Promise<Uint8Array> {
  const response = await fetch(trustedFileUrl(value), { redirect: "error", signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error("Topview 결과를 가져오지 못했습니다.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try { while (true) { const { done, value: chunk } = await reader.read(); if (done) break; size += chunk.length; if (size > MAX_MEDIA_BYTES) throw new Error("Topview 결과가 64 MiB를 초과했습니다."); chunks.push(chunk); } }
  finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}

export async function executeTopview(input: RunInput, profile: MediaProfile, resolved: ResolvedMedia, prompt: string, onSubmitted: (id: string) => Promise<void>): Promise<RunResult> {
  const client = await connect();
  try {
    return await executeTopviewSession(input, profile, resolved, prompt, onSubmitted, {
      call: (name, req) => call(client, name, req),
      upload: (asset) => upload(client, asset),
      wait: () => delay(10_000),
      result: async (url) => storeMedia(await download(url), input.operation === "image" ? "topview-image" : "topview-video", input.operation as "image" | "video"),
    });
  } finally { await client.close().catch(() => {}); }
}

export async function executeTopviewSession(
  input: RunInput, profile: MediaProfile, resolved: ResolvedMedia, prompt: string,
  onSubmitted: (id: string) => Promise<void>,
  session: { call: (name: string, req: ObjectValue) => Promise<unknown>; upload: (asset: Asset) => Promise<string>; wait: () => Promise<void>; result: (url: unknown) => Promise<Asset> },
): Promise<RunResult> {
    const boardResult = await session.call("topview_list_boards", { pageNo: 1, pageSize: 20, mode: "editable-by-me" });
    const candidate = find(boardResult, "boards") ?? find(boardResult, "list");
    const boards = Array.isArray(candidate) ? candidate.map(obj) : [];
    const board = boards.find((item) => item.isSystemDefault === true) ?? boards.find((item) => item.name === "My First Board") ?? boards[0];
    const created = board ? undefined : await session.call("topview_create_board", { name: "Omni AI Canvas" });
    const boardId = board?.boardId ?? board?.id ?? find(created, "boardId");
    if (typeof boardId !== "string" || !boardId) throw new Error("Topview에서 사용할 보드를 찾지 못했습니다.");
    const params = await buildTopviewRequest(profile, resolved, prompt, boardId, session.upload);
    const result = await session.call(input.operation === "image" ? "topview_generate_image" : "topview_generate_video", params);
    const id = find(result, "taskId");
    if (typeof id !== "string" || !/^[\w-]{1,128}$/.test(id)) throw new Error("Topview 작업 번호를 확인하지 못했습니다. Topview에서 작업 상태를 확인하세요.");
    await onSubmitted(id);
    for (let attempt = 0; attempt < 120; attempt++) {
      await session.wait();
      const task = await session.call("topview_query_task", { taskType: profile.mode, taskId: id, needCloudFrontUrl: true });
      const status = find(task, "status");
      if (status === "fail" || status === "failed") throw new Error(`Topview 작업 ${id}이 실패했습니다. Topview에서 상세 상태를 확인하세요.`);
      if (status === "success") {
        const outputs = find(task, input.operation === "image" ? "images" : "videos");
        const successful = Array.isArray(outputs) ? outputs.map(obj).find((item) => String(item.status).toLowerCase() === "success" && typeof item.filePath === "string") : undefined;
        const url = successful?.filePath;
        return { asset: await session.result(url) };
      }
    }
    throw new Error(`Topview 작업 ${id}의 결과를 아직 확인하지 못했습니다. 같은 작업 번호로 상태를 확인하세요.`);
}

export async function buildTopviewRequest(profile: MediaProfile, resolved: ResolvedMedia, prompt: string, boardId: string, uploadAsset: (asset: Asset) => Promise<string>): Promise<ObjectValue> {
    const params: ObjectValue = { taskType: profile.mode, model: profile.model, prompt, boardId, ...resolved.options };
    for (const [id, value] of Object.entries(resolved.options)) if (countField(id) && value !== 1 && value !== "1") throw new Error("Topview 생성 수량은 한 개만 지원합니다.");
    for (const option of profile.options) if (countField(option.id)) params[option.id] = option.default;
    for (const [slot, assets] of Object.entries(resolved.media)) {
      if (!assets.length) continue;
      const ids: string[] = [];
      for (const asset of assets) ids.push(await uploadAsset(asset));
      if (slot === "firstFrameFileId" || slot === "endFrameFileId") params[slot] = ids[0];
      else if (slot === "inputImages" || slot === "inputVideos") params[slot] = ids.map((fileId, index) => ({ fileId, name: `${slot === "inputImages" ? "Image" : "Video"}${index + 1}` }));
      else params[slot] = ids;
    }
    return params;
}
