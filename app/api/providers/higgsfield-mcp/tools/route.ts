import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { HiggsfieldMcpOAuth, HIGGSFIELD_MCP_URL } from "@/lib/higgsfield-mcp-auth";
import { localApi, localOrigin } from "@/lib/http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return localApi(request, async () => {
    const origin = localOrigin(request);
    if (!origin) return Response.json({ error: "로컬 연결을 확인해 주세요." }, { status: 403 });
    const provider = new HiggsfieldMcpOAuth("auth.json", `${origin}/api/providers/higgsfield-mcp/callback`);
    if (!(await provider.tokens())) return Response.json({ connected: false, tools: [] });
    const client = new Client({ name: "scene-room", version: "1.0.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(HIGGSFIELD_MCP_URL), {
        authProvider: provider,
        fetch: (url, init) => fetch(url, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) }),
      }), { timeout: 20000, signal: AbortSignal.timeout(20000) });
      const result = await client.listTools();
      return Response.json({ connected: true, tools: result.tools.map((tool) => ({ name: tool.name, description: tool.description })) });
    } catch {
      return Response.json({ connected: false, tools: [], error: "Higgsfield MCP 연결 상태를 확인해 주세요." }, { status: 422 });
    } finally { await client.close().catch(() => {}); }
  });
}
