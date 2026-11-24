import assert from "node:assert/strict";
import test from "node:test";
import { adjustBoardLayout, optimizeBoardLayout, type BoardNodeSize } from "../lib/board-layout";
import { validateGraph } from "../lib/graph";
import type { Graph } from "../lib/types";

function assertSeparated(graph: Graph, sizes: Map<string, BoardNodeSize>) {
  for (let i = 0; i < graph.nodes.length; i++) {
    for (let j = i + 1; j < graph.nodes.length; j++) {
      const a = graph.nodes[i];
      const b = graph.nodes[j];
      const as = sizes.get(a.id)!;
      const bs = sizes.get(b.id)!;
      assert.ok(a.x + as.width + 48 <= b.x || b.x + bs.width + 48 <= a.x ||
        a.y + as.height + 48 <= b.y || b.y + bs.height + 48 <= a.y,
      `${a.id}와 ${b.id} 사이의 간격`);
    }
  }
}

test("서로 겹친 이미지·영상 카드의 실제 높이를 반영해 간격을 확보한다", () => {
  const graph: Graph = {
    nodes: [
      { id: "a", kind: "character", title: "인물", body: "", x: 0, y: 0, group: "g",
        asset: { type: "image", url: "/sample/portrait.webp", name: "person.webp" } },
      { id: "b", kind: "referenceVideo", title: "영상", body: "", x: 0, y: 180, group: "g",
        asset: { type: "video", url: "/sample/preview.mp4", name: "scene.mp4" } },
      { id: "c", kind: "note", title: "메모", body: "", x: 330, y: 0 },
      { id: "d", kind: "note", title: "멀리 둔 메모", body: "", x: 1400, y: 1000 },
    ],
    edges: [{ source: "a", target: "b" }],
  };
  const sizes = new Map<string, BoardNodeSize>([
    ["a", { width: 250, height: 470 }], ["b", { width: 250, height: 390 }],
    ["c", { width: 250, height: 130 }], ["d", { width: 250, height: 120 }],
  ]);
  const original = structuredClone(graph);
  const result = optimizeBoardLayout(graph, sizes);
  assertSeparated(result, sizes);
  assert.equal(result.nodes[0], graph.nodes[0]);
  assert.equal(result.nodes[2], graph.nodes[2]);
  assert.equal(result.nodes[3], graph.nodes[3]);
  assert.deepEqual(result.nodes.map(({ id }) => id), graph.nodes.map(({ id }) => id));
  assert.strictEqual(result.edges, graph.edges);
  assert.equal(result.nodes[1].group, "g");
  assert.strictEqual(result.nodes[1].asset, graph.nodes[1].asset);
  assert.deepEqual(graph, original);
  assert.equal(validateGraph(result), true);
  assert.strictEqual(optimizeBoardLayout(result, sizes), result);
});

test("이미 충분히 떨어진 배치는 그대로 유지하고 빈 그래프도 처리한다", () => {
  const graph: Graph = {
    nodes: [
      { id: "a", kind: "note", title: "A", body: "", x: -300, y: -200 },
      { id: "b", kind: "note", title: "B", body: "", x: 0, y: -200 },
    ],
    edges: [{ source: "a", target: "b" }],
  };
  const sizes = new Map([["a", { width: 250, height: 100 }], ["b", { width: 250, height: 100 }]]);
  assert.strictEqual(optimizeBoardLayout(graph, sizes), graph);
  const empty: Graph = { nodes: [], edges: [] };
  assert.strictEqual(optimizeBoardLayout(empty, sizes), empty);
});

test("좌표 경계에서 유효한 방향으로 이동한다", () => {
  const graph: Graph = {
    nodes: [
      { id: "a", kind: "note", title: "A", body: "", x: 100_000, y: 100_000 },
      { id: "b", kind: "note", title: "B", body: "", x: 100_000, y: 100_000 },
    ],
    edges: [],
  };
  const sizes = new Map([["a", { width: 250, height: 100 }], ["b", { width: 250, height: 100 }]]);
  const result = optimizeBoardLayout(graph, sizes);
  assertSeparated(result, sizes);
  assert.equal(validateGraph(result), true);
  assert.strictEqual(optimizeBoardLayout(result, sizes), result);
});

test("측정값이 누락되거나 유효하지 않으면 미디어 카드의 보수적인 크기를 사용한다", () => {
  const graph: Graph = {
    nodes: [
      { id: "a", kind: "character", title: "A", body: "", x: 0, y: 0,
        asset: { type: "image", url: "/a.png", name: "a.png" } },
      { id: "b", kind: "note", title: "B", body: "", x: 0, y: 200 },
    ],
    edges: [],
  };
  const result = optimizeBoardLayout(graph, new Map([["a", { width: 0, height: NaN }]]));
  assert.ok(result.nodes[1].x !== 0 || result.nodes[1].y !== 200);
  assert.strictEqual(optimizeBoardLayout(result, new Map()), result);
});

