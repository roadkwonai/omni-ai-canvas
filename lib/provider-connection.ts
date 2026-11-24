import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

type SubscriptionProvider = "codex" | "claude" | "agy";
type ConnectionAction = "connect" | "disconnect";
type ConnectionCommand = { executable: string; args: string[]; terminal: boolean };

const commands: Record<SubscriptionProvider, Record<ConnectionAction, ConnectionCommand>> = {
  codex: {
    connect: { executable: "codex", args: ["login"], terminal: true },
    disconnect: { executable: "codex", args: ["logout"], terminal: false },
  },
  claude: {
    connect: { executable: "claude", args: ["auth", "login", "--claudeai"], terminal: true },
    disconnect: { executable: "claude", args: ["auth", "logout"], terminal: false },
  },
  agy: {
    connect: { executable: "agy", args: [], terminal: true },
    disconnect: { executable: "agy", args: [], terminal: true },
  },
};

export function connectionCommand(provider: string, action: string): ConnectionCommand | null {
  if (!Object.hasOwn(commands, provider) || (action !== "connect" && action !== "disconnect")) return null;
  return commands[provider as SubscriptionProvider][action];
}

export function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

async function executablePath(name: string): Promise<string> {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter).filter((item) => path.isAbsolute(item))) {
    const candidate = path.join(directory, name);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch { /* Try the next PATH entry. */ }
  }
  throw new Error("CLI를 찾지 못했습니다.");
}

const executeFile = promisify(execFile);
const terminalScript = [
  "on run argv",
  'tell application "Terminal"',
  "activate",
  "do script (item 1 of argv)",
  "end tell",
  "end run",
].join("\n");

export async function runSubscriptionConnection(
  provider: string,
  action: string,
  options: {
    platform?: NodeJS.Platform;
    findExecutable?: (name: string) => Promise<string>;
    execute?: (file: string, args: string[]) => Promise<void>;
  } = {},
): Promise<{ message: string; completed: boolean }> {
  const command = connectionCommand(provider, action);
  if (!command) throw new Error("지원하지 않는 연결 작업입니다.");
  const executable = await (options.findExecutable ?? executablePath)(command.executable);
  const execute = options.execute ?? (async (file: string, args: string[]) => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV, ...Object.fromEntries(
      ["PATH", "HOME", "USER", "TMPDIR", "LANG", "LC_ALL", "XDG_CONFIG_HOME", "XDG_DATA_HOME"].flatMap((key) =>
        process.env[key] ? [[key, process.env[key]]] : [],
      ),
    ) };
    await executeFile(file, args, { env, timeout: 15_000, maxBuffer: 1024 * 1024 });
  });
  if (command.terminal) {
    if ((options.platform ?? process.platform) !== "darwin") throw new Error("이 컴퓨터에서는 공식 CLI를 직접 열어 로그인해 주세요.");
    const line = [executable, ...command.args].map(shellQuote).join(" ");
    await execute("/usr/bin/osascript", ["-e", terminalScript, line]);
    if (provider === "agy" && action === "disconnect") {
      return { message: "열린 Antigravity 터미널에서 /logout을 입력해 연결을 해제한 뒤 연결 상태를 새로고침해 주세요.", completed: false };
    }
    if (provider === "agy") {
      return { message: "열린 Antigravity 터미널에서 계정을 확인해 주세요. 다른 계정은 /logout 후 다시 실행해 로그인합니다.", completed: false };
    }
    return { message: "열린 터미널의 안내에 따라 로그인을 완료한 뒤 연결 상태를 새로고침해 주세요.", completed: false };
  }
  await execute(executable, command.args);
  return { message: "계정 연결을 해제했습니다.", completed: true };
}
