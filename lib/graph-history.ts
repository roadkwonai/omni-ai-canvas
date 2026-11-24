import { useCallback, useMemo, useState } from "react";
import type { Graph } from "./types";

export function createGraphHistory() {
  let past: Graph[] = [];
  let future: Graph[] = [];
  let lastKey: string | undefined;
  let lastAt = 0;
  return {
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    remember(graph: Graph, key?: string) {
      const now = Date.now();
      if (!key || key !== lastKey || now - lastAt > 1000) {
        past.push(structuredClone(graph));
        if (past.length > 40) past.shift();
      }
      lastKey = key;
      lastAt = now;
      future = [];
    },
    reset() {
      past = [];
      future = [];
      lastKey = undefined;
      lastAt = 0;
    },
    undo(current: Graph) {
      const previous = past.pop();
      if (!previous) return null;
      future.push(structuredClone(current));
      lastKey = undefined;
      return previous;
    },
    redo(current: Graph) {
      const next = future.pop();
      if (!next) return null;
      past.push(structuredClone(current));
      lastKey = undefined;
      return next;
    },
  };
}

export function useGraphHistory(projectId: string | undefined) {
  const holder = useMemo(
    () => ({ projectId, history: createGraphHistory() }),
    [projectId],
  );
  const history = holder.history;
  const [status, setStatus] = useState({
    history,
    canUndo: false,
    canRedo: false,
  });
  const refresh = useCallback(
    () =>
      setStatus({
        history,
        canUndo: history.canUndo,
        canRedo: history.canRedo,
      }),
    [history],
  );
  const remember = useCallback(
    (graph: Graph, key?: string) => {
      history.remember(graph, key);
      refresh();
    },
    [history, refresh],
  );
  const reset = useCallback(() => {
    history.reset();
    refresh();
  }, [history, refresh]);
  const undo = useCallback(
    (current: Graph) => {
      const result = history.undo(current);
      refresh();
      return result;
    },
    [history, refresh],
  );
  const redo = useCallback(
    (current: Graph) => {
      const result = history.redo(current);
      refresh();
      return result;
    },
    [history, refresh],
  );
  return {
    remember,
    reset,
    undo,
    redo,
    canUndo: status.history === history && status.canUndo,
    canRedo: status.history === history && status.canRedo,
  };
}
