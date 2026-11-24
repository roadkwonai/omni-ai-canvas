import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  createBlenderAsset,
  getBlenderAsset,
  inspectGlb,
  listBlenderAssets,
} from "../lib/blender-assets";

function glb(document: object, binary = Buffer.alloc(4)) {
  const raw = Buffer.from(JSON.stringify(document));
  const json = Buffer.concat([
    raw,
    Buffer.alloc((4 - (raw.length % 4)) % 4, 0x20),
  ]);
  const header = Buffer.alloc(20);
  header.write("glTF", 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + json.length + 8 + binary.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.write("JSON", 16);
  const chunk = Buffer.alloc(8);
  chunk.writeUInt32LE(binary.length, 0);
  chunk.write("BIN\0", 4);
  return Buffer.concat([header, json, chunk, binary]);
}
const doc = {
  asset: { version: "2.0" },
  buffers: [{ byteLength: 4 }],
  bufferViews: [{ buffer: 0, byteLength: 4 }],
  accessors: [{ count: 1 }],
  meshes: [{ name: "토끼" }],
  nodes: [{ name: "머리" }],
  skins: [{ joints: [0] }],
  animations: [{ name: "걷기" }],
};

test("GLB 내부 자산의 메시와 리그 및 동작을 읽고 외부 참조를 차단한다", () => {
  assert.deepEqual(inspectGlb(glb(doc)), {
    meshes: ["토끼"],
    bones: ["머리"], shapeKeys: [],
    animations: ["걷기"],
  });
  assert.throws(
    () => inspectGlb(glb({ ...doc, images: [{ uri: "file:///etc/passwd" }] })),
    /외부 파일/,
  );
  assert.throws(
    () => inspectGlb(glb({ ...doc, buffers: [{ byteLength: 400 }] })),
    /버퍼/,
  );
  assert.throws(
    () =>
      inspectGlb(glb({ ...doc, bufferViews: [{ buffer: 0, byteLength: 5 }] })),
    /범위/,
  );
  assert.throws(
    () => inspectGlb(glb({ ...doc, accessors: [{ count: 2_000_001 }] })),
    /한도/,
  );
  assert.throws(() => inspectGlb(Buffer.from("bad")), /GLB/);
});

test("3D 자산은 프로젝트 안에서 보존되고 다른 프로젝트에서 읽을 수 없다", async () => {
  const project = randomUUID(),
    other = randomUUID();
  try {
    const created = await createBlenderAsset(
      project,
      glb(doc),
      "rabbit.glb",
      "https://example.org",
      "CC0",
    );
    assert.equal(
      (await getBlenderAsset(project, created.id)).asset.credit,
      "CC0",
    );
    assert.equal((await listBlenderAssets(project))[0].id, created.id);
    await assert.rejects(getBlenderAsset(other, created.id), /프로젝트/);
  } finally {
    await rm(
      path.join(process.cwd(), ".scene-room", "blender-assets", project),
      { recursive: true, force: true },
    );
  }
});
