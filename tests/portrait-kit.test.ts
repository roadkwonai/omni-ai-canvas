import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultPortraitKit, makePortraitGraph } from "../lib/portrait-kit";
import { validateGraph } from "../lib/graph";

test("캐릭터 키트는 얼굴·포즈·의상을 구분하고 세 시점에 정체성을 연결한다", () => {
  const graph = makePortraitGraph({
    ...defaultPortraitKit,
    name: "서윤",
    costume: "녹색 코트",
  });
  assert.ok(validateGraph(graph));
  assert.equal(
    graph.nodes.filter((node) => node.id.startsWith("turn-")).length,
    3,
  );
  assert.ok(
    graph.nodes
      .find((node) => node.id === "portrait")
      ?.body.includes("녹색 코트"),
  );
  assert.deepEqual(
    graph.edges
      .filter((edge) => edge.target === "portrait")
      .map((edge) => [edge.source, edge.role]),
    [
      ["identity", "identity"],
      ["pose", "context"],
      ["costume", "prop"],
      ["character", "context"],
    ],
  );
});

test("25컷은 각각 독립된 샷과 키프레임으로 만들어지고 기존 제한을 지킨다", () => {
  const graph = makePortraitGraph({
    ...defaultPortraitKit,
    turnaround: false,
    storyboard: true,
  });
  assert.ok(validateGraph(graph));
  assert.equal(graph.nodes.filter((node) => node.kind === "shot").length, 25);
  assert.equal(
    graph.nodes.filter((node) => node.id.startsWith("frame-")).length,
    25,
  );
  assert.ok(
    graph.edges.some(
      (edge) => edge.source === "shot-25" && edge.target === "frame-25",
    ),
  );
  assert.throws(() => makePortraitGraph({ ...defaultPortraitKit, pose: "" }));
});
