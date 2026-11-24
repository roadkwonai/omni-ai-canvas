import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addEditedImage,
  addStagingGuide,
  applyStaging,
  defaultStaging,
  projectPoint,
  validateStaging,
} from "../lib/staging";
import { validateGraph } from "../lib/graph";
import { snapshotReferences } from "../lib/run-input";
import type { Graph } from "../lib/types";

const image = {
  url: "/sample/portrait.webp",
  type: "image" as const,
  name: "portrait.webp",
};
test("원근 좌표가 거리와 초점거리에 따라 변하며 잘못된 카메라 설정은 거절한다", () => {
  const near = projectPoint(1, 2, 1, defaultStaging)!;
  const far = projectPoint(1, 8, 1, defaultStaging)!;
  assert.ok(near.scale > far.scale);
  assert.ok(
    projectPoint(1, 2, 1, { ...defaultStaging, focal: 70 })!.scale > near.scale,
  );
  assert.equal(validateStaging(defaultStaging), true);
  assert.equal(validateStaging({ ...defaultStaging, yaw: NaN }), false);
});

test("샷 지시, 가이드 비전송과 편집본 원본 보존을 검증한다", () => {
  const initial: Graph = {
    nodes: [
      {
        id: "image",
        kind: "referenceImage",
        title: "인물",
        body: "원본",
        x: 0,
        y: 0,
        asset: image,
      },
    ],
    edges: [],
  };
  const shot = applyStaging(initial, null, "shot", defaultStaging);
  assert.equal(
    shot.nodes.find((node) => node.id === "shot")?.staging?.focal,
    35,
  );
  const changed = applyStaging(shot, "shot", "unused", {
    ...defaultStaging,
    focal: 50,
  });
  assert.equal(
    (
      changed.nodes
        .find((node) => node.id === "shot")!
        .body.match(/## 촬영 지시/g) || []
    ).length,
    1,
  );
  assert.throws(
    () => applyStaging(changed, "missing", "other", defaultStaging),
    /삭제/,
  );
  const withGuide = addStagingGuide(changed, "shot", "guide", image);
  assert.equal(validateGraph(withGuide), true);
  assert.ok(
    withGuide.edges.some(
      (edge) => edge.source === "guide" && edge.usage === "guide",
    ),
  );
  assert.ok(
    !snapshotReferences(withGuide, "shot", "text").some(
      (item) => item.nodeId === "guide",
    ),
  );
  const edited = addEditedImage(withGuide, "image", image.url, "edited", image);
  assert.deepEqual(
    edited.nodes.find((node) => node.id === "image")?.asset,
    image,
  );
  assert.equal(
    edited.nodes.find((node) => node.id === "edited")?.kind,
    "referenceImage",
  );
  assert.throws(
    () => addEditedImage(edited, "image", "/different", "other", image),
    /변경/,
  );
});
