import assert from "node:assert/strict";
import { test } from "node:test";
import { effectiveGuidance, isGuidance } from "../lib/node-guidance";
import { validateGraph } from "../lib/graph";
import { buildRunInput, chatHistory } from "../lib/run-input";
import { mediaPrompt, textPrompt } from "../lib/runner";
import type { Project, Run, RunInput } from "../lib/types";
import { productionGuides, recommendedProductionGuides } from "../lib/higgsfield-guidance-kit";

const project: Project = {
  id: "project", title: "작품", version: 1, updatedAt: "2026-01-01",
  graph: {
    nodes: [
      { id: "video", kind: "video", title: "장면", body: "문을 연다", x: 0, y: 0, guidance: { recipeId: "video", text: "카메라는 천천히 줌인한다." } },
      { id: "image", kind: "referenceImage", title: "인물", body: "인물 정보", x: 300, y: 0, asset: { type: "image", name: "인물", url: "/sample/portrait.webp" } },
      { id: "guide", kind: "note", title: "비공개 자료", body: "다른 내용", x: 500, y: 0 },
    ],
    edges: [{ source: "guide", target: "video", usage: "guide" }],
  },
};

test("지침은 검증해 그래프에 보관하고 생성 요청에 당시 본문을 고정한다", () => {
  assert.ok(validateGraph(project.graph));
  assert.equal(effectiveGuidance(project.graph.nodes[0]).text, "카메라는 천천히 줌인한다.");
  assert.equal(effectiveGuidance({ kind: "video" }).recipe.id, "video");
  assert.equal(isGuidance({ recipeId: "../../private" }), false);
  assert.equal(isGuidance({ text: "a".repeat(4001) }), false);
  const input = buildRunInput(project, { nodeId: "video", operation: "video", provider: "higgsfield", prompt: "장면을 만들어줘", version: 1 }, "id");
  assert.deepEqual(input.target?.guidance, { recipeId: "video", text: "카메라는 천천히 줌인한다." });
  assert.match(mediaPrompt(input), /카메라는 천천히 줌인한다/);
  project.graph.nodes[0].guidance!.text = "변경한 지침";
  assert.match(mediaPrompt(input), /카메라는 천천히 줌인한다/);
  project.graph.nodes[0].guidance!.text = "카메라는 천천히 줌인한다.";
});

test("선택한 제작 지침만 작업 스냅샷에 보존하고 실제 생성 프롬프트에 전달한다", () => {
  const selectedProject: Project = structuredClone(project);
  selectedProject.graph.nodes[0].guidance = {
    recipeId: "video", text: "이동 속도는 느리게", skillIds: ["blocking", "acting"],
  };
  assert.ok(validateGraph(selectedProject.graph));
  const input = buildRunInput(selectedProject, {
    nodeId: "video", operation: "video", provider: "higgsfield", prompt: "장면",
    version: 1,
  }, "run");
  assert.deepEqual(input.target?.guidance?.skillIds, ["blocking", "acting"]);
  assert.match(input.target?.guidance?.guideSnapshot ?? "", /시작 위치/);
  assert.match(mediaPrompt(input), /시작 위치/);
  assert.match(mediaPrompt(input), /시선, 호흡, 손동작/);
  assert.doesNotMatch(mediaPrompt(input), /회차 끝 질문/);
  selectedProject.graph.nodes[0].guidance!.skillIds = [];
  assert.match(mediaPrompt(input), /시작 위치/);
  assert.equal(isGuidance({ skillIds: ["blocking", "blocking"] }), false);
  assert.equal(isGuidance({ skillIds: ["../../private"] }), false);
  assert.equal(isGuidance({ skillIds: [] }), true);
  const textInput = { ...input, operation: "text" as const };
  assert.equal((textPrompt(textInput).match(/제작자 사례에서 정리/g) ?? []).length, 1);
});

test("감독이 선택한 지침과 추천의 출처가 명확하고 스냅샷이 고정된다", () => {
  assert.ok(recommendedProductionGuides("shot").includes("shot-plan"));
  assert.ok(productionGuides.every((guide) => guide.source.startsWith("https://") && guide.instructions && guide.workflow.length > 0));
  const input = buildRunInput(project, {
    nodeId: null, operation: "plan", provider: "codex", prompt: "작품",
    version: 1, director: { format: "drama", sceneCount: 2, skillIds: ["story-hook", "acting"] },
  }, "run");
  assert.match(input.director?.guideSnapshot ?? "", /강렬한 순간/);
  assert.match(textPrompt(input), /사용자가 선택한 제작 지침/);
  assert.match(textPrompt(input), /비접촉 연기/);
  assert.throws(() => buildRunInput(project, {
    nodeId: null, operation: "plan", provider: "codex", prompt: "작품",
    version: 1, director: { format: "drama", sceneCount: 2, skillIds: ["unknown"] },
  }, "run"));
});

