import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { directorReferenceMap, readDirectorReferenceFile, readDirectorReferences } from "../lib/director-references";

test("로컬 참고 예제는 목록과 해시가 맞는 파일만 읽는다", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "director-references-"));
  try {
    assert.deepEqual(await readDirectorReferences(root), []);
    const still = Buffer.from("still"), video = Buffer.from("video");
    const sha = (content: Buffer) => createHash("sha256").update(content).digest("hex");
    const source = "https://materials.ainspire.co.kr/cineguide/img/dolly_in_v2.mp4";
    const valid = { id: "dolly-in", still: { file: "dolly-in.webp", sha256: sha(still) }, video: { file: "dolly-in.mp4", sha256: sha(video) }, source };
    await writeFile(path.join(root, "dolly-in.webp"), still);
    await writeFile(path.join(root, "dolly-in.mp4"), video);
    await writeFile(path.join(root, "secret.webp"), "secret");
    await writeFile(path.join(root, "manifest.json"), JSON.stringify({ items: [
      valid,
      { ...valid, id: "pan", still: { file: "../../../.env", sha256: sha(still) } },
      { ...valid, id: "tilt", source: "https://example.com/a.mp4" },
    ] }));
    const items = await readDirectorReferences(root);
    assert.deepEqual(items.map(({ id }) => id), ["dolly-in"]);
    assert.match(directorReferenceMap(items)["dolly-in"].video!, /^\/api\/director-references\/dolly-in\.mp4\?v=[0-9a-f]{12}$/);
    assert.deepEqual(await readDirectorReferenceFile("dolly-in.mp4", root), video);
    for (const file of ["secret.webp", "manifest.json", "../../../.env", "pan.webp"]) assert.equal(await readDirectorReferenceFile(file, root), null);
    await writeFile(path.join(root, "dolly-in.mp4"), "changed");
    assert.equal(await readDirectorReferenceFile("dolly-in.mp4", root), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
