import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { HIGGSFIELD_MCP_URL, HiggsfieldMcpOAuth } from "./higgsfield-mcp-auth";
import { uuid } from "./http";

type ElementMedia = { id: string; type: "media_input" | "image_job"; url: string };
export type ElementRequest = { name?: string; category: "auto" | "character" | "environment" | "prop"; medias: ElementMedia[] };
export function parseElementRequest(value: unknown): ElementRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.confirmed !== true || !["auto", "character", "environment", "prop"].includes(String(input.category)) ||
      (input.name !== undefined && (typeof input.name !== "string" || input.name.trim().length > 32)) ||
      !Array.isArray(input.medias) || !input.medias.length || input.medias.length > 8) return null;
  const medias: ElementMedia[] = [];
  for (const value of input.medias) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const media = value as Record<string, unknown>;
    if (!uuid(media.id) || !["media_input", "image_job"].includes(String(media.type)) || typeof media.url !== "string") return null;
    try {
      const url = new URL(media.url);
      if (url.protocol !== "https:" || url.username || url.password || url.port ||
          !(url.hostname === "higgsfield.ai" || url.hostname.endsWith(".higgsfield.ai"))) return null;
    } catch { return null; }
    medias.push({ id: media.id, type: media.type as ElementMedia["type"], url: media.url });
  }
  return { category: input.category as ElementRequest["category"], medias,
    ...(typeof input.name === "string" && input.name.trim() ? { name: input.name.trim() } : {}) };
}

export function validateElementToolSchema(tool: { inputSchema: { properties?: Record<string, unknown>; required?: string[] } }, create: boolean) {
  const properties = tool.inputSchema.properties ?? {};
  const required = tool.inputSchema.required ?? [];
  if (!create) return required.every((key) => ["action", "cursor", "size"].includes(key));
  if (!("medias" in properties) || required.some((key) => !["medias", "name", "category"].includes(key))) return false;
  const media = properties.medias as { type?: string; items?: { properties?: Record<string, unknown>; required?: string[] } };
  const items = media?.items;
  return media?.type === "array" && !!items?.properties && ["id", "url"].every((key) => key in items.properties!) &&
    (items.required ?? []).every((key) => ["id", "url", "type"].includes(key));
}

export async function useHiggsfieldMcp<T>(origin: string, action: (client: Client) => Promise<T>): Promise<T> {
  const authProvider = new HiggsfieldMcpOAuth("auth.json", `${origin}/api/providers/higgsfield-mcp/callback`);
  if (!(await authProvider.tokens())) throw new Error("Higgsfield MCP 계정을 먼저 연결해 주세요.");
  const client = new Client({ name: "scene-room", version: "1.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(HIGGSFIELD_MCP_URL), {
      authProvider,
      fetch: (url, init) => fetch(url, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) }),
    }), { timeout: 20000, signal: AbortSignal.timeout(20000) });
    return await action(client);
  } finally { await client.close().catch(() => {}); }
}

export function resultData(value: { isError?: boolean; structuredContent?: unknown; content: unknown[] }): Record<string, unknown> {
  if (value.isError) throw new Error("Higgsfield MCP 작업이 실패했습니다. Higgsfield에서 작업 상태를 확인하세요.");
  if (value.structuredContent && typeof value.structuredContent === "object" && !Array.isArray(value.structuredContent))
    return value.structuredContent as Record<string, unknown>;
  for (const block of value.content) {
    if (block && typeof block === "object" && "text" in block && typeof block.text === "string") {
      try { const parsed: unknown = JSON.parse(block.text); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>; } catch { /* 다음 블록을 확인한다. */ }
    }
  }
  throw new Error("Higgsfield MCP 응답을 읽을 수 없습니다.");
}
