import type { LocalTtsProgress } from "./tts-types";
import type { Asset } from "./types";

export class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new RequestError(data.error || "요청을 처리하지 못했습니다.", response.status);
  return data as T;
}

const maxRetries = 5;

/** 같은 요청 번호로 이어 물으며 완성된 음성을 기다린다. 연결·서버 오류에는 진행 중인 작업을 버리지 않고 다시 묻는다. */
export async function pollLocalTts<T extends { asset?: Asset; progress?: LocalTtsProgress }>({ send, onProgress, signal, retryMs = 2000 }: {
  send: () => Promise<T>;
  onProgress?: (progress: LocalTtsProgress) => void;
  signal?: AbortSignal;
  retryMs?: number;
}): Promise<T & { asset: Asset }> {
  for (let failures = 0; ;) {
    try {
      const answer = await send();
      const { asset, progress } = answer;
      if (asset) return { ...answer, asset };
      failures = 0;
      signal?.throwIfAborted();
      if (progress) onProgress?.(progress);
    } catch (error) {
      signal?.throwIfAborted();
      if ((error instanceof RequestError && error.status < 500) || ++failures > maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
  }
}
