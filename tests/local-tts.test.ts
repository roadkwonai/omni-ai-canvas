import assert from "node:assert/strict";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import { mkdir, mkdtemp, readdir, rm, utimes, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalTts, localWorkerCommand, outputDirectory } from "../lib/local-tts";
import { fishReference, localReference, localVoices, spokenWords } from "../lib/tts-reference";
import type { LocalTtsOptions } from "../lib/local-tts-options";
import { fetchFishVoiceReference } from "../lib/tts-provider";
import type { Asset, Graph } from "../lib/types";

const audio: Asset = { url: "/api/assets/00000000-0000-4000-8000-000000000001.wav", type: "audio", name: "a.wav" };

// 실제 모델 프로세스 대신 같은 줄 단위 계약을 지키는 대역. 프로세스 시작 시간에 결과가 흔들리지 않는다.
function fakeWorker() {
  let runs = 0;
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), closed: false, settings: [] as object[],
    kill() {
      if (this.closed) return false;
      this.closed = true;
      setImmediate(() => child.emit("close", null, "SIGKILL"));
      return true;
    },
  });
  createInterface({ input: child.stdin }).on("line", (line) => {
    const request = JSON.parse(line);
    const say = (event: object) => { if (!child.closed) child.stdout.write(JSON.stringify({ id: request.id, ...event }) + "\n"); };
    child.stdout.write("library noise\n");
    if (request.text === "fail") say({ event: "error", message: "실패한 대사" });
    else if (request.text === "crash") child.kill();
    else if (request.text === "missing") say({ event: "done", seconds: 1 });
    else if (request.text === "hang") say({ event: "generating", seconds: 1.5, total: 6, part: 1, parts: 3, fraction: 0.25 });
    else {
      const hidden = ["id", "model", "output", "text", "refAudio", "refText"];
      child.settings.push(Object.fromEntries(Object.entries(request).filter(([key]) => !hidden.includes(key))));
      writeFileSync(request.output, `run ${++runs} ${request.text} ${request.refText ?? ""}`);
      say({ event: "done", seconds: 2, rate: 44100, ...(request.lines ? { marks: request.lines.map((_: unknown, index: number) => [index, index + 1]) } : {}) });
    }
  });
  return child;
}

