import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { localAssetPath } from "./media";
import type { ProviderModel } from "./types";
import type {
  MediaOperation,
  MediaOption,
  MediaProfile,
  MediaSlot,
  MediaValue,
  ResolvedMedia,
} from "./media-model-types";

const exec = promisify(execFile);
const cli = path.join(process.cwd(), "node_modules/.bin/higgsfield");
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

type Parameter = {
  name: string;
  type: string;
  default?: unknown;
  required?: boolean;
  enum?: unknown[];
};
type ModelSchema = {
  job_type: string;
  display_name: string;
  type: string;
  params: Parameter[];
  rules?: { cel?: string; message?: string }[];
};

async function readCli(args: string[]): Promise<unknown> {
  const { stdout } = await exec(cli, [...args, "--json"], {
    timeout: 20_000,
    maxBuffer: 8_000_000,
    env: { NODE_ENV: process.env.NODE_ENV, ...Object.fromEntries(
      ["PATH", "HOME", "USER", "TMPDIR", "LANG", "LC_ALL", "XDG_CONFIG_HOME"]
        .flatMap((key) => process.env[key] ? [[key, process.env[key]!]] : []),
    ) },
  });
  return JSON.parse(stdout);
}

export async function higgsfieldModels(): Promise<ProviderModel[]> {
  const items = await readCli(["model", "list"]);
  if (!Array.isArray(items)) throw new Error("Higgsfield 모델 목록을 읽을 수 없습니다.");
  return items.flatMap((item): ProviderModel[] => {
    if (!item || typeof item !== "object" ||
        typeof item.job_type !== "string" || !identifier.test(item.job_type) ||
        typeof item.display_name !== "string" || !item.display_name.trim() ||
        (item.type !== "image" && item.type !== "video" && !(item.type === "audio" && item.job_type === "seed_audio"))) return [];
    return [{ id: item.job_type, label: item.display_name, operations: [item.type] }];
  });
}

const optionLabels: Record<string, string> = {
  aspect_ratio: "화면비", duration: "길이 (초)", resolution: "해상도",
  quality: "품질", variant: "변형", mode: "모드", sound: "사운드",
  generate_audio: "오디오 생성", output_format: "출력 형식", background: "배경",
  dynamic_range: "다이내믹 레인지", bitrate_mode: "비트레이트", seed: "시드",
  extension_mode: "이어쓰기 방향", negative_prompt: "제외할 내용",
};
const modeLabels: Record<string, string> = {
  t2v: "텍스트로 영상 생성", "text-to-video": "텍스트로 영상 생성",
  omni_reference: "이미지·영상 참조", "reference-to-video": "이미지·영상 참조",
  "image-to-video": "이미지로 영상 생성", video_edit: "원본 영상 리메이크",
  "video-edit": "원본 영상 편집", edit: "원본 영상 편집",
  video_extension: "영상 이어쓰기",
};
const supportedMode = (mode: string) => Object.hasOwn(modeLabels, mode);

function toOption(parameter: Parameter, operation: MediaOperation): MediaOption | null {
  if (!identifier.test(parameter.name) || parameter.name === "prompt" ||
      parameter.name === "batch_size" || parameter.name === "is_inpaint" ||
      parameter.name === "draft" || parameter.name === "draft_job_id") return null;
  const base = parameter.type.split("|")[0];
  if (base !== "string" && base !== "integer" && base !== "number" && base !== "boolean") return null;
  if (base === "string" && !parameter.enum && !parameter.required &&
      parameter.name !== "negative_prompt") return null;
  let values: MediaValue[] | undefined;
  if (Array.isArray(parameter.enum)) {
    values = parameter.enum.flatMap((entry): MediaValue[] => {
      if (base === "string" && typeof entry === "string") return [entry];
      if ((base === "number" || base === "integer") &&
          (typeof entry === "number" || (typeof entry === "string" && /^-?\d+(\.\d+)?$/.test(entry)))) return [Number(entry)];
      return [];
    });
    if (parameter.name === "output_format") {
      const supportedFormats = operation === "image" ? ["png", "jpeg", "webp", "jpg"] : ["mp4", "webm"];
      values = values.filter((v) => supportedFormats.includes(String(v).toLowerCase()));
    }
    if (!values.length) return null;
  }
  const candidate = parameter.default;
  const defaultValue = typeof candidate === base ||
    (base === "integer" && typeof candidate === "number") ? candidate as MediaValue : undefined;
  return {
    id: parameter.name,
    label: optionLabels[parameter.name] ?? parameter.name.replaceAll("_", " "),
    type: base,
    ...(values ? { values } : {}),
    ...(defaultValue !== undefined && (!values || values.includes(defaultValue)) ? { default: defaultValue } : {}),
    ...(parameter.required ? { required: true } : {}),
  };
}

