import { readSecretSync, type SecretName } from "./service-settings";
import { readFile, stat } from "node:fs/promises";
import { localAssetPath, storeMedia } from "./media";
import type { Asset, ProviderInfo, RunInput, RunResult } from "./types";

const openaiModels = [
  {
    id: "gpt-image-2.5-sunburst",
    label: "GPT Image 2.5 Sunburst",
    operations: ["image"] as const,
  },
  {
    id: "gpt-image-2.5-flare",
    label: "GPT Image 2.5 Flare",
    operations: ["image"] as const,
  },
  {
    id: "gpt-image-1.5",
    label: "GPT Image 1.5",
    operations: ["image"] as const,
  },
];
const geminiModels = [
  {
    id: "gemini-nano-banana-2.1",
    label: "Nano Banana 2.1",
    operations: ["image"] as const,
  },
  {
    id: "gemini-3.1-flash-image",
    label: "Nano Banana 2",
    operations: ["image"] as const,
  },
  {
    id: "gemini-2.5-flash-image",
    label: "Gemini 2.5 Flash Image",
    operations: ["image"] as const,
  },
];
const seedreamModel = () =>
  process.env.SEEDREAM_MODEL?.trim() || "seedream-4-5-251128";
const validModel = (value: string) => /^[A-Za-z0-9._-]{1,120}$/.test(value);
const keyAvailable = (name: SecretName) => Boolean(readSecretSync(name));

export function imageApiProviders(): ProviderInfo[] {
  const seedream = seedreamModel();
  return [
    {
      id: "openai-image",
      label: "OpenAI 이미지 API",
      operations: ["image"],
      models: openaiModels.map((item) => ({
        ...item,
        operations: [...item.operations],
      })),
      available: keyAvailable("OPENAI_API_KEY"),
      detail: keyAvailable("OPENAI_API_KEY")
        ? "API 키 설정됨 · 계정과 모델 권한은 실행 시 확인"
        : "OPENAI_API_KEY 설정 필요",
      billing: "OpenAI API 따로 결제",
      website: "https://platform.openai.com/docs/guides/image-generation",
    },
    {
      id: "gemini-image",
      label: "Gemini 이미지 API",
      operations: ["image"],
      models: geminiModels.map((item) => ({
        ...item,
        operations: [...item.operations],
      })),
      available: keyAvailable("GEMINI_API_KEY"),
      detail: keyAvailable("GEMINI_API_KEY")
        ? "API 키 설정됨 · 계정과 모델 권한은 실행 시 확인"
        : "GEMINI_API_KEY 설정 필요",
      billing: "Gemini API 따로 결제",
      website: "https://ai.google.dev/gemini-api/docs/image-generation",
    },
    {
      id: "seedream",
      label: "Seedream · BytePlus",
      operations: ["image"],
      models: [{ id: seedream, label: seedream, operations: ["image"] }],
      available: keyAvailable("ARK_API_KEY") && validModel(seedream),
      detail:
        keyAvailable("ARK_API_KEY") && validModel(seedream)
          ? "싱가포르 ModelArk 키 설정됨 · 모델 권한은 실행 시 확인"
          : "ARK_API_KEY와 모델 설정 확인 필요",
      billing: "BytePlus ModelArk 따로 결제",
      website:
        "https://docs.byteplus.com/en/docs/modelark/image-generation-api",
    },
  ];
}

type ImageReference = { bytes: Uint8Array; mime: string; label: string };

function imageMime(bytes: Uint8Array): string | null {
  const head = Buffer.from(bytes.subarray(0, 16));
  if (
    head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (head.length >= 3 && head[0] === 255 && head[1] === 216 && head[2] === 255)
    return "image/jpeg";
  if (
    head.toString("ascii", 0, 4) === "RIFF" &&
    head.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return null;
}

async function references(input: RunInput): Promise<ImageReference[]> {
  if (
    input.references.some(
      (ref) =>
        ref.role === "motion" || ref.role === "start" || ref.role === "end",
    )
  )
    throw new Error(
      "이미지 API는 동작·시작·끝 프레임 역할을 지원하지 않습니다.",
    );
  const selected = input.references.filter((ref) => ref.asset);
  if (selected.length > 4)
    throw new Error("이미지 참조는 최대 4개까지 지원합니다.");
  const result: ImageReference[] = [];
  for (const [index, reference] of selected.entries()) {
    const asset = reference.asset as Asset;
    if (asset.type !== "image" || reference.role === "motion")
      throw new Error("이 이미지 API는 영상과 동작 참조를 지원하지 않습니다.");
    const file = localAssetPath(asset);
    const info = await stat(file).catch(() => null);
    if (!info || info.size === 0 || info.size > 10 * 1024 * 1024)
      throw new Error("참조 이미지는 각각 10 MiB 이하여야 합니다.");
    const bytes = await readFile(file);
    const mime = imageMime(bytes);
    if (!mime)
      throw new Error("참조 이미지는 PNG, JPEG 또는 WebP 형식이어야 합니다.");
    result.push({
      bytes,
      mime,
      label: `참조 이미지 ${index + 1}: ${reference.title} (역할: ${reference.role ?? "context"})`,
    });
  }
  return result;
}

async function responseJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.body)
    throw new Error(
      "이미지 API 요청에 실패했습니다. 키, 모델 권한과 사용량을 확인하세요.",
    );
  const declared = Number(response.headers.get("content-length"));
  const max = 30 * 1024 * 1024;
  if (declared > max) throw new Error("이미지 API 응답이 너무 큽니다.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new Error("이미지 API 응답이 너무 큽니다.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("이미지 API 응답을 해석할 수 없습니다.");
  }
}