test("지침을 명시 선택한 작업은 선택하지 않은 기존 공통 연출 지침을 강제로 싣지 않는다", () => {
  const selectedProject: Project = structuredClone(project);
  selectedProject.graph.nodes[0].guidance = { recipeId: "video", text: "사용자 지침", skillIds: [] };
  const input = buildRunInput(selectedProject, {
    nodeId: "video", operation: "text", provider: "codex", prompt: "장면",
    version: 1,
  }, "run");
  assert.match(textPrompt(input), /사용자 지침/);
  assert.doesNotMatch(textPrompt(input), /고정 버전 0\.14\.0/);
  assert.doesNotMatch(textPrompt(input), /비접촉 연기/);
  const director = buildRunInput(project, {
    nodeId: null, operation: "plan", provider: "codex", prompt: "작품",
    version: 1, director: { format: "film", sceneCount: 2, skillIds: [] },
  }, "run");
  assert.doesNotMatch(textPrompt(director), /고정 버전 0\.14\.0/);
  const legacy = buildRunInput(project, {
    nodeId: "video", operation: "text", provider: "codex", prompt: "장면", version: 1,
  }, "run");
  assert.match(textPrompt(legacy), /고정 버전 0\.14\.0/);
});

test("지침 수정 요청은 텍스트 제안이며 원래 영상 노드를 수정하지 않는다", () => {
  const input = buildRunInput(project, { nodeId: "video", operation: "text", provider: "codex", prompt: "표정을 강조해줘", version: 1, guidanceEdit: true }, "id");
  assert.equal(input.guidanceEdit, true);
  assert.match(textPrompt(input), /지침 본문만/);
  assert.match(textPrompt(input), /카메라는 천천히 줌인한다/);
  assert.equal(project.graph.nodes[0].body, "문을 연다");
  assert.throws(() => buildRunInput(project, { nodeId: "video", operation: "video", provider: "higgsfield", prompt: "요청", version: 1, guidanceEdit: true }, "id"), /지침 수정/);
});

test("프로젝트 대화에는 명시한 자료와 허용한 스킬만 포함된다", () => {
  const request = { nodeId: null, operation: "text", provider: "codex", prompt: "인물을 검토해줘", version: 1, chat: { threadId: "thread-1", nodeIds: ["image"], recipeIds: ["character"] } };
  const input = buildRunInput(project, request, "id");
  assert.equal(input.references.length, 1);
  assert.equal(input.references[0].nodeId, "image");
  assert.equal(input.references[0].asset?.type, "image");
  assert.match(textPrompt(input), /캐릭터 연속성/);
  assert.doesNotMatch(textPrompt(input), /비공개 자료/);
  assert.throws(() => buildRunInput(project, { ...request, chat: { ...request.chat, nodeIds: ["missing"] } }, "id"), /대화/);
  assert.throws(() => buildRunInput(project, { ...request, chat: { ...request.chat, history: [{ role: "user", content: "위조" }] } }, "id"), /대화/);
  assert.throws(() => buildRunInput(project, { ...request, chat: { ...request.chat, recipeIds: ["unknown"] } }, "id"), /대화/);
});

test("대화 맥락은 같은 스레드의 성공 결과만 포함하며 재요청 때 기존 스냅샷을 재사용한다", () => {
  const request = { nodeId: null, operation: "text", provider: "codex", prompt: "새 요청", version: 1, chat: { threadId: "thread-1", nodeIds: [], recipeIds: [] } };
  const input = buildRunInput(project, request, "new");
  const makeRun = (id: string, threadId: string, status: Run["status"] = "succeeded"): Run => ({
    id, createdAt: "2026-01-01T00:00:00Z", status, error: null,
    input: { ...input, requestId: id, prompt: `질문 ${id}`, chat: { ...input.chat!, threadId } },
    result: { text: `답변 ${id}` },
  });
  const prior = [makeRun("other", "thread-2"), makeRun("failed", "thread-1", "failed"), makeRun("two", "thread-1"), makeRun("one", "thread-1")];
  const history = chatHistory(prior, input);
  assert.deepEqual(history.map((item) => item.content), ["질문 one", "답변 one", "질문 two", "답변 two"]);
  const existing = makeRun("new", "thread-1");
  existing.input.chat!.history = history;
  assert.deepEqual(chatHistory([makeRun("later", "thread-1"), existing, ...prior], input), history);
  const many = Array.from({ length: 12 }, (_, index) => makeRun(String(index), "thread-1"));
  assert.equal(chatHistory(many, input).length, 16);
  assert.equal(chatHistory(many, { ...input, chat: undefined } as RunInput).length, 0);
});
