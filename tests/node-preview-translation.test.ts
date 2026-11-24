import assert from "node:assert/strict";
import test from "node:test";
import { createPreviewTranslator } from "../lib/node-preview-translation";
import type { RunInput } from "../lib/types";

test("작업실의 텍스트 설정으로 번역할 본문만 전달하고 동일 요청은 공유한다", async () => {
  const requests: { input: RunInput; source: string; target: "en" | "ko" }[] = [];
  let finish: (value: { text: string }) => void = () => {};
  const translator = createPreviewTranslator({
    getTextAgent: async () => ({ provider: "claude", model: "example", effort: "low" }),
    execute: (input, source, target) => {
      requests.push({ input, source, target });
      return new Promise((resolve) => { finish = resolve; });
    },
  });
  const first = translator("The shot is a close-up.", "ko");
  const second = translator("The shot is a close-up.", "ko");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].source, "The shot is a close-up.");
  assert.equal(requests[0].target, "ko");
  assert.equal(requests[0].input.provider, "claude");
  assert.equal(requests[0].input.model, "example");
  assert.equal(requests[0].input.effort, "low");
  assert.deepEqual(requests[0].input.references, []);
  assert.equal(requests[0].input.target, undefined);
  assert.equal(requests[0].input.chat, undefined);
  finish({ text: "  클로즈업 샷입니다.  " });
  assert.deepEqual(await Promise.all([first, second]), ["클로즈업 샷입니다.", "클로즈업 샷입니다."]);
});

test("기본 텍스트 에이전트가 없으면 Codex를 사용하고 실패한 요청을 다시 시도한다", async () => {
  const requests: RunInput[] = [];
  const translator = createPreviewTranslator({
    getTextAgent: async () => undefined,
    execute: async (input) => {
      requests.push(input);
      return { text: requests.length === 1 ? "" : "번역됨" };
    },
  });
  await assert.rejects(translator("text", "ko"), /비어 있습니다/);
  assert.equal(await translator("text", "ko"), "번역됨");
  assert.equal(requests[0].provider, "codex");
});

test("지원하지 않는 기본 공급사와 과도하게 긴 번역 결과는 거절한다", async () => {
  const unsupported = createPreviewTranslator({
    getTextAgent: async () => ({ provider: "higgsfield", model: "" }),
    execute: async () => ({ text: "번역" }),
  });
  await assert.rejects(unsupported("text", "ko"), /텍스트 에이전트/);
  const large = createPreviewTranslator({
    getTextAgent: async () => undefined,
    execute: async () => ({ text: "가".repeat(24_001) }),
  });
  await assert.rejects(large("text", "ko"), /너무 깁니다/);
});


test("같은 본문을 양방향으로 요청하면 목표 언어별로 별도로 실행한다", async () => {
  const calls: ("en" | "ko")[] = [];
  const translator = createPreviewTranslator({
    getTextAgent: async () => undefined,
    execute: async (_input, _source, target) => {
      calls.push(target);
      await new Promise((resolve) => setImmediate(resolve));
      return { text: target === "en" ? "A rainy street." : "비 오는 거리." };
    },
  });
  const [english, korean] = await Promise.all([
    translator("street", "en"),
    translator("street", "ko"),
  ]);
  assert.deepEqual(calls, ["en", "ko"]);
  assert.equal(english, "A rainy street.");
  assert.equal(korean, "비 오는 거리.");
});

test("작업실 설정 조회에 실패하면 내부 오류를 노출하지 않는다", async () => {
  const translator = createPreviewTranslator({
    getTextAgent: async () => { throw new Error("internal configuration error"); },
    execute: async () => ({ text: "unused" }),
  });
  await assert.rejects(translator("text", "en"), (error: Error) =>
    error.message === "작업실 텍스트 에이전트 설정을 불러오지 못했습니다.");
});
