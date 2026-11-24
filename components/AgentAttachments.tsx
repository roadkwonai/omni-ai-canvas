"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { AudioLines, Clapperboard, FilePlus2, Film, Link2, Trash2 } from "lucide-react";
import type { AttachmentRecord } from "../lib/attachments-types";
import { roleLabels, type Operation, type Provider, type RunInput } from "../lib/types";
import "./agent-attachments.css";

type Props = {
  projectId: string;
  items: AttachmentRecord[];
  onChange: (items: AttachmentRecord[]) => void;
  onBusyChange?: (busy: boolean) => void;
  provider?: Provider;
  operation: Operation;
  compact?: boolean;
  references?: RunInput["references"];
  onConnectReference?: () => void;
  onMention?: () => void;
  onDirector?: (trigger: HTMLButtonElement) => void;
};
type Pending = { id: string; project: string; name: string; error?: string };
const MAX_ATTACHMENTS = 8;

export default function AgentAttachments({
  projectId,
  items,
  onChange,
  onBusyChange,
  provider,
  operation,
  compact = false,
  references = [],
  onConnectReference,
  onMention,
  onDirector,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const currentProject = useRef(projectId);
  const currentItems = useRef(items);
  const controllers = useRef(new Map<string, AbortController>());
  const pendingRef = useRef<Pending[]>([]);
  const changeRef = useRef(onChange);
  const busyRef = useRef(onBusyChange);
  const [pending, setPending] = useState<Pending[]>([]);
  const [urlState, setUrlState] = useState({ project: projectId, value: "" });
  const url = urlState.project === projectId ? urlState.value : "";
  const setUrl = (value: string) => setUrlState({ project: projectId, value });
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    changeRef.current = onChange;
    busyRef.current = onBusyChange;
    currentItems.current = items.filter((item) => item.projectId === projectId);
  }, [items, onChange, onBusyChange, projectId]);
  useLayoutEffect(() => {
    currentProject.current = projectId;
    const activeControllers = controllers.current;
    return () => {
      for (const controller of activeControllers.values()) controller.abort();
      activeControllers.clear();
      pendingRef.current = [];
      busyRef.current?.(false);
    };
  }, [projectId]);

  const updatePending = useCallback((next: Pending[]) => {
    pendingRef.current = next;
    setPending(next);
    busyRef.current?.(next.some((item) => !item.error));
  }, []);

  const upload = useCallback(
    (sources: (File | string)[]) => {
      let rejected = false;
      if (compact) {
        const accepted = sources.filter((source) => typeof source !== "string" &&
          (/\.(png|jpe?g|webp)$/i.test(source.name) || (operation === "video" && /\.(mp4|webm)$/i.test(source.name))));
        if (accepted.length !== sources.length) {
          rejected = true;
          setError(operation === "video" ? "PNG·JPG·WebP 이미지와 MP4·WebM 영상만 첨부할 수 있습니다." : "PNG·JPG·WebP 이미지만 첨부할 수 있습니다.");
          if (!accepted.length) return;
        }
        sources = accepted;
      }
      const available =
        MAX_ATTACHMENTS -
        currentItems.current.length -
        pendingRef.current.length;
      if (available <= 0) {
        setError("첨부 자료는 최대 8개입니다.");
        return;
      }
      if (sources.length > available)
        setError(`최대 8개까지 첨부할 수 있어 ${available}개만 추가합니다.`);
      else if (!rejected) setError("");
      const project = currentProject.current;
      for (const source of sources.slice(0, available)) {
        const id = crypto.randomUUID();
        const name = typeof source === "string" ? source : source.name;
        const controller = new AbortController();
        controllers.current.set(id, controller);
        updatePending([...pendingRef.current, { id, project, name }]);
        const request: RequestInit = {
          method: "POST",
          signal: controller.signal,
        };
        if (typeof source === "string") {
          request.headers = { "Content-Type": "application/json" };
          request.body = JSON.stringify({ url: source });
        } else {
          const body = new FormData();
          body.append("file", source);
          request.body = body;
        }
        void (async () => {
          try {
            const response = await fetch(
              `/api/projects/${encodeURIComponent(project)}/attachments`,
              request,
            );
            const result = await response.json();
            if (!response.ok)
              throw new Error(
                typeof result.error === "string"
                  ? result.error
                  : "첨부하지 못했습니다.",
              );
            if (
              controller.signal.aborted ||
              currentProject.current !== project ||
              !controllers.current.has(id)
            )
              return;
            const attachment = result.attachment as AttachmentRecord;
            if (!attachment || attachment.projectId !== project)
              throw new Error("첨부 결과를 확인할 수 없습니다.");
            const next = [...currentItems.current, attachment];
            currentItems.current = next;
            changeRef.current(next);
            updatePending(pendingRef.current.filter((item) => item.id !== id));
          } catch (cause) {
            if (
              !controller.signal.aborted &&
              currentProject.current === project &&
              controllers.current.has(id)
            ) {
              updatePending(
                pendingRef.current.map((item) =>
                  item.id === id
                    ? {
                        ...item,
                        error:
                          cause instanceof Error
                            ? cause.message
                            : "첨부하지 못했습니다.",
                      }
                    : item,
                ),
              );
            }
          } finally {
            controllers.current.delete(id);
          }
        })();
      }
    },
    [compact, operation, updatePending],
  );

  useEffect(() => {
    const panel = root.current?.closest(".agent-panel");
    if (!panel) return;
    const paste = (event: Event) => {
      const clipboard = (event as ClipboardEvent).clipboardData;
      const images = Array.from(clipboard?.files || []).filter((file) =>
        file.type.startsWith("image/"),
      );
      if (!images.length) return;
      if (!clipboard?.getData("text/plain")) event.preventDefault();
      upload(images);
    };
    panel.addEventListener("paste", paste);
    return () => panel.removeEventListener("paste", paste);
  }, [upload]);

  const removePending = (id: string) => {
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    updatePending(pendingRef.current.filter((item) => item.id !== id));
  };
  const removeItem = (id: string) => {
    const next = currentItems.current.filter((item) => item.id !== id);
    currentItems.current = next;
    onChange(next);
  };
  const addUrl = () => {
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== "https:" || parsed.username || parsed.password)
        throw new Error();
      upload([parsed.href]);
      setUrl("");
    } catch {
      setError("공개 HTTPS 주소를 입력해 주세요.");
    }
  };

  const visibleItems = items.filter((item) => item.projectId === projectId);
  const visiblePending = pending.filter((item) => item.project === projectId);
  const visibleReferences = references.filter((item) => item.nodeId && item.asset);
  const support = !provider
    ? "서비스를 선택하면 전달 방식이 보입니다."
    : provider === "agy"
      ? "Antigravity에는 추출한 글만 전달합니다. 그림이나 영상을 봐야 하는 요청에는 쓸 수 없습니다."
      : provider === "road-music" || operation === "audio"
        ? "음악 생성에는 추출한 글만 전달합니다."
        : provider === "higgsfield" && operation === "video"
          ? "Higgsfield 영상에는 원본 이미지·영상과 추출한 글을 전달합니다."
          : provider === "kling" || provider === "topview"
            ? "선택한 모델과 작업 방식에 맞게 이미지·영상 원본을 전달합니다."
              : "이미지와 영상의 대표 프레임, 문서와 링크에서 추출한 글을 전달합니다.";

  if (compact) return (
    <div ref={root} className="media-prompt-references"
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        upload(Array.from(event.dataTransfer.files));
      }}>
      <div className="media-reference-actions">
        <input ref={input} type="file" multiple hidden
          accept={operation === "video" ? ".png,.jpg,.jpeg,.webp,.mp4,.webm" : ".png,.jpg,.jpeg,.webp"}
          onChange={(event) => { if (event.target.files) upload(Array.from(event.target.files)); event.target.value = ""; }} />
        <button type="button" className="studio-action" data-help="이번 제작 요청에 함께 보낼 이미지나 영상 파일을 선택합니다." onClick={() => input.current?.click()}>
          <FilePlus2 size={16} aria-hidden="true" /> 파일 첨부
        </button>
        {onConnectReference && <button type="button" className="studio-action" data-help="캔버스의 다른 자료를 현재 노드의 입력 참조로 연결합니다." onClick={onConnectReference}>
          <Link2 size={16} aria-hidden="true" /> 캔버스 참조
        </button>}
        {onMention && <button type="button" className="studio-action" data-help="캔버스 노드의 이름을 찾아 현재 노드에 연결합니다." onClick={onMention}>@ 노드 참조</button>}
        {onDirector && <button type="button" className="studio-action" data-help="장면의 연기, 카메라, 조명과 미술 지시를 검토하고 저장합니다." aria-haspopup="dialog" onClick={(event) => onDirector(event.currentTarget)}>
          <Clapperboard size={16} aria-hidden="true" /> 디렉터 스튜디오
        </button>}
        <span>{visibleItems.length + visiblePending.length} / {MAX_ATTACHMENTS}</span>
      </div>
      {error && <p className="attachment-error" role="alert">{error}</p>}
      {(visibleItems.length > 0 || visiblePending.length > 0 || visibleReferences.length > 0) && <ul className="media-reference-list" aria-label="생성에 사용할 참조 자료">
        {visibleReferences.map((item) => <li key={`node:${item.nodeId}:${item.role ?? "context"}`} className="media-reference-card">
          <div className="media-reference-preview">
            {item.asset?.type === "audio" && <AudioLines size={20} aria-hidden="true" />}
            {item.asset?.type === "image" && item.asset.url.startsWith("/") && <Image src={item.asset.url} alt="" width={80} height={64} unoptimized />}
            {item.asset?.type === "video" && item.asset.url.startsWith("/") && <video src={item.asset.url} muted preload="metadata" aria-hidden="true" />}
            {item.asset?.type === "video" && <Film className="media-reference-video-icon" size={16} aria-hidden="true" />}
          </div>
          <span title={item.title}>{item.title || item.asset?.name || "연결된 참조"}</span>
          <small>{item.asset?.type === "audio" ? "음향 참조" : item.role ? roleLabels[item.role] : "캔버스 참조"}</small>
        </li>)}
        {visibleItems.map((item) => <li key={`attachment:${item.id}`} className="media-reference-card">
          <div className="media-reference-preview">
            {item.asset?.type === "image" && item.asset.url.startsWith("/") && <Image src={item.asset.url} alt="" width={80} height={64} unoptimized />}
            {item.asset?.type === "video" && item.asset.url.startsWith("/") && <video src={item.asset.url} muted preload="metadata" aria-hidden="true" />}
            {item.asset?.type === "video" && <Film className="media-reference-video-icon" size={16} aria-hidden="true" />}
            <button type="button" className="media-reference-remove" aria-label={`${item.name} 첨부 제거`} title="첨부 제거" onClick={() => removeItem(item.id)}>
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
          <span title={item.name}>{item.name}</span><small>{item.kind === "video" ? "영상 첨부" : item.kind === "image" ? "이미지 첨부" : "첨부 자료"}</small>
        </li>)}
        {visiblePending.map((item) => <li key={item.id} className="media-reference-pending">
          <span role="status">{item.name} · {item.error || "첨부 중"}</span>
          <button type="button" className="studio-action" data-tone="quiet" data-size="icon" aria-label={`${item.name} 첨부 취소`} onClick={() => removePending(item.id)}><Trash2 size={15} aria-hidden="true" /></button>
        </li>)}
      </ul>}
      <p className="media-reference-help">{operation === "video" ? "이미지·영상을 첨부하거나 캔버스 자료를 연결하세요. 모델이 받는 방식에 맞춰 씁니다." : "참조 이미지를 첨부하거나 캔버스 자료를 연결하세요."}</p>
    </div>
  );

  return (
    <div
      ref={root}
      className="agent-attachments"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        upload(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="attachment-controls">
        <input
          ref={input}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.mp4,.webm,.pdf,.docx,.pptx,.md,.txt,.srt,.csv,.json"
          hidden
          onChange={(event) => {
            if (event.target.files) upload(Array.from(event.target.files));
            event.target.value = "";
          }}
        />
        <button
          type="button"
          title="PDF·문서, 이미지 또는 MP4·WebM 영상을 첨부합니다."
          onClick={() => input.current?.click()}
        >
          <FilePlus2 size={15} /> 파일 첨부
        </button>
        <span>
          {visibleItems.length + visiblePending.length} / {MAX_ATTACHMENTS}
        </span>
      </div>
      <div className="attachment-link">
        <Link2 size={15} aria-hidden="true" />
        <input
          type="url"
          aria-label="공개 링크 주소"
          title="본문을 읽을 공개 HTTPS 페이지의 주소를 입력합니다. 영상 장면을 분석하려면 파일을 첨부하세요."
          placeholder="공개 HTTPS 링크"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addUrl();
            }
          }}
        />
        <button
          type="button"
          title="입력한 링크를 첨부합니다."
          onClick={addUrl}
        >
          추가
        </button>
      </div>
      {error && (
        <p className="attachment-error" role="alert">
          {error}
        </p>
      )}
      {(visibleItems.length > 0 || visiblePending.length > 0) && (
        <ul className="attachment-list">
          {visiblePending.map((item) => (
            <li key={item.id}>
              <span>
                {item.name} {item.error ? `· ${item.error}` : "· 처리 중"}
              </span>
              <button
                type="button"
                aria-label={`${item.name} 첨부 취소`}
                title="처리 중인 첨부를 취소하거나 실패 항목을 닫습니다."
                onClick={() => removePending(item.id)}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
          {visibleItems.map((item) => (
            <li key={item.id}>
              <div className="attachment-item">
                <div className="attachment-item__head">
                  <strong>{item.name}</strong>
                  <button
                    type="button"
                    aria-label={`${item.name} 첨부 제거`}
                    title="이번 요청에서 이 자료를 제거합니다."
                    onClick={() => removeItem(item.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <p>
                  {item.detail || item.kind}
                  {item.kind === "video" &&
                    " · 영상 속 말은 자동으로 받아쓰지 않습니다."}
                </p>
                <details>
                  <summary title="추출된 내용을 확인합니다.">내용 확인</summary>
                  {item.text && <pre>{item.text}</pre>}
                  {item.asset?.type === "image" && (
                    <Image
                      src={item.asset.url}
                      alt={item.name}
                      width={300}
                      height={180}
                      unoptimized
                    />
                  )}
                  {item.asset?.type === "video" && (
                    <video
                      src={item.asset.url}
                      controls
                      preload="metadata"
                      aria-label={item.name}
                    />
                  )}
                  {item.frames?.map((frame) => (
                    <figure key={frame.url}>
                      <Image
                        src={frame.url}
                        alt={frame.name}
                        width={300}
                        height={180}
                        unoptimized
                      />
                      <figcaption>{frame.name}</figcaption>
                    </figure>
                  ))}
                </details>
              </div>
            </li>
          ))}
        </ul>
      )}
      {visibleItems.length > 0 && (
        <p className="attachment-support">{support}</p>
      )}
    </div>
  );
}
