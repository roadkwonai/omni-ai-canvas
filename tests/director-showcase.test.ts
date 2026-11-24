import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { directorShowcase, directorTechniqueCount, ownMoves } from "../lib/director-showcase";

const example = (id: string, extension: string) => existsSync(new URL(`../public/director/examples/${id}.${extension}`, import.meta.url));

test("랜딩 연출 예제는 모두 실제 기법이고 Blender로 만든 예제를 쓰지 않는다", () => {
  assert.ok(directorTechniqueCount > 100);
  assert.deepEqual(directorShowcase.map(({ id, items }) => [id, items.length]),
    [["movement", 12], ["framing", 8], ["composition", 8], ["camera", 8], ["viewpoint", 8]]);
  for (const { id: group, items } of directorShowcase) for (const { id, name, use } of items) {
    assert.ok(name && use, id);
    if (group === "movement") continue;
    assert.ok(example(id, "webp"), `${id} 사진이 없다`);
    // 앱에 든 움직임 예제(mp4)는 Blender 렌더다. 실사 사진에는 짝이 되는 mp4가 없다.
    assert.ok(!example(id, "mp4"), `${id}는 Blender 예제다`);
  }
  const moves = directorShowcase[0].items.map(({ id }) => id);
  for (const id of ownMoves) {
    assert.ok(moves.includes(id), id);
    for (const extension of ["mp4", "webp"]) assert.ok(existsSync(new URL(`../public/director/moves/${id}.${extension}`, import.meta.url)), `${id}.${extension}`);
  }
});
