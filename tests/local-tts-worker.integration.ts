// 설치한 실제 모델로 워커를 확인한다. npm run test:local-tts
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { after, before, test } from "node:test";
import { localTtsReady, localWorkerCommand } from "../lib/local-tts";

const model = (folder: string) => path.join(process.cwd(), ".scene-room", "local-tts", "models", folder);
const short = "오늘은 일찍 눈을 떴어요. 창밖에는 비가 내려요.";
const long = "할머니는 아무 말 없이 낡은 사진첩을 꺼냈다. 그 안에는 내가 본 적 없는 젊은 날의 아버지가 환하게 웃고 있었다. 그날 밤 우리는 바닷가에 오래 앉아 있었다. 파도는 낮게 밀려왔다가 조용히 물러갔고, 멀리서 등대 불빛이 천천히 돌았다. 나는 무슨 말이든 해야 했다.";
let root = "";
before(async () => {
  assert.deepEqual(await localTtsReady(), { "s2-pro": true, "drama-3": true }, "npm run setup:local-tts로 두 모델을 설치해 주세요.");
  root = await mkdtemp(path.join(tmpdir(), "tts-worker-"));
});
after(() => rm(root, { recursive: true, force: true }));

async function run(requests: object[]) {
  const { command, args, env } = localWorkerCommand();
  const child = spawn(command, args, { env, stdio: ["pipe", "pipe", "ignore"] });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const results: { hash: string; output: string; seconds: number; marks?: [number, number][]; parts: number; part: number; events: string[] }[] = [];
  try {
    for (const [index, request] of requests.entries()) {
      const output = path.join(root, `${crypto.randomUUID()}.wav`);
      child.stdin.write(JSON.stringify({ id: String(index), output, seed: 5, ...request }) + "\n");
      const events: { event: string; fraction?: number; part?: number; parts?: number; message?: string; seconds?: number; marks?: [number, number][] }[] = [];
      while (!events.length || !["done", "error"].includes(events.at(-1)!.event)) events.push(JSON.parse((await lines.next()).value));
      assert.equal(events.at(-1)!.event, "done", events.at(-1)!.message);
      const made = events.filter((event) => event.fraction !== undefined);
      const fractions = made.map((event) => event.fraction!);
      assert.deepEqual(fractions, [...fractions].sort((a, b) => a - b), "진행 비율은 줄어들지 않는다");
      assert.ok(fractions.every((value) => value >= 0 && value <= 1));
      results.push({ output, marks: events.at(-1)!.marks, seconds: events.at(-1)!.seconds!, hash: createHash("sha256").update(await readFile(output)).digest("hex"), parts: made.at(-1)!.parts!, part: made.at(-1)!.part!, events: events.map((event) => event.event) });
    }
  } finally { child.kill("SIGKILL"); }
  return results;
}

for (const folder of ["s2-pro-8bit", "drama-3-4bit"]) {
  test(`${folder}은 새 워커의 첫 요청부터 만들고 연기 지시와 시드를 반영한다`, { timeout: 300_000 }, async () => {
    const base = { model: model(folder), text: short };
    const [first, again, directed, split] = await run([base, base, { ...base, direction: "whispering softly" }, { ...base, text: long }]);
    assert.equal(first.events[0], "loading");
    assert.equal(again.events[0], "generating", "올려 둔 모델을 다시 쓴다");
    assert.equal(again.hash, first.hash, "같은 시드는 같은 음성을 만든다");
    assert.notEqual(directed.hash, first.hash, "연기 지시가 결과를 바꾼다");
    assert.ok(split.parts > 1 && split.part === split.parts, "긴 대사를 나눠 끝까지 만든다");
  });
}

