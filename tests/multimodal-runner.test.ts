import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  claudeVisionInput,
  codexImageArguments,
  parseClaudeStream,
  runClaudeVision,
} from "../lib/runner";
import { reviewPrompt, parseDirectorReview } from "../lib/director-review";
import type { RunInput } from "../lib/types";

const asset = {
  url: "/sample/portrait.webp",
  type: "image" as const,
  name: "portrait.webp",
};
const input: RunInput = {
  projectId: "p",
  requestId: "r",
  nodeId: null,
  provider: "claude",
  operation: "plan",
  prompt: "대본 검토",
  review: true,
  references: [
    { nodeId: "script", kind: "script", title: "대본", body: "원본" },
    { title: "첨부 인물", body: "왼쪽 인물", role: "identity", asset },
  ],
};

test("Claude 비전 입력은 실제 로컬 이미지 바이트와 이름·역할을 전달한다", async () => {
  const request = JSON.parse(await claudeVisionInput(input));
  assert.equal(request.type, "user");
  const image = request.message.content.find(
    (item: { type: string }) => item.type === "image",
  );
  assert.equal(image.source.media_type, "image/webp");
  assert.deepEqual(
    Buffer.from(image.source.data, "base64"),
    await readFile("public/sample/portrait.webp"),
  );
  assert.match(request.message.content[0].text, /첨부 인물.*인물 외형/);
  assert.ok(!JSON.stringify(request).includes(process.cwd()));
  assert.deepEqual(codexImageArguments(input), [
    "-i",
    `${process.cwd()}/public/sample/portrait.webp`,
  ]);
});

test("Claude 스트림은 안전한 도구 제한과 단일 결과만 전달한다", async () => {
  const output = await runClaudeVision(
    input,
    "/tmp",
    1000,
    async (file, args, cwd, stdin, timeout) => {
      assert.equal(file, "claude");
      assert.equal(cwd, "/tmp");
      assert.equal(timeout, 1000);
      for (const item of [
        "--restricted",
        "--safe-mode",
        "--tools",
        "--strict-mcp-config",
        "--input-format",
        "--output-format",
        "--verbose",
        "--no-session-persistence",
      ])
        assert.ok(args.includes(item));
      assert.equal(args[args.indexOf("--tools") + 1], "");
      assert.equal(args[args.indexOf("--input-format") + 1], "stream-json");
      assert.equal(JSON.parse(stdin!).message.content[1].source.type, "base64");
      return '{"type":"system","subtype":"init"}\n{"type":"result","subtype":"success","is_error":false,"result":"검토 완료"}\n';
    },
  );
  assert.equal(output, "검토 완료");
  assert.throws(
    () =>
      parseClaudeStream(
        '{"type":"result","subtype":"error","is_error":true,"result":"비밀 경로"}',
      ),
    (error) => error instanceof Error && !error.message.includes("비밀 경로"),
  );
  assert.throws(() => parseClaudeStream('{"type":"system"}'), /비어/);
});

test("검토 첨부는 배경으로 표시하고 ID가 있는 노드만 수정한다", () => {
  const prompt = reviewPrompt(input);
  assert.match(prompt, /첨부 자료는 검토 배경/);
  assert.match(prompt, /첨부 인물/);
  assert.throws(
    () =>
      parseDirectorReview(
        JSON.stringify({
          summary: "검토",
          notes: [{ nodeId: "첨부 인물", reason: "수정", body: "결과" }],
        }),
        input,
      ),
    /검토 대상 밖/,
  );
  assert.equal(
    parseDirectorReview(
      JSON.stringify({
        summary: "검토",
        notes: [{ nodeId: "script", reason: "보완", body: "새 본문" }],
      }),
      input,
    ).notes.length,
    1,
  );
});
