import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { executeRoadMusic, roadMusicInfo } from "../lib/road-music";
import { localAssetPath } from "../lib/media";
import { GET } from "../app/api/assets/[file]/route";
import type { RunInput } from "../lib/types";

test("Road Music 경로가 없는 새 환경은 설치 안내를 표시한다", async () => {
  const previous = process.env.ROAD_MUSIC_HOME;
  delete process.env.ROAD_MUSIC_HOME;
  try {
    const info = await roadMusicInfo();
    assert.equal(info.available, false);
    assert.match(info.detail ?? "", /ROAD_MUSIC_HOME/);
  } finally {
    if (previous !== undefined) process.env.ROAD_MUSIC_HOME = previous;
  }
});

function wav() {
  const data = Buffer.alloc(1600);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(16000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

test("가짜 Road Music CLI로 준비·제출·작업번호 저장·결과 검증과 Range 재생을 연결한다", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "road-fixture-"));
  const old = process.env.ROAD_MUSIC_HOME;
  process.env.ROAD_MUSIC_HOME = root;
  const songDir = path.join(root, "songs", "song");
  await mkdir(path.join(root, "cli"), { recursive: true });
  await mkdir(songDir, { recursive: true });
  await writeFile(path.join(songDir, "track.wav"), wav());
  await writeFile(
    path.join(root, "cli", "road-music.js"),
    `
const fs = require('fs'); const path = require('path'); const root = path.resolve(__dirname, '..');
const command = process.argv[2]; let input = ''; process.stdin.on('data', c => input += c); process.stdin.on('end', () => {
  fs.appendFileSync(path.join(root, 'calls'), command + '\\n');
  const data = input ? JSON.parse(input) : {};
  const ok = x => console.log(JSON.stringify({ok:true,result:x}));
  if (command === 'service:status') { if (!process.argv.includes('--no-start')) process.exit(2); ok({}); }
  else if (command === 'song:prepare') ok({valid:data.count === 1 && !fs.existsSync(path.join(root,'invalid')), changes:{style:{dropped:[]}}});
  else if (command === 'app:state') ok({songsDir:path.join(root,'songs'),engines:{ace:true}});
  else if (command === 'song:generate') { if (!data.soundEffect || data.targetSeconds !== 3) process.exit(3); ok({jobId:'job-123'}); }
  else if (command === 'job:wait') { if (!fs.existsSync(path.join(root,'saved'))) process.exit(4); ok({ok:true,song:{jobId:'job-123',dir:path.join(root,'songs','song'),audio:fs.existsSync(path.join(root,'outside')) ? '/etc/passwd' : path.join(root,'songs','song','track.wav')}}); }
  else process.exit(5);
});`,
  );
  let savedPath: string | undefined;
  try {
    assert.equal((await roadMusicInfo()).available, true);
    const input: RunInput = {
      projectId: "p",
      requestId: "r",
      nodeId: "n",
      provider: "road-music",
      operation: "audio",
      prompt: "작은 스위치 소리",
      references: [],
      audio: { engine: "ace", purpose: "sfx", seconds: 3 },
    };
    const result = await executeRoadMusic(input, async (id) => {
      assert.equal(id, "job-123");
      await writeFile(path.join(root, "saved"), id);
    });
    assert.equal(result.asset?.type, "audio");
    savedPath = localAssetPath(result.asset!);
    const response = await GET(
      new Request(`http://localhost${result.asset!.url}`, {
        headers: { host: "localhost", range: "bytes=0-9" },
      }),
      { params: Promise.resolve({ file: path.basename(result.asset!.url) }) },
    );
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-type"), "audio/wav");
    assert.equal((await response.arrayBuffer()).byteLength, 10);
    assert.deepEqual(
      (await readFile(path.join(root, "calls"), "utf8")).trim().split("\n"),
      [
        "service:status",
        "song:prepare",
        "app:state",
        "song:generate",
        "job:wait",
      ],
    );
    await assert.rejects(
      executeRoadMusic(
        { ...input, audio: { engine: "yue", purpose: "sfx", seconds: 3 } },
        async () => {},
      ),
      /ACE/,
    );
    await writeFile(path.join(root, "outside"), "");
    await assert.rejects(
      executeRoadMusic(input, async () => {}),
      /폴더 밖/,
    );
    await writeFile(path.join(root, "invalid"), "");
    const before = await readFile(path.join(root, "calls"), "utf8");
    await assert.rejects(
      executeRoadMusic(input, async () => {}),
      /준비 검증/,
    );
    assert.equal(
      (await readFile(path.join(root, "calls"), "utf8")).slice(before.length),
      "song:prepare\n",
    );
  } finally {
    if (savedPath) await rm(savedPath, { force: true });
    if (old === undefined) delete process.env.ROAD_MUSIC_HOME;
    else process.env.ROAD_MUSIC_HOME = old;
    await rm(root, { recursive: true, force: true });
  }
});
