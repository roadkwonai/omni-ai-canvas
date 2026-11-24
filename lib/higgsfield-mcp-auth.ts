import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

export const HIGGSFIELD_MCP_URL = "https://mcp.higgsfield.ai/mcp";
const dir = path.join(process.cwd(), ".scene-room", "higgsfield-mcp");
const timedFetch: typeof fetch = (url, init) => fetch(url, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) });
type Stored = { client?: OAuthClientInformationMixed; tokens?: OAuthTokens; verifier?: string; state?: string; redirect?: string; created?: number };

async function read(name: string): Promise<Stored> {
  try { return JSON.parse(await readFile(path.join(dir, name), "utf8")) as Stored; }
  catch { return {}; }
}
async function save(name: string, state: Stored) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const temp = path.join(dir, `.${randomBytes(16).toString("hex")}`);
  await writeFile(temp, JSON.stringify(state), { mode: 0o600, flag: "wx" });
  await rename(temp, path.join(dir, name));
}

export class HiggsfieldMcpOAuth implements OAuthClientProvider {
  authorizationUrl?: URL;
  constructor(private readonly name = "auth.json", private readonly callback = "http://127.0.0.1:5050/api/providers/higgsfield-mcp/callback") {}
  get redirectUrl() { return this.callback; }
  get clientMetadata(): OAuthClientMetadata {
    return { client_name: "Omni AI Canvas", redirect_uris: [this.callback], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" };
  }
  async state() { return (await read(this.name)).state ?? ""; }
  async clientInformation() { return (await read(this.name)).client; }
  async saveClientInformation(client: OAuthClientInformationMixed) { await save(this.name, { ...await read(this.name), client }); }
  async tokens() { return (await read(this.name)).tokens; }
  async saveTokens(tokens: OAuthTokens) { await save(this.name, { ...await read(this.name), tokens }); }
  async redirectToAuthorization(url: URL) { this.authorizationUrl = url; }
  async saveCodeVerifier(verifier: string) { await save(this.name, { ...await read(this.name), verifier }); }
  async codeVerifier() { const value = (await read(this.name)).verifier; if (!value) throw new Error("Higgsfield MCP 인증 세션이 만료됐습니다."); return value; }
}

export async function beginHiggsfieldMcpAuth(origin: string) {
  const state = randomBytes(32).toString("hex");
  const name = `pending-${state}.json`;
  const redirect = `${origin}/api/providers/higgsfield-mcp/callback`;
  await save(name, { state, redirect, created: Date.now() });
  const provider = new HiggsfieldMcpOAuth(name, redirect);
  const result = await auth(provider, { serverUrl: HIGGSFIELD_MCP_URL, fetchFn: timedFetch });
  if (result !== "REDIRECT" || !provider.authorizationUrl || provider.authorizationUrl.protocol !== "https:" || provider.authorizationUrl.hostname !== "higgsfield.ai") throw new Error("Higgsfield MCP 인증 주소를 확인하지 못했습니다.");
  return { state, url: provider.authorizationUrl.toString() };
}

export async function finishHiggsfieldMcpAuth(state: string, code: string, origin: string) {
  if (!/^[a-f0-9]{64}$/.test(state) || !code || code.length > 4096) throw new Error("Higgsfield MCP 인증 요청을 확인할 수 없습니다.");
  const name = `pending-${state}.json`;
  const pending = await read(name);
  if (pending.state !== state || pending.redirect !== `${origin}/api/providers/higgsfield-mcp/callback` || !pending.created || Date.now() - pending.created > 600_000) throw new Error("Higgsfield MCP 인증 세션이 만료됐습니다.");
  const provider = new HiggsfieldMcpOAuth(name, pending.redirect);
  const result = await auth(provider, { serverUrl: HIGGSFIELD_MCP_URL, authorizationCode: code, fetchFn: timedFetch });
  if (result !== "AUTHORIZED") throw new Error("Higgsfield MCP 인증을 완료하지 못했습니다.");
  const complete = await read(name);
  if (!complete.tokens) throw new Error("Higgsfield MCP 인증 결과를 확인하지 못했습니다.");
  await save("auth.json", complete);
  await unlink(path.join(dir, name)).catch(() => {});
}
