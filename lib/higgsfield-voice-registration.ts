import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { isAsset, localAssetPath } from "./media";
import { uuid } from "./http";
import { resultData } from "./higgsfield-elements";
import { registerCharacterAsset } from "./character-registration-receipt";
import type { Asset } from "./types";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

type Voice = { id: string; type: "element"; status: "training" | "ready" | "failed" };
export type VoiceRegistration = { nodeId: string; name: string; asset: Asset; retryConfirmed: boolean };
type Tool = { name: string; inputSchema: { properties?: Record<string, unknown>; required?: string[] } };

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function parseVoiceRegistration(value: unknown): VoiceRegistration | null {
  const item = record(value);
  if (!item || item.confirmed !== true || item.consent !== true || typeof item.nodeId !== "string" || !item.nodeId.trim() ||
      item.nodeId.length > 200 || typeof item.name !== "string" || !item.name.trim() || item.name.trim().length > 80 ||
      !isAsset(item.asset) || item.asset.type !== "audio") return null;
  return { nodeId: item.nodeId, name: item.name.trim(), asset: item.asset, retryConfirmed: item.retryConfirmed === true };
}

function schemaCompatible(tool: Tool | undefined, needed: string[], allowedRequired: string[]) {
  if (!tool) return false;
  const properties = tool.inputSchema.properties ?? {};
  return needed.every((key) => stringSchemas(properties[key]).length > 0) &&
    (tool.inputSchema.required ?? []).every((key) => allowedRequired.includes(key));
}

function stringSchemas(value: unknown): Record<string, unknown>[] {
  const schema = record(value);
  if (!schema) return [];
  if (schema.type === "string" || (Array.isArray(schema.type) && schema.type.includes("string"))) return [schema];
  const choices = schema.anyOf ?? schema.oneOf;
  return Array.isArray(choices) ? choices.flatMap(stringSchemas) : [];
}

function accepts(tool: Tool | undefined, key: string, value: string) {
  return stringSchemas(tool?.inputSchema.properties?.[key]).some((property) =>
    (!Array.isArray(property.enum) || property.enum.includes(value)) &&
    (property.const === undefined || property.const === value));
}

export function voiceToolsAvailable(tools: Tool[]): boolean {
  const get = (name: string) => tools.find((tool) => tool.name === name);
  return schemaCompatible(get("media_upload"), ["filename", "content_type", "method"], ["filename", "content_type", "method"]) &&
    schemaCompatible(get("media_confirm"), ["media_id", "type"], ["media_id", "type"]) &&
    schemaCompatible(get("create_voice_from_confirmed_audio"), ["audio_media_id", "name"], ["audio_media_id", "name"]) &&
    schemaCompatible(get("list_voices"), [], ["size"]) &&
    accepts(get("media_upload"), "method", "upload_url") && accepts(get("media_confirm"), "type", "audio");
}

export async function hasVoiceRegistrationTools(client: Client): Promise<boolean> {
  let cursor: string | undefined;
  const seen = new Set<string>();
  const tools: Tool[] = [];
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined);
    tools.push(...page.tools);
    if (voiceToolsAvailable(tools)) return true;
    cursor = page.nextCursor;
    if (cursor && seen.has(cursor)) return false;
    if (cursor) seen.add(cursor);
  } while (cursor);
  return false;
}

export function permittedUploadUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (host === "upload.higgsfield.ai" || /^[a-z0-9-]*higgsfield[a-z0-9-]*\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(host));
  } catch { return false; }
}

export function providerVoice(value: unknown): Voice | null {
  const item = record(value);
  if (!item) return null;
  const nested = record(item.voice) ?? record(item.element);
  if (nested) return providerVoice(nested);
  const id = item.voice_id ?? item.id;
  if (!uuid(id)) return null;
  const status = item.status === "failed" || item.status === "voice_clone_failed" ? "failed"
    : item.status === "completed" && item.is_audio_eligible === true ? "ready" : "training";
  return { id, type: "element", status };
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await client.callTool({ name, arguments: args });
  if (!("content" in response) || !Array.isArray(response.content)) throw new Error("Higgsfield의 응답을 확인하지 못했습니다.");
  const result = resultData({ content: response.content, structuredContent: response.structuredContent, isError: response.isError === true });
  if (result.error) throw new Error("Higgsfield가 요청을 처리하지 못했습니다. 계정과 작업 상태를 확인해 주세요.");
  return result;
}