function referenceMax(schema: ModelSchema, name: string, fallback: number): number {
  const expression = new RegExp(`size\\(params\\.${name}\\)\\s*<=\\s*(\\d+)`);
  for (const rule of schema.rules ?? []) {
    const match = rule.cel?.match(expression);
    if (match) return Math.max(1, Math.min(Number(match[1]), 12));
  }
  return fallback;
}

function mediaSlots(schema: ModelSchema): MediaSlot[] {
  const slots: MediaSlot[] = [];
  const hasImageReferences = schema.params.some((param) =>
    ["image_references", "input_images", "image"].includes(param.name),
  );
  for (const param of schema.params) {
    const { name } = param;
    if (name === "start_image") slots.push({ id: name, label: "시작 프레임", type: "image", max: 1, ...(param.required ? { min: 1 } : {}), roles: hasImageReferences ? ["start"] : ["start", "context", "identity", "location", "prop", "look"] });
    if (name === "end_image") slots.push({ id: name, label: "끝 프레임", type: "image", max: 1, ...(param.required ? { min: 1 } : {}), roles: ["end"] });
    if (name === "image_references" || name === "input_images") slots.push({
      id: name, label: "참조 이미지", type: "image", max: referenceMax(schema, name, 8), ...(param.required ? { min: 1 } : {}),
      roles: ["context", "identity", "location", "prop", "look"],
    });
    if (name === "audio_references") slots.push({
      id: name, label: "참조 음향", type: "audio", max: referenceMax(schema, name, 3), ...(param.required ? { min: 1 } : {}), roles: ["context"],
    });
    if (name === "video_references") slots.push({
      id: name, label: "참조 영상", type: "video", max: referenceMax(schema, name, 3), ...(param.required ? { min: 1 } : {}), roles: ["motion", "context"],
    });
    if (name === "image" && !slots.some((slot) => slot.id === "image"))
      slots.push({ id: name, label: "참조 이미지", type: "image", max: 1, ...(param.required ? { min: 1 } : {}), roles: ["context", "identity", "location", "prop", "look", "start"] });
    if (name === "video") slots.push({ id: name, label: "참조 영상", type: "video", max: 1, ...(param.required ? { min: 1 } : {}), roles: ["motion", "context"] });
  }
  return slots;
}

