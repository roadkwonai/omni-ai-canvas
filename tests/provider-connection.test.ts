import assert from "node:assert/strict";
import { test } from "node:test";
import { connectionCommand, shellQuote } from "../lib/provider-connection";

test("구독 계정의 로그인·해제는 정해진 공식 명령만 실행한다", () => {
  assert.deepEqual(connectionCommand("codex", "connect"), { executable: "codex", args: ["login"], terminal: true });
  assert.deepEqual(connectionCommand("claude", "connect"), { executable: "claude", args: ["auth", "login", "--claudeai"], terminal: true });
  assert.deepEqual(connectionCommand("codex", "disconnect"), { executable: "codex", args: ["logout"], terminal: false });
  assert.deepEqual(connectionCommand("claude", "disconnect"), { executable: "claude", args: ["auth", "logout"], terminal: false });
  assert.deepEqual(connectionCommand("agy", "connect"), { executable: "agy", args: [], terminal: true });
  assert.deepEqual(connectionCommand("agy", "disconnect"), { executable: "agy", args: [], terminal: true });
  assert.equal(connectionCommand("codex; touch /tmp/test", "connect"), null);
  assert.equal(connectionCommand("codex", "delete"), null);
});

test("터미널에 전달하는 실행 경로는 셸 문자도 한 인수로 보존한다", () => {
  assert.equal(shellQuote("a'b $(echo x)"), "'a'\\''b $(echo x)'");
});

test("연결은 고정된 인증 명령을 터미널로 열고 완료 여부는 사용자 조작을 기다린다", async () => {
  const { runSubscriptionConnection } = await import("../lib/provider-connection");
  const called: { file: string; args: string[] }[] = [];
  const options = {
    platform: "darwin" as const,
    findExecutable: async (name: string) => `/test path/${name}`,
    execute: async (file: string, args: string[]) => { called.push({ file, args }); },
  };
  const login = await runSubscriptionConnection("claude", "connect", options);
  assert.equal(login.completed, false);
  assert.equal(called[0].file, "/usr/bin/osascript");
  assert.equal(called[0].args.at(-1), "'/test path/claude' 'auth' 'login' '--claudeai'");
  const logout = await runSubscriptionConnection("codex", "disconnect", options);
  assert.equal(logout.completed, true);
  assert.deepEqual(called[1], { file: "/test path/codex", args: ["logout"] });
  const agy = await runSubscriptionConnection("agy", "disconnect", options);
  assert.equal(agy.completed, false);
  assert.match(agy.message, /\/logout/);
  assert.equal(called[2].args.at(-1), "'/test path/agy'");
  await assert.rejects(runSubscriptionConnection("codex", "connect", { ...options, platform: "linux" }), /직접 열어/);
  await assert.rejects(runSubscriptionConnection("codex", "disconnect", {
    ...options, execute: async () => { throw new Error("no permission"); },
  }), /no permission/);
});

test("계정 연결 API는 외부 출처와 지원하지 않는 요청을 거부한다", async () => {
  const { POST } = await import("../app/api/providers/[provider]/connection/route");
  const request = (body: unknown, origin = "http://127.0.0.1:3000") => new Request("http://127.0.0.1:3000/api/providers/codex/connection", {
    method: "POST", headers: { host: "127.0.0.1:3000", origin, "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const context = { params: Promise.resolve({ provider: "codex" }) };
  assert.equal((await POST(request({ action: "disconnect" }, "https://external.invalid"), context)).status, 403);
  assert.equal((await POST(request({ action: "bad" }), context)).status, 400);
  assert.equal((await POST(request({ action: "connect" }), { params: Promise.resolve({ provider: "unknown" }) })).status, 400);
});

test("연결 해제 API가 정해진 CLI 명령을 실행하고 성공을 반환한다", async () => {
  const { mkdtemp, writeFile, chmod, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { POST } = await import("../app/api/providers/[provider]/connection/route");
  const root = await mkdtemp(path.join(tmpdir(), "scene-room-auth-test-"));
  const previous = process.env.PATH;
  const executable = path.join(root, "codex");
  try {
    await writeFile(executable, `#!/usr/bin/env node
const fs = require("node:fs");
fs.writeFileSync(process.argv[1] + ".result", JSON.stringify(process.argv.slice(2)));
process.exit(process.argv[2] === "logout" ? 0 : 1);
`);
    await chmod(executable, 0o755);
    process.env.PATH = `${root}:${previous ?? ""}`;
    const request = new Request("http://127.0.0.1:3000/api/providers/codex/connection", {
      method: "POST",
      headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "content-type": "application/json" },
      body: JSON.stringify({ action: "disconnect" }),
    });
    const response = await POST(request, { params: Promise.resolve({ provider: "codex" }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).completed, true);
    assert.deepEqual(JSON.parse(await readFile(executable + ".result", "utf8")), ["logout"]);
  } finally {
    if (previous === undefined) delete process.env.PATH;
    else process.env.PATH = previous;
    await rm(root, { recursive: true, force: true });
  }
});
