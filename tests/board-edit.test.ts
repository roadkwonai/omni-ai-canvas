import test from "node:test";
import assert from "node:assert/strict";
import { addStoryboardVideo, duplicateGraph, positionGraph, prepareProductionVideo, removeBoardItems, sceneShots, selectedGraph } from "../lib/board-edit";
import { emptyGridSpacing, type PortraitGridConfig } from "../lib/portrait-grid";
import { boardEdgeId } from "../lib/board-run-state";
import { validateGraph } from "../lib/graph";
import type { Graph } from "../lib/types";
import { createImageEditNode } from "../lib/image-edit";

test("씬과 샷에서 연결된 영상 노드를 만들거나 기존 테이크를 재사용한다", () => {
  const graph: Graph = {
    nodes: [
      { id: "scene", kind: "scene", title: "터널", body: "터널로 들어간다.", x: 0, y: 0 },
      { id: "script", kind: "script", title: "대본", body: "", x: 300, y: 0 },
      { id: "shot", kind: "shot", title: "터널 입구", body: "천천히 전진.", x: 600, y: 0 },
      { id: "frame", kind: "keyframe", title: "첫 프레임", body: "", x: 900, y: 0,
        asset: { type: "image", name: "frame.webp", url: "/sample/frame.webp" } },
      { id: "guide", kind: "shot", title: "연출 가이드", body: "", x: 600, y: 300 },
    ],
    edges: [{ source: "scene", target: "script" }, { source: "script", target: "shot" },
      { source: "shot", target: "frame" }, { source: "scene", target: "guide", usage: "guide" }],
  };
  const [scene, , shot, frame] = graph.nodes;
  assert.deepEqual(sceneShots(graph, scene.id), [shot]);
  const sceneVideo = prepareProductionVideo(graph, scene, { id: "scene-video", position: { x: 700, y: 300 } });
  assert.deepEqual(sceneVideo.graph.edges.at(-1), { source: scene.id, target: "scene-video", usage: "input" });
  const shotVideo = prepareProductionVideo(sceneVideo.graph, shot, { id: "shot-video", position: { x: 1200, y: 0 } });
  assert.deepEqual(shotVideo.graph.edges.slice(-2), [
    { source: shot.id, target: "shot-video", usage: "input" },
    { source: frame.id, target: "shot-video", usage: "input", role: "start" },
  ]);
  assert.deepEqual(prepareProductionVideo(shotVideo.graph, frame, { id: "extra", position: { x: 1600, y: 0 } }), shotVideo);
  assert.deepEqual(prepareProductionVideo(shotVideo.graph, shot, { id: "extra", position: { x: 1600, y: 0 } }), shotVideo);
});

test("선택 항목 복제는 내부 연결과 역할만 복사하고 그룹 식별자를 바꾼다", () => {
  const graph: Graph = {
    nodes: [
      { id: "a", kind: "brief", title: "A", body: "", x: 0, y: 0, group: "g" },
      {
        id: "b",
        kind: "shot",
        title: "B",
        body: "",
        x: 100,
        y: 0,
        group: "g",
        timeline: {
          aspect: "16:9",
          clips: [
            {
              nodeId: "a",
              durationFrames: 30,
              inFrame: 0,
              transition: "cut",
              transitionFrames: 0,
            },
            {
              nodeId: "c",
              durationFrames: 30,
              inFrame: 0,
              transition: "cut",
              transitionFrames: 0,
            },
          ],
          audio: [],
        },
      },
      { id: "c", kind: "video", title: "C", body: "", x: 200, y: 0 },
    ],
    edges: [
      { source: "a", target: "b", usage: "guide", role: "context" },
      { source: "b", target: "c" },
    ],
  };
  let index = 0;
  const clone = duplicateGraph(
    selectedGraph(graph, ["a", "b"]),
    () => `new${++index}`,
  );
  assert.deepEqual(clone.edges, [
    { source: "new1", target: "new2", usage: "guide", role: "context" },
  ]);
  assert.equal(clone.nodes[0].group, clone.nodes[1].group);
  assert.notEqual(clone.nodes[0].group, "g");
  assert.equal(clone.nodes[0].x, 40);
  assert.equal(clone.nodes[1].timeline?.clips[0].nodeId, "new1");
  assert.equal(clone.nodes[1].timeline?.clips[1].nodeId, "c");
  assert.equal(graph.nodes[0].id, "a");
});

test("원본과 이미지 편집을 함께 복제하면 새 원본으로 입력을 연결한다", () => {
  const source: Graph["nodes"][number] = {
    id: "source", kind: "character", title: "Source", body: "", x: 0, y: 0,
    asset: { url: "/sample/portrait.webp", type: "image", name: "portrait.webp" },
  };
  const { node, edge } = createImageEditNode(source, "texture", "피부결 유지", "take");
  const ids = ["source-copy", "take-copy"];
  const copied = duplicateGraph({ nodes: [source, node], edges: [edge] }, () => ids.shift()!);
  assert.equal(copied.nodes[1].imageEdit?.sourceNodeId, copied.nodes[0].id);
  assert.equal(copied.edges[0].source, copied.nodes[0].id);
  assert.deepEqual(copied.nodes[1].imageEdit?.sourceAsset, source.asset);
});

