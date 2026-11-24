"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Copy,
  FileText,
  Image as ImageIcon,
  Music,
  Upload,
  Video,
  X,
} from "lucide-react";
import { validateGraph } from "../lib/graph";
import type { Asset, CanvasNode, Graph, Run } from "../lib/types";
import "./asset-library.css";

export type LibraryItem = {
  id: string;
  title: string;
  body: string;
  asset?: Asset;
  sourceNodeId?: string;
};
type Props = {
  nodes: CanvasNode[];
  runs: Run[];
  selected: string | null;
  onClose: () => void;
  onUse: (item: LibraryItem, usage: "copy" | "input" | "guide") => void;
  onFiles: (files: File[]) => Promise<void>;
  edgeCount: number;
  onBoardImport: (graph: Graph) => void;
  initialSource?: "all" | "runs" | "saved";
  savedItems?: LibraryItem[];
};

export default function AssetLibrary({
  nodes,
  runs,
  selected,
  onClose,
  onUse,
  onFiles,
  edgeCount,
  onBoardImport,
  initialSource = "all",
  savedItems = [],
}: Props) {
  const [type, setType] = useState("all");
  const [source, setSource] = useState(initialSource);
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const boardInput = useRef<HTMLInputElement>(null);
  const [board, setBoard] = useState<{ name: string; graph: Graph } | null>(
    null,
  );
  async function readBoard(file: File) {
    setBoard(null);
    setError("");
    try {
      if (
        !/\.json$/i.test(file.name) ||
        (file.type &&
          !["application/json", "text/plain"].includes(file.type)) ||
        file.size > 8 * 1024 * 1024
      )
        throw new Error("8 MiB 이하의 Omni AI Canvas JSON 파일을 선택해 주세요.");
      const parsed: unknown = JSON.parse(await file.text());
      const value =
        parsed && typeof parsed === "object" && "graph" in parsed
          ? parsed.graph
          : parsed;
      if (!validateGraph(value))
        throw new Error("Omni AI Canvas 보드의 노드와 연결 형식을 확인해 주세요.");
      const ids = new Set(value.nodes.map((node) => node.id));
      if (
        value.nodes.some(
          (node) =>
            node.timeline &&
            (node.timeline.clips.some(
              (clip) => clip.nodeId && !ids.has(clip.nodeId),
            ) ||
              node.timeline.audio.some((track) => !ids.has(track.nodeId))),
        )
      )
        throw new Error("가져올 타임라인의 참조 노드가 파일에 없습니다.");
      const graph: Graph = {
        nodes: value.nodes.map((node) => ({
          id: node.id,
          kind: node.kind,
          title: node.title,
          body: node.body,
          x: node.x,
          y: node.y,
          ...(node.group ? { group: node.group } : {}),
          ...(node.rating !== undefined ? { rating: node.rating } : {}),
          ...(node.guidance ? { guidance: { ...node.guidance } } : {}),
          ...(node.motionShort ? { motionShort: structuredClone(node.motionShort) } : {}),
          ...(node.blenderScene ? { blenderScene: structuredClone(node.blenderScene) } : {}),
          ...(node.blenderTake ? { blenderTake: structuredClone(node.blenderTake) } : {}),
          ...(node.asset
            ? {
                asset: {
                  url: node.asset.url,
                  type: node.asset.type,
                  name: node.asset.name,
                },
              }
            : {}),
          ...(node.staging
            ? {
                staging: {
                  yaw: node.staging.yaw,
                  pitch: node.staging.pitch,
                  focal: node.staging.focal,
                  actorX: node.staging.actorX,
                  actorZ: node.staging.actorZ,
                  propX: node.staging.propX,
                  propZ: node.staging.propZ,
                  angle: node.staging.angle,
                  framing: node.staging.framing,
                  movement: node.staging.movement,
                  expression: node.staging.expression,
                  look: node.staging.look,
                  light: node.staging.light,
                  ...(node.staging.gaze ? { gaze: node.staging.gaze } : {}),
                },
              }
            : {}),
          ...(node.timeline
            ? {
                timeline: {
                  aspect: node.timeline.aspect,
                  ...(node.timeline.words ? { words: structuredClone(node.timeline.words) } : {}),
                  clips: node.timeline.clips.map((clip) => ({
                    nodeId: clip.nodeId,
                    durationFrames: clip.durationFrames,
                    inFrame: clip.inFrame,
                    transition: clip.transition,
                    transitionFrames: clip.transitionFrames,
                  })),
                  audio: node.timeline.audio.map((track) => ({
                    nodeId: track.nodeId,
                    startFrame: track.startFrame,
                    inFrame: track.inFrame,
                    durationFrames: track.durationFrames,
                    gain: track.gain,
                    fadeInFrames: track.fadeInFrames,
                    fadeOutFrames: track.fadeOutFrames,
                  })),
                },
              }
            : {}),
        })),
        edges: value.edges.map((edge) => ({
          source: edge.source,
          target: edge.target,
          ...(edge.role ? { role: edge.role } : {}),
          ...(edge.usage ? { usage: edge.usage } : {}),
        })),
      };
      setBoard({ name: file.name, graph });
    } catch (cause) {
      setError(
        cause instanceof SyntaxError
          ? "JSON 파일을 읽을 수 없습니다."
          : cause instanceof Error
            ? cause.message
            : "파일을 읽지 못했습니다.",
      );
    }
  }
  const items = useMemo<LibraryItem[]>(
    () => [
      ...nodes.flatMap((node) =>
        node.asset || node.kind === "note" || node.kind === "script"
          ? [
              {
                id: `node-${node.id}`,
                title: node.title,
                body: node.body,
                asset: node.asset,
                sourceNodeId: node.id,
              },
            ]
          : [],
      ),
      ...runs.flatMap((run) =>
        run.result?.asset
          ? [
              {
                id: `run-${run.id}`,
                title: run.result.asset.name,
                body: run.input.prompt,
                asset: run.result.asset,
              },
            ]
          : [],
      ),
    ],
    [nodes, runs],
  );
  const displayed = source === "saved" ? savedItems : source === "runs" ? items.filter((item) => item.id.startsWith("run-")) : [...savedItems, ...items];
  const visible = displayed.filter(
    (item) =>
      (type === "all" || (item.asset?.type || "text") === type) &&
      `${item.title} ${item.asset?.name || ""}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  async function addFiles(files: FileList | File[]) {
    if (!files.length || uploading) return;
    setUploading(true);
    setError("");
    try {
      await onFiles(Array.from(files));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "파일을 가져오지 못했습니다.",
      );
    } finally {
      setUploading(false);
    }
  }
  return (
    <section
      className="asset-library"
      aria-label="프로젝트 자산 보관함"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void addFiles(event.dataTransfer.files);
      }}
    >
      <div className="asset-library-head">
        <div>
          <h2>자산 보관함</h2>
          <p>노드와 실행 결과를 다시 사용합니다.</p>
        </div>
        <button
          className="icon-button"
          title="자산 보관함을 닫습니다."
          aria-label="자산 보관함 닫기"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div className="asset-library-tools">
        <select aria-label="자산 출처" value={source} onChange={(event) => setSource(event.target.value as "all" | "runs" | "saved")}>
          <option value="all">전체 자산</option><option value="saved">내가 저장한 자산</option><option value="runs">생성 기록</option>
        </select>
        <input
          aria-label="자산 검색"
          title="자산 이름으로 검색합니다."
          placeholder="자산 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label="자산 유형"
          title="이미지, 영상 또는 오디오만 표시합니다."
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="all">전체</option>
          <option value="image">이미지</option>
          <option value="video">영상</option>
          <option value="audio">오디오</option>
          <option value="text">텍스트</option>
        </select>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,audio/wav,audio/x-wav,audio/mpeg,.txt,.md,text/plain,text/markdown"
        hidden
        onChange={(event) => {
          if (event.target.files) void addFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        className="outline-button"
        title="이미지, 영상, 음성, 텍스트 파일을 여러 개 가져와 노드로 만듭니다."
        disabled={uploading}
        onClick={() => input.current?.click()}
      >
        <Upload size={16} />
        {uploading ? "가져오는 중" : "파일 가져오기"}
      </button>
      <p className="asset-drop-hint">
        파일을 이곳에 놓아 가져올 수도 있습니다.
      </p>
      <input
        ref={boardInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void readBoard(file);
          event.target.value = "";
        }}
      />
      <button
        className="outline-button"
        title="Omni AI Canvas JSON 파일을 확인한 뒤 현재 보드에 추가합니다."
        onClick={() => boardInput.current?.click()}
      >
        보드 JSON 가져오기
      </button>
      {board && (
        <div className="board-import-preview">
          <strong>{board.name}</strong>
          <p>
            노드 {board.graph.nodes.length}개와 연결 {board.graph.edges.length}
            개를 추가합니다. 현재 보드는 유지됩니다.
          </p>
          <p>
            미디어 원본은 JSON에 포함되지 않습니다. 같은 컴퓨터에 원본 파일이
            있어야 합니다.
          </p>
          {(nodes.length + board.graph.nodes.length > 120 ||
            edgeCount + board.graph.edges.length > 500) && (
            <p role="alert">노드 또는 연결 한도를 초과합니다.</p>
          )}
          <button
            className="outline-button"
            title="확인한 보드를 현재 프로젝트에 합칩니다."
            disabled={
              nodes.length + board.graph.nodes.length > 120 ||
              edgeCount + board.graph.edges.length > 500
            }
            onClick={() => {
              try {
                onBoardImport(board.graph);
                setBoard(null);
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "보드를 추가하지 못했습니다.",
                );
              }
            }}
          >
            현재 보드에 추가
          </button>
          <button
            className="text-button"
            title="가져오기 확인을 취소합니다."
            onClick={() => setBoard(null)}
          >
            취소
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="asset-error">
          {error}
        </p>
      )}
      <div className="asset-list">
        {visible.length ? (
          visible.map((item) => (
            <article className="asset-row" key={item.id}>
              <div className="asset-thumb">
                {item.asset?.type === "image" ? (
                  <ImageIcon size={20} />
                ) : item.asset?.type === "video" ? (
                  <Video size={20} />
                ) : item.asset?.type === "audio" ? (
                  <Music size={20} />
                ) : (
                  <FileText size={20} />
                )}
              </div>
              <div className="asset-info">
                <strong title={item.title}>
                  {item.title || item.asset?.name || "제목 없음"}
                </strong>
                <span>{item.asset?.name || "텍스트"}</span>
                {item.asset?.type === "image" && (
                  <Image
                    src={item.asset!.url}
                    alt=""
                    width={320}
                    height={180}
                    unoptimized
                  />
                )}
                {item.asset?.type === "video" && (
                  <video
                    src={item.asset!.url}
                    controls
                    preload="metadata"
                    aria-label={`${item.title} 미리보기`}
                  />
                )}{" "}
                {item.asset?.type === "audio" && (
                  <audio
                    src={item.asset!.url}
                    controls
                    preload="metadata"
                    aria-label={`${item.title} 미리 듣기`}
                  />
                )}
                <div className="asset-actions">
                  <button
                    title="이 자료를 새 노드로 복사합니다."
                    onClick={() => onUse(item, "copy")}
                  >
                    <Copy size={14} /> 복사
                  </button>
                  <button
                    title="선택한 노드에 생성할 때 보낼 참조로 연결합니다."
                    disabled={!selected || selected === item.sourceNodeId}
                    onClick={() => onUse(item, "input")}
                  >
                    생성 전송
                  </button>
                  <button
                    title="선택한 노드에 연출 확인용으로 연결합니다."
                    disabled={!selected || selected === item.sourceNodeId}
                    onClick={() => onUse(item, "guide")}
                  >
                    연출 확인용
                  </button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <p className="asset-empty">조건에 맞는 자산이 없습니다.</p>
        )}
      </div>
    </section>
  );
}
