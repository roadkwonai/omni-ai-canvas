import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { storeMedia } from "./media";
import { describeVoiceDesign, plainVoice, postFilters, withDirection, type LocalTtsOptions, type VoiceDesign } from "./local-tts-options";
import { createProgress } from "./local-tts-progress";
import type { LocalTtsModel, LocalTtsProgress } from "./tts-types";
import type { Asset } from "./types";

const inHome = (...parts: string[]) => path.join(process.cwd(), ".scene-room", "local-tts", ...parts);
export const outputDirectory = () => inHome("output");
const modelFolders: Record<LocalTtsModel, string> = { "s2-pro": "s2-pro-8bit", "drama-3": "drama-3-4bit" };

type LocalTtsRequest = { key: string; input: string; model: LocalTtsModel; characters: number };
export type LocalTtsInput = { text: string; options: LocalTtsOptions; reference?: { file: string; text: string }; /** 참조 음성을 앞 테이크로 들려주고 다시 연기한다. */ retake?: boolean; dialogue?: LocalDialogue };
/** 줄마다 목소리 번호와 시드. 목소리는 참조 음성이거나 설계 설명이다. */
type LocalDialogue = {
  lines: { voice: number; text: string; seed: number }[];
  /** 설계한 목소리는 refText를 한 번 읽은 소리를 그 인물의 참조로 쓴다. */
  cast: ({ refAudio: string; refText: string } | { design: { description: string; scene?: string }; seed: number; refText: string })[];
  gap: number;
};
type LocalTtsJob = {
  input: string;
  result: Promise<Asset>;
  progress: () => LocalTtsProgress;
  /** 대화의 줄마다 시작과 끝(초). 끝난 대화에만 있다. */
  marks: () => [number, number][] | undefined;
  /** 정해진 시간 안에 끝나면 음성을, 아니면 null을 돌려준다. 아무도 기다리지 않는 작업은 잠시 뒤 멈춘다. */
  wait: (ms: number) => Promise<Asset | null>;
};
type Worker = { child: ChildProcessWithoutNullStreams; active?: { id: string; event: (value: WorkerEvent) => void; fail: (error: Error) => void } };
type WorkerEvent = {
  id: string; event: "loading" | "generating" | "done" | "error"; message?: string;
  seconds?: number; total?: number; part?: number; parts?: number; fraction?: number; rate?: number; marks?: [number, number][];
};
type Progress = ReturnType<typeof createProgress>;
type Options = {
  launch?: () => ChildProcessWithoutNullStreams;
  save?: typeof storeMedia;
  process?: (source: string, target: string, filters: string) => Promise<void>;
  idleMs?: number;
  jobMs?: number;
  keepResultMs?: number;
  abandonMs?: number;
};

const cancelledError = () => new Error("음성 생성을 취소했습니다.");

export const workerDesign = (design: VoiceDesign) =>
  ({ description: describeVoiceDesign(design) || plainVoice, ...(design.scene ? { scene: design.scene } : {}) });

/** 제작자에게 보일 수 있는 오류만 남기고 경로나 시스템 문구가 담긴 오류는 바꾼다. */
function presentable(error: unknown): Error {
  return error instanceof Error && !("code" in error) && /[가-힣]/.test(error.message)
    ? error : new Error("로컬 음성 모델을 실행하지 못했습니다. 설치 상태를 확인한 뒤 다시 시도해 주세요.");
}

export async function localTtsReady(): Promise<Record<LocalTtsModel, boolean>> {
  const exists = (file: string) => access(file).then(() => true, () => false);
  const [python, s2, drama] = await Promise.all([
    exists(inHome(".venv", "bin", "python")),
    exists(inHome("models", modelFolders["s2-pro"], ".ready")), exists(inHome("models", modelFolders["drama-3"], ".ready")),
  ]);
  return { "s2-pro": python && s2, "drama-3": python && drama };
}

export function localWorkerCommand() {
  return {
    command: inHome(".venv", "bin", "python"),
    args: ["-I", path.join(process.cwd(), "scripts", "local_tts_worker.py")],
    env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, HF_HUB_OFFLINE: "1" } as NodeJS.ProcessEnv,
  };
}

function launchWorker() {
  const { command, args, env } = localWorkerCommand();
  return spawn(command, args, { cwd: inHome(), env });
}

async function processAudio(source: string, target: string, filters: string) {
  await promisify(execFile)("ffmpeg", ["-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe", "-i", source, "-af", filters, "-y", target], { timeout: 120_000 });
}

