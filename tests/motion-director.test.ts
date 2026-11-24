import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRunInput } from "../lib/run-input";
import { textPrompt } from "../lib/runner";
import { parseMotionDirector } from "../lib/motion-director";
import { makeStyleDraft } from "../lib/style-preset-core";
import type { Project } from "../lib/types";

const project: Project = {
  id: "p",
  title: "작품",
  version: 1,
  updatedAt: "",
  graph: { nodes: [], edges: [] },
};
const request = {
  nodeId: null,
  operation: "text",
  provider: "codex",
  prompt: "차를 소개해 줘",
  version: 1,
};
const design = { aspect: "9:16" as const, seconds: 6 };
const spec = {
  scenes: [
    { text: "한 잔의 차", seconds: 3, recipe: "type" },
    {
      text: "천천히 향을 맡아요",
      seconds: 3,
      recipe: "cards",
      detail: "따뜻한 시간",
    },
  ],
  aspect: "9:16",
  background: "#18191d",
  foreground: "#ffffff",
  layout: "center",
  motion: "fade",
};

test("모션 에이전트는 허용된 텍스트 계정과 유효한 길이의 독립 요청을 받는다", () => {
  const style = {
    ...makeStyleDraft("shortform"),
    evidence: "원본 비공개 메모",
  };
  const input = buildRunInput(
    project,
    { ...request, motionDesign: { ...design, style } },
    "run",
  );
  assert.equal(input.motionDesign?.style?.evidence, "");
  assert.deepEqual(input.references, []);
  assert.match(textPrompt(input), /전체 장면 수는 1~48개/);
  assert.doesNotMatch(textPrompt(input), /원본 비공개 메모/);
  for (const changes of [
    { provider: "higgsfield" },
    { nodeId: "x" },
    { operation: "video" },
    { motionDesign: { ...design, seconds: 6.2 } },
    { motionDesign: { ...design, seconds: 601 } },
    { chat: {} },
    { attachmentIds: ["id"] },
  ])
    assert.throws(() =>
      buildRunInput(
        project,
        { ...request, motionDesign: design, ...changes },
        "run",
      ),
    );
});

test("에이전트 결과는 화면비·전체 길이·안전한 레시피와 필드가 일치해야 한다", () => {
  assert.deepEqual(parseMotionDirector(JSON.stringify(spec), design), spec);
  for (const item of [
    { ...spec, aspect: "16:9" },
    { ...spec, scenes: [{ ...spec.scenes[0], seconds: 5 }] },
    { ...spec, script: "unsafe" },
    { ...spec, scenes: [{ ...spec.scenes[0], seconds: 6, recipe: "number" }] },
    {
      ...spec,
      scenes: [{ ...spec.scenes[0], seconds: 6, image: { url: "/secret" } }],
    },
    {
      ...spec,
      scenes: [{ ...spec.scenes[0], seconds: 6, recipe: "parallax" }],
    },
  ])
    assert.throws(() => parseMotionDirector(JSON.stringify(item), design));
  assert.throws(() => parseMotionDirector("not json", design));
});