test("보정된 시트의 선택 컷은 행 우선 순서로 영상 하나에 연결되고 복제 후에도 출처가 유지된다", () => {
  const asset = { url: "/sample/frame.webp", type: "image" as const, name: "sheet.webp" };
  const portraitGrid: PortraitGridConfig = {
    assetUrl: asset.url, layout: "5x5", spacing: emptyGridSpacing, cells: {},
  };
  const sheet: Graph["nodes"][number] = {
    id: "sheet", kind: "keyframe", title: "시트", body: "", x: 0, y: 0, asset, portraitGrid,
  };
  const cuts: Graph["nodes"] = [0, 12, 24].map((index) => ({
    id: `cut-${index}`, kind: "keyframe", title: "선택 컷", body: "", x: 300, y: index * 15,
    asset,
    gridCell: { sourceNodeId: sheet.id, sourceAssetUrl: asset.url, index, rows: 5, columns: 5,
      bounds: { left: 5, top: 5, right: 20, bottom: 20 } },
  }));
  const graph = { nodes: [sheet, ...cuts], edges: cuts.map(({ id }) => ({ source: sheet.id, target: id })) };
  const video = { id: "video", position: { x: 640, y: 0 } };
  const result = addStoryboardVideo(graph, sheet.id, ["cut-24", "cut-0", "cut-12"], portraitGrid, video);
  assert.deepEqual(result.edges.slice(-3).map(({ source, role }) => [source, role]),
    [["cut-0", "context"], ["cut-12", "context"], ["cut-24", "context"]]);
  assert.match(result.nodes.at(-1)!.body, /1-1, 3-3, 5-5/);
  assert.throws(() => addStoryboardVideo(graph, sheet.id, ["cut-0"], {
    ...portraitGrid, spacing: { ...emptyGridSpacing, top: 2 },
  }, video), /경계가 변경/);
  let count = 0;
  const duplicate = duplicateGraph(result, () => `clone-${++count}`);
  assert.equal(duplicate.nodes[1].gridCell?.sourceNodeId, duplicate.nodes[0].id);
  assert.equal(duplicate.edges.at(-1)?.target, duplicate.nodes.at(-1)?.id);
});

test("포인터 위치에 붙여넣어도 선택 노드의 상대 위치와 연결을 보존한다", () => {
  const graph: Graph = {
    nodes: [
      { id: "a", kind: "note", title: "A", body: "", x: 40, y: 80, rating: 3 },
      { id: "b", kind: "note", title: "B", body: "", x: 140, y: 30 },
    ],
    edges: [{ source: "a", target: "b", usage: "guide" }],
  };
  const placed = positionGraph(graph, { x: 12, y: 24 });
  assert.deepEqual(placed.nodes.map(({ x, y }) => [x, y]), [[12, 74], [112, 24]]);
  assert.deepEqual(placed.edges, graph.edges);
  assert.equal(placed.nodes[0].rating, 3);
  assert.ok(validateGraph(placed));
  assert.equal(validateGraph({ ...placed, nodes: [{ ...placed.nodes[0], rating: 6 }, placed.nodes[1]] }), false);
});

test("메뉴로 연결만 끊거나 노드를 삭제할 때 기존 타임라인을 보전한다", () => {
  const graph: Graph = {
    nodes: [
      { id: "a", kind: "video", title: "A", body: "", x: 0, y: 0 },
      { id: "b", kind: "previs", title: "B", body: "", x: 100, y: 0, timeline: {
        aspect: "16:9", audio: [], clips: [{ nodeId: "a", durationFrames: 30, inFrame: 0, transition: "cut", transitionFrames: 0 }],
      } },
    ],
    edges: [{ source: "a", target: "b" }],
  };
  const disconnected = removeBoardItems(graph, [], new Set([boardEdgeId("a", "b")]));
  assert.deepEqual(disconnected.nodes, graph.nodes);
  assert.deepEqual(disconnected.edges, []);
  const deleted = removeBoardItems(graph, ["a"], new Set());
  assert.equal(deleted.nodes[0].timeline?.clips[0].nodeId, null);
  assert.ok(validateGraph(deleted));
});

test("로컬 편집 노드가 복제되면 원본 연결과 저장한 확대 배율을 이어받는다", () => {
  const asset = { url: "/sample/portrait.webp", type: "image" as const, name: "portrait.webp" };
  const graph: Graph = {
    nodes: [
      { id: "source", kind: "character", title: "원본", body: "", x: 0, y: 0, asset },
      { id: "result", kind: "keyframe", title: "업스케일", body: "", x: 340, y: 0,
        imageOperation: { kind: "upscale", sourceId: "source", sourceAsset: asset, settings: { scale: 4, style: "detail" } } },
    ],
    edges: [{ source: "source", target: "result", role: "identity" }],
  };
  const ids = ["source-copy", "result-copy"];
  const copy = duplicateGraph(graph, () => ids.shift()!);
  assert.ok(validateGraph(copy));
  assert.equal(copy.nodes[1].imageOperation?.sourceId, copy.edges[0].source);
  assert.deepEqual(copy.nodes[1].imageOperation?.settings, { scale: 4, style: "detail" });
});