export function higgsfieldProfilesFromSchema(schema: ModelSchema, operation: MediaOperation): MediaProfile[] {
  if (schema.type !== operation || !identifier.test(schema.job_type) || !Array.isArray(schema.params))
    throw new Error("선택한 Higgsfield 모델의 작업 유형을 확인해 주세요.");
  const params = schema.params.filter((p) => p && typeof p.name === "string" && typeof p.type === "string");
  const modeParam = params.find((p) => p.name === "mode");
  const modeValues = modeParam?.enum?.filter((v): v is string => typeof v === "string" && supportedMode(v)) ?? [];
  const nativeModes = modeValues.length > 0 && modeValues.length === modeParam?.enum?.length;
  const formatParam = params.find((param) => param.name === "output_format");
  if (formatParam && Array.isArray(formatParam.enum) && !toOption(formatParam, operation))
    throw new Error("이 모델의 출력 형식은 Omni AI Canvas에서 지원하지 않습니다.");
  const baseOptions = params.filter((p) => !(nativeModes && p.name === "mode"))
    .filter((p) => !(formatParam?.enum?.includes("gif") && ["frame_count", "frame_duration_ms"].includes(p.name)))
    .map((p) => toOption(p, operation)).filter((o): o is MediaOption => o !== null);
  const allSlots = mediaSlots(schema);
  for (const param of params) {
    if (!param.required || param.name === "prompt" || param.name === "batch_size" ||
      (nativeModes && param.name === "mode") ||
      baseOptions.some((option) => option.id === param.name) ||
      allSlots.some((slot) => slot.id === param.name)) continue;
    throw new Error(`이 모델의 필수 입력 '${param.name}'은 현재 Omni AI Canvas에서 지원하지 않습니다.`);
  }
  const modes = nativeModes ? modeValues : ["default"];
  return modes.map((mode) => {
    let slots = allSlots;
    let requiresMedia = false;
    if (["t2v", "text-to-video"].includes(mode)) slots = [];
    if (mode === "image-to-video") {
      slots = allSlots.filter((s) => s.type === "image" &&
        (schema.job_type !== "gemini_omni_flash_1_1" || s.id !== "image_references"));
      if (schema.job_type === "gemini_omni_flash_1_1")
        slots = slots.map((s) => s.id === "start_image" ? { ...s, min: 1 } : s);
      requiresMedia = true;
    }
    if (["omni_reference", "reference-to-video"].includes(mode)) {
      if (mode === "reference-to-video" && schema.job_type === "gemini_omni_flash_1_1")
        slots = allSlots.filter((s) => s.id !== "start_image" && s.id !== "end_image");
      requiresMedia = true;
    }
    if (["video_edit", "video-edit", "video_extension", "edit"].includes(mode)) {
      slots = allSlots.filter((s) => s.id === "video_references" || s.id === "video" ||
        (schema.job_type === "seedance_2_5" && s.id === "image_references"))
        .map((s) => s.type === "video" ? { ...s, min: 1, max: 1 } : s);
      requiresMedia = true;
    }
    const options = baseOptions.filter((o) => o.id !== "extension_mode" || mode === "video_extension")
      .map((o) => o.id === "extension_mode" && mode === "video_extension" ? { ...o, required: true } : o);
    return { model: schema.job_type, operation, mode, ...(params.some((param) => param.name === "custom_reference_id") ? { supportsSoulId: true } : {}), label: modeLabels[mode] ?? "기본 생성", options, slots, acceptsPrompt: params.some((param) => param.name === "prompt"), singleOutputParameter: params.some((param) => param.name === "batch_size") ? "batch_size" : undefined, ...(requiresMedia ? { requiresMedia } : {}) };
  });
}

export async function higgsfieldProfiles(model: string, operation: MediaOperation): Promise<MediaProfile[]> {
  if (!identifier.test(model)) throw new Error("Higgsfield 모델을 확인해 주세요.");
  const data = await readCli(["model", "get", model]);
  if (!data || typeof data !== "object" || !("job_type" in data) || (data as ModelSchema).job_type !== model)
    throw new Error("Higgsfield 모델 사양을 읽을 수 없습니다.");
  return higgsfieldProfilesFromSchema(data as ModelSchema, operation);
}

export function higgsfieldModelArguments(profile: MediaProfile, resolved: ResolvedMedia, prompt: string): string[] {
  if (!identifier.test(profile.model)) throw new Error("Higgsfield 모델을 확인해 주세요.");
  const args = [profile.model];
  if ((profile as MediaProfile & { acceptsPrompt?: boolean }).acceptsPrompt !== false)
    args.push(`--prompt=${prompt}`);
  if ((profile as MediaProfile & { singleOutputParameter?: string }).singleOutputParameter === "batch_size")
    args.push("--batch_size=1");
  if (profile.mode !== "default") args.push("--mode", profile.mode);
  for (const [name, value] of Object.entries(resolved.options)) {
    if (!profile.options.some((option) => option.id === name) || !identifier.test(name))
      throw new Error("지원하지 않는 Higgsfield 옵션입니다.");
    args.push(`--${name}=${String(value)}`);
  }
  for (const [name, assets] of Object.entries(resolved.media)) {
    const slot = profile.slots.find((item) => item.id === name);
    if (!slot || !identifier.test(name)) throw new Error("지원하지 않는 Higgsfield 참조입니다.");
    const flag = name === "input_images" ? "image" : name.replaceAll("_", "-");
    for (const asset of assets) {
      if (asset.type !== slot.type) throw new Error("Higgsfield 참조 유형을 확인해 주세요.");
      args.push(`--${flag}`, localAssetPath(asset));
    }
  }
  return args;
}