test("원래 간격이 충분했던 노드를 고정한 상태에서 인접한 겹침을 해소한다", () => {
  const graph: Graph = {
    nodes: [
      { id: "a", kind: "character", title: "인물", body: "", x: 0, y: 0 },
      { id: "b", kind: "referenceVideo", title: "영상", body: "", x: 0, y: 180 },
      { id: "c", kind: "note", title: "기존 배치", body: "", x: 298, y: 180 },
    ],
    edges: [],
  };
  const sizes = new Map([
    ["a", { width: 250, height: 470 }],
    ["b", { width: 250, height: 390 }],
    ["c", { width: 250, height: 100 }],
  ]);
  const result = optimizeBoardLayout(graph, sizes);
  assertSeparated(result, sizes);
  assert.strictEqual(result.nodes[2], graph.nodes[2]);
  assert.strictEqual(optimizeBoardLayout(result, sizes), result);
});


test("새 노드가 기존 노드에 겹치면 새 노드만 빈 공간으로 옮긴다", () => {
  const graph: Graph = {
    nodes: [
      { id: "old", kind: "note", title: "기존", body: "", x: 0, y: 0 },
      { id: "new", kind: "note", title: "새 노드", body: "", x: 40, y: 30 },
      { id: "unrelated", kind: "note", title: "먼 곳", body: "", x: 800, y: 0 },
    ],
    edges: [{ source: "old", target: "new" }],
  };
  const sizes = new Map(graph.nodes.map(({ id }) => [id, { width: 250, height: 120 }]));
  const result = adjustBoardLayout(graph, sizes, { added: new Set(["new"]), grown: new Set() });
  assert.strictEqual(result.nodes[0], graph.nodes[0]);
  assert.strictEqual(result.nodes[2], graph.nodes[2]);
  assert.notDeepEqual({ x: result.nodes[1].x, y: result.nodes[1].y }, { x: 40, y: 30 });
  assertSeparated(result, sizes);
  assert.strictEqual(result.edges, graph.edges);
  assert.equal(validateGraph(result), true);
  assert.strictEqual(adjustBoardLayout(result, sizes, { added: new Set(["new"]), grown: new Set() }), result);
});

test("미디어가 커지면 커진 노드를 고정하고 실제 겹친 이웃만 옮긴다", () => {
  const graph: Graph = {
    nodes: [
      { id: "grown", kind: "character", title: "이미지", body: "", x: 0, y: 0,
        asset: { type: "image", url: "/sample/portrait.webp", name: "a.webp" } },
      { id: "neighbor", kind: "note", title: "겹친 메모", body: "", x: 0, y: 260, group: "group" },
      { id: "near", kind: "note", title: "가까운 메모", body: "", x: 270, y: 0 },
      { id: "old1", kind: "note", title: "다른 기존 겹침", body: "", x: 1000, y: 0 },
      { id: "old2", kind: "note", title: "다른 기존 겹침", body: "", x: 1010, y: 0 },
    ],
    edges: [{ source: "grown", target: "neighbor" }],
  };
  const sizes = new Map(graph.nodes.map(({ id }) => [id, { width: 250, height: id === "grown" ? 400 : 120 }]));
  const result = adjustBoardLayout(graph, sizes, { added: new Set(), grown: new Set(["grown"]) });
  assert.strictEqual(result.nodes[0], graph.nodes[0]);
  assert.notStrictEqual(result.nodes[1], graph.nodes[1]);
  assert.equal(result.nodes[1].group, "group");
  assert.strictEqual(result.nodes[2], graph.nodes[2]);
  assert.strictEqual(result.nodes[3], graph.nodes[3]);
  assert.strictEqual(result.nodes[4], graph.nodes[4]);
  assert.strictEqual(result.edges, graph.edges);
  assert.equal(validateGraph(result), true);
  assert.strictEqual(adjustBoardLayout(result, sizes, { added: new Set(), grown: new Set(["grown"]) }), result);
});

test("이미 떨어진 신규 노드나 무관한 기존 겹침은 자동으로 옮기지 않는다", () => {
  const graph: Graph = {
    nodes: [
      { id: "old1", kind: "note", title: "A", body: "", x: 0, y: 0 },
      { id: "old2", kind: "note", title: "B", body: "", x: 10, y: 0 },
      { id: "new", kind: "note", title: "C", body: "", x: 280, y: 0 },
    ],
    edges: [],
  };
  const sizes = new Map(graph.nodes.map(({ id }) => [id, { width: 250, height: 100 }]));
  assert.strictEqual(adjustBoardLayout(graph, sizes, { added: new Set(["new"]), grown: new Set() }), graph);
});

test("여러 새 노드와 동시에 커진 노드는 겹침 없이 결정적으로 배치된다", () => {
  const graph: Graph = {
    nodes: [
      { id: "grown1", kind: "note", title: "A", body: "", x: 0, y: 0 },
      { id: "grown2", kind: "note", title: "B", body: "", x: 0, y: 0 },
      { id: "new1", kind: "note", title: "C", body: "", x: 0, y: 0 },
      { id: "new2", kind: "note", title: "D", body: "", x: 0, y: 0 },
    ],
    edges: [],
  };
  const sizes = new Map(graph.nodes.map(({ id }) => [id, { width: 250, height: 100 }]));
  const changes = { grown: new Set(["grown1", "grown2"]), added: new Set(["new1", "new2"]) };
  const result = adjustBoardLayout(graph, sizes, changes);
  assert.strictEqual(result.nodes[0], graph.nodes[0]);
  assertSeparated(result, sizes);
  assert.deepEqual(adjustBoardLayout(graph, sizes, changes), result);
  assert.strictEqual(adjustBoardLayout(result, sizes, changes), result);
});
