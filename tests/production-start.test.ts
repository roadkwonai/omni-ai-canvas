import assert from "node:assert/strict";
import { test } from "node:test";
import { validateGraph } from "../lib/graph";
import { productionProfiles } from "../lib/style-preset-core";
import { addMissingStarter, boardTemplate, instantiateBoardTemplate, productionDefaults, starterGraph } from "../lib/production-start";
import { createImageEditNode } from "../lib/image-edit";
import { parseDirectorOptions, type Graph } from "../lib/types";

test("모든 제작 형식의 시작 보드는 유효하고 씬 수와 화면비를 반영한다", () => {
  for (const profile of productionProfiles) {
    const graph = starterGraph(profile.id, 2, "1:1");
    assert.ok(validateGraph(graph), profile.id);
    assert.equal(graph.nodes.filter((node) => node.kind === "scene").length, 2);
    assert.ok(graph.nodes.filter((node) => node.timeline).every((node) => node.timeline?.aspect === "1:1"));
  }
  assert.throws(() => starterGraph("invalid"), /형식/);
  assert.throws(() => starterGraph("drama", 0), /씬 수/);
  assert.equal(productionDefaults("short-drama").aspect, "9:16");
});

test("이미지 편집 프리셋의 입력 자리와 작업은 남기고 프로젝트 자산과 지시는 비운다", () => {
  const source: Graph["nodes"][number] = {
    id: "source", kind: "character", title: "작품 속 배역", body: "", x: 0, y: 0,
    asset: { type: "image", name: "개인 참고 사진.webp", url: "/sample/portrait.webp" },
  };
  const { node, edge } = createImageEditNode(source, "grid9", "작품 고유 촬영 지시", "edit");
  const template = instantiateBoardTemplate(boardTemplate({ nodes: [source, node], edges: [edge] }, [node.id]));
  const edit = template.nodes.find((entry) => entry.imageEdit);
  const input = template.nodes.find((entry) => entry.title.endsWith("입력"));
  assert.ok(edit?.imageEdit && input);
  assert.equal(edit.imageEdit.sourceNodeId, input.id);
  assert.equal(edit.imageEdit.sourceAsset, undefined);
  assert.equal(edit.imageEdit.kind, "grid9");
  assert.match(edit.imageEdit.instruction, /3×3/);
  assert.doesNotMatch(JSON.stringify(template), /고유 촬영 지시|작품 속 배역|개인 참고 사진/);
});

test("빠진 기본 구성만 추가하며 기존 노드와 재적용 결과를 보존한다", () => {
  const original = { nodes: [{ id: "brief", kind: "brief" as const, title: "내 작업", body: "원본", x: 0, y: 0 }], edges: [] };
  const first = addMissingStarter(original, "drama", 1);
  assert.deepEqual(first.nodes[0], original.nodes[0]);
  const second = addMissingStarter(first, "drama", 1);
  assert.equal(second.nodes.length, first.nodes.length);
  assert.equal(second.edges.length, first.edges.length);
  assert.ok(validateGraph(second));
});

test("선택 보드 프리셋은 작품 내용과 원본을 비우고 새 노드 ID로 연결을 보존한다", () => {
  const graph = starterGraph("film", 1);
  const brief = graph.nodes.find((node) => node.id === "brief")!;
  const scenario = graph.nodes.find((node) => node.id === "scenario")!;
  brief.body = "작품 고유 내용";
  const template = boardTemplate(graph, [brief.id, scenario.id]);
  assert.ok(template.nodes.length > 2);
  assert.ok(template.nodes.some((node) => node.title.endsWith(" 입력")));
  assert.ok(template.nodes.every((node) => !node.body.includes("작품 고유 내용") && !node.asset && !node.productionRole));
  const next = instantiateBoardTemplate(template);
  assert.ok(validateGraph(next));
  assert.ok(next.nodes.every((node) => !template.nodes.some((old) => old.id === node.id)));
  assert.equal(next.edges.length, template.edges.length);
});

test("부분 프리셋에서 선택하지 않은 노드에 대한 타임라인 참조를 제거한다", () => {
  const graph = starterGraph("drama", 1);
  const previs = graph.nodes.find((node) => node.kind === "previs")!;
  previs.timeline!.words = [{ text: "작품 자막", startFrame: 0, endFrame: 1 }];
  const template = boardTemplate(graph, [previs.id]);
  assert.ok(validateGraph(template));
  assert.ok(template.nodes[0].timeline?.clips.every((clip) => clip.nodeId === null));
  assert.equal(template.nodes[0].timeline?.words, undefined);
});

test("모든 형식에서 최대 씬 수와 자동 시작 보드는 유효하다", () => {
  for (const profile of productionProfiles) {
    const full = starterGraph(profile.id, 12);
    assert.ok(validateGraph(full), profile.id);
    assert.equal(full.nodes.filter((node) => node.kind === "scene").length, 12);
    const auto = starterGraph(profile.id, "auto");
    assert.ok(validateGraph(auto), profile.id);
    assert.equal(auto.nodes.filter((node) => node.kind === "scene").length, 0);
    assert.ok(auto.nodes.some((node) => node.kind === "scenario"));
  }
  assert.equal(parseDirectorOptions({ format: "drama", sceneCount: "auto" })?.sceneCount, "auto");
  assert.equal(parseDirectorOptions({ format: "drama", sceneCount: 12 })?.sceneCount, 12);
  assert.equal(parseDirectorOptions({ format: "drama", sceneCount: 13 }), null);
});

test("광고 형식에서 패션 광고 워크플로우를 선택해도 기본 광고 설정을 보존한다", () => {
  assert.equal(productionDefaults("ad", "fashion-ad").aspect, "16:9");
  assert.equal(productionDefaults("ad", "fashion-ad").sceneCount, 9);
  assert.equal(productionDefaults("ad").aspect, "9:16");
  const first = starterGraph("ad", 2, "16:9", "fashion-ad");
  const extended = addMissingStarter(first, "ad", 2, "16:9", "fashion-ad");
  assert.deepEqual(extended, first);
  assert.ok(first.nodes.some((node) => node.guidance?.skillIds?.includes("fashion-ad-reference")));
  assert.ok(first.nodes.some((node) => node.guidance?.skillIds?.includes("fashion-ad-lens-transition")));
});

test("패션 광고에 새 씬을 추가하면 기존 편집을 유지하며 새 영상만 타임라인에 추가한다", () => {
  const graph = starterGraph("ad", 2, "16:9", "fashion-ad");
  const timeline = graph.nodes.find((node) => node.productionRole === "ai-ad-timeline")!;
  const removed = timeline.timeline!.clips[0].nodeId;
  timeline.timeline!.clips = [{ ...timeline.timeline!.clips[1], durationFrames: 150 }];
  const next = addMissingStarter(graph, "ad", 3, "16:9", "fashion-ad");
  const updated = next.nodes.find((node) => node.id === timeline.id)!.timeline!;
  const newVideo = next.nodes.find((node) => node.productionRole === "ai-ad-video-3")!;
  assert.deepEqual(updated.clips.map((clip) => clip.nodeId), [timeline.timeline!.clips[0].nodeId, newVideo.id]);
  assert.equal(updated.clips[0].durationFrames, 150);
  assert.ok(!updated.clips.some((clip) => clip.nodeId === removed));
  assert.deepEqual(addMissingStarter(next, "ad", 3, "16:9", "fashion-ad"), next);
  assert.ok(validateGraph(next));
});
