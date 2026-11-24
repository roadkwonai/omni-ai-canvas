import { useCallback, useEffect, useRef, useState } from "react";
import { pollLocalTts, requestJson } from "@/lib/local-tts-poll";
import type { LocalTtsProgress } from "@/lib/tts-types";
import type { Asset } from "@/lib/types";

type Answer = { asset?: Asset; marks?: [number, number][]; progress?: LocalTtsProgress };

/** 로컬 생성 하나를 요청하고 진행 상태를 읽는다. 화면이 사라지면 대기열을 막지 않게 멈춘다. */
export function useLocalTts(endpoint: string) {
  const [progress, setProgress] = useState<LocalTtsProgress>();
  const [requestId, setRequestId] = useState("");
  const active = useRef<{ requestId: string; stop: AbortController } | null>(null);
  useEffect(() => () => {
    if (!active.current) return;
    active.current.stop.abort();
    void fetch(`${endpoint}?requestId=${active.current.requestId}`, { method: "DELETE", keepalive: true }).catch(() => {});
  }, [endpoint]);

  const generate = useCallback(async (id: string, content: object, onProgress?: (progress: LocalTtsProgress) => void) => {
    const stop = new AbortController();
    active.current = { requestId: id, stop };
    setRequestId(id);
    const body = JSON.stringify({ ...content, requestId: id });
    try {
      return await pollLocalTts<Answer>({
        send: () => requestJson(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body }),
        signal: stop.signal,
        onProgress: (reading) => {
          setProgress(reading);
          onProgress?.(reading);
        },
      });
    } finally {
      active.current = null;
      setRequestId("");
      setProgress(undefined);
    }
  }, [endpoint]);
  const cancel = useCallback(() => requestJson(`${endpoint}?requestId=${active.current?.requestId ?? ""}`, { method: "DELETE" }), [endpoint]);
  return { progress, requestId, generate, cancel };
}