function decodeImage(value: unknown): Uint8Array {
  if (
    typeof value !== "string" ||
    value.length > 24 * 1024 * 1024 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw new Error("이미지 API 결과를 확인할 수 없습니다.");
  const bytes = Buffer.from(value, "base64");
  if (!bytes.length || bytes.length > 18 * 1024 * 1024 || !imageMime(bytes))
    throw new Error("이미지 API가 유효한 이미지를 반환하지 않았습니다.");
  return bytes;
}

export async function executeImageApi(input: RunInput): Promise<RunResult> {
  const provider = imageApiProviders().find(
    (item) => item.id === input.provider,
  );
  if (!provider || input.operation !== "image")
    throw new Error("이미지 API 작업을 확인해 주세요.");
  if (!provider.available)
    throw new Error("이미지 API 키 또는 모델 설정을 확인해 주세요.");
  const model = input.model ?? provider.models?.[0]?.id;
  if (!model || !provider.models?.some((item) => item.id === model))
    throw new Error("선택한 이미지 모델을 확인해 주세요.");
  const images = await references(input);
  const texts = input.references
    .filter((ref) => ref.body.trim())
    .map((ref) => `${ref.title} (역할: ${ref.role ?? "context"})\n${ref.body}`);
  const prompt = [
    input.prompt,
    ...texts,
    ...images.map((image) => image.label),
  ].join("\n\n");
  if (prompt.length > 32_000)
    throw new Error("이미지 요청과 연결된 텍스트는 32,000자 이하여야 합니다.");
  let url: string;
  let request: RequestInit;
  if (input.provider === "openai-image") {
    url = `https://api.openai.com/v1/images/${images.length ? "edits" : "generations"}`;
    if (images.length) {
      const form = new FormData();
      form.set("model", model);
      form.set("prompt", prompt);
      form.set("n", "1");
      images.forEach((image) =>
        form.append(
          "image[]",
          new Blob([Uint8Array.from(image.bytes)], { type: image.mime }),
          image.mime === "image/jpeg"
            ? "reference.jpg"
            : image.mime === "image/webp"
              ? "reference.webp"
              : "reference.png",
        ),
      );
      request = {
        method: "POST",
        headers: { Authorization: `Bearer ${readSecretSync("OPENAI_API_KEY")}` },
        body: form,
      };
    } else {
      request = {
        method: "POST",
        headers: {
          Authorization: `Bearer ${readSecretSync("OPENAI_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, prompt, n: 1 }),
      };
    }
  } else if (input.provider === "gemini-image") {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const parts: object[] = [{ text: prompt }];
    images.forEach((image) => {
      parts.push({ text: image.label });
      parts.push({
        inlineData: {
          mimeType: image.mime,
          data: Buffer.from(image.bytes).toString("base64"),
        },
      });
    });
    request = {
      method: "POST",
      headers: {
        "x-goog-api-key": readSecretSync("GEMINI_API_KEY"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          candidateCount: 1,
        },
      }),
    };
  } else {
    url = "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations";
    const refs = images.map(
      (image) =>
        `data:${image.mime};base64,${Buffer.from(image.bytes).toString("base64")}`,
    );
    request = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readSecretSync("ARK_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        response_format: "b64_json",
        ...(refs.length ? { image: refs.length === 1 ? refs[0] : refs } : {}),
      }),
    };
  }
  let data: unknown;
  try {
    data = await responseJson(
      await fetch(url, {
        ...request,
        redirect: "error",
        signal: AbortSignal.timeout(180_000),
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("이미지 API"))
      throw error;
    throw new Error(
      "이미지 API 연결에 실패했습니다. 서비스 작업 상태와 네트워크를 확인하세요.",
    );
  }
  const response = data as {
    data?: { b64_json?: string }[];
    candidates?: {
      content?: {
        parts?: {
          thought?: boolean;
          inlineData?: { data?: string; mimeType?: string };
        }[];
      };
    }[];
  };
  const encoded =
    input.provider === "gemini-image"
      ? response.candidates
          ?.flatMap((candidate) => candidate.content?.parts ?? [])
          .find(
            (part) =>
              !part.thought && part.inlineData?.mimeType?.startsWith("image/"),
          )?.inlineData?.data
      : response.data?.[0]?.b64_json;
  const asset = await storeMedia(
    decodeImage(encoded),
    `${input.provider}-image`,
  );
  return { asset };
}
