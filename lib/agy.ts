import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { StringDecoder } from "node:string_decoder";
import type { ProviderInfo } from "./types";
import { agentModelArguments } from "./agent-models";
import { agentEffortArguments, type AgentEffort } from "./agent-effort";

const settings = JSON.stringify({
  toolPermission: "strict",
  allowNonWorkspaceAccess: false,
  permissions: {
    deny: [
      "command(*)",
      "read_file(*)",
      "write_file(*)",
      "read_url(*)",
      "execute_url(*)",
      "mcp(*)",
    ],
  },
});

export function agyEnabled(root = process.cwd(), environment: Record<string, string | undefined> = process.env): boolean {
  return environment.SCENE_ROOM_AGY_PERSONAL === "1" || existsSync(path.join(root, ".scene-room", "agy-personal-enabled"));
}

export async function setAgyEnabled(enabled: boolean, root = process.cwd()): Promise<void> {
  const directory = path.join(root, ".scene-room");
  const file = path.join(directory, "agy-personal-enabled");
  if (enabled) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(file, "enabled\n", { mode: 0o600 });
  } else {
    await rm(file, { force: true });
  }
}

export async function agyInfo(): Promise<ProviderInfo> {
  const enabled = agyEnabled();
  let installed = false;
  if (enabled) {
    try {
      await promisify(execFile)("agy", ["--version"], {
        timeout: 5000,
        env: {
          NODE_ENV: process.env.NODE_ENV,
          PATH: process.env.PATH,
          HOME: process.env.HOME,
        },
      });
      installed = true;
    } catch {
      /* CLI availability is reported below. */
    }
  }
  return {
    id: "agy",
    label: "Antigravity",
    operations: enabled ? ["plan", "text"] : [],
    available: enabled && installed,
    detail: !enabled
      ? "MCP로 연결하거나 개인 계정 직접 실행을 설정하세요."
      : installed
        ? "개인 계정 실행 설정됨 · 로그인 상태 확인 필요"
        : "Antigravity CLI 설치 필요",
    billing: "설정한 개인 계정 사용량",
    website: "https://antigravity.google",
  };
}

export async function runAgy(
  prompt: string,
  timeout = 180_000,
  model?: string,
  effort?: AgentEffort,
): Promise<string> {
  if (!agyEnabled())
    throw new Error("Antigravity 개인 계정 직접 실행이 비활성화되어 있습니다.");
  const work = await mkdtemp(path.join(os.tmpdir(), "scene-room-agy-"));
  const env = {
    NODE_ENV: process.env.NODE_ENV,
    ...Object.fromEntries(
      ["PATH", "HOME", "USER", "TMPDIR", "LANG", "LC_ALL", "SHELL"].flatMap(
        (key) => (process.env[key] ? [[key, process.env[key]]] : []),
      ),
    ),
  };
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(
        "agy",
        [
          "--sandbox",
          ...agentModelArguments(model),
          ...agentEffortArguments("agy", effort),
          "--disable-slash-commands",
          "--settings",
          settings,
          "--input-format",
          "stream-json",
          "--output-format",
          "stream-json",
        ],
        {
          cwd: work,
          env,
          shell: false,
          detached: process.platform !== "win32",
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      let buffer = "";
      let received = 0;
      const decoder = new StringDecoder("utf8");
      let response = "";
      let failure = "";
      const stop = () => {
        if (process.platform !== "win32" && child.pid) {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {
            child.kill("SIGKILL");
          }
        } else child.kill("SIGKILL");
      };
      const timer = setTimeout(() => {
        failure = "Antigravity 응답 시간이 초과됐습니다.";
        stop();
      }, timeout);
      child.stdout.on("data", (chunk: Buffer) => {
        received += chunk.length;
        buffer += decoder.write(chunk);
        if (received > 8_000_000) {
          failure =
            "Antigravity 응답이 허용 크기를 초과했습니다. 장면 수를 줄여 다시 요청하세요.";
          stop();
          return;
        }
        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          try {
            const event = JSON.parse(line);
            if (
              event.event === "step_update" &&
              event.step_update?.step_type === "tool"
            ) {
              failure =
                "Antigravity가 도구 사용을 요청하여 작업을 중단했습니다.";
              stop();
            }
            if (event.event === "result") {
              if (
                event.result?.status === "SUCCESS" &&
                typeof event.result.response === "string"
              )
                response = event.result.response;
              else
                failure =
                  "Antigravity 응답을 완료하지 못했습니다. 계정 연결을 확인하세요.";
            }
          } catch {
            failure = "Antigravity 응답 형식을 확인하지 못했습니다.";
            stop();
          }
        }
      });
      child.stderr.resume();
      child.on("error", () => {
        clearTimeout(timer);
        reject(new Error("Antigravity CLI를 실행할 수 없습니다."));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (failure || code !== 0 || !response.trim())
          reject(
            new Error(
              failure ||
                "Antigravity 응답이 없습니다. 로그인 상태와 사용량을 확인하세요.",
            ),
          );
        else resolve(response);
      });
      child.stdin.on("error", () => {});
      child.stdin.end(
        JSON.stringify({ event: "user", message: { content: prompt } }) + "\n",
      );
    });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