type EngineOptions = Parameters<typeof createLocalTts>[0];
function engine(options: EngineOptions = {}) {
  const children: ReturnType<typeof fakeWorker>[] = [];
  const saved: string[] = [];
  const local = createLocalTts({
    launch: () => {
      const child = fakeWorker();
      children.push(child);
      return child as unknown as ChildProcessWithoutNullStreams;
    },
    save: async (bytes) => { saved.push(Buffer.from(bytes).toString()); return audio; },
    ...options,
  });
  return { local, saved, children, launches: () => children.length, alive: () => children.filter((child) => !child.closed).length };
}
const until = async (done: () => boolean) => {
  for (let i = 0; i < 300 && !done(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(done(), "기다린 상태가 되지 않았습니다.");
};
const ask = (key: string, input: string, characters = 10) => ({ key, input, model: "s2-pro" as const, characters });
const input = (text: string, options: LocalTtsOptions = {}) => async () => ({ text, options });

test("로컬 워커는 모델을 올린 채 순서대로 생성하고 같은 요청을 다시 만들지 않는다", async () => {
  const { local, saved, launches } = engine();
  try {
    const first = local.start(ask("p:1", "one"), async () => ({ text: "하나", options: {}, reference: { file: "/r.wav", text: "참조" } }));
    assert.equal(local.start(ask("p:1", "one"), input("다시")), first);
    const second = local.start(ask("p:2", "two"), input("둘"));
    assert.deepEqual(await Promise.all([first.result, second.result]), [audio, audio]);
    assert.deepEqual(saved, ["run 1 하나 참조", "run 2 둘 "]);
    assert.equal(launches(), 1);
  } finally { local.stop(); }
});

test("한 작업의 실패·중단은 다음 작업을 막지 않고 실패한 요청은 다시 시도할 수 있다", async () => {
  const { local, launches } = engine();
  try {
    await assert.rejects(local.start(ask("p:1", "x"), input("fail")).result, /실패한 대사/);
    await assert.rejects(local.start(ask("p:2", "x"), input("crash")).result, /멈췄습니다/);
    assert.equal(await local.start(ask("p:3", "x"), input("정상")).result, audio);
    assert.equal(launches(), 2);
    assert.equal(await local.start(ask("p:4", "x"), input("재시도")).result, audio);
  } finally { local.stop(); }
});

test("취소는 진행 중인 생성을 멈추고 대기 중인 작업은 시작하지 않는다", async () => {
  const { local, saved } = engine();
  try {
    const hanging = local.start(ask("p:1", "x"), input("hang"));
    const waiting = local.start(ask("p:2", "x"), input("대기"));
    const failed = assert.rejects(hanging.result, /취소/);
    const skipped = assert.rejects(waiting.result, /취소/);
    local.cancel("p:2");
    await until(() => hanging.progress().seconds === 1.5);
    assert.equal(hanging.progress().phase, "generating");
    local.cancel("p:1");
    await Promise.all([failed, skipped]);
    assert.equal(await local.start(ask("p:3", "x"), input("다음")).result, audio);
    assert.deepEqual(saved, ["run 1 다음 "]);
  } finally { local.stop(); }
});

test("워커를 띄우기 전에 취소한 작업은 모델을 실행하지 않는다", async () => {
  const { local, saved, launches } = engine();
  try {
    const job = local.start(ask("p:1", "x"), input("첫 작업"));
    await Promise.resolve();
    local.cancel("p:1");
    await assert.rejects(job.result, /취소/);
    assert.equal(await local.start(ask("p:2", "x"), input("다음")).result, audio);
    assert.deepEqual(saved, ["run 1 다음 "]);
    assert.equal(launches(), 1);
  } finally { local.stop(); }
});

test("시작보다 먼저 도착한 취소도 그 작업만 막는다", async () => {
  const { local, saved } = engine();
  try {
    local.cancel("p:1");
    await assert.rejects(local.start(ask("p:1", "x"), input("취소됨")).result, /취소/);
    assert.equal(await local.start(ask("p:2", "x"), input("다시")).result, audio);
    assert.deepEqual(saved, ["run 1 다시 "]);
  } finally { local.stop(); }
});

test("준비가 오래 걸리는 작업을 취소하면 다음 작업이 바로 시작한다", async () => {
  const { local } = engine();
  let release = () => {};
  try {
    const slow = local.start(ask("p:1", "x"), () => new Promise((resolve) => { release = () => resolve({ text: "늦은 준비", options: {} }); }));
    const next = local.start(ask("p:2", "x"), input("다음"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    local.cancel("p:1");
    await assert.rejects(slow.result, /취소/);
    assert.equal(await next.result, audio);
  } finally { release(); local.stop(); }
});

test("저장 중에 취소해도 올려 둔 모델을 버리지 않는다", async () => {
  let saving = false;
  let finish = () => {};
  const { local, launches } = engine({ save: () => new Promise((resolve) => { saving = true; finish = () => resolve(audio); }) });
  try {
    const job = local.start(ask("p:1", "x"), input("하나"));
    await until(() => saving);
    local.cancel("p:1");
    await assert.rejects(job.result, /취소/);
    finish();
    const next = local.start(ask("p:2", "x"), input("둘"));
    saving = false;
    await until(() => saving);
    finish();
    assert.equal(await next.result, audio);
    assert.equal(launches(), 1);
  } finally { local.stop(); }
});

test("쉬는 시간이 지나면 모델을 내리고 다음 작업을 준비하는 동안에는 내리지 않는다", async () => {
  const { local, launches, alive } = engine({ idleMs: 60 });
  try {
    assert.equal(await local.start(ask("p:1", "x"), input("하나")).result, audio);
    let release = () => {};
    const next = local.start(ask("p:2", "x"), () => new Promise((resolve) => { release = () => resolve({ text: "둘", options: {} }); }));
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(alive(), 1, "준비 중에는 모델을 유지한다");
    release();
    assert.equal(await next.result, audio);
    assert.equal(launches(), 1);
    await until(() => alive() === 0);
    assert.equal(await local.start(ask("p:3", "x"), input("셋")).result, audio);
    assert.equal(launches(), 2);
  } finally { local.stop(); }
});

test("제한 시간을 넘긴 생성은 멈추고 다음 작업은 새 워커에서 이어간다", async () => {
  const { local, launches } = engine({ jobMs: 80 });
  try {
    await assert.rejects(local.start(ask("p:1", "x"), input("hang")).result, /시간이 초과/);
    assert.equal(await local.start(ask("p:2", "x"), input("다음")).result, audio);
    assert.equal(launches(), 2);
  } finally { local.stop(); }
});

test("끝난 작업은 보관 시간이 지나면 잊고 같은 요청을 새로 만든다", async () => {
  const { local, saved } = engine({ keepResultMs: 30 });
  try {
    await local.start(ask("p:1", "x"), input("하나")).result;
    await until(() => !local.find("p:1"));
    await local.start(ask("p:1", "x"), input("하나")).result;
    assert.equal(saved.length, 2);
  } finally { local.stop(); }
});

test("오래 걸리는 생성은 기다리다 진행 상태로 응답하고 완성과 실패는 바로 알린다", async () => {
  const { local } = engine();
  try {
    const done = local.start(ask("p:1", "x"), input("하나"));
    assert.equal(await done.wait(5000), audio);
    await assert.rejects(local.start(ask("p:2", "x"), input("fail")).wait(5000), /실패한 대사/);
    assert.equal(await local.start(ask("p:3", "x"), input("hang")).wait(30), null);
  } finally { local.stop(); }
});

test("기다리는 화면이 없는 작업은 멈추고 다시 기다리면 이어간다", async () => {
  const { local } = engine({ abandonMs: 80 });
  try {
    const job = local.start(ask("p:1", "x"), input("hang"));
    for (let i = 0; i < 4; i++) assert.equal(await job.wait(50), null, "기다리는 동안에는 멈추지 않는다");
    await assert.rejects(job.result, /취소/);
    const next = local.start(ask("p:2", "x"), input("다음"));
    assert.equal(await next.wait(5000), audio);
  } finally { local.stop(); }
});

test("고른 옵션을 워커가 쓰는 설정으로 보내고 후처리한 파일을 저장한다", async () => {
  const processed: string[] = [];
  const { local, saved, children } = engine({ process: async (source, target, filters) => {
    processed.push(filters);
    writeFileSync(target, `처리됨 ${readFileSync(source, "utf8")}`);
  } });
  try {
    await local.start(ask("p:1", "x"), input("하나", { design: { gender: "female", age: "young", scene: "비 오는 밤" }, style: "sad", temperature: 0.9, topP: 0.95, topK: 40, seed: 7, speed: 1.25 })).result;
    await local.start(ask("p:2", "x"), input("둘")).result;
    assert.deepEqual(children[0].settings, [
      { design: { description: "young woman in her twenties", scene: "비 오는 밤" }, direction: "heavy, deflated sadness", temperature: 0.9, top_p: 0.95, top_k: 40, seed: 7 },
      {},
    ]);
    assert.deepEqual(processed, ["atempo=1.25"]);
    assert.deepEqual(saved, ["처리됨 run 1 하나 ", "run 2 둘 "]);
  } finally { local.stop(); }
});

test("대화는 줄과 화자별 목소리를 워커에 보내고 줄마다 시작과 끝을 알린다", async () => {
  const { local, children } = engine();
  try {
    const lines = [{ voice: 0, text: "가자.", seed: 1 }, { voice: 1, text: "어디로?", seed: 2 }];
    const cast = [{ refAudio: "/a.wav", refText: "참조" }, { design: { description: "young man in his twenties" }, seed: 7, refText: "표본" }];
    const job = local.start({ ...ask("p:1", "x"), model: "drama-3" }, async () => ({ text: "가자.\n어디로?", options: {}, dialogue: { lines, cast, gap: 0.5 } }));
    assert.equal(await job.result, audio);
    assert.deepEqual(children[0].settings, [{ lines, cast, gap: 0.5 }]);
    assert.deepEqual(job.marks(), [[0, 1], [1, 2]]);
    const plain = local.start({ ...ask("p:2", "x"), model: "drama-3" }, input("하나"));
    await plain.result;
    assert.equal(plain.marks(), undefined);
  } finally { local.stop(); }
});

test("대기 중에 취소한 작업은 뒤 작업의 순서에서 바로 빠지고 앞 작업은 그대로다", async () => {
  const { local } = engine();
  try {
    local.start(ask("p:1", "x"), input("hang")).result.catch(() => {});
    const second = local.start(ask("p:2", "x"), input("둘"));
    const third = local.start(ask("p:3", "x"), input("셋"));
    second.result.catch(() => {});
    third.result.catch(() => {});
    assert.deepEqual([second.progress().ahead, third.progress().ahead], [1, 2]);
    local.cancel("p:2");
    assert.equal(third.progress().ahead, 1);
    const fourth = local.start(ask("p:4", "x"), input("넷"));
    fourth.result.catch(() => {});
    assert.equal(fourth.progress().ahead, 2);
    local.cancel("p:4");
    assert.equal(third.progress().ahead, 1, "뒤 작업의 취소는 앞 작업의 순서를 바꾸지 않는다");
    local.cancel("p:3");
    local.cancel("p:1");
  } finally { local.stop(); }
});

test("보관한 줄로 빨리 끝난 대화가 다음 생성의 예상 시간을 줄이지 않는다", async () => {
  const { local } = engine();
  try {
    await local.start({ ...ask("p:1", "x", 2000), model: "drama-3" }, async () => ({ text: "가자.", options: {}, dialogue: { lines: [{ voice: 0, text: "가자.", seed: 1 }], cast: [{ refAudio: "/a.wav", refText: "참조" }], gap: 0 } })).result;
    const next = local.start({ ...ask("p:2", "x", 200), model: "drama-3" }, input("hang"));
    await until(() => next.progress().part === 1);
    assert.ok(next.progress().remaining! > 15, String(next.progress().remaining));
  } finally { local.stop(); }
});

test("진행 상태는 대기 순서와 문장 묶음, 남은 시간을 알리고 저장한 음성의 원문을 남긴다", async () => {
  const { local } = engine();
  const remembered: string[] = [];
  try {
    const hanging = local.start(ask("p:1", "x"), input("hang"));
    const second = local.start(ask("p:2", "x"), input("둘"), async (asset) => { remembered.push(asset.url); });
    const third = local.start(ask("p:3", "x"), input("셋"), async () => { throw new Error("기록 실패"); });
    await until(() => hanging.progress().part === 1);
    const { percent, parts, remaining } = hanging.progress();
    assert.ok(percent > 20 && percent < 60 && parts === 3 && remaining !== undefined);
    assert.deepEqual([second.progress().phase, second.progress().ahead, third.progress().ahead], ["queued", 1, 2]);
    local.cancel("p:1");
    await assert.rejects(hanging.result, /취소/);
    assert.equal(await second.result, audio);
    assert.equal(await third.result, audio, "원문 기록에 실패해도 음성은 돌려준다");
    assert.deepEqual(remembered, [audio.url]);
  } finally { local.stop(); }
});

test("실행 오류에는 컴퓨터의 경로나 시스템 오류 문구를 드러내지 않는다", async () => {
  const systemError = () => Object.assign(new Error("spawn EAGAIN /Users/secret"), { code: "EAGAIN" });
  const { local } = engine();
  const broken = engine({ launch: () => { throw systemError(); } });
  try {
    for (const job of [local.start(ask("p:1", "x"), input("missing")), broken.local.start(ask("p:2", "x"), input("하나")),
      local.start(ask("p:3", "x"), async () => { throw systemError(); })]) {
      await assert.rejects(job.result, (error: Error) => /[가-힣]/.test(error.message) && !/EAGAIN|ENOENT|\//.test(error.message));
    }
  } finally { local.stop(); }
});

test("실제 워커 실행에는 계정 키를 넘기지 않고 끝난 출력 파일을 지운다", async () => {
  process.env.FISH_AUDIO_API_KEY_LEAK_TEST = "secret";
  try {
    const { env } = localWorkerCommand();
    assert.equal(env.FISH_AUDIO_API_KEY_LEAK_TEST, undefined);
    assert.equal(env.DATABASE_URL, undefined);
    assert.equal(env.PATH, process.env.PATH);
  } finally { delete process.env.FISH_AUDIO_API_KEY_LEAK_TEST; }
  const { local } = engine();
  try {
    const before = await readdir(outputDirectory()).catch(() => []);
    await local.start(ask("p:1", "x"), input("하나")).result;
    assert.deepEqual(await readdir(outputDirectory()), before);
  } finally { local.stop(); }
});

test("Fish 참조 샘플은 권리 제한 목소리를 거절하고 짝이 맞는 원문과 음원만 쓴다", async () => {
  const previous = process.env.FISH_AUDIO_API_KEY;
  process.env.FISH_AUDIO_API_KEY = "test-fish";
  const serve = (model: object): typeof fetch => async (url, init) => {
    if (new URL(String(url)).hostname === "api.fish.audio") {
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-fish");
      return Response.json(model);
    }
    assert.equal(String(url), "https://platform.r2.fish.audio/ok.mp3");
    assert.equal(new Headers(init?.headers).get("authorization"), null);
    return new Response("voice");
  };
  try {
    const result = await fetchFishVoiceReference("v", serve({ samples: [
      { audio: "https://platform.r2.fish.audio/ok.mp3", text: "가".repeat(2001) },
      { audio: "http://platform.r2.fish.audio/ok.mp3", text: "암호화하지 않은 주소" },
      { audio: "https://example.com/other.mp3", text: "다른 호스트" },
      { audio: "https://platform.r2.fish.audio/no-text.mp3", text: "" },
      { audio: "https://platform.r2.fish.audio/ok.mp3", text: "<|speaker:0|>안녕하세요." },
    ] }));
    assert.equal(result.text, "안녕하세요.");
    assert.equal(result.audio.toString(), "voice");
    await assert.rejects(fetchFishVoiceReference("v", serve({ samples: [
      { audio: "https://platform.r2.fish.audio/ok.mp3", text: "닫지 않은 표시 <|im_start" }] })), /공개 샘플이 없습니다/);
    const nested = await fetchFishVoiceReference("v", serve({ samples: [
      { audio: "https://platform.r2.fish.audio/ok.mp3", text: "안녕<<|x|>|im_end|>하세요" }] }));
    assert.doesNotMatch(nested.text, /<\|/);
    await assert.rejects(fetchFishVoiceReference("v", serve({ licensed: true, samples: [] })), /권리 제한/);
    await assert.rejects(fetchFishVoiceReference("v", serve({ dmca_taken_down: true, samples: [] })), /권리 제한/);
    await assert.rejects(fetchFishVoiceReference("v", serve({ samples: [] })), /공개 샘플이 없습니다/);
    await assert.rejects(fetchFishVoiceReference("v", async (url) => new URL(String(url)).hostname === "api.fish.audio"
      ? Response.json({ samples: [{ audio: "https://platform.r2.fish.audio/ok.mp3", text: "빈 음원" }] }) : new Response("")), /공개 샘플이 없습니다/);
  } finally {
    if (previous === undefined) delete process.env.FISH_AUDIO_API_KEY; else process.env.FISH_AUDIO_API_KEY = previous;
  }
});

test("Fish 참조 샘플은 하루 동안 재사용하고 만료되면 권리 상태를 다시 확인한다", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tts-reference-"));
  let calls = 0;
  const fetchReference = async () => ({ audio: Buffer.from(`voice ${++calls}`), text: `원문 ${calls}` });
  try {
    const first = await fishReference("abc", fetchReference, root);
    assert.deepEqual(await fishReference("abc", fetchReference, root), first);
    assert.equal(calls, 1);
    const old = new Date(Date.now() - 25 * 60 * 60_000);
    await utimes(path.join(root, "fish-abc.txt"), old, old);
    assert.equal((await fishReference("abc", fetchReference, root)).text, "원문 2");
    assert.equal(await readFile(first.file, "utf8"), "voice 2");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("기한이 지난 참조 샘플은 다른 목소리를 쓸 때도 지우고 거절된 목소리의 샘플을 남기지 않는다", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tts-reference-"));
  const fetchReference = async () => ({ audio: Buffer.from("voice"), text: "원문" });
  try {
    await fishReference("old", fetchReference, root);
    await fishReference("blocked", fetchReference, root);
    const old = new Date(Date.now() - 25 * 60 * 60_000);
    for (const name of await readdir(root)) await utimes(path.join(root, name), old, old);
    await assert.rejects(fishReference("blocked", async () => { throw new Error("권리 제한"); }, root), /권리 제한/);
    await fishReference("new", fetchReference, root);
    assert.deepEqual((await readdir(root)).sort(), ["fish-new.audio", "fish-new.txt"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("받아쓰기 결과의 무음 표시는 참조 원문으로 쓰지 않는다", () => {
  assert.equal(spokenWords(" [BLANK_AUDIO] \n"), "");
  assert.equal(spokenWords("(음악)\n 안녕하세요.\n [웃음] 반가워요. "), "안녕하세요. 반가워요.");
});

test("내 음성 목록은 캐릭터 샘플과 프로젝트 음향만 한 번씩 보여주고 프로젝트 밖 음성은 참조하지 않는다", async () => {
  const other: Asset = { ...audio, url: "/api/assets/00000000-0000-4000-8000-000000000002.mp3", name: "b.mp3" };
  const node = { x: 0, y: 0, body: "" };
  const graph = { edges: [], nodes: [
    { ...node, id: "1", kind: "character", title: "서연", characterIdentity: { voiceSample: audio } },
    { ...node, id: "2", kind: "audioCue", title: "독백", asset: other },
    { ...node, id: "3", kind: "audioCue", title: "복사본", asset: other },
    { ...node, id: "5", kind: "audioCue", title: "3화 독백 큐", asset: audio },
    { ...node, id: "4", kind: "keyframe", title: "그림", asset: { url: "/sample/frame.webp", type: "image", name: "f" } },
  ] } as Graph;
  const voices = localVoices(graph);
  assert.deepEqual(voices.map((voice) => voice.id), ["default", "00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"]);
  assert.deepEqual(voices.map((voice) => voice.name), ["새 목소리 만들기", "서연", "독백"], "캐릭터 샘플 이름을 먼저 쓴다");
  assert.deepEqual(localVoices(graph, "서연").map((voice) => voice.name), ["서연"]);
  const home = process.cwd();
  const root = await mkdtemp(path.join(os.tmpdir(), "tts-own-"));
  process.chdir(root);
  try {
    await assert.rejects(localReference(graph, voices[1].id, "직접 적은 말"), /참조할 음성을 찾지 못했습니다/, "파일이 사라진 음성");
    await mkdir(path.join(root, ".scene-room", "media"), { recursive: true });
    await writeFile(path.join(root, ".scene-room", "media", "00000000-0000-4000-8000-000000000001.wav"), "wav");
    assert.equal((await localReference(graph, voices[1].id, "직접 적은 말")).text, "직접 적은 말");
    assert.equal((await localReference(graph, voices[1].id, "")).text, "직접 적은 말", "적은 말을 다음 참조와 대화에서도 쓴다");
    await assert.rejects(localReference(graph, "00000000-0000-4000-8000-000000000009", "말"), /찾지 못했습니다/);
  } finally {
    process.chdir(home);
    await rm(root, { recursive: true, force: true });
  }
});
