import { useEffect, useState } from "react";
import { clipSource, type TimelineNodes } from "../lib/timeline-layout";
import type { TimelineSpec } from "../lib/timeline-spec";
import type { Asset } from "../lib/types";

type Request = { url: string; type: Asset["type"]; frame: number };
type Info = { seconds?: number; thumb?: string };

// 자산 URL은 새 파일마다 바뀌므로 만료 없이 남긴다. 실패한 결과는 남기지 않는다.
const cache = new Map<string, Info>();
const CACHE_LIMIT = 300;

export const thumbKey = (url: string, frame: number) => `${url}#${frame}`;

const once = (target: HTMLMediaElement, event: string, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const limit = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
  target.addEventListener(event, () => resolve(), { once: true, signal: limit });
  target.addEventListener("error", () => reject(new Error("media")), { once: true, signal: limit });
  limit.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
});

function shrink(source: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = Math.max(1, Math.round(160 * height / (width || 160)));
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}

async function read({ url, type, frame }: Request, signal: AbortSignal): Promise<Info> {
  if (type === "image") {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { thumb: shrink(image, image.naturalWidth, image.naturalHeight) };
  }
  const media = document.createElement(type);
  media.muted = true;
  media.preload = "auto";
  media.src = url;
  try {
    await once(media, "loadedmetadata", signal);
    const seconds = media.duration;
    if (!(media instanceof HTMLVideoElement)) return { seconds };
    media.currentTime = Math.min((frame + 0.5) / 30, Math.max(0, seconds - 0.05));
    await once(media, "seeked", signal);
    return { seconds, thumb: shrink(media, media.videoWidth, media.videoHeight) };
  } finally {
    media.removeAttribute("src");
    media.load();
  }
}

function remember(key: string, info: Info) {
  cache.set(key, info);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
}

const add = (media: { thumbs: ReadonlyMap<string, string>; seconds: ReadonlyMap<string, number> }, { url, frame }: Request, { thumb, seconds }: Info) => ({
  thumbs: thumb === undefined ? media.thumbs : new Map(media.thumbs).set(thumbKey(url, frame), thumb),
  seconds: seconds === undefined ? media.seconds : new Map(media.seconds).set(url, seconds),
});

/** 브라우저가 한 번에 열 수 있는 미디어 수가 제한돼 원본을 하나씩 읽어 작은 장면과 길이를 남긴다. */
export function useTimelineMedia(spec: TimelineSpec, nodes: TimelineNodes) {
  const requests: Request[] = [
    ...spec.clips.flatMap(({ nodeId, inFrame }) => {
      const source = clipSource(nodeId, nodes);
      const asset = nodeId ? nodes.get(nodeId)?.asset : undefined;
      return asset && (source === "image" || source === "video") ? [{ url: asset.url, type: source, frame: source === "video" ? inFrame : 0 }] : [];
    }),
    ...spec.audio.flatMap(({ nodeId }) => {
      const asset = nodes.get(nodeId)?.asset;
      return asset?.type === "audio" ? [{ url: asset.url, type: asset.type, frame: 0 }] : [];
    }),
  ];
  const pending = JSON.stringify(requests);
  const [media, setMedia] = useState(() => requests.reduce((current, request) => add(current, request, cache.get(thumbKey(request.url, request.frame)) ?? {}),
    { thumbs: new Map<string, string>() as ReadonlyMap<string, string>, seconds: new Map<string, number>() as ReadonlyMap<string, number> }));
  const [done] = useState(() => new Set(requests.map(({ url, frame }) => thumbKey(url, frame)).filter((key) => cache.has(key))));
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      for (const request of JSON.parse(pending) as Request[]) {
        const key = thumbKey(request.url, request.frame);
        if (controller.signal.aborted) return;
        if (done.has(key)) continue;
        try {
          const info = cache.get(key) ?? await read(request, controller.signal);
          remember(key, info);
          setMedia((current) => add(current, request, info));
        } catch {
          if (controller.signal.aborted) return;
        }
        done.add(key);
      }
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [pending, done]);
  return media;
}
