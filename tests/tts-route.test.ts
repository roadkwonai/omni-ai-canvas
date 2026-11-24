import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { castSample } from "../lib/dialogue";
import { localTts } from "../lib/local-tts";
import { DELETE, GET, POST } from "../app/api/projects/[id]/tts/route";
import { POST as DIRECT } from "../app/api/projects/[id]/tts/direct/route";

const project = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const sample = { url: "/api/assets/00000000-0000-4000-8000-000000000001.wav", type: "audio", name: "a.wav" };
const graphs: Record<string, object> = {
  [project]: { nodes: [{ id: "c", kind: "character", title: "서연", body: "", x: 0, y: 0, characterIdentity: { voiceSample: sample } }], edges: [] },
  [other]: { nodes: [], edges: [] },
};
const database = { delay: 0, fail: false, queries: [] as string[], catalog: [] as object[] };
const previous = { cwd: process.cwd(), fetch: globalThis.fetch, url: process.env.DATABASE_URL };
let root = "";
const sampleFile = () => path.join(root, ".scene-room", "media", "00000000-0000-4000-8000-000000000001.wav");

function result(rows: object[]) {
  const names = Object.keys(rows[0] ?? {});
  return { command: "SELECT", rowCount: rows.length, rowAsArray: false, fields: names.map((name) => ({ name, dataTypeID: 114 })),
    rows: rows.map((row) => names.map((name) => JSON.stringify((row as Record<string, unknown>)[name]))) };
}