test("Drama 3의 목소리 설명은 다음 요청에 남지 않는다", { timeout: 300_000 }, async () => {
  const base = { model: model("drama-3-4bit"), text: short };
  const [plain, designed, other, plainAgain] = await run([base, { ...base, design: { description: "elderly man, about seventy-five" } },
    { ...base, design: { description: "little girl, about seven years old", scene: "조용한 방" } }, base]);
  assert.equal(new Set([plain.hash, designed.hash, other.hash]).size, 3);
  assert.equal(plainAgain.hash, plain.hash);
});

test("모델을 바꿔도 앞 모델의 설정이 섞이지 않는다", { timeout: 300_000 }, async () => {
  const [s2, , s2Again] = await run([{ model: model("s2-pro-8bit"), text: short }, { model: model("drama-3-4bit"), text: short, design: { description: "adult man" } },
    { model: model("s2-pro-8bit"), text: short }]);
  assert.equal(s2Again.hash, s2.hash);
});

test("Drama 3는 목표 길이에 맞춰 늘이고 앞 음성을 기준으로 다시 연기한다", { timeout: 300_000 }, async () => {
  const base = { model: model("drama-3-4bit"), text: short };
  const [take, stretched, designed] = await run([base, { ...base, seconds: 9 }, { ...base, seconds: 9, design: { description: "adult man" } }]);
  for (const made of [stretched, designed]) assert.ok(Math.abs(made.seconds - 9) < 2, `목표 9초, 실제 ${made.seconds}초`);
  const again = { ...base, retake: true, refAudio: take.output, refText: short };
  const [kept, directed, edited, plain] = await run([again, { ...again, direction: "whispering softly" }, { ...again, text: "오늘은 늦게 눈을 떴어요." }, base]);
  assert.equal(new Set([take.hash, kept.hash, directed.hash]).size, 3, "지시가 있으면 앞 연기를 이어 가지 않는다");
  assert.ok(edited.seconds < take.seconds, `짧게 고친 대사 ${edited.seconds}초, 앞 음성 ${take.seconds}초`);
  assert.equal(plain.hash, take.hash, "다시 연기한 설정이 다음 요청에 남지 않는다");
});

test("Drama 3는 여러 화자의 대화를 줄마다 만들고 한 줄만 바꿔도 다른 줄은 그대로 둔다", { timeout: 300_000 }, async () => {
  const refText = "오늘은 일찍 눈을 떴어요. 창밖에는 밤새 내린 비가 아직 흐르고 있었죠.";
  const cast = [{ design: { description: "young man in his twenties, deep, low-pitched voice" }, seed: 3, refText }, { design: { description: "little girl, about seven years old" }, seed: 3, refText }];
  const lines = [{ voice: 0, text: "다녀왔어.", seed: 1 }, { voice: 1, text: "오빠, 왜 이렇게 늦었어?", seed: 2 }, { voice: 0, text: "[sighs] 미안, 일이 많았어.", seed: 3 }];
  const base = { model: model("drama-3-4bit"), text: "", cast, gap: 0.5 };
  const [first, again, changed] = await run([{ ...base, lines }, { ...base, lines }, { ...base, lines: [lines[0], { ...lines[1], seed: 9 }, lines[2]] }]);
  assert.equal(again.hash, first.hash);
  assert.notEqual(changed.hash, first.hash);
  assert.equal(first.parts, 3);
  assert.equal(first.marks!.length, 3);
  for (const index of [1, 2]) assert.ok(Math.abs(first.marks![index][0] - first.marks![index - 1][1] - 0.5) < 0.01, "줄 사이에 정한 만큼 쉰다");
  const lengths = (made: typeof first) => made.marks!.map(([from, to]) => Math.round((to - from) * 1000));
  assert.deepEqual([lengths(changed)[0], lengths(changed)[2]], [lengths(first)[0], lengths(first)[2]]);
  assert.ok(Math.abs(first.marks![2][1] - first.seconds) < 0.01);
});

