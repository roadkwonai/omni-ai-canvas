import { z } from "zod";

export type GridSpacing = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  horizontal: number;
  vertical: number;
};
export const emptyGridSpacing: GridSpacing = {
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
  horizontal: 0,
  vertical: 0,
};

export const gridLayouts = {
  "1x3": { rows: 1, columns: 3, label: "3면도 · 1×3" },
  "3x3": { rows: 3, columns: 3, label: "멀티카메라 · 3×3" },
  "5x5": { rows: 5, columns: 5, label: "스토리보드 · 5×5" },
  "2x2": { rows: 2, columns: 2, label: "스토리 전개 · 2×2" },
} as const;

export type GridLayout = keyof typeof gridLayouts;

const boundsSchema = z.object({
  left: z.number().min(0).max(100),
  top: z.number().min(0).max(100),
  right: z.number().min(0).max(100),
  bottom: z.number().min(0).max(100),
}).strict().refine((bounds) => bounds.right > bounds.left && bounds.bottom > bounds.top);

export type GridCellBounds = z.infer<typeof boundsSchema>;

const spacingSchema = z.object({
  top: z.number().min(0).max(100),
  bottom: z.number().min(0).max(100),
  left: z.number().min(0).max(100),
  right: z.number().min(0).max(100),
  horizontal: z.number().min(0).max(100),
  vertical: z.number().min(0).max(100),
}).strict();

const gridConfigSchema = z.object({
  assetUrl: z.string().min(1).max(2048),
  layout: z.enum(["1x3", "3x3", "5x5", "2x2"]),
  spacing: spacingSchema,
  cells: z.record(z.string().regex(/^(?:[0-9]|1[0-9]|2[0-4])$/), boundsSchema),
}).strict().refine(({ layout, cells }) => {
  const { rows, columns } = gridLayouts[layout];
  return Object.keys(cells).every((index) => Number(index) < rows * columns);
});
export type PortraitGridConfig = z.infer<typeof gridConfigSchema>;

const cellProvenanceSchema = z.object({
  sourceNodeId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  sourceAssetUrl: z.string().min(1).max(2048),
  index: z.number().int().min(0).max(24),
  rows: z.number().int().positive(),
  columns: z.number().int().positive(),
  bounds: boundsSchema,
}).strict().refine(({ rows, columns, index }) =>
  isGridLayout(rows, columns) && index < rows * columns);
export type GridCellProvenance = z.infer<typeof cellProvenanceSchema>;

export function isPortraitGridConfig(value: unknown): value is PortraitGridConfig {
  return gridConfigSchema.safeParse(value).success;
}

export function isGridCellProvenance(value: unknown): value is GridCellProvenance {
  return cellProvenanceSchema.safeParse(value).success;
}

export function samePortraitGrid(a: PortraitGridConfig | undefined, b: PortraitGridConfig): boolean {
  if (!a || a.assetUrl !== b.assetUrl || a.layout !== b.layout) return false;
  if ((Object.keys(emptyGridSpacing) as (keyof GridSpacing)[]).some((key) => a.spacing[key] !== b.spacing[key])) return false;
  const keys = Object.keys(a.cells);
  if (keys.length !== Object.keys(b.cells).length) return false;
  return keys.every((key) => {
    const first = a.cells[key];
    const second = b.cells[key];
    return !!second && first.left === second.left && first.top === second.top &&
      first.right === second.right && first.bottom === second.bottom;
  });
}

export function isGridLayout(rows: unknown, columns: unknown): boolean {
  return Object.values(gridLayouts).some(
    (layout) => layout.rows === rows && layout.columns === columns,
  );
}

export function gridRectangles(
  width: number,
  height: number,
  columns: number,
  rows: number,
  spacing: GridSpacing,
  cells: Record<string, GridCellBounds> = {},
) {
  if (
    ![width, height, columns, rows].every(
      (v) => Number.isInteger(v) && v > 0,
    ) ||
    !spacing ||
    Object.keys(emptyGridSpacing).some((key) => {
      const value = spacing[key as keyof GridSpacing];
      return (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 100
      );
    })
  )
    throw new Error("이미지 여백과 간격을 확인해 주세요.");
  const left = (width * spacing.left) / 100,
    top = (height * spacing.top) / 100;
  const gapX = (width * spacing.horizontal) / 100,
    gapY = (height * spacing.vertical) / 100;
  const cellWidth =
    (width - left - (width * spacing.right) / 100 - gapX * (columns - 1)) /
    columns;
  const cellHeight =
    (height - top - (height * spacing.bottom) / 100 - gapY * (rows - 1)) / rows;
  if (cellWidth < 1 || cellHeight < 1)
    throw new Error("여백과 간격을 줄여 각 칸의 크기를 확보해 주세요.");
  if (!Object.entries(cells).every(([index, bounds]) =>
    /^(?:[0-9]|1[0-9]|2[0-4])$/.test(index) &&
    Number(index) < rows * columns && boundsSchema.safeParse(bounds).success))
    throw new Error("개별 칸의 경계를 확인해 주세요.");
  return Array.from({ length: rows * columns }, (_, index) => {
    const col = index % columns,
      row = Math.floor(index / columns);
    const x = Math.round(left + col * (cellWidth + gapX)),
      y = Math.round(top + row * (cellHeight + gapY));
    const right = Math.round(left + col * (cellWidth + gapX) + cellWidth);
    const bottom = Math.round(top + row * (cellHeight + gapY) + cellHeight);
    const bounds = cells[String(index)];
    if (!bounds) return { left: x, top: y, width: right - x, height: bottom - y };
    const cellLeft = Math.round(width * bounds.left / 100);
    const cellTop = Math.round(height * bounds.top / 100);
    const cellRight = Math.round(width * bounds.right / 100);
    const cellBottom = Math.round(height * bounds.bottom / 100);
    if (cellRight <= cellLeft || cellBottom <= cellTop)
      throw new Error("선택한 칸의 크기를 확인해 주세요.");
    return { left: cellLeft, top: cellTop, width: cellRight - cellLeft, height: cellBottom - cellTop };
  });
}

export function gridCellBounds(
  index: number,
  width: number,
  height: number,
  columns: number,
  rows: number,
  spacing: GridSpacing,
  cells: Record<string, GridCellBounds> = {},
): GridCellBounds {
  const rect = gridRectangles(width, height, columns, rows, spacing, cells)[index];
  if (!rect) throw new Error("선택한 칸을 확인해 주세요.");
  return {
    left: rect.left / width * 100,
    top: rect.top / height * 100,
    right: (rect.left + rect.width) / width * 100,
    bottom: (rect.top + rect.height) / height * 100,
  };
}
