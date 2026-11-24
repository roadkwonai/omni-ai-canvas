import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePresetProposal } from "../lib/preset-design";
import { buildRunInput } from "../lib/run-input";
import { textPrompt } from "../lib/runner";
import { makeStyleDraft } from "../lib/style-preset-core";
import type { Project } from "../lib/types";

const project: Project = {
  id: "project",
  title: "작품",
  version: 1,
  updatedAt: "2026-11-22",
  graph: {
    nodes: [
      {
        id: "private",
        kind: "note",
        title: "프로젝트 메모",
        body: "아직 공개하지 않은 결말",
        x: 0,
        y: 0,
      },
    ],
    edges: [],
  },
};
const draft = makeStyleDraft("short-drama");
const base = {
  nodeId: null,
  operation: "text",
  provider: "codex",
  prompt: "새 이야기",
  version: 1,
};
const analysis = { mode: "analyze" as const, draft };
const recommendation = { mode: "recommend" as const, draft };

test("영상 프리셋 요청의 자료 범위와 시각 에이전트를 검사한다", () => {
  assert.doesNotThrow(() => buildRunInput(project, {
    ...base, presetDesign: analysis, attachmentIds: Array.from({ length: 8 }, (_, index) => `clip-${index}`),
  }, "request"));
  assert.throws(() => buildRunInput(project, {
    ...base, presetDesign: analysis, attachmentIds: Array.from({ length: 9 }, (_, index) => `clip-${index}`),
  }, "request"), /1~8편/);
  const input = buildRunInput(
    project,
    { ...base, presetDesign: analysis, attachmentIds: ["clip"] },
    "request",
  );
  assert.equal(input.presetDesign?.mode, "analyze");
  assert.deepEqual(input.references, []);
  const prompt = textPrompt(input);
  assert.match(prompt, /타임코드/);
  assert.match(prompt, /endPercent/);
  assert.doesNotMatch(prompt, /아직 공개하지 않은 결말/);
  for (const override of [
    { attachmentIds: [] },
    { provider: "agy" },
    { nodeId: "private" },
    { operation: "video" },
    { guidanceEdit: true },
  ])
    assert.throws(() =>
      buildRunInput(
        project,
        {
          ...base,
          presetDesign: analysis,
          attachmentIds: ["clip"],
          ...override,
        },
        "request",
      ),
    );
  assert.ok(
    buildRunInput(
      project,
      { ...base, provider: "agy", presetDesign: recommendation },
      "request",
    ),
  );
  assert.throws(() =>
    buildRunInput(
      project,
      { ...base, presetDesign: recommendation, attachmentIds: ["clip"] },
      "request",
    ),
  );
});

test("분석 제안은 편집 가능한 같은 유형의 초안과 관찰 근거를 요구한다", () => {
  const proposal = {
    ...draft,
    name: "리액션을 먼저",
    evidence: "00:02 얼굴이 화면 오른쪽을 향한다.",
  };
  assert.deepEqual(
    parsePresetProposal(JSON.stringify(proposal), analysis),
    proposal,
  );
  assert.throws(() => parsePresetProposal("불완전한 응답", analysis));
  assert.throws(() =>
    parsePresetProposal(
      JSON.stringify({ ...proposal, profileId: "film" }),
      analysis,
    ),
  );
  assert.throws(() =>
    parsePresetProposal(
      JSON.stringify({ ...proposal, evidence: "" }),
      analysis,
    ),
  );
  assert.equal(
    parsePresetProposal(JSON.stringify(proposal), recommendation).evidence,
    draft.evidence,
  );
});

test("프로젝트 대화는 활성 스타일을 전달하고 다른 프로젝트에서 가져온 관찰 메모는 제외한다", () => {
  const input = buildRunInput(
    project,
    {
      ...base,
      chat: {
        threadId: "thread",
        nodeIds: [],
        recipeIds: [],
        stylePreset: {
          ...draft,
          concept: "새 작품의 이야기",
          evidence: "원본 프로젝트 관찰",
        },
      },
    },
    "request",
  );
  const prompt = textPrompt(input);
  assert.match(prompt, /새 작품의 이야기/);
  assert.doesNotMatch(prompt, /원본 프로젝트 관찰|아직 공개하지 않은 결말/);
});

test("컷별 응답은 실제 시트에 표시된 컷 번호만 받아 프리셋과 함께 보존한다", async () => {
  const { parseCutPresetResult } = await import("../lib/preset-design");
  const design = { mode: "analyze" as const, draft, analyzedCuts: [1, 3] };
  const proposal = { ...draft, evidence: "1초부터 3초 사이 근거" };
  const review = [
    {
      cut: 1,
      composition: "인물 정면",
      caption: "하단 두 줄",
      change: "확인 불가",
    },
    {
      cut: 3,
      composition: "손 클로즈업",
      caption: "상단 한 줄",
      change: "크기 변화",
    },
  ];
  const result = parseCutPresetResult(
    JSON.stringify({ stylePreset: proposal, cutReview: review }),
    design,
  );
  assert.equal(result.cutReview?.length, 2);
  assert.throws(() =>
    parseCutPresetResult(
      JSON.stringify({
        stylePreset: proposal,
        cutReview: [review[0], review[0]],
      }),
      design,
    ),
  );
  assert.throws(() =>
    parseCutPresetResult(
      JSON.stringify({
        stylePreset: proposal,
        cutReview: [{ ...review[0], cut: 2 }],
      }),
      design,
    ),
  );
});
