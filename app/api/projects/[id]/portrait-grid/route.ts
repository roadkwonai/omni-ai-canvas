import { readFile, unlink } from "node:fs/promises";
import sharp from "sharp";
import { getProject, saveProject } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { localAssetPath, storeMedia } from "@/lib/media";
import {
  emptyGridSpacing,
  gridCellBounds,
  gridRectangles,
  isGridLayout,
  isPortraitGridConfig,
  gridLayouts,
  type GridCellBounds,
  type GridLayout,
  type GridSpacing,
} from "@/lib/portrait-grid";
import type { Asset } from "@/lib/types";
import { nodeLimit } from "@/lib/graph";
import { validateGraph } from "@/lib/graph";
import { addProductionGraph } from "@/lib/production-template";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const data = await jsonObject(request);
    if (
      !uuid(id) ||
      typeof data.nodeId !== "string" ||
      !Number.isSafeInteger(data.version) ||
      (data.adopt !== undefined && typeof data.adopt !== "boolean") ||
      !isGridLayout(data.rows, data.columns) ||
      !Array.isArray(data.cells) ||
      data.cells.length < 1 ||
      data.cells.length > 25 ||
      data.cells.some(
        (cell) =>
          !Number.isInteger(cell) ||
          cell < 0 ||
          cell >= Number(data.rows) * Number(data.columns),
      ) ||
      new Set(data.cells).size !== data.cells.length
    )
      return bad("시트와 선택한 칸을 확인해 주세요.");
    const project = await getProject(id);
    if (!project) return bad("프로젝트를 찾을 수 없습니다.", 404);
    if (project.version !== data.version)
      return bad("프로젝트가 변경됐습니다. 저장 후 다시 시도해 주세요.", 409);
    const source = project.graph.nodes.find((node) => node.id === data.nodeId);
    if (!source?.asset || source.asset.type !== "image")
      return bad("이미지 시트 노드를 선택해 주세요.");
    const layout = (Object.keys(gridLayouts) as GridLayout[]).find((key) =>
      gridLayouts[key].rows === data.rows && gridLayouts[key].columns === data.columns);
    const config = {
      assetUrl: source.asset.url,
      layout,
      spacing: data.spacing ?? emptyGridSpacing,
      cells: data.cellBounds ?? {},
    };
    if (!isPortraitGridConfig(config)) return bad("시트 경계 설정을 확인해 주세요.");
    const created: Asset[] = [];
    let saving = false;
    try {
      const bytes = await readFile(localAssetPath(source.asset));
      const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 })
        .rotate()
        .metadata();
      const width = metadata.autoOrient?.width ?? metadata.width;
      const height = metadata.autoOrient?.height ?? metadata.height;
      const columns = Number(data.columns),
        rows = Number(data.rows);
      if (!width || !height || width < columns || height < rows)
        throw new Error("이미지 크기가 너무 작습니다.");
      const rects = gridRectangles(
        width,
        height,
        columns,
        rows,
        config.spacing as GridSpacing,
        config.cells as Record<string, GridCellBounds>,
      );
      const missing: number[] = [];
      const existing = new Map<number, Asset>();
      for (const index of data.cells as number[]) {
        const bounds = gridCellBounds(index, width, height, columns, rows, config.spacing, config.cells);
        const found = data.adopt ? project.graph.nodes.find((node) =>
          node.asset?.type === "image" && node.gridCell?.sourceNodeId === source.id &&
          project.graph.edges.some((edge) => edge.source === source.id && edge.target === node.id) &&
          node.gridCell.sourceAssetUrl === source.asset!.url && node.gridCell.index === index &&
          node.gridCell.rows === rows && node.gridCell.columns === columns &&
          Object.keys(bounds).every((key) =>
            node.gridCell!.bounds[key as keyof GridCellBounds] === bounds[key as keyof GridCellBounds])) : undefined;
        if (found?.asset) existing.set(index, found.asset);
        else missing.push(index);
      }
      if (data.adopt && (project.graph.nodes.length + missing.length > nodeLimit ||
          project.graph.edges.length + missing.length > 500))
        return bad("선택한 칸을 추가할 노드 또는 연결 공간이 부족합니다.");
      for (const index of missing) {
        const rect = rects[index];
        const image = await sharp(bytes, { limitInputPixels: 40_000_000 })
          .rotate()
          .extract(rect)
          .png()
          .toBuffer();
        created.push(
          await storeMedia(
            image,
            `${source.title} · ${index + 1}번.png`,
            "image",
          ),
        );
      }
      if (data.adopt) {
        if (!missing.length)
          return Response.json({ cells: (data.cells as number[]).map((index) => existing.get(index)), project }, { status: 200, headers: { "Cache-Control": "no-store" } });
        const graph = addProductionGraph(project.graph, {
          nodes: created.map((asset, i) => ({
            id: `cell-${missing[i] + 1}`,
            kind: "keyframe" as const,
            title: `${source.title.slice(0, 145)} · ${missing[i] + 1}번`,
            body: `원본 시트 ${rows}×${columns}의 ${missing[i] + 1}번 칸.`,
            asset,
            gridCell: {
              sourceNodeId: source.id,
              sourceAssetUrl: source.asset!.url,
              index: missing[i],
              rows,
              columns,
              bounds: gridCellBounds(missing[i], width, height, columns, rows, config.spacing, config.cells),
            },
            x: 0,
            y: i * 260,
          })),
          edges: [],
        });
        for (const cell of graph.nodes.slice(project.graph.nodes.length))
          graph.edges.push({ source: source.id, target: cell.id, role: "context", usage: "guide" });
        if (!validateGraph(graph)) throw new Error("선택한 칸의 연결을 확인해 주세요.");
        saving = true;
        const saved = await saveProject(id, project.title, graph, project.version);
        saving = false;
        if (!saved) {
          await Promise.all(created.map((asset) => unlink(localAssetPath(asset)).catch(() => {})));
          return bad("분할 중 프로젝트가 변경됐습니다. 다시 시도해 주세요.", 409);
        }
        return Response.json({ cells: created, project: saved }, { status: 201, headers: { "Cache-Control": "no-store" } });
      }
      const latest = await getProject(id);
      if (!latest || latest.version !== project.version) {
        await Promise.all(created.map((asset) => unlink(localAssetPath(asset)).catch(() => {})));
        return bad("분할 중 프로젝트가 변경됐습니다. 다시 시도해 주세요.", 409);
      }
      return Response.json(
        { cells: created },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      if (saving) return bad("저장 결과를 확인하지 못했습니다. 프로젝트를 다시 열어 확인해 주세요.", 503);
      await Promise.all(created.map((asset) => unlink(localAssetPath(asset)).catch(() => {})));
      return bad(
        error instanceof Error
          ? error.message
          : "이미지를 분할하지 못했습니다.",
        422,
      );
    }
  });
}
