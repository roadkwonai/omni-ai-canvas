import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAgentDefaults, selectedAgent, supportsOperation } from "../lib/agent-preferences";
import type { ProviderInfo } from "../lib/types";

test("작업별 기본값은 노드의 직접 선택이 없을 때 적용한다", () => {
  const defaults = parseAgentDefaults({
    plan: { provider: "claude", model: "opus" },
    text: { provider: "codex", model: "gpt-6.2-sol" },
    video: { provider: "topview", model: "Seedance 2.5" },
  });
  assert.deepEqual(selectedAgent(undefined, defaults, "text"), {
    provider: "codex", models: { codex: "gpt-6.2-sol" },
  });
  assert.deepEqual(selectedAgent(undefined, defaults, "video"), {
    provider: "topview", models: { topview: "Seedance 2.5" },
  });
  const override = { provider: "claude" as const, models: { claude: "sonnet" } };
  assert.equal(selectedAgent(override, defaults, "text"), override);
  assert.equal(selectedAgent(undefined, defaults, "image"), undefined);
});

test("브라우저 설정의 잘못된 항목을 무시하고 정해진 작업 유형만 저장한다", () => {
  assert.deepEqual(parseAgentDefaults({
    image: { provider: "topview", model: "GPT Image 2" },
    plan: { provider: "unknown", model: "model" },
    text: { provider: "codex", model: "bad\nvalue" },
    secret: { provider: "claude", model: "" },
  }), { image: { provider: "topview", model: "GPT Image 2" } });
  assert.deepEqual(parseAgentDefaults(null), {});
  assert.deepEqual(parseAgentDefaults([]), {});
});

test("설정의 공급사 목록은 노드 작업의 지원 여부를 따른다", () => {
  const provider: ProviderInfo = {
    id: "agy", label: "Antigravity", operations: [], available: false,
    detail: "", billing: "", website: "",
  };
  assert.equal(supportsOperation(provider, "text"), true);
  assert.equal(supportsOperation(provider, "image"), true);
  assert.equal(supportsOperation(provider, "video"), false);
});

test("새 작업에 기본 추론 강도를 적용하고 노드별 선택이 우선한다", () => {
  const defaults = parseAgentDefaults({
    text: { provider: "codex", model: "gpt-6.2-sol", effort: "xhigh" },
    plan: { provider: "claude", model: "opus", effort: "unknown" },
    video: { provider: "higgsfield", model: "model", effort: "high" },
  });
  assert.equal(defaults.plan?.effort, undefined);
  assert.equal(defaults.video?.effort, undefined);
  assert.deepEqual(selectedAgent(undefined, defaults, "text"), {
    provider: "codex", models: { codex: "gpt-6.2-sol" }, effort: "xhigh",
  });
  assert.equal(selectedAgent({ provider: "codex", models: { codex: "gpt-6.2-sol" }, effort: "low" }, defaults, "text")?.effort, "low");
});