test("줄 앞뒤의 무음을 다듬어 정한 만큼만 쉬고 대사에 적은 쉼은 남긴다", () => {
  const { command, args } = localWorkerCommand();
  const script = `
import json, sys, types, numpy as np
space = {}
exec(open(sys.argv[1], encoding="utf-8").read().replace("\\nmain()\\n", "\\n"), space)
engine = space["Engine"]()
rate = 1000
engine.model = types.SimpleNamespace(sample_rate=rate)
engine.reference = lambda file: np.full(rate, 0.1, np.float32)
def speak(request, voice=None, max_tokens=4096):
    quiet = np.full(300, 0.0005, np.float32)
    yield np.concatenate([quiet, np.full(1000, 0.1, np.float32), np.zeros(400, np.float32), np.full(500, 0.1, np.float32), quiet]), 1, 1, 0.5, 1.0
engine.speak = speak
texts = ["가자.", "[sighs] 그래.", "[heavy] [long pause] 내 이름이.", "있잖아 [pause]"]
marks = []
pieces = [audio for audio, _, _ in engine.dialogue({"gap": 0.5, "cast": [{"refAudio": sys.argv[1], "refText": "t"}], "lines": [{"voice": 0, "text": text, "seed": index} for index, text in enumerate(texts)]}, marks) if audio is not None]
space["events"].write(json.dumps({"lengths": [round(end - start, 3) for start, end in marks], "total": sum(map(len, pieces)) / rate, "last": marks[-1][1]}))
space["events"].flush()
`;
  const { stdout, stderr } = spawnSync(command, ["-I", "-c", script, args[1]], { encoding: "utf8" });
  const result = JSON.parse(stdout || "null");
  assert.ok(result, stderr.slice(-400));
  assert.deepEqual(result.lengths, [2, 2, 2.25, 2.25], "말 사이의 무음은 남기고 앞뒤는 0.05초만 남긴다. 적은 쉼이 있는 쪽은 그대로 둔다");
  assert.equal(Math.round(result.total * 1000), Math.round(result.last * 1000));
});

test("보관한 줄이 넘치면 오래 쓰지 않은 줄부터 버리고 만들어 둔 줄은 진행률에서 뺀다", () => {
  const { command, args } = localWorkerCommand();
  const script = `
import json, sys, types, numpy as np
source = open(sys.argv[1], encoding="utf-8").read().replace("\\nmain()\\n", "\\n")
space = {}
exec(source, space)
space["MAX_SPOKEN_LINES"] = 3
engine = space["Engine"]()
made = []
def speak(request, voice=None, max_tokens=4096):
    made.append(request["text"])
    yield np.full(44100, 0.1, np.float32), 1, 1, 0.5, 1.0
engine.speak = speak
for key in ["a", "b", "c", "a", "d", "a", "b"]:
    list(engine.line(key, {"text": key}))
engine.model = types.SimpleNamespace(sample_rate=44100)
engine.reference = lambda file: np.full(44100, 0.1, np.float32)
request = {"gap": 0, "cast": [{"refAudio": sys.argv[1], "refText": "t"}], "lines": [{"voice": 0, "text": "하나둘", "seed": 1}, {"voice": 0, "text": "셋", "seed": 2}]}
list(engine.dialogue(request, []))
request["lines"][1]["seed"] = 3
made_before = len(made)
fractions = [fraction for _, _, fraction in engine.dialogue(request, [])]
space["events"].write(json.dumps({"made": made[:5], "again": len(made) - made_before, "first": fractions[0]}))
space["events"].flush()
`;
  const { stdout, stderr } = spawnSync(command, ["-I", "-c", script, args[1]], { encoding: "utf8", env: { ...process.env, PYTHONPATH: "" } });
  const result = JSON.parse(stdout || "null");
  assert.ok(result, stderr.slice(-400));
  assert.deepEqual(result.made, ["a", "b", "c", "d", "b"], "a는 다시 써서 남고 b가 먼저 버려진다");
  assert.equal(result.again, 1);
  assert.equal(result.first, 0, "만들어 둔 줄이 진행률을 앞당기지 않는다");
});
