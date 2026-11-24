import assert from "node:assert/strict";
import test from "node:test";
import {
  addBlenderTake,
  addBlockingReference,
  linkBlenderTimeline,
  saveBlenderShot,
} from "../lib/blender-board";
import { defaultBlenderScene } from "../lib/blender-scene-spec";
import { validateGraph } from "../lib/graph";
import { snapshotReferences } from "../lib/run-input";
import type { Asset } from "../lib/types";

const spec = defaultBlenderScene(crypto.randomUUID(), crypto.randomUUID());
const movie: Asset = {
  type: "video",
  url: `/api/assets/${crypto.randomUUID()}.mp4`,
  name: "take.mp4",
};

test("3D 장면·테이크·타임라인을 보존하고 같은 테이크의 재연결은 중복되지 않는다", () => {
  const scene = saveBlenderShot({ nodes: [], edges: [] }, spec);
  const take = addBlenderTake(scene.graph, scene.nodeId, spec, movie, "final");
  const edit = saveBlenderShot(
    take.graph,
    { ...spec, camera: { ...spec.camera, lens: 70 } },
    scene.nodeId,
  );
  assert.equal(
    edit.graph.nodes.find((node) => node.id === take.nodeId)?.blenderTake?.scene
      .camera.lens,
    40,
  );
  const timeline = linkBlenderTimeline(edit.graph, take.nodeId);
  const again = linkBlenderTimeline(
    timeline.graph,
    take.nodeId,
    timeline.nodeId,
  );
  assert.ok(validateGraph(again.graph));
  assert.equal(again.graph, timeline.graph);
  assert.equal(
    again.graph.nodes.find((node) => node.id === timeline.nodeId)?.timeline
      ?.clips[0].durationFrames,
    90,
  );
  assert.equal(
    addBlenderTake(edit.graph, scene.nodeId, spec, movie, "final").nodeId,
    take.nodeId,
  );
  const earlier = { ...movie, url: `/api/assets/${crypto.randomUUID()}.mp4` };
  assert.throws(
    () => addBlenderTake(edit.graph, scene.nodeId, spec, earlier, "preview"),
    /렌더 중 샷 설정/,
  );
  const confirmed = addBlenderTake(
    edit.graph,
    scene.nodeId,
    spec,
    earlier,
    "preview",
    true,
  );
  assert.equal(
    confirmed.graph.nodes.find((node) => node.id === confirmed.nodeId)
      ?.blenderTake?.scene.camera.lens,
    40,
  );
});

test("테이크에서 뽑은 블로킹 프레임은 대안 샷의 연출 가이드로 연결한다", () => {
  const scene = saveBlenderShot({ nodes: [], edges: [] }, spec);
  const take = addBlenderTake(
    scene.graph,
    scene.nodeId,
    spec,
    movie,
    "preview",
  );
  const still: Asset = {
    type: "image",
    url: `/api/assets/${crypto.randomUUID()}.png`,
    name: "frame.png",
  };
  const next = addBlockingReference(take.graph, take.nodeId, still, 0);
  assert.ok(validateGraph(next.graph));
  assert.deepEqual(
    next.graph.nodes.find((n) => n.id === next.nodeId)?.blenderScene,
    spec,
  );
  assert.ok(
    snapshotReferences(next.graph, next.nodeId, "video").every(
      (ref) => ref.asset?.url !== still.url,
    ),
  );
  assert.throws(() =>
    addBlockingReference(take.graph, take.nodeId, still, spec.seconds),
  );
});