/** 모델을 한 번에 하나만 올리는 워커 프로세스와 작업 대기열. 같은 키의 요청은 진행 중인 작업을 다시 돌려준다. */
export function createLocalTts({
  launch = launchWorker, save = storeMedia, process: convert = processAudio, idleMs = 10 * 60_000, jobMs = 45 * 60_000, keepResultMs = 10 * 60_000, abandonMs = 60_000,
}: Options = {}) {
  let worker: Worker | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  let idle: NodeJS.Timeout | undefined;
  const jobs = new Map<string, { job: LocalTtsJob; abort: AbortController }>();
  const cancelledBeforeStart = new Set<string>();
  const unfinished = new Set<Progress>();
  // 처음에는 M1 Ultra에서 잰 값으로 예상하고 실제로 걸린 시간으로 바꾼다.
  const pace = { "s2-pro": { load: 4, character: 0.13 }, "drama-3": { load: 8, character: 0.105 } };
  const later = (action: () => void) => setTimeout(action, keepResultMs).unref();

  function connect(): Worker {
    if (worker) return worker;
    const child = launch();
    const current: Worker = { child };
    worker = current;
    const lost = () => {
      if (worker === current) worker = undefined;
      current.active?.fail(new Error("로컬 음성 모델이 멈췄습니다. 다시 시도해 주세요."));
    };
    child.on("error", lost);
    child.on("close", lost);
    child.stdin.on("error", lost);
    child.stderr.on("data", (chunk) => console.error(String(chunk).trimEnd().slice(-2000)));
    createInterface({ input: child.stdout }).on("line", (line) => {
      try {
        const value = JSON.parse(line) as WorkerEvent;
        if (value.id === current.active?.id) current.active.event(value);
      } catch { /* 이벤트가 아닌 출력은 버린다. */ }
    });
    return current;
  }

  function stop() {
    clearTimeout(idle);
    const child = worker?.child;
    worker = undefined;
    child?.kill("SIGKILL");
  }

  async function generate(request: LocalTtsRequest, { text, options, reference, retake, dialogue }: LocalTtsInput, output: string, progress: Progress, signal: AbortSignal): Promise<{ rate: number; marks?: [number, number][] }> {
    const current = connect();
    const finished = new AbortController();
    let phaseAt = Date.now();
    const took = () => Math.max(0.5, (Date.now() - phaseAt) / 1000);
    try {
      return await new Promise((resolve, reject) => {
        const id = randomUUID();
        const interrupt = (error: Error) => {
          reject(error);
          stop();
        };
        const limit = setTimeout(() => interrupt(new Error("로컬 음성 생성 시간이 초과됐습니다. 대사를 나눠 주세요.")), jobMs);
        finished.signal.addEventListener("abort", () => clearTimeout(limit));
        signal.addEventListener("abort", () => interrupt(cancelledError()), { signal: finished.signal });
        let loading = false;
        let generating = false;
        current.active = { id, fail: reject, event: (value) => {
          if (value.event === "error") return reject(new Error(value.message || "로컬 모델이 음성을 만들지 못했습니다."));
          if (value.event === "done") {
            // 대화는 보관한 줄을 다시 쓰기도 해서 걸린 시간으로 속도를 알 수 없다.
            if (!dialogue) pace[request.model].character = took() / Math.max(10, request.characters);
            return resolve({ rate: value.rate ?? 44_100, marks: value.marks });
          }
          if (value.event === "loading") loading = true;
          else if (!generating) {
            generating = true;
            if (loading) pace[request.model].load = took();
            phaseAt = Date.now();
          }
          progress.enter(value.event);
          if (value.fraction !== undefined) {
            progress.generated({ seconds: value.seconds ?? 0, total: value.total ?? 0, part: value.part ?? 1, parts: value.parts ?? 1, fraction: value.fraction });
          }
        } };
        const direction = withDirection(options);
        current.child.stdin.write(JSON.stringify({
          id, model: inHome("models", modelFolders[request.model]), text, output,
          ...(reference ? { refAudio: reference.file, refText: reference.text } : {}),
          ...(retake ? { retake } : {}),
          ...(options.design ? { design: workerDesign(options.design) } : {}), ...dialogue,
          ...(direction ? { direction } : {}),
          temperature: options.temperature, top_p: options.topP, top_k: options.topK, seed: options.seed, seconds: options.seconds,
        }) + "\n");
      });
    } finally {
      current.active = undefined;
      finished.abort();
    }
  }

  function start(request: LocalTtsRequest, prepare: () => Promise<LocalTtsInput>, onSaved?: (asset: Asset) => Promise<void>): LocalTtsJob {
    const { key, input, model, characters } = request;
    const existing = jobs.get(key);
    if (existing) return existing.job;
    const progress = createProgress({ characters, ahead: unfinished.size, loadSeconds: pace[model].load, secondsPerCharacter: pace[model].character });
    unfinished.add(progress);
    let marks: [number, number][] | undefined;
    const abort = new AbortController();
    const { signal } = abort;
    // 끝나거나 취소한 작업을 순서에서 빼고 그 뒤에서 기다리던 작업만 앞으로 옮긴다.
    const leave = () => {
      const order = [...unfinished];
      if (!unfinished.delete(progress)) return;
      for (const waiting of order.slice(order.indexOf(progress) + 1)) waiting.moveUp();
    };
    signal.addEventListener("abort", leave);
    const aborted = new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(cancelledError())));
    aborted.catch(() => {});
    if (cancelledBeforeStart.delete(key)) abort.abort();
    const ifActive = () => { if (signal.aborted) throw cancelledError(); };
    const turn = queue.then(async () => {
      ifActive();
      clearTimeout(idle);
      progress.enter("preparing");
      const output = path.join(outputDirectory(), `${randomUUID()}.wav`);
      const processed = path.join(outputDirectory(), `${randomUUID()}.wav`);
      try {
        const prepared = await Promise.race([prepare(), aborted]);
        await mkdir(outputDirectory(), { recursive: true });
        ifActive();
        const made = await generate(request, prepared, output, progress, signal);
        progress.enter("finishing");
        const filters = postFilters(prepared.options, made.rate);
        if (filters) await convert(output, processed, filters);
        const bytes = await readFile(filters ? processed : output);
        ifActive();
        const asset = await save(bytes, "tts.wav", "audio");
        await onSaved?.(asset).catch(() => {});
        marks = made.marks;
        return asset;
      } finally {
        await Promise.all([output, processed].map((file) => unlink(file).catch(() => {})));
        idle = setTimeout(stop, idleMs);
        idle.unref();
      }
    }).finally(leave);
    queue = turn.catch(() => {});
    // 앞선 작업이 길어도 대기 중인 작업의 취소는 바로 돌려준다.
    const result = Promise.race([turn, aborted]).catch((error) => { throw presentable(error); });
    let waiting = 0;
    let abandoned: NodeJS.Timeout | undefined;
    const wait = async (ms: number) => {
      waiting++;
      clearTimeout(abandoned);
      let timer: NodeJS.Timeout | undefined;
      try {
        const asset = await Promise.race([result, new Promise<null>((resolve) => { timer = setTimeout(resolve, ms, null); })]);
        if (!asset && waiting === 1) abandoned = setTimeout(() => abort.abort(), abandonMs).unref();
        return asset;
      } finally {
        waiting--;
        clearTimeout(timer);
      }
    };
    const job: LocalTtsJob = { input, result, progress: progress.read, marks: () => marks, wait };
    jobs.set(key, { job, abort });
    const forgetLater = () => later(() => { if (jobs.get(key)?.job === job) jobs.delete(key); });
    result.then(forgetLater, forgetLater);
    return job;
  }

  return {
    start,
    stop,
    find: (key: string) => jobs.get(key)?.job,
    /** 시작 요청보다 먼저 도착한 취소도 기억해 그 작업을 실행하지 않는다. */
    cancel(key: string) {
      const entry = jobs.get(key);
      if (entry) return entry.abort.abort();
      cancelledBeforeStart.add(key);
      later(() => cancelledBeforeStart.delete(key));
    },
  };
}

// 개발 서버가 모듈을 다시 읽으면 이전 코드의 워커를 내리고 새로 시작해 모델이 두 번 올라가지 않게 한다.
type Engine = ReturnType<typeof createLocalTts>;
const shared = globalThis as typeof globalThis & { __sceneRoomLocalTtsEngine?: Engine & { factory?: typeof createLocalTts } };
export function localTts(): Engine {
  if (shared.__sceneRoomLocalTtsEngine?.factory !== createLocalTts) {
    shared.__sceneRoomLocalTtsEngine?.stop();
    shared.__sceneRoomLocalTtsEngine = { ...createLocalTts(), factory: createLocalTts };
  }
  return shared.__sceneRoomLocalTtsEngine;
}
