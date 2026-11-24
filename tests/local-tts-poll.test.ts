import assert from "node:assert/strict";
import test from "node:test";
import { pollLocalTts, RequestError } from "../lib/local-tts-poll";
import type { LocalTtsProgress } from "../lib/tts-types";
import type { Asset } from "../lib/types";

const asset: Asset = { url: "/api/assets/00000000-0000-4000-8000-000000000001.wav", type: "audio", name: "a.wav" };
type Step = { asset?: Asset; progress?: LocalTtsProgress } | Error;
const at = (phase: LocalTtsProgress["phase"], seconds: number) => ({ progress: { phase, seconds, percent: 1, elapsed: 1, ahead: 0 } });
function script(steps: Step[]) {
  let sent = 0;
  return { sent: () => sent, send: async () => {
    const step = steps[Math.min(sent++, steps.length - 1)];
    if (step instanceof Error) throw step;
    return step;
  } };
}

test("로컬 생성은 완성될 때까지 같은 요청을 이어 보내며 진행 상태를 알린다", async () => {
  const progress: string[] = [];
  const { send, sent } = script([at("loading", 0), at("generating", 12), { asset }]);
  assert.deepEqual((await pollLocalTts({ send, onProgress: ({ phase, seconds }) => progress.push(`${phase} ${seconds}`), retryMs: 1 })).asset, asset);
  assert.deepEqual(progress, ["loading 0", "generating 12"]);
  assert.equal(sent(), 3);
});

test("로컬 생성은 일시적인 연결·서버 오류를 다시 시도하고 확정된 오류는 바로 알린다", async () => {
  const recovered = script([new TypeError("network"), new RequestError("서버 오류", 503), at("generating", 1), new RequestError("서버 오류", 500), { asset }]);
  assert.deepEqual((await pollLocalTts({ send: recovered.send, retryMs: 1 })).asset, asset);
  const refused = script([new RequestError("음성 생성을 취소했습니다.", 422), { asset }]);
  await assert.rejects(pollLocalTts({ send: refused.send, retryMs: 1 }), /취소/);
  assert.equal(refused.sent(), 1);
  const down = script([new RequestError("계속 실패", 503)]);
  await assert.rejects(pollLocalTts({ send: down.send, retryMs: 1 }), /계속 실패/);
  assert.equal(down.sent(), 6, "처음 한 번과 다시 시도 다섯 번");
});

test("화면을 닫으면 로컬 생성을 더 기다리지 않는다", async () => {
  const controller = new AbortController();
  const { send, sent } = script([at("generating", 1)]);
  await assert.rejects(pollLocalTts({ send: async () => {
    if (sent() === 2) controller.abort();
    return send();
  }, retryMs: 1, signal: controller.signal }));
  assert.equal(sent(), 3);
});
