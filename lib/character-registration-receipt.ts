import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export class RegistrationConflict extends Error {
  constructor(readonly code: "registration_in_progress" | "registration_review_required", message: string) {
    super(message);
  }
}

type Receipt = { state: "pending" | "complete" | "uncertain"; fingerprint?: string; startedAt?: number; result?: unknown };

export async function registerCharacterAsset<T>(options: {
  directory: string;
  projectId: string;
  nodeId: string;
  input: { [key: string]: unknown };
  retryConfirmed: boolean;
  pendingMs: number;
  inProgress: string;
  reviewRequired: string;
  parse: (value: unknown) => T | null;
  submit: () => Promise<T>;
}): Promise<T> {
  await mkdir(options.directory, { recursive: true, mode: 0o700 });
  const key = createHash("sha256").update(`${options.projectId}\0${options.nodeId}`).digest("hex");
  const file = path.join(options.directory, `${key}.json`);
  const fingerprint = createHash("sha256").update(JSON.stringify(options.input)).digest("hex");
  const pending: Receipt = { state: "pending", fingerprint, startedAt: Date.now() };
  const inProgress = () => new RegistrationConflict("registration_in_progress", options.inProgress);

  async function write(receipt: Receipt) {
    const temp = `${file}.${randomUUID()}`;
    await writeFile(temp, JSON.stringify(receipt), { flag: "wx", mode: 0o600 });
    try { await rename(temp, file); }
    finally { await unlink(temp).catch(() => {}); }
  }

  try {
    const handle = await open(file, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(pending)); }
    finally { await handle.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const raw = await readFile(file, "utf8");
    let previous: Receipt | undefined;
    try { previous = JSON.parse(raw) as Receipt; } catch { /* 초기 기록을 쓰는 중일 수 있다. */ }
    if (previous?.state === "complete" && previous.fingerprint === fingerprint && !options.retryConfirmed) {
      const result = options.parse(previous.result);
      if (result) return result;
    }
    const startedAt = typeof previous?.startedAt === "number" ? previous.startedAt : (await lstat(file)).mtimeMs;
    if ((!previous || previous.state === "pending") && Date.now() - startedAt < options.pendingMs) throw inProgress();
    if (!options.retryConfirmed) throw new RegistrationConflict("registration_review_required", options.reviewRequired);
    const recovery = `${file}.recovery`;
    const handle = await open(recovery, "wx", 0o600).catch(() => { throw inProgress(); });
    try {
      if (await readFile(file, "utf8") !== raw) throw inProgress();
      await write(pending);
    } finally {
      await handle.close();
      await unlink(recovery).catch(() => {});
    }
  }

  let result: T;
  try { result = await options.submit(); }
  catch (error) {
    await write({ ...pending, state: "uncertain" });
    throw error;
  }
  await write({ ...pending, state: "complete", result });
  return result;
}
