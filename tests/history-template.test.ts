import assert from "node:assert/strict";
import { test } from "node:test";
import { createGraphHistory } from "../lib/graph-history";
import { validateGraph } from "../lib/graph";
import {
  addProductionGraph,
  appendProductionTemplate,
  makeProductionTemplate,
} from "../lib/production-template";
import { DIRECTOR_FORMATS, MAX_SCENE_COUNT, type Graph } from "../lib/types";

const graph = (body: string): Graph => ({
  nodes: [{ id: "n", title: "제목", body, kind: "script", x: 0, y: 0 }],
  edges: [],
});

test("실행 취소·다시 실행·입력 묶음·분기 편집", () => {
  const history = createGraphHistory();
  const first = graph("원본"),
    second = graph("중간"),
    third = graph("최종");
  history.remember(first, "body-n");
  history.remember(second, "body-n");
  assert.deepEqual(history.undo(third), first);
  assert.equal(history.canRedo, true);
  assert.deepEqual(history.redo(first), third);
  assert.equal(history.canRedo, false);
  assert.deepEqual(history.undo(third), first);
  history.remember(first, "other");
  assert.equal(history.canRedo, false);
  history.reset();
  assert.equal(history.undo(first), null);
  assert.equal(history.canUndo, false);
});

test("되돌리기 기록은 40개로 제한되고 입력 원본을 보존한다", () => {
  const history = createGraphHistory();
  const first = graph("0");
  history.remember(first);
  first.nodes[0].body = "변경";
  assert.equal(history.undo(graph("1"))?.nodes[0].body, "0");
  history.reset();
  for (let i = 0; i < 50; i++) history.remember(graph(String(i)));
  let count = 0;
  while (history.undo(graph("현재"))) count++;
  assert.equal(count, 40);
});

test("6개 작품 양식은 서로 다른 현장 지침과 연결된 프리비즈를 제공한다", () => {
  const briefs = new Set<string>();
  for (const format of DIRECTOR_FORMATS) {
    const result = makeProductionTemplate(format, 3);
    assert.ok(validateGraph(result), format);
    assert.equal(
      result.nodes.filter((node) => node.kind === "scene").length,
      3,
    );
    assert.equal(
      result.nodes.filter(
        (node) => node.kind === "previs" && node.timeline?.clips.length,
      ).length,
      3,
    );
    assert.ok(result.nodes.some((node) => node.kind === "audioCue"));
    briefs.add(result.nodes[0].body);
  }
  assert.equal(briefs.size, 6);
  assert.match(
    JSON.stringify(makeProductionTemplate("ad", 3)),
    /USP.*시연.*CTA/,
  );
  assert.match(
    JSON.stringify(makeProductionTemplate("musicVideo", 3)),
    /BPM.*인트로.*후렴.*브리지/,
  );
  assert.equal(makeProductionTemplate("short", 7).nodes.filter((node) => node.kind === "scene").length, 7);
  assert.throws(() => makeProductionTemplate("short", MAX_SCENE_COUNT + 1));
});

test("추가 시 노드·그룹·타임라인 참조를 새 ID로 연결하고 기존 그래프를 보존한다", () => {
  const current = graph("기존");
  current.nodes[0].group = "group-1";
  const addition = makeProductionTemplate("musicVideo", 1);
  const previs = addition.nodes.find((item) => item.kind === "previs")!;
  previs.timeline!.clips[0].nodeId = "frame-1";
  previs.timeline!.audio.push({
    nodeId: "audio",
    startFrame: 0,
    inFrame: 0,
    durationFrames: 30,
    gain: 1,
    fadeInFrames: 0,
    fadeOutFrames: 0,
  });
  const original = structuredClone(current);
  const added = addProductionGraph(current, addition);
  assert.deepEqual(current, original);
  assert.ok(validateGraph(added));
  const frame = added.nodes.find((item) => item.title === "씬 1 키프레임")!;
  const audio = added.nodes.find((item) => item.kind === "audioCue")!;
  const timeline = added.nodes.find((item) => item.kind === "previs")!;
  assert.equal(timeline.timeline?.clips[0].nodeId, frame.id);
  assert.equal(timeline.timeline?.audio[0].nodeId, audio.id);
  assert.notEqual(frame.group, "scene-1");
  assert.equal(frame.group, timeline.group);
  assert.ok(
    added.edges.some(
      (edge) => edge.target === frame.id && edge.role === undefined,
    ),
  );
  assert.notEqual(
    appendProductionTemplate(current, "film", 1).nodes.length,
    current.nodes.length,
  );
});
