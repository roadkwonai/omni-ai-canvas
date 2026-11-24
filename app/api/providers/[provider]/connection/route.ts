import { providerCache } from "@/lib/provider-cache";
import { spawn } from "node:child_process";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { bad, jsonObject, localApi } from "@/lib/http";
import { connectionCommand, runSubscriptionConnection } from "@/lib/provider-connection";
import { setAgyEnabled } from "@/lib/agy";

const commands = {
  higgsfield: { login: ["auth", "login"], logout: ["auth", "logout"] },
  kling: { login: ["login"], logout: ["logout"] },
} as const;
const pending = new Set<string>();

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  return localApi(request, async () => {
    const { provider } = await context.params;
    const { action } = await jsonObject(request);
    if (action !== "connect" && action !== "disconnect") return bad("연결 작업을 확인해 주세요.");
    if (provider === "topview" || provider === "higgsfield-mcp") {
      if (action !== "disconnect") return bad("공식 인증 화면에서 연결해 주세요.");
      const directory = provider === "topview" ? "topview" : "higgsfield-mcp";
      await unlink(path.join(process.cwd(), ".scene-room", directory, "auth.json")).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
      await providerCache.invalidate();
      return Response.json({ message: "이 제작실의 MCP 연결을 해제했습니다." });
    }
    if (connectionCommand(provider, action)) {
      if (pending.has(provider)) return bad("계정 연결 작업이 진행 중입니다.", 409);
      pending.add(provider);
      try {
        const result = await runSubscriptionConnection(provider, action);
        if (provider === "agy") await setAgyEnabled(action === "connect");
        await providerCache.invalidate();
        return Response.json(result, { headers: { "Cache-Control": "no-store" } });
      } catch {
        return bad("계정 연결 프로그램을 열지 못했습니다. CLI 설치와 터미널 접근 권한을 확인해 주세요.", 503);
      } finally {
        pending.delete(provider);
      }
    }
    if (provider !== "higgsfield" && provider !== "kling") return bad("서비스를 확인해 주세요.");
    if (pending.has(provider)) return bad("계정 연결 작업이 진행 중입니다.", 409);
    pending.add(provider);
    const executable = path.join(process.cwd(), "node_modules", ".bin", provider);
    const args = action === "connect" ? commands[provider].login : commands[provider].logout;
    const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV, ...Object.fromEntries(["PATH", "HOME", "USER", "TMPDIR", "LANG", "LC_ALL", "XDG_CONFIG_HOME"].flatMap((key) => process.env[key] ? [[key, process.env[key]]] : [])) };
    try {
      await providerCache.invalidate();
      const child = spawn(executable, [...args], { env, stdio: "ignore", detached: false });
      child.once("error", () => pending.delete(provider));
      child.once("close", () => pending.delete(provider));
      return await new Promise<Response>((resolve) => {
        child.once("error", () => resolve(bad("계정 연결 프로그램을 시작하지 못했습니다.", 503)));
        if (action === "connect") {
          child.once("spawn", () => resolve(Response.json({ message: "열린 인증 화면에서 로그인을 완료한 후 연결 상태를 새로고침해 주세요." })));
        } else {
          child.once("close", (code) => resolve(code === 0 ? Response.json({ message: "계정 연결을 해제했습니다." }) : bad("연결을 해제하지 못했습니다.", 503)));
        }
      });
    } catch {
      pending.delete(provider);
      return bad("계정 연결 프로그램을 시작하지 못했습니다.", 503);
    }
  });
}
