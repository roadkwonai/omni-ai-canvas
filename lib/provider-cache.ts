import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { isAgentEffort } from "./agent-effort";
import type { Operation, Provider, ProviderInfo } from "./types";

const providers: Provider[] = ["codex", "claude", "agy", "higgsfield", "kling", "topview", "openai-image", "gemini-image", "seedream", "road-music"];
const operations: Operation[] = ["plan", "text", "image", "video", "audio"];
const refreshAfter = 60_000;
const maxAge = 30 * 60_000;
type Snapshot = { epoch: string; snapshotAt: string; providers: ProviderInfo[] };
type Display = { providers: ProviderInfo[]; snapshotAt: string | null; refreshing: boolean };
const text = (value: unknown, fallback = "") => typeof value === "string" && value.length <= 500 && !/[\x00-\x1f\x7f@]/.test(value) ? value : fallback;
const listOperations = (value: unknown) => Array.isArray(value) ? value.filter((item): item is Operation => operations.includes(item)) : [];
const efforts = (value: unknown) => Array.isArray(value) ? value.filter(isAgentEffort) : [];

function sanitize(value: unknown): ProviderInfo[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, providers.length).flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    if (!providers.includes(item.id as Provider) || typeof item.available !== "boolean") return [];
    const models = Array.isArray(item.models) ? item.models.slice(0, 500).flatMap((value: unknown) => {
      if (!value || typeof value !== "object") return [];
      const model = value as Record<string, unknown>;
      const id = text(model.id);
      if (!id) return [];
      return [{ id, label: text(model.label, id), operations: listOperations(model.operations),
        ...(Array.isArray(model.efforts) ? { efforts: efforts(model.efforts) } : {}) }];
    }) : undefined;
    const account = item.account && typeof item.account === "object" ? item.account as Record<string, unknown> : undefined;
    const plan = account ? text(account.plan) || null : null;
    const credits = account && typeof account.credits === "number" && Number.isFinite(account.credits) ? account.credits : null;
    return [{
      id: item.id as Provider, label: text(item.label, item.id as string), operations: listOperations(item.operations),
      available: item.available, detail: text(item.detail), billing: text(item.billing),
      website: text(item.website), ...(models ? { models } : {}),
      ...(Array.isArray(item.efforts) ? { efforts: efforts(item.efforts) } : {}),
      ...(account ? { account: { plan, credits } } : {}),
    }];
  });
}

export class ProviderCache {
  private pending?: Promise<void>;
  constructor(
    private readonly rootPath: string | (() => string),
    private readonly load: () => Promise<unknown[]>,
    private readonly now: () => number = Date.now,
  ) {}

  private get root() { return typeof this.rootPath === "function" ? this.rootPath() : this.rootPath; }

  private async epoch(): Promise<string> {
    try { return await readFile(path.join(this.root, "epoch"), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""; throw error; }
  }

  private async stored(): Promise<Snapshot | null> {
    try {
      const snapshot = JSON.parse(await readFile(path.join(this.root, "providers.json"), "utf8")) as Snapshot;
      const time = Date.parse(snapshot.snapshotAt);
      if (snapshot.epoch !== await this.epoch() || !Number.isFinite(time) || time > this.now() || this.now() - time > maxAge) return null;
      return { epoch: snapshot.epoch, snapshotAt: snapshot.snapshotAt, providers: sanitize(snapshot.providers) };
    } catch { return null; }
  }

  async read(): Promise<Display> {
    const current = await this.stored();
    if (!current || this.now() - Date.parse(current.snapshotAt) >= refreshAfter) void this.refresh().catch(() => {});
    return { providers: current?.providers ?? [], snapshotAt: current?.snapshotAt ?? null, refreshing: !!this.pending };
  }

  refresh(): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      const epoch = await this.epoch();
      const loaded = sanitize(await this.load());
      if (!loaded.length || epoch !== await this.epoch()) return;
      const snapshot: Snapshot = { epoch, snapshotAt: new Date(this.now()).toISOString(), providers: loaded };
      const temp = path.join(this.root, `.providers-${randomUUID()}.tmp`);
      try {
        await writeFile(temp, JSON.stringify(snapshot), { mode: 0o600, flag: "wx" });
        await rename(temp, path.join(this.root, "providers.json"));
      } finally { await unlink(temp).catch(() => {}); }
    })().finally(() => { this.pending = undefined; });
    return this.pending;
  }

  async invalidate(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const temp = path.join(this.root, `.epoch-${randomUUID()}.tmp`);
    try {
      await writeFile(temp, randomUUID(), { mode: 0o600, flag: "wx" });
      await rename(temp, path.join(this.root, "epoch"));
    } finally { await unlink(temp).catch(() => {}); }
  }
}

export const providerCache = new ProviderCache(
  () => path.join(process.cwd(), ".scene-room", "provider-cache"),
  async () => (await import("./runner")).getProviders(),
);
