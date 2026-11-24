import { readSecretSync, type SecretName } from "./service-settings";
import { storeMedia } from "./media";
import type { Asset } from "./types";
import { isTtsLanguageCode, ttsFilterValues, ttsTextLimit, type TtsCatalog, type TtsApiProvider, type TtsFilters, type TtsSynthesis, type TtsVoice } from "./tts-types";

const keys: Record<TtsApiProvider, SecretName> = {
  "fish-audio": "FISH_AUDIO_API_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
  typecast: "TYPECAST_API_KEY",
  "gemini-tts": "GEMINI_TTS_API_KEY",
};
const geminiVoices = [
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe",
  "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi",
  "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi",
  "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
];
const maxAudioBytes = 32 * 1024 * 1024;

export function providerKey(provider: TtsApiProvider) {
  return readSecretSync(keys[provider]) || (provider === "gemini-tts" ? readSecretSync("GEMINI_API_KEY") : "");
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function safePreview(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password && !url.port) return url.href;
  } catch {
    return undefined;
  }
}

async function request(url: string, init: RequestInit, fetcher: typeof fetch) {
  const result = await fetcher(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
  if (!result.ok) {
    throw new Error(`서비스 요청이 실패했습니다. 연결과 사용량을 확인해 주세요. (HTTP ${result.status})`);
  }
  return result;
}

async function readBounded(result: Response, max: number): Promise<Buffer> {
  const length = result.headers.get("content-length");
  if (length && Number(length) > max) throw new Error("서비스 응답 크기가 허용 범위를 넘었습니다.");
  if (!result.body) throw new Error("서비스의 응답이 비어 있습니다.");
  const reader = result.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new Error("서비스 응답 크기가 허용 범위를 넘었습니다.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

async function readJson(result: Response): Promise<unknown> {
  try {
    return JSON.parse((await readBounded(result, 45 * 1024 * 1024)).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("서비스의 응답을 읽을 수 없습니다.");
    throw error;
  }
}

export async function listTtsVoices(provider: TtsApiProvider, search = "", cursor = "", filters: TtsFilters = {}, pageSize = 30): Promise<TtsCatalog> {
  const key = providerKey(provider);
  if (!key) throw new Error("설정에서 해당 TTS API 키를 등록해 주세요.");
  if (provider === "gemini-tts") {
    return { voices: geminiVoices.filter((name) => name.toLowerCase().includes(search.toLowerCase()))
      .map((name) => ({ id: name, name })) };
  }

  const isFish = provider === "fish-audio";
  const isEleven = provider === "elevenlabs";
  const url = new URL(isFish ? "https://api.fish.audio/model" : isEleven
    ? "https://api.elevenlabs.io/v2/voices" : "https://api.typecast.ai/v3/voices");
  if (isFish) {
    url.searchParams.set("page_size", String(Math.max(1, Math.min(pageSize, 100))));
    url.searchParams.set("page_number", cursor || "1");
    url.searchParams.set("sort_by", filters.sort === "recent" ? "created_at" : "task_count");
    const requestedTags = new Set([
      ...ttsFilterValues(filters.gender), ...ttsFilterValues(filters.age), ...ttsFilterValues(filters.tag),
    ]);
    for (const tag of requestedTags) url.searchParams.append("tag", tag);
    for (const language of ttsFilterValues(filters.language)) url.searchParams.append("language", language);
    if (search) url.searchParams.set("title", search);
  } else if (isEleven) {
    url.searchParams.set("page_size", "30");
    if (cursor) url.searchParams.set("next_page_token", cursor);
    if (search) url.searchParams.set("search", search);
  } else {
    url.searchParams.set("model", "ssfm-v30");
  }

  const headers: Record<string, string> = isFish ? { Authorization: `Bearer ${key}` }
    : isEleven ? { "xi-api-key": key } : { "X-API-KEY": key };
  const raw = await readJson(await request(url.href, { headers }, fetch));
  const data = record(raw);
  const rows = isFish ? data?.items : isEleven ? data?.voices : Array.isArray(raw) ? raw : data?.voices;
  if (!Array.isArray(rows)) throw new Error("서비스의 목소리 목록을 읽을 수 없습니다.");

  const voices: TtsVoice[] = rows.flatMap((value: unknown) => {
    const item = record(value);
    if (!item) return [];
    const id = isFish ? item._id : item.voice_id ?? item.id;
    const localized = record(item.voice_name);
    const name = isFish ? item.title : isEleven ? item.name : localized?.kor ?? localized?.eng;
    if (typeof id !== "string" || typeof name !== "string" || !id || !name) return [];
    if (search && !isFish && !isEleven && !name.toLowerCase().includes(search.toLowerCase())) return [];
    const sample = Array.isArray(item.samples) ? record(item.samples[0]) : undefined;
    const preview = safePreview(item.preview_url ?? sample?.audio);
    const tags = isFish && Array.isArray(item.tags)
      ? item.tags.filter((tag): tag is string => typeof tag === "string" && tag.length > 0 && tag.length <= 100)
      : [];
    const gender = tags.includes("male") && !tags.includes("female") ? "male" as const
      : tags.includes("female") && !tags.includes("male") ? "female" as const : undefined;
    const languages = isFish && Array.isArray(item.languages)
      ? [...new Set(item.languages.filter(isTtsLanguageCode).map((language) => language.toLowerCase()))] : [];
    return [{
      id, name,
      ...(tags.length ? { tags } : {}),
      ...(gender ? { gender } : {}),
      ...(languages.length ? { languages } : {}),
      ...(isFish && typeof item.task_count === "number" && Number.isSafeInteger(item.task_count) && item.task_count >= 0 ? { taskCount: item.task_count } : {}),
      ...(isFish && typeof item.created_at === "string" && Number.isFinite(Date.parse(item.created_at)) ? { createdAt: item.created_at } : {}),
      ...(preview ? { previewUrl: preview } : {}),
      ...(typeof item.description === "string" ? { description: item.description.slice(0, 500) } : {}),
    }];
  });

  let nextCursor: string | undefined;
  if (provider === "typecast") {
    const offset = (Number(cursor || "1") - 1) * 30;
    const next = offset + 30 < voices.length ? String(Number(cursor || "1") + 1) : undefined;
    return { voices: voices.slice(offset, offset + 30), ...(next ? { nextCursor: next } : {}) };
  }
  if (isFish && data?.has_more === true) nextCursor = String(Number(cursor || "1") + 1);
  if (isEleven && data?.has_more === true && typeof data.next_page_token === "string") {
    nextCursor = data.next_page_token;
  }
  const tags = isFish ? [...new Set(voices.flatMap((voice) => voice.tags ?? []))].sort() : [];
  return { voices, ...(tags.length ? { tags } : {}), ...(nextCursor ? { nextCursor } : {}) };
}

export type FishVoiceReference = { audio: Buffer; text: string };

export async function fetchFishVoiceReference(voiceId: string, fetcher: typeof fetch = fetch): Promise<FishVoiceReference> {
  const key = providerKey("fish-audio");
  if (!key) throw new Error("Fish Audio 목소리의 샘플을 확인하려면 설정에서 API 키를 등록해 주세요.");
  const model = record(await readJson(await request(`https://api.fish.audio/model/${encodeURIComponent(voiceId)}`,
    { headers: { Authorization: `Bearer ${key}` } }, fetcher)));
  if (model?.dmca_taken_down === true || model?.licensed === true) {
    throw new Error("권리 제한이 있는 목소리는 로컬에서 복제할 수 없습니다. 다른 목소리를 골라 주세요.");
  }
  const samples = Array.isArray(model?.samples) ? model.samples.map(record) : [];
  for (const sample of samples) {
    const url = safePreview(sample?.audio);
    const text = typeof sample?.text === "string" ? sample.text.replace(/<\|[^>]*\|>/g, " ").trim() : "";
    if (!url || !text || text.includes("<|") || text.length > ttsTextLimit ||
        !/\.(?:fish\.audio|r2\.cloudflarestorage\.com)$/.test(new URL(url).hostname)) continue;
    const response = await request(url, {}, fetcher);
    const audio = response.body ? await readBounded(response, maxAudioBytes) : Buffer.alloc(0);
    if (audio.byteLength) return { text, audio };
  }
  throw new Error("이 목소리에는 로컬에서 참조할 공개 샘플이 없습니다. 다른 목소리를 골라 주세요.");
}

type Dependencies = {
  fetcher?: typeof fetch;
  save?: (bytes: Uint8Array, name: string, type: "audio") => Promise<Asset>;
};

export async function synthesizeTts(input: TtsSynthesis, dependencies: Dependencies = {}): Promise<Asset> {
  const key = providerKey(input.provider);
  if (!key) throw new Error("설정에서 해당 TTS API 키를 등록해 주세요.");
  const fetcher = dependencies.fetcher ?? fetch;
  const save = dependencies.save ?? storeMedia;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let url: string;
  let body: Record<string, unknown>;

  switch (input.provider) {
    case "fish-audio":
      url = "https://api.fish.audio/v1/tts";
      headers.Authorization = `Bearer ${key}`;
      headers.model = "s2.1-pro";
      body = { text: input.text, reference_id: input.voiceId, format: "mp3" };
      break;
    case "elevenlabs":
      url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.voiceId)}?output_format=mp3_44100_128`;
      headers["xi-api-key"] = key;
      body = { text: input.text, model_id: "eleven_multilingual_v2" };
      break;
    case "typecast":
      url = "https://api.typecast.ai/v1/text-to-speech";
      headers["X-API-KEY"] = key;
      body = { voice_id: input.voiceId, text: input.text, model: "ssfm-v30", output: { audio_format: "mp3" } };
      break;
    case "gemini-tts":
      if (!geminiVoices.includes(input.voiceId)) throw new Error("Gemini 목소리를 다시 선택해 주세요.");
      url = "https://generativelanguage.googleapis.com/v1beta/interactions";
      headers["x-goog-api-key"] = key;
      body = {
        model: "gemini-3.8-flash-tts",
        input: [{ type: "user_input", content: [{ type: "text", text: input.text }] }],
        response_format: { type: "audio", mime_type: "audio/wav" },
        generation_config: { speech_config: [{ voice: input.voiceId }] },
      };
      break;
  }

  const result = await request(url, { method: "POST", headers, body: JSON.stringify(body) }, fetcher);
  let bytes: Uint8Array;
  if (input.provider === "gemini-tts") {
    const data = record(await readJson(result));
    const steps = Array.isArray(data?.steps) ? data.steps : [];
    const parts = steps.flatMap((step: unknown) => {
      const item = record(step);
      return item?.type === "model_output" && Array.isArray(item.content) ? item.content : [];
    });
    const audio = parts.map(record).filter((part) => part?.type === "audio" && typeof part.data === "string").at(-1);
    if (typeof audio?.data !== "string" || audio.data.length > Math.ceil(maxAudioBytes * 4 / 3) + 4) {
      throw new Error("Gemini의 음성 결과를 확인하지 못했습니다.");
    }
    bytes = Buffer.from(audio.data, "base64");
  } else {
    bytes = await readBounded(result, maxAudioBytes);
  }
  if (!bytes.byteLength || bytes.byteLength > maxAudioBytes) throw new Error("생성된 음성 파일의 크기를 확인해 주세요.");
  return save(bytes, input.provider === "gemini-tts" ? "tts.wav" : "tts.mp3", "audio");
}
