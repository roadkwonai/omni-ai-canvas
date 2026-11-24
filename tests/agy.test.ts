import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { agyInfo, runAgy } from "../lib/agy";

test("Antigravity는 명시적으로 활성화해야 하며 제한된 환경과 stdin을 사용한다", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "scene-room-agy-test-"));
  const original = { ...process.env };
  try {
    const mock = path.join(folder, "agy");
    await writeFile(
      mock,
      `#!/usr/bin/env node
if (process.argv.includes("--version")) { console.log("1.5.14"); process.exit(0); }
const args = process.argv.slice(2);
const settings = JSON.parse(args[args.indexOf("--settings") + 1]);
if (!args.includes("--sandbox") || settings.toolPermission !== "strict" || !settings.permissions.deny.includes("read_file(*)") || process.env.GEMINI_API_KEY || process.env.AGY_ADC_AUTH || process.env.DATABASE_URL) process.exit(2);
let input = "";
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  const message = JSON.parse(input).message.content;
  if (message === "도구") console.log(JSON.stringify({ event: "step_update", step_update: { step_type: "tool" } }));
  else console.log(JSON.stringify({ event: "result", result: { status: "SUCCESS", response: message } }));
});
`,
    );
    await chmod(mock, 0o755);
    process.env.PATH = `${folder}:${original.PATH}`;
    process.env.GEMINI_API_KEY = "fake";
    process.env.AGY_ADC_AUTH = "true";
    process.env.DATABASE_URL = "fake";
    delete process.env.SCENE_ROOM_AGY_PERSONAL;
    assert.equal((await agyInfo()).available, false);
    await assert.rejects(runAgy("안녕"), /비활성화/);
    process.env.SCENE_ROOM_AGY_PERSONAL = "1";
    assert.equal((await agyInfo()).available, true);
    assert.equal(await runAgy("안녕"), "안녕");
    await assert.rejects(runAgy("도구"), /도구 사용/);
  } finally {
    process.env = original;
    await rm(folder, { recursive: true, force: true });
  }
});

test("작업실 연결에서 개인 CLI 실행을 활성화하고 해제할 수 있다", async () => {
  const { agyEnabled, setAgyEnabled } = await import("../lib/agy");
  const folder = await mkdtemp(path.join(os.tmpdir(), "scene-room-agy-config-"));
  try {
    assert.equal(agyEnabled(folder, {}), false);
    await setAgyEnabled(true, folder);
    assert.equal(agyEnabled(folder, {}), true);
    await setAgyEnabled(false, folder);
    assert.equal(agyEnabled(folder, {}), false);
    assert.equal(agyEnabled(folder, { SCENE_ROOM_AGY_PERSONAL: "1" }), true);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
