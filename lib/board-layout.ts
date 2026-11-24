import type { CanvasNode, Graph } from "./types";

export type BoardNodeSize = { width: number; height: number };

type Rectangle = BoardNodeSize & { x: number; y: number };

const gap = 48;
const coordinateLimit = 100_000;

function measuredSize(node: CanvasNode, sizes: ReadonlyMap<string, BoardNodeSize>): BoardNodeSize {
  const measured = sizes.get(node.id);
  if (measured && Number.isFinite(measured.width) && measured.width > 0 &&
      Number.isFinite(measured.height) && measured.height > 0) return measured;
  return { width: 250, height: node.asset ? 520 : 320 };
}

function overlaps(left: Rectangle, right: Rectangle, clearance = gap): boolean {
  return left.x < right.x + right.width + clearance &&
    right.x < left.x + left.width + clearance &&
    left.y < right.y + right.height + clearance &&
    right.y < left.y + left.height + clearance;
}

function allowed(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= coordinateLimit;
}

function nearestOpenPosition(original: Rectangle, placed: readonly Rectangle[]): Rectangle | undefined {
  const candidates: Rectangle[] = [];
  for (const other of placed) {
    candidates.push(
      { ...original, x: other.x - original.width - gap },
      { ...original, x: other.x + other.width + gap },
      { ...original, y: other.y - original.height - gap },
      { ...original, y: other.y + other.height + gap },
    );
  }
  const possible = candidates.filter((candidate) => allowed(candidate.x) && allowed(candidate.y) &&
    placed.every((other) => !overlaps(candidate, other)));
  possible.sort((a, b) => {
    const cost = (item: Rectangle) => Math.abs(item.x - original.x) * 1.2 + Math.abs(item.y - original.y);
    const difference = cost(a) - cost(b);
    if (difference) return difference;
    return Number(a.x < original.x || a.y < original.y) - Number(b.x < original.x || b.y < original.y);
  });
  return possible[0];
}

function withPositions(graph: Graph, positions: ReadonlyMap<string, { x: number; y: number }>): Graph {
  let changed = false;
  const nodes = graph.nodes.map((node) => {
    const position = positions.get(node.id);
    if (!position || (node.x === position.x && node.y === position.y)) return node;
    changed = true;
    return { ...node, ...position };
  });
  return changed ? { ...graph, nodes } : graph;
}

export function optimizeBoardLayout(graph: Graph, sizes: ReadonlyMap<string, BoardNodeSize>): Graph {
  const placed: Rectangle[] = [];
  const positions = new Map<string, { x: number; y: number }>();
  const rectangles = graph.nodes.map((node, index) => ({
    node, index, original: { x: node.x, y: node.y, ...measuredSize(node, sizes) },
  }));
  const sorted = rectangles
    .map((item) => ({
      ...item,
      isolated: rectangles.every((other) => other === item || !overlaps(item.original, other.original)),
    }))
    .sort((a, b) => Number(b.isolated) - Number(a.isolated) ||
      a.node.y - b.node.y || a.node.x - b.node.x || a.index - b.index);

  for (const { node, original } of sorted) {
    let position = original;
    if (placed.some((other) => overlaps(original, other))) {
      const available = nearestOpenPosition(original, placed);
      if (!available) return graph;
      position = available;
    }
    positions.set(node.id, { x: position.x, y: position.y });
    placed.push(position);
  }

  return withPositions(graph, positions);
}

export function adjustBoardLayout(
  graph: Graph,
  sizes: ReadonlyMap<string, BoardNodeSize>,
  changes: { added: ReadonlySet<string>; grown: ReadonlySet<string> },
): Graph {
  const rectangles = graph.nodes.map((node) => ({
    node,
    rect: { x: node.x, y: node.y, ...measuredSize(node, sizes) },
  }));
  const grown = rectangles.filter(({ node }) => changes.grown.has(node.id) && !changes.added.has(node.id));
  const neighbors = rectangles.filter(({ node, rect }) =>
    !changes.added.has(node.id) && !changes.grown.has(node.id) &&
    grown.some((item) => overlaps(rect, item.rect, 0)),
  );
  const movable = new Set([
    ...grown.map(({ node }) => node.id),
    ...neighbors.map(({ node }) => node.id),
    ...changes.added,
  ]);
  const placed = rectangles.filter(({ node }) => !movable.has(node.id)).map(({ rect }) => rect);
  const positions = new Map<string, { x: number; y: number }>();
  const added = rectangles.filter(({ node }) => changes.added.has(node.id));

  for (const { node, rect } of [...grown, ...neighbors, ...added]) {
    let position = rect;
    if (placed.some((other) => overlaps(rect, other, 0))) {
      const available = nearestOpenPosition(rect, placed);
      if (!available) return graph;
      position = available;
    }
    placed.push(position);
    positions.set(node.id, { x: position.x, y: position.y });
  }
  return withPositions(graph, positions);
}
