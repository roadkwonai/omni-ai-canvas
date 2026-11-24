import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  listBlenderReceipts,
  saveBlenderReceipt,
  type BlenderReceipt,
} from "../lib/blender-receipts";
import { defaultBlenderScene } from "../lib/blender-scene-spec";
import { localAssetPath } from "../lib/media";
import type { Graph } from "../lib/types";

test("새로고침 후 같은 샷의 미연결 렌더를 복구하며 연결되거나 파일이 사라진 결과는 제외한다", async () => {
  const projectId = randomUUID(),
    otherId = randomUUID();
  const assetId = randomUUID();
  const receipt: BlenderReceipt = {
    asset: {
      type: "video",
      url: `/api/assets/${assetId}.mp4`,
      name: "장면.mp4",
    },
    sceneId: "shot-a",
    spec: defaultBlenderScene(randomUUID(), randomUUID()),
    quality: "final",
    createdAt: new Date().toISOString(),
  };
  const graph: Graph = {
    nodes: [{ id: "shot-a", title: "샷", kind: "shot", body: "", x: 0, y: 0 }],
    edges: [],
  };
  const target = localAssetPath(receipt.asset);
  try {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "fixture", { flag: "wx" });
    await saveBlenderReceipt(projectId, receipt);
    assert.deepEqual(await listBlenderReceipts(projectId, "shot-a", graph), [
      receipt,
    ]);
    assert.deepEqual(await listBlenderReceipts(otherId, "shot-a", graph), []);
    assert.deepEqual(await listBlenderReceipts(projectId, "shot-b", graph), []);
    const linked: Graph = {
      nodes: [
        ...graph.nodes,
        {
          id: "take",
          title: "영상",
          kind: "video",
          body: "",
          x: 0,
          y: 0,
          asset: receipt.asset,
        },
      ],
      edges: [{ source: "shot-a", target: "take" }],
    };
    assert.deepEqual(
      await listBlenderReceipts(projectId, "shot-a", linked),
      [],
    );
    await unlink(target);
    assert.deepEqual(await listBlenderReceipts(projectId, "shot-a", graph), []);
  } finally {
    await unlink(target).catch(() => {});
    await rm(
      path.join(process.cwd(), ".scene-room", "blender-receipts", projectId),
      { recursive: true, force: true },
    );
  }
});
