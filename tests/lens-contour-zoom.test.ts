import { test } from "node:test";
import assert from "node:assert/strict";
import { contourPushIn } from "../lib/lens-contour-zoom";

test("렌즈와 영상이 같은 좌표계에서 확대되고 최종 네 모서리가 내부에 들어간다", () => {
  const polygon = [{ x: .2, y: .2 }, { x: .7, y: .2 }, { x: .7, y: .8 }, { x: .2, y: .8 }];
  for (const [w, h] of [[1280, 720], [720, 1280]]) {
    const start = contourPushIn(polygon, w, h, 0);
    assert.deepEqual(start.crop, { left: 0, top: 0, width: w, height: h });
    assert.deepEqual(start.outline, polygon);
    const middle = contourPushIn(polygon, w, h, .25);
    assert.ok(middle.crop.width < w && middle.crop.width > 20);
    assert.equal(middle.outline[0].x, (polygon[0].x * w - middle.crop.left) / middle.crop.width);
    const end = contourPushIn(polygon, w, h, 1);
    assert.ok(end.outline[0].x < 0 && end.outline[0].y < 0);
    assert.ok(end.outline[2].x > 1 && end.outline[2].y > 1);
  }
});
test("너무 작거나 화면 밖인 윤곽은 명확히 거절한다", () => {
  assert.throws(() => contourPushIn([{ x: .5, y: .5 }, { x: .501, y: .5 }, { x: .5, y: .501 }], 1280, 720, 1));
  assert.throws(() => contourPushIn([{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], 1280, 720, 1));
});
