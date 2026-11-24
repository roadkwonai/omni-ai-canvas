import type { Run } from "./types";

export function mergeRunPages(current: Run[], incoming: Run[], active: Run[] = []): Run[] {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of [...incoming, ...active]) {
    const previous = merged.get(item.id);
    const terminal = previous?.status === "succeeded" || previous?.status === "failed";
    const stale = item.status === "queued" || item.status === "running";
    if (!terminal || !stale) merged.set(item.id, item);
  }
  return [...merged.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  );
}


export function reconcileHead(previousHead: string[] | undefined, incoming: Run[], cursor: string | null | undefined, nextCursor: string | null) {
  const gap = !!previousHead?.length && !!incoming.length &&
    !incoming.some((item) => previousHead.includes(item.id));
  return { cursor: cursor === undefined || gap ? nextCursor : cursor, gap };
}