// 모델 대신 받은 요청을 기록하고 짧은 WAV를 쓰는 실행 파일.
const python = `#!${process.execPath}
const fs = require("node:fs");
require("node:readline").createInterface({ input: process.stdin }).on("line", (line) => {
  const r = JSON.parse(line);
  fs.appendFileSync(__LOG__, line + "\\n");
  const wav = Buffer.alloc(44 + 8820);
  wav.write("RIFF"); wav.writeUInt32LE(36 + 8820, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(88200, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(8820, 40);
  setTimeout(() => { fs.writeFileSync(r.output, wav); console.log(JSON.stringify({ id: r.id, event: "done", seconds: 0.1, ...(r.lines ? { marks: r.lines.map((_, i) => [i, i + 1]) } : {}) })); }, r.text.includes("느리게") ? 400 : 0);
});`;

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), "scene-tts-route-"));
  process.chdir(root);
  root = process.cwd();
  const home = path.join(root, ".scene-room", "local-tts");
  await mkdir(path.join(home, ".venv", "bin"), { recursive: true });
  await mkdir(path.join(home, "models", "s2-pro-8bit"), { recursive: true });
  await mkdir(path.join(root, "scripts"));
  await writeFile(path.join(home, "models", "s2-pro-8bit", ".ready"), "");
  await writeFile(path.join(home, ".venv", "bin", "python"), python.replace("__LOG__", JSON.stringify(path.join(root, "worker.log"))));
  await chmod(path.join(home, ".venv", "bin", "python"), 0o755);
  await mkdir(path.join(root, ".scene-room", "media"), { recursive: true });
  await writeFile(sampleFile(), "wav");
  process.env.DATABASE_URL = "postgresql://u:p@db.invalid/x";
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    const { query, params } = JSON.parse(String(init.body)) as { query: string; params: unknown[] };
    database.queries.push(query);
    await new Promise((resolve) => setTimeout(resolve, database.delay));
    if (database.fail) return Response.json({ message: "connection terminated" }, { status: 500 });
    if (query.includes("EXISTS (") && query.includes("projects")) return Response.json(result([{ found: params[0] === project || params[0] === other }]));
    if (query.includes("FROM drama_canvas.projects")) {
      const graph = graphs[String(params[0])];
      return Response.json(result(graph ? [{ id: params[0], title: "t", graph, version: 1, updated_at: "2026-11-24T00:00:00Z", deleted_at: null }] : []));
    }
    if (query.includes("name_ko, description_ko, preview_url")) return Response.json(result(database.catalog));
    if (query.includes("max(fetched_at)")) return Response.json(result([{ count: 101, last_synced_at: "2026-11-24T00:00:00Z", complete: true, syncing: false, next_page: 1, next_scope: 0, scope_plan: [] }]));
    if (query.includes("'tag' AS kind")) return Response.json(result([{ kind: "language", value: "ko", label_ko: null }, { kind: "tag", value: "calm", label_ko: "차분한" }]));
    throw new Error(`예상하지 못한 쿼리 ${query.slice(0, 80)}`);
  }) as typeof fetch;
});
beforeEach(() => Object.assign(database, { delay: 0, fail: false, queries: [], catalog: [] }));
after(async () => {
  localTts().stop();
  process.chdir(previous.cwd);
  globalThis.fetch = previous.fetch;
  if (previous.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.url;
  await rm(root, { recursive: true, force: true });
});

const headers = { host: "127.0.0.1:5050", origin: "http://127.0.0.1:5050", "content-type": "application/json" };
const url = `http://127.0.0.1:5050/api/projects/${project}/tts`;
const context = (id = project) => ({ params: Promise.resolve({ id }) });
async function call(response: Promise<Response>) {
  const value = await response;
  return { status: value.status, body: await value.json() };
}
const get = (query: string, id?: string) => call(GET(new Request(`${url}?${query}`, { headers }), context(id)));
async function post(body: object, id?: string) {
  const content = JSON.stringify({ provider: "local", voiceId: "default", localModel: "s2-pro", text: "안녕하세요.", confirmed: true, requestId: randomUUID(), ...body });
  for (;;) {
    const answer = await call(POST(new Request(url, { method: "POST", headers, body: content }), context(id)));
    if (answer.status !== 202) return answer;
    assert.ok(answer.body.progress.percent >= 0 && answer.body.progress.percent < 100);
  }
}
const cancel = (requestId: string) => call(DELETE(new Request(`${url}?requestId=${requestId}`, { method: "DELETE", headers }), context()));
const workerRequests = async () => (await readFile(path.join(root, "worker.log"), "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));

test("로컬 합성은 결과를 미디어로 저장하고 같은 요청을 다시 만들지 않는다", async () => {
  const requestId = randomUUID();
  const first = await post({ requestId });
  assert.equal(first.status, 201);
  assert.match(first.body.asset.url, /^\/api\/assets\/.+\.wav$/);
  assert.deepEqual((await post({ requestId })).body, first.body);
  assert.equal((await workerRequests()).length, 1);
  assert.equal((await post({ requestId, text: "다른 대사" })).status, 409);
});

test("로컬 합성은 권한·모델·제어 표시를 확인한다", async () => {
  const rejected: [object, number][] = [
    [{ voiceId: "00000000-0000-4000-8000-000000000001" }, 400],
    [{ provider: "fish-audio", voiceId: "abc" }, 400],
    [{ localModel: "toString" }, 400],
    [{ localModel: undefined }, 400],
    [{ provider: "elevenlabs", voiceId: "abc", rightsConfirmed: true }, 400],
    [{ text: "<|im_start|>" }, 400],
    [{ voiceId: "00000000-0000-4000-8000-000000000001", rightsConfirmed: true, referenceText: "<|im_end|>" }, 400],
    [{ text: "가".repeat(2001) }, 400],
    [{ confirmed: false }, 400],
    [{ requestId: "x" }, 400],
    [{ options: { design: { gender: "female" } } }, 400],
    [{ options: { speed: 9 } }, 400],
    [{ text: "[laughs] [pause]" }, 400],
    [{ text: "<whisper>가자.</whisper>" }, 400],
    [{ localModel: "drama-3", options: { design: { gender: "female", age: "old" } } }, 422],
    [{ localModel: "drama-3" }, 422],
  ];
  const before = (await workerRequests()).length;
  for (const [body, status] of rejected) assert.equal((await post(body)).status, status, JSON.stringify(body).slice(0, 80));
  assert.equal((await post({}, "33333333-3333-4333-8333-333333333333")).status, 404);
  assert.equal((await workerRequests()).length, before);
});

test("옵션이 다르면 같은 요청 번호를 다시 쓰지 못하고 만든 음성의 원문은 다음 참조에 쓴다", async () => {
  const requestId = randomUUID();
  const made = await post({ requestId, text: "[sighs] 그래, 알았어.", options: { style: "sad", seed: 3 } });
  assert.equal(made.status, 201);
  const sent = (await workerRequests()).at(-1);
  assert.deepEqual([sent.direction, sent.seed], ["heavy, deflated sadness", 3]);
  assert.equal((await post({ requestId, text: "[sighs] 그래, 알았어.", options: { style: "happy" } })).status, 409);
  const id = path.basename(made.body.asset.url, ".wav");
  const own = "44444444-4444-4444-8444-444444444444";
  graphs[own] = { nodes: [{ id: "c", kind: "character", title: "만든 목소리", body: "", x: 0, y: 0, characterIdentity: { voiceSample: made.body.asset } }], edges: [] };
  assert.equal((await post({ voiceId: id, rightsConfirmed: true }, own)).status, 201);
  assert.equal((await workerRequests()).at(-1).refText, "그래, 알았어.");
});

test("만든 음성을 들려주고 다시 연기하며 그 프로젝트에서 만든 음성만 기준으로 쓴다", async () => {
  const first = await post({ text: "[sighs] 그래, 알았어." });
  const retakeOf = path.basename(first.body.asset.url, ".wav");
  const body = { localModel: "drama-3", text: "그래, 이제 알았어.", retakeOf, options: { style: "slow" } };
  const ready = path.join(root, ".scene-room", "local-tts", "models", "drama-3-4bit");
  await mkdir(ready, { recursive: true });
  await writeFile(path.join(ready, ".ready"), "");
  try {
    const requestId = randomUUID();
    assert.equal((await post({ ...body, requestId })).status, 201);
    const sent = (await workerRequests()).at(-1);
    assert.deepEqual([sent.retake, sent.refText, sent.direction], [true, "그래, 알았어.", "slower, with more pauses"]);
    assert.equal(sent.refAudio, path.join(root, ".scene-room", "media", `${retakeOf}.wav`));
    assert.equal((await post({ ...body, requestId, retakeOf: undefined, options: {} })).status, 409);
    for (const [change, status] of [
      [{ localModel: "s2-pro" }, 400], [{ retakeOf: "../x" }, 400], [{ retakeOf: 3 }, 400], [{ options: { design: { gender: "female" } } }, 400],
      [{ retakeOf: "00000000-0000-4000-8000-000000000001" }, 422], [{ options: { seconds: 1 } }, 400],
    ] as [object, number][]) assert.equal((await post({ ...body, ...change })).status, status, JSON.stringify(change));
    assert.equal((await post(body, other)).status, 422, "다른 프로젝트에서 만든 음성은 쓰지 않는다");
    assert.equal((await post({ ...body, voiceId: "00000000-0000-4000-8000-000000000001" })).status, 400, "참조 음성의 권한 확인은 그대로 필요하다");
    assert.equal((await post({ ...body, retakeOf: undefined, options: { seconds: 3 } })).status, 201);
    assert.equal((await workerRequests()).at(-1).seconds, 3);
  } finally { await rm(ready, { recursive: true }); }
});

test("기준 음성이나 참조 파일이 사라졌으면 무엇을 찾지 못했는지 알린다", async () => {
  const made = await post({ text: "지워질 음성." });
  const retakeOf = path.basename(made.body.asset.url, ".wav");
  await rm(path.join(root, ".scene-room", "media", `${retakeOf}.wav`));
  const ready = path.join(root, ".scene-room", "local-tts", "models", "drama-3-4bit");
  await mkdir(ready, { recursive: true });
  await writeFile(path.join(ready, ".ready"), "");
  try {
    const before = (await workerRequests()).length;
    const answer = await post({ localModel: "drama-3", retakeOf });
    assert.equal(answer.status, 422);
    assert.match(answer.body.error, /다시 연기할 음성을 찾지 못했습니다/);
    await rm(sampleFile());
    const missing = await post({ voiceId: "00000000-0000-4000-8000-000000000001", rightsConfirmed: true, referenceText: "참조한 말" });
    assert.match(missing.body.error ?? "", /참조할 음성/);
    assert.equal((await workerRequests()).length, before);
  } finally { await Promise.all([rm(ready, { recursive: true }), writeFile(sampleFile(), "wav")]); }
});

test("여러 화자 대화는 화자마다 정한 목소리로 만들고 줄마다 시각을 돌려준다", async () => {
  const voiceId = "00000000-0000-4000-8000-000000000001";
  const dialogue = {
    lines: [{ speaker: "서연", text: "[낮게] 가자." }, { speaker: "은찬", text: "어디로?" }, { speaker: "은찬", text: "어디로?", take: 1 }],
    cast: [{ name: "서연", voiceId }, { name: "은찬", design: { gender: "male", age: "teen" }, seed: 7 }], gap: 0.4, seed: 3,
  };
  const ask = (change: object = {}, id?: string) => post({ voiceId: undefined, text: undefined, localModel: undefined, dialogue, rightsConfirmed: true, ...change }, id);
  assert.equal((await ask()).status, 422, "Drama 3가 없으면 만들지 않는다");
  const ready = path.join(root, ".scene-room", "local-tts", "models", "drama-3-4bit");
  const spokenFile = path.join(root, ".scene-room", "tts-references", "asset-00000000-0000-4000-8000-000000000001.txt");
  await mkdir(ready, { recursive: true });
  await mkdir(path.dirname(spokenFile), { recursive: true });
  await writeFile(path.join(ready, ".ready"), "");
  await writeFile(spokenFile, "참조한 말");
  try {
    const requestId = randomUUID();
    const made = await ask({ requestId });
    assert.equal(made.status, 201);
    assert.deepEqual(made.body.marks, [[0, 1], [1, 2], [2, 3]]);
    const sent = (await workerRequests()).at(-1);
    assert.deepEqual(sent.cast, [
      { refAudio: path.join(root, ".scene-room", "media", `${voiceId}.wav`), refText: "참조한 말" }, { design: { description: "teenage boy, about sixteen" }, seed: 7, refText: castSample },
    ]);
    assert.deepEqual(sent.lines.map(({ voice, text }: { voice: number; text: string }) => [voice, text]), [[0, "[낮게] 가자."], [1, "어디로?"], [1, "어디로?"]]);
    assert.equal(new Set(sent.lines.map(({ seed }: { seed: number }) => seed)).size, 3, "다시 만드는 줄은 시드가 다르다");
    assert.equal(sent.gap, 0.4);
    assert.match(sent.model, /drama-3-4bit$/);
    assert.deepEqual((await ask({ requestId })).body, made.body);
    assert.equal((await ask({ requestId, dialogue: { ...dialogue, gap: 1 } })).status, 409);
    const moved = { ...dialogue, lines: [{ speaker: "은찬", text: "잠깐." }, ...dialogue.lines] };
    await ask({ dialogue: moved });
    assert.deepEqual((await workerRequests()).at(-1).lines.slice(1), sent.lines, "줄을 끼워 넣어도 다른 줄은 그대로다");
    for (const [change, status] of [
      [{ rightsConfirmed: false }, 400], [{ dialogue: { ...dialogue, gap: 9 } }, 400], [{ dialogue: null }, 400], [{ confirmed: false }, 400], [{ requestId: "x" }, 400],
    ] as [object, number][]) assert.equal((await ask(change)).status, status, JSON.stringify(change).slice(0, 60));
    assert.equal((await ask({}, other)).status, 422, "다른 프로젝트의 음성은 쓰지 않는다");
    assert.equal((await ask({ rightsConfirmed: false, dialogue: { ...dialogue, lines: dialogue.lines.slice(1), cast: dialogue.cast.slice(1) } })).status, 201, "설계한 목소리만 쓰면 권한 확인이 필요 없다");
  } finally { await Promise.all([rm(ready, { recursive: true }), rm(spokenFile)]); }
});

test("연기 지시 요청은 대사와 프로젝트를 확인한 뒤에만 에이전트를 부른다", async () => {
  const direct = (body: object, id = project) => call(DIRECT(new Request(`${url}/direct`, { method: "POST", headers, body: JSON.stringify(body) }), context(id)));
  const body = { model: "drama-3", lines: [{ speaker: "시우", text: "가자." }], context: "" };
  assert.equal((await direct({ ...body, lines: [] })).status, 400);
  assert.equal((await direct({ ...body, model: "toString" })).status, 400);
  assert.equal((await direct(body, "33333333-3333-4333-8333-333333333333")).status, 404);
  assert.equal((await direct(body, "x")).status, 404);
});

test("프로젝트 음성은 권한을 확인하고 그 프로젝트 안에서만 참조한다", async () => {
  const body = { voiceId: "00000000-0000-4000-8000-000000000001", rightsConfirmed: true, referenceText: "참조한 말" };
  assert.equal((await post(body)).status, 201);
  const request = (await workerRequests()).at(-1);
  assert.equal(request.refText, "참조한 말");
  assert.equal(request.refAudio, path.join(root, ".scene-room", "media", "00000000-0000-4000-8000-000000000001.wav"));
  assert.equal((await post(body, other)).status, 422);
});

test("이어 기다리는 요청은 DB 연결이 끊겨도 진행 중인 작업을 놓치지 않는다", async () => {
  const requestId = randomUUID();
  const first = post({ requestId, text: "느리게 말하기" });
  await new Promise((resolve) => setTimeout(resolve, 100));
  database.fail = true;
  const second = await post({ requestId, text: "느리게 말하기" });
  assert.equal(second.status, 201);
  assert.deepEqual((await first).body, second.body);
});

test("취소는 시작 요청보다 먼저 도착해도 그 작업을 막고 다른 작업에는 영향을 주지 않는다", async () => {
  database.delay = 100;
  const requestId = randomUUID();
  const started = post({ requestId, text: "취소할 대사" });
  assert.equal((await cancel(requestId)).status, 200);
  const result = await started;
  assert.equal(result.status, 422);
  assert.match(result.body.error, /취소/);
  assert.equal((await post({})).status, 201);
  assert.ok((await workerRequests()).every((request) => request.text !== "취소할 대사"));
});

test("목소리 목록의 첫 페이지는 필터 정보를 주고 이어 읽는 페이지는 행만 준다", async () => {
  database.catalog = Array.from({ length: 101 }, (_, index) => ({ id: `v${index}`, name: `목소리 ${index}`, description: null, name_ko: null,
    description_ko: null, preview_url: null, gender: null, tags: [], languages: [] }));
  const first = await get("provider=fish-audio&sort=popular");
  assert.equal(first.status, 200);
  assert.equal(first.body.voices.length, 100);
  assert.equal(first.body.nextCursor, "db:100");
  assert.deepEqual([first.body.tags, first.body.languages, first.body.cache.count], [["calm"], ["ko"], 101]);
  database.queries = [];
  assert.deepEqual((await get("provider=fish-audio&sort=recent")).body.tags, ["calm"]);
  assert.ok(database.queries.every((query) => !query.includes("'tag' AS kind")), "필터 목록을 잠시 재사용한다");
  database.queries = [];
  database.catalog = database.catalog.slice(0, 1);
  const next = await get("provider=fish-audio&sort=popular&cursor=db:100");
  assert.deepEqual(Object.keys(next.body).sort(), ["pageSize", "voices"], "마지막 페이지에는 다음 위치가 없다");
  assert.ok(database.queries.every((query) => !query.includes("count(*)") && !query.includes("'tag' AS kind")));
  assert.ok(database.queries.some((query) => query.includes("OFFSET")));
});

test("목소리 목록은 없는 프로젝트와 잘못된 조건을 거절하고 내 음성은 그 프로젝트 것만 보여준다", async () => {
  assert.equal((await get("provider=fish-audio", "33333333-3333-4333-8333-333333333333")).status, 404);
  assert.equal((await get("provider=fish-audio&age=toString")).status, 400);
  assert.equal((await get("provider=fish-audio&cursor=db:-1")).status, 400);
  assert.equal((await get("provider=unknown")).status, 400);
  assert.deepEqual((await get("provider=local")).body.voices.map((voice: { name: string }) => voice.name), ["새 목소리 만들기", "서연"]);
  assert.deepEqual((await get("provider=local", other)).body.voices.map((voice: { name: string }) => voice.name), ["새 목소리 만들기"]);
  assert.deepEqual((await get("")).body.localModels, { "s2-pro": true, "drama-3": false });
});