export async function createProviderVoice(client: Client, registration: VoiceRegistration, put: typeof fetch = fetch): Promise<Voice> {
  if (!await hasVoiceRegistrationTools(client)) throw new Error("연결된 Higgsfield MCP가 음성 등록을 지원하지 않습니다. Higgsfield Audio에서 등록해 주세요.");
  const file = localAssetPath(registration.asset);
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 11 * 1024 * 1024)
    throw new Error("목소리 샘플은 11 MiB 이하의 MP3 또는 WAV 파일이어야 합니다.");
  const bytes = await readFile(file);
  const mime = registration.asset.url.endsWith(".mp3") ? "audio/mpeg" : "audio/wav";
  const upload = await call(client, "media_upload", { filename: path.basename(file), content_type: mime, method: "upload_url" });
  const slot = Array.isArray(upload.uploads) ? record(upload.uploads[0]) : undefined;
  if (!slot || !uuid(slot.media_id) || !permittedUploadUrl(slot.upload_url) || slot.content_type !== mime || String(slot.method).toUpperCase() !== "PUT")
    throw new Error("Higgsfield의 업로드 주소를 확인할 수 없습니다. Higgsfield Audio에서 등록해 주세요.");
  const response = await put(slot.upload_url, { method: "PUT", headers: { "Content-Type": mime }, body: bytes,
    redirect: "error", signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error("목소리 샘플 업로드를 완료하지 못했습니다.");
  const confirmed = await call(client, "media_confirm", { media_id: slot.media_id, type: "audio" });
  const results = Array.isArray(confirmed.results) ? confirmed.results : [];
  if (!results.some((entry) => { const item = record(entry); return item?.media_id === slot.media_id && ["uploaded", "confirmed", "completed"].includes(String(item?.status)); }))
    throw new Error("Higgsfield에서 목소리 샘플을 확인하지 못했습니다.");
  const created = await call(client, "create_voice_from_confirmed_audio", { audio_media_id: slot.media_id, name: registration.name });
  const voice = providerVoice(created);
  if (!voice) throw new Error("목소리 등록 응답을 확인하지 못했습니다. 중복 등록 전에 Higgsfield의 목소리 목록을 확인해 주세요.");
  return voice;
}

export async function findProviderVoice(client: Client, id: string): Promise<Voice | null> {
  if (!await hasVoiceRegistrationTools(client)) throw new Error("연결된 Higgsfield MCP가 음성 등록을 지원하지 않습니다.");
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const result = await call(client, "list_voices", { ...(cursor ? { cursor } : {}), size: 100 });
    const voices = Array.isArray(result.voices) ? result.voices : Array.isArray(result.items) ? result.items : [];
    const found = voices.find((entry) => { const item = record(entry); return (item?.voice_id ?? item?.id) === id && (item?.voice_type ?? item?.type) === "element"; });
    if (found) return providerVoice(found);
    cursor = typeof result.next_cursor === "string" && result.next_cursor ? result.next_cursor : undefined;
    if (cursor && seen.has(cursor)) throw new Error("목소리 목록의 다음 페이지를 확인하지 못했습니다.");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return null;
}

export async function createVoiceOnce(projectId: string, registration: VoiceRegistration, submit: () => Promise<Voice>,
  directory = path.join(process.cwd(), ".scene-room", "voice-registration")): Promise<Voice> {
  return registerCharacterAsset({
    directory, projectId, nodeId: registration.nodeId, retryConfirmed: registration.retryConfirmed, pendingMs: 600_000,
    input: { name: registration.name, asset: registration.asset.url },
    inProgress: "이 캐릭터의 목소리 등록을 처리하고 있습니다.",
    reviewRequired: "이전 등록 결과를 Higgsfield 목소리 목록에서 확인해 주세요.",
    parse: (value) => {
      const item = record(value);
      const id = item?.id;
      const status = item?.status;
      return uuid(id) && item?.type === "element" && (status === "training" || status === "ready" || status === "failed")
        ? { id, type: "element", status } : null;
    },
    submit,
  });
}
