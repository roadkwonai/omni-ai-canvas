import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { StringDecoder } from "node:string_decoder";
import type { Operation, Provider } from "./types";
import { isAgentEffort, type AgentEffort } from "./agent-effort";

export type AgentModel = { id: string; label: string; operations: Operation[]; efforts?: AgentEffort[] };
const operations: Operation[] = ["plan", "text"];
const environment = {
  NODE_ENV: process.env.NODE_ENV,
  ...Object.fromEntries(
    [
      "PATH",
      "HOME",
      "USER",
      "TMPDIR",
      "LANG",
      "LC_ALL",
      "SHELL",
      "XDG_CONFIG_HOME",
      "XDG_DATA_HOME",
      "XDG_CACHE_HOME",
    ].flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
  ),
};
const validId = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export function parseAgyModels(output: string): AgentModel[] {
  return output.split(/\r?\n/).flatMap((line) => {
    const [id, label] = line.split("\t");
    return id && label && validId.test(id)
      ? [{ id, label: label.trim(), operations }]
      : [];
  });
}

export function parseAgyEfforts(output: string): AgentEffort[] {
  try {
    const value = JSON.parse(output);
    const data = value.command?.name === "effort" ? value.command.data : undefined;
    return data?.adjustable === true && Array.isArray(data.available)
      ? data.available.filter(isAgentEffort) : [];
  } catch { return []; }
}

async function agyEfforts(models: AgentModel[]): Promise<AgentModel[]> {
  return Promise.all(models.map(async (model) => {
    try {
      const result = await promisify(execFile)("agy", [
        "-p", "/effort", "--output-format", "json", "--model", model.id,
      ], { env: environment, timeout: 10_000, maxBuffer: 100_000 });
      return { ...model, efforts: parseAgyEfforts(result.stdout) };
    } catch { return { ...model, efforts: [] }; }
  }));
}

export function parseClaudeModels(output: string): AgentModel[] {
  const match = output.match(
    /--model <model>[\s\S]*?(?=\n\s{2}--|\n\s{2}-[a-z],|$)/,
  );
  const examples = match?.[0].match(/\(e\.g\.\s*([\s\S]*?)\)/)?.[1] ?? "";
  const ids = [...examples.matchAll(/'([a-zA-Z0-9._-]+)'/g)].map(
    (item) => item[1],
  );
  return [...new Set(ids)]
    .filter((id) => validId.test(id))
    .map((id) => ({ id, label: `${id} (Claude CLI 별칭)`, operations }));
}

export function parseCodexModels(value: unknown): AgentModel[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("data" in value) ||
    !Array.isArray(value.data)
  )
    return [];
  return value.data.flatMap((item: unknown) => {
    if (
      !item ||
      typeof item !== "object" ||
      !("id" in item) ||
      typeof item.id !== "string" ||
      !validId.test(item.id) ||
      ("hidden" in item && item.hidden)
    )
      return [];
    const id =
      "model" in item &&
      typeof item.model === "string" &&
      validId.test(item.model)
        ? item.model
        : item.id;
    const label =
      "displayName" in item && typeof item.displayName === "string"
        ? item.displayName
        : item.id;
    const effortItems = "supportedReasoningEfforts" in item && Array.isArray(item.supportedReasoningEfforts)
      ? item.supportedReasoningEfforts : undefined;
    const efforts = effortItems?.flatMap((entry: unknown) => {
      const value = entry && typeof entry === "object" && "reasoningEffort" in entry
        ? entry.reasoningEffort : undefined;
      return isAgentEffort(value) ? [value] : [];
    });
    return [{ id, label, operations, ...(efforts ? { efforts } : {}) }];
  });
}

async function codexModels(): Promise<AgentModel[]> {
  return new Promise((resolve) => {
    const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
      env: environment,
      stdio: ["pipe", "pipe", "ignore"],
    });
    let buffer = "";
    const decoder = new StringDecoder("utf8");
    let settled = false;
    const finish = (models: AgentModel[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolve(models);
    };
    const timer = setTimeout(() => finish([]), 10_000);
    child.on("error", () => finish([]));
    child.on("close", () => finish([]));
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += decoder.write(chunk);
      if (buffer.length > 2_000_000) return finish([]);
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        try {
          const message = JSON.parse(line);
          if (message.id === 2) return finish(parseCodexModels(message.result));
        } catch {
          return finish([]);
        }
      }
    });
    child.stdin.on("error", () => finish([]));
    child.stdin.write(
      JSON.stringify({
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "scene-room", version: "1" },
          capabilities: {},
        },
      }) + "\n",
    );
    child.stdin.write(
      JSON.stringify({ method: "initialized", params: {} }) + "\n",
    );
    child.stdin.write(
      JSON.stringify({ id: 2, method: "model/list", params: { limit: 100 } }) +
        "\n",
    );
  });
}

const cache = new Map<Provider, { expires: number; models: AgentModel[] }>();
export async function getAgentModels(
  provider: Provider,
): Promise<AgentModel[]> {
  if (!["codex", "claude", "agy"].includes(provider)) return [];
  const previous = cache.get(provider);
  if (previous && previous.expires > Date.now()) return previous.models;
  let models: AgentModel[] = [];
  try {
    if (provider === "codex") models = await codexModels();
    else {
      const output = await promisify(execFile)(
        provider === "agy" ? "agy" : "claude",
        provider === "agy" ? ["models"] : ["--help"],
        { env: environment, timeout: 10_000, maxBuffer: 2_000_000 },
      );
      models =
        provider === "agy"
          ? await agyEfforts(parseAgyModels(output.stdout))
          : parseClaudeModels(output.stdout);
    }
  } catch {
    /* 목록을 읽지 못해도 기본 모델 실행은 가능하다. */
  }
  cache.set(provider, { expires: Date.now() + 60_000, models });
  return models;
}

export function agentModelArguments(model?: string): string[] {
  if (model === undefined) return [];
  if (!validId.test(model)) throw new Error("모델 이름이 올바르지 않습니다.");
  return ["--model", model];
}

export async function codexAccount(): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
      env: environment,
      stdio: ["pipe", "pipe", "ignore"],
    });
    let buffer = "";
    let settled = false;
    const finish = (plan: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolve(plan);
    };
    const timer = setTimeout(() => finish(null), 10_000);
    child.on("error", () => finish(null));
    child.on("close", () => finish(null));
    child.stdin.on("error", () => finish(null));
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (buffer.length > 2_000_000) return finish(null);
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        try {
          const message = JSON.parse(line);
          if (message.id !== 2) continue;
          const account = message.result?.account;
          const plan = account?.type === "chatgpt" && typeof account.planType === "string"
            && /^[a-zA-Z0-9 _-]{1,60}$/.test(account.planType) ? account.planType : null;
          return finish(plan);
        } catch { return finish(null); }
      }
    });
    child.stdin.write(JSON.stringify({
      id: 1, method: "initialize",
      params: { clientInfo: { name: "scene-room", version: "1" }, capabilities: {} },
    }) + "\n");
    child.stdin.write(JSON.stringify({ method: "initialized", params: {} }) + "\n");
    child.stdin.write(JSON.stringify({ id: 2, method: "account/read", params: { refreshToken: false } }) + "\n");
  });
}
