import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAiAdGraph } from "../lib/ai-ad-board";
import { validateGraph } from "../lib/graph";
import { buildRunInput } from "../lib/run-input";
import { mediaPrompt } from "../lib/runner";
import type { Project } from "../lib/types";

test("AI 광고 보드는 선택한 씬과 참조, 영상 및 타임라인을 연결한다", () => {
  for (const sceneCount of [1, 9, 12, "auto"] as const) {
    const graph = buildAiAdGraph({ sceneCount, aspect: "16:9", blocking: true });
    assert.ok(validateGraph(graph));
    const videos = graph.nodes.filter((node) => /^ai-ad-video-\d+$/.test(node.id));
    assert.equal(videos.length, sceneCount === "auto" ? 0 : sceneCount);
    assert.equal(graph.nodes.filter((node) => node.kind === "scene").length, videos.length);
    assert.ok(graph.nodes.find((node) => node.id === "ai-ad-blocking"));
    assert.ok(graph.nodes.find((node) => node.id === "ai-ad-timeline")?.timeline?.clips.every((clip) => clip.durationFrames === 120));
    assert.equal(graph.nodes.find((node) => node.id === "ai-ad-timeline")?.timeline?.clips.length, videos.length);
    for (const video of videos) assert.ok(graph.edges.some((edge) => edge.source === video.id && edge.target === "ai-ad-timeline"));
  }
});

test("씬 수, 배역과 화면비는 유효성을 검사한다", () => {
  assert.throws(() => buildAiAdGraph({ sceneCount: 13, aspect: "16:9" }));
  assert.throws(() => buildAiAdGraph({ sceneCount: 1, aspect: "1:1", cast: ["a", "b", "c", "d", "e"] }));
});

test("배치와 전환 보조 노드를 선택 해제할 수 있다", () => {
  const graph = buildAiAdGraph({ sceneCount: 2, aspect: "9:16", blocking: false, transitions: false });
  assert.equal(graph.nodes.some((node) => node.id === "ai-ad-blocking" || node.id === "ai-ad-transition"), false);
  assert.equal(graph.nodes.find((node) => node.id === "ai-ad-timeline")?.timeline?.aspect, "9:16");
});

test("패션 광고 테이크 요청에 작업 지침과 시작 프레임이 고정된다", () => {
  const graph = buildAiAdGraph({ sceneCount: 2, aspect: "16:9" });
  const asset = { type: "image" as const, name: "시작 화면", url: "/sample/frame.webp" };
  graph.nodes.find((node) => node.id === "ai-ad-frame-1")!.asset = asset;
  const project: Project = { id: "project", title: "패션 광고", version: 1, updatedAt: "2026-11-23", graph };
  const input = buildRunInput(project, {
    nodeId: "ai-ad-video-1", operation: "video", provider: "higgsfield", prompt: "제품을 착용하는 샷", version: 1,
  }, "test");
  assert.ok(input.references?.some((reference) => reference.role === "start" && reference.asset?.url === asset.url));
  assert.match(mediaPrompt(input), /패션 광고 샷 프롬프트/);
  assert.match(mediaPrompt(input), /카메라의 렌즈·거리·이동 경로와 종료 지점/);
});

test("씬별로 주인공·조연·제품 전용 장면을 지정하고 잘못된 배역을 거절한다", () => {
  const graph = buildAiAdGraph({ sceneCount: 3, aspect: "16:9", cast: ["주인공", "조연"], sceneCast: { 0: [1], 1: [], 2: [0, 1] } });
  const input = (index: number) => graph.edges.filter((edge) => edge.target === `ai-ad-frame-${index}` && edge.role === "identity").map((edge) => edge.source);
  assert.deepEqual(input(1), ["ai-ad-cast-image-1"]);
  assert.deepEqual(input(2), []);
  assert.deepEqual(input(3), ["ai-ad-cast-image-0", "ai-ad-cast-image-1"]);
  assert.throws(() => buildAiAdGraph({ sceneCount: 1, aspect: "16:9", sceneCast: { 0: [0, 0] } }));
  assert.doesNotThrow(() => buildAiAdGraph({ sceneCount: 1, aspect: "16:9", sceneCast: { 1: [0] } }));
  assert.throws(() => buildAiAdGraph({ sceneCount: 1, aspect: "16:9", sceneCast: { 0: [1] } }));
});
