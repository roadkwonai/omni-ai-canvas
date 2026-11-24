import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultWorkflow,
  workflowBoard,
} from "../lib/higgsfield-workflows";
import { validateGraph } from "../lib/graph";
import { addProductionGraph } from "../lib/production-template";
import { snapshotReferences } from "../lib/run-input";

test("세 장르의 제작 보드에 승인한 지침과 등장 상태를 배치하고 프리비즈를 재매핑한다", () => {
  for (const format of ["cinema", "commercial", "drama"] as const) {
    const graph = workflowBoard({
      ...defaultWorkflow(format),
      states: true,
      voices: true,
      roomTour: true,
      alternate: true,
      extras: true,
      cast: ["윤서", "민우"],
      sceneCast: {
        0: [
          { actor: 0, variant: true },
          { actor: 1, variant: false },
        ],
      },
    });
    assert.ok(validateGraph(graph));
    const inputs = graph.edges.filter((edge) => edge.target === "frame-0");
    assert.ok(inputs.some((edge) => edge.source === "cast-0-state"));
    assert.ok(inputs.some((edge) => edge.source === "cast-1-image"));
    assert.ok(
      graph.edges.some(
        (edge) => edge.source === "blocking" && edge.usage === "guide",
      ),
    );
    assert.ok(
      snapshotReferences(graph, "video-0", "video").every(
        (ref) => ref.nodeId !== "blocking",
      ),
    );
    assert.ok(
      validateGraph(addProductionGraph({ nodes: [], edges: [] }, graph)),
    );
  }
});

test("사용자가 선택한 블로킹 입력과 연기 영상 입력만 해당 샷에 보낸다", () => {
  const graph = workflowBoard({
    ...defaultWorkflow("cinema"),
    voices: true,
    roomTour: true,
    blockingInput: true,
    elementInput: true,
    skills: [],
  });
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.source === "blocking" &&
        edge.target === "video-0" &&
        edge.usage === "input",
    ),
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.source === "cast-0-element" &&
        edge.target === "video-0" &&
        edge.role === "motion",
    ),
  );
  assert.deepEqual(
    graph.nodes.find((node) => node.id === "shot-0")?.guidance?.skillIds,
    [],
  );
});

test("패션 광고의 배역 선택과 화면비를 새 작업 묶음에 적용한다", () => {
  const graph = workflowBoard({
    ...defaultWorkflow("fashion-ad"),
    ad: { sceneCount: 2, aspect: "9:16", transitions: false },
    roomTour: false,
    cast: ["주인공", "동료"], sceneCast: { 0: [{ actor: 1, variant: false }], 1: [] },
  });
  assert.ok(validateGraph(graph));
  assert.equal(graph.nodes.find((node) => node.id === "ai-ad-timeline")?.timeline?.aspect, "9:16");
  assert.ok(graph.edges.some((edge) => edge.source === "ai-ad-cast-image-1" && edge.target === "ai-ad-frame-1"));
  assert.ok(!graph.edges.some((edge) => edge.source.startsWith("ai-ad-cast-image-") && edge.target === "ai-ad-frame-2"));
  assert.ok(!graph.nodes.some((node) => ["ai-ad-blocking", "ai-ad-transition"].includes(node.id)));
});
