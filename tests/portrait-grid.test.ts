import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { emptyGridSpacing, gridCellBounds, gridLayouts, gridRectangles, isGridLayout, isGridCellProvenance, isPortraitGridConfig, samePortraitGrid, type PortraitGridConfig } from "../lib/portrait-grid";
import { POST } from "../app/api/projects/[id]/portrait-grid/route";

test("여백과 간격이 있는 시트에서 선택한 칸을 실제 픽셀로 추출한다", async () => {
  const colors = ["#ff0000", "#00ff00", "#0000ff"];
  const rects = gridRectangles(120, 60, 3, 1, { top: 10, bottom: 10, left: 5, right: 5, horizontal: 2.5, vertical: 0 });
  const source = await sharp({ create: { width: 120, height: 60, channels: 3, background: "#000000" } })
    .composite(rects.map((rect, index) => ({ input: { create: { width: rect.width, height: rect.height, channels: 3, background: colors[index] } }, left: rect.left, top: rect.top }))).png().toBuffer();
  for (const [index, rect] of rects.entries()) {
    const cell = await sharp(source).extract(rect).raw().toBuffer();
    const values = [cell[0], cell[1], cell[2]];
    assert.equal(values[index], 255);
    assert.equal(values[(index + 1) % 3], 0);
  }
  assert.throws(() => gridRectangles(120, 60, 5, 5, { ...emptyGridSpacing, horizontal: 26 }));
});

test("3×3과 2×2에서 선택한 번호의 실제 픽셀을 같은 순서로 추출한다", async () => {
  for (const [layout, chosen] of [["3x3", [0, 4, 8]], ["2x2", [0, 3]]] as const) {
    const { rows, columns } = gridLayouts[layout];
    const rects = gridRectangles(120, 120, columns, rows, emptyGridSpacing);
    const source = await sharp({ create: { width: 120, height: 120, channels: 3, background: "#000" } })
      .composite(rects.map((rect, index) => ({
        input: { create: { width: rect.width, height: rect.height, channels: 3, background: { r: index * 20, g: 42, b: 3 } } },
        left: rect.left,
        top: rect.top,
      }))).png().toBuffer();
    for (const index of chosen) {
      const pixels = await sharp(source).extract(rects[index]).raw().toBuffer();
      assert.deepEqual([...pixels.subarray(0, 3)], [index * 20, 42, 3]);
    }
  }
});

test("지원하는 그리드만 검증하고 기존 1×3과 5×5를 유지한다", () => {
  for (const { rows, columns } of Object.values(gridLayouts)) assert.equal(isGridLayout(rows, columns), true);
  assert.equal(isGridLayout(1, 3), true);
  assert.equal(isGridLayout(5, 5), true);
  assert.equal(isGridLayout(3, 5), false);
  assert.equal(isGridLayout("3", 3), false);
});

test("분할 API는 지원하지 않는 행·열과 범위 밖 칸을 저장 전에 거절한다", async () => {
  const id = "fc4d1397-b6fb-4520-8b62-aef82be11ea2";
  for (const input of [
    { rows: 3, columns: 5, cells: [0] },
    { rows: 3, columns: 3, cells: [9] },
    { rows: 2, columns: 2, cells: [1, 1] },
    { rows: 2, columns: 2, cells: [0], adopt: "true" },
  ]) {
    const request = new Request(`http://127.0.0.1:5050/api/projects/${id}/portrait-grid`, {
      method: "POST",
      headers: { host: "127.0.0.1:5050", "content-type": "application/json" },
      body: JSON.stringify({ nodeId: "source", version: 1, ...input }),
    });
    const response = await POST(request, { params: Promise.resolve({ id }) });
    assert.equal(response.status, 400);
  }
});

test("개별 셀 경계를 저장하고 동일한 좌표로 실제 픽셀을 자른다", async () => {
  const cells = { "12": { left: 41, top: 43, right: 59, bottom: 59 } };
  const rects = gridRectangles(100, 100, 5, 5, emptyGridSpacing, cells);
  assert.deepEqual(rects[12], { left: 41, top: 43, width: 18, height: 16 });
  assert.deepEqual(gridCellBounds(12, 100, 100, 5, 5, emptyGridSpacing, cells), cells["12"]);
  const source = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#000" } })
    .composite([{ input: { create: { width: 18, height: 16, channels: 3, background: "#ff0000" } }, left: 41, top: 43 }])
    .png().toBuffer();
  const { data, info } = await sharp(source).extract(rects[12]).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 18);
  assert.equal(info.height, 16);
  assert.deepEqual([...data.subarray(0, 3)], [255, 0, 0]);
  const config = { assetUrl: "/api/assets/test.png", layout: "5x5", spacing: emptyGridSpacing, cells };
  assert.equal(isPortraitGridConfig(JSON.parse(JSON.stringify(config))), true);
  assert.equal(isPortraitGridConfig({ ...config, cells: { "25": cells["12"] } }), false);
  assert.equal(isGridCellProvenance({ sourceNodeId: "source", sourceAssetUrl: config.assetUrl, index: 12, rows: 5, columns: 5, bounds: cells["12"] }), true);
  assert.equal(isGridCellProvenance({ sourceNodeId: "source", sourceAssetUrl: config.assetUrl, index: 25, rows: 5, columns: 5, bounds: cells["12"] }), false);
  assert.throws(() => gridRectangles(100, 100, 5, 5, emptyGridSpacing, { "12": { ...cells["12"], bottom: 40 } }));
});

test("저장한 설정은 JSON 속성 순서와 무관하게 비교하고 경계 변경은 구분한다", () => {
  const first: PortraitGridConfig = {
    assetUrl: "/api/assets/test.png",
    layout: "5x5",
    spacing: { ...emptyGridSpacing },
    cells: { "12": { left: 41, top: 43, right: 59, bottom: 59 } },
  };
  const second: PortraitGridConfig = {
    cells: { "12": { bottom: 59, right: 59, top: 43, left: 41 } },
    spacing: { vertical: 0, horizontal: 0, right: 0, left: 0, bottom: 0, top: 0 },
    layout: "5x5",
    assetUrl: "/api/assets/test.png",
  };
  assert.equal(samePortraitGrid(first, second), true);
  assert.equal(samePortraitGrid(first, { ...second, cells: { "12": { ...second.cells["12"], bottom: 58 } } }), false);
  assert.equal(samePortraitGrid(undefined, second), false);
});
