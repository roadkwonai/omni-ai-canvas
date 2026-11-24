import assert from "node:assert/strict";
import { test } from "node:test";
import {
  agentModelArguments,
  parseAgyModels,
  parseClaudeModels,
  parseCodexModels,
} from "../lib/agent-models";

test("CLI 모델 목록의 유효한 공개 항목만 텍스트 작업용으로 표시한다", () => {
  assert.deepEqual(
    parseAgyModels(
      "Fetching available models...\ngemini-test\tGemini Test\n--bad\tBad\n",
    ),
    [{ id: "gemini-test", label: "Gemini Test", operations: ["plan", "text"] }],
  );
  assert.deepEqual(
    parseCodexModels({
      data: [
        { id: "gpt-test", displayName: "GPT Test", hidden: false },
        { id: "secret", hidden: true },
        { id: "--bad" },
      ],
    }),
    [{ id: "gpt-test", label: "GPT Test", operations: ["plan", "text"] }],
  );
  assert.deepEqual(
    parseClaudeModels(
      "  --model <model>  Use an alias (e.g. 'opus', or 'sonnet') or full name.\n  --name <name> Name",
    ),
    [
      {
        id: "opus",
        label: "opus (Claude CLI 별칭)",
        operations: ["plan", "text"],
      },
      {
        id: "sonnet",
        label: "sonnet (Claude CLI 별칭)",
        operations: ["plan", "text"],
      },
    ],
  );
});

test("선택이 없으면 CLI 기본 모델을 사용하고 모델 값은 단일 인수다", () => {
  assert.deepEqual(agentModelArguments(), []);
  assert.deepEqual(agentModelArguments("model-1"), ["--model", "model-1"]);
  assert.throws(() => agentModelArguments("--model=attacker"));
});

test("Codex 모델이 선언한 추론 강도만 보존하고 실행 인수에 반영한다", async () => {
  const { effortOptions, agentEffortArguments } = await import("../lib/agent-effort");
  const models = parseCodexModels({ data: [{ id: "example", supportedReasoningEfforts: [
    { reasoningEffort: "low" }, { reasoningEffort: "high" }, { reasoningEffort: "invalid" },
  ] }] });
  assert.deepEqual(models[0].efforts, ["low", "high"]);
  const provider = { id: "codex" as const, label: "Codex", operations: ["text" as const],
    available: true, detail: "", billing: "", website: "", models };
  assert.deepEqual(effortOptions(provider, "example"), ["low", "high"]);
  assert.deepEqual(effortOptions(provider, "missing"), []);
  assert.deepEqual(agentEffortArguments("codex", "high"), ["-c", 'model_reasoning_effort="high"']);
  assert.deepEqual(agentEffortArguments("claude", "max"), ["--effort", "max"]);
  assert.throws(() => agentEffortArguments("codex", "high\";bad" as never));
});

test("Antigravity가 조회한 모델별 추론 단계만 허용한다", async () => {
  const { parseAgyEfforts } = await import("../lib/agent-models");
  assert.deepEqual(parseAgyEfforts('{"command":{"name":"effort","data":{"adjustable":true,"available":["low","high","unknown"]}}}'), ["low", "high"]);
  assert.deepEqual(parseAgyEfforts('{"command":{"name":"effort","data":{"adjustable":false}}}'), []);
  assert.deepEqual(parseAgyEfforts("broken"), []);
});
