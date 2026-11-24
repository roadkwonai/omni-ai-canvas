"use client";

import { createContext, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import Image from "next/image";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  SelectionMode,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type OnEdgesChange,
  type OnNodesChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  BookOpen,
  Clapperboard,
  FileText,
  Grid3X3,
  Image as ImageIcon,
  LayoutGrid,
  Map as MapIcon,
  PenLine,
  Images,
  ListVideo,
  ScrollText,
  Film,
  UserRound,
  AudioLines,
  StickyNote,
  GitBranch,
  PanelsTopLeft,
  Undo2,
  Redo2,
  Hand,
  MousePointer2,
  Eye,
  Zap,
  Copy,
  Clipboard,
  CopyPlus,
  Group,
  Ungroup,
  Search,
  Plus,
  BookmarkPlus,
  Archive,
  ArrowDownToLine,
  Clock3,
  Link2,
  MoreHorizontal,
  Star,
  Trash2,
  Unlink2,
  Upload,
} from "lucide-react";
import { canConnect, nodeLimit, validateGraph } from "@/lib/graph";
import { defaultCharacterReference } from "@/lib/character-identity";
import { isDocumentNode } from "@/lib/node-document";
import { imageEditKinds, type ImageEditKind } from "@/lib/image-edit";
import { canStartVideo, duplicateGraph, positionGraph, removeBoardItems, selectedGraph, type BoardPoint } from "@/lib/board-edit";
import { adjustBoardLayout, optimizeBoardLayout, type BoardNodeSize } from "@/lib/board-layout";
import { boardEdgeId, boardRunState, type BoardRunLabel } from "@/lib/board-run-state";
import BoardContextMenu, { type BoardMenuItem } from "./BoardContextMenu";
import CanvasImageTools, { imageActionIcons } from "./CanvasImageTools";
import { imageOperationLabels, type ImageOperation } from "../lib/image-operation";
import {
  kinds,
  kindLabels,
  type CanvasNode,
  type Graph,
  type Kind,
  type Run,
} from "@/lib/types";
import "@xyflow/react/dist/style.css";
import "./board.css";

type PortDirection = "input" | "output";
type BoardRunState = ReturnType<typeof boardRunState>;
type MenuTarget = { kind: "pane" } | { kind: "nodes"; ids: string[] } | { kind: "edge"; id: string };
type BoardMenu = { anchor: BoardPoint; point: BoardPoint; target: MenuTarget; view: "main" | "add" | "rating" | "image" };
export type BoardMenuController = {
  openAddMenu: (trigger: HTMLElement) => void;
  queueLayout: (previous: Graph, next: Graph) => void;
};
type LayoutChange = { kind: "added" } | { kind: "media"; previousSize?: BoardNodeSize };
type PendingLayout = { graph: Graph; changes: Map<string, LayoutChange> };
const NodeMenuContext = createContext<((id: string, trigger: HTMLElement) => void) | null>(null);

type BoardNode = Node<{
  item: CanvasNode;
  runState?: BoardRunLabel;
  onPort: (id: string, direction: PortDirection) => void;
  onPreviewNode: (id: string, trigger?: HTMLElement) => void;
}, "card">;
type BoardProps = {
  ref?: Ref<BoardMenuController>;
  graph: Graph;
  runs: readonly Run[];
  selected: string | null;
  focusNode?: Pick<CanvasNode, "id" | "x" | "y"> | null;
  onSelect: (id: string | null) => void;
  onVideo: (id: string) => void;
  onChange: (graph: Graph) => void;
  onAutoLayout: (previous: Graph, next: Graph) => void;
  onPort: BoardNode["data"]["onPort"];
  onPreviewNode: BoardNode["data"]["onPreviewNode"];
  onSavePreset: (nodeIds: string[]) => void;
  onImportFiles: (files: File[], point: BoardPoint) => Promise<void>;
  onSaveAsset: (nodeId: string) => Promise<void>;
  onLibrary: (source: "runs" | "saved", point?: BoardPoint) => void;
  onTool: (tool: "clip" | "director" | "agent") => void;
  onImageTool: (node: CanvasNode, kind: ImageEditKind) => void;
  onImageAction: (node: CanvasNode, kind: ImageOperation) => void;
  onImageSplit: (node: CanvasNode) => void;
  imageEditor?: ReactNode;
  imageEditorTitle?: string;
  onCloseImageEditor: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
};

const nodeKeywords: Partial<Record<Kind, string>> = {
  note: "텍스트 text",
  script: "스크립트 script",
  character: "캐릭터 인물",
  keyframe: "이미지 사진 image",
  video: "비디오 video",
  audioCue: "오디오 audio",
  switch: "비디오 스위치",
};

const icons = {
  brief: FileText,
  scenario: ScrollText,
  script: PenLine,
  scene: ListVideo,
  shot: Film,
  character: UserRound,
  keyframe: ImageIcon,
  video: Clapperboard,
  referenceImage: Images,
  referenceVideo: Clapperboard,
  audioCue: AudioLines,
  previs: PanelsTopLeft,
  note: StickyNote,
  switch: GitBranch,
};

function Card({ data, selected }: NodeProps<BoardNode>) {
  const openContextMenu = useContext(NodeMenuContext);
  const { item } = data;
  const Icon = icons[item.kind as Kind];
  const documentNode = isDocumentNode(item);
  const PreviewIcon = documentNode ? BookOpen : Eye;
  const previewLabel = documentNode ? "문서 보기" : "노드 미리보기";
  return (
    <article
      className={`board-card board-card--${item.kind}${selected ? " is-selected" : ""}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        aria-hidden="true"
        title="다른 노드의 출력을 이 포트에 연결해 제작 자료로 사용합니다."
      />
      <button className="board-port-add board-port-add--input nodrag nopan" type="button"
        aria-label={`${item.title || kindLabels[item.kind]}에 입력 추가`}
        title="입력 노드 연결"
        onClick={(event) => { event.stopPropagation(); data.onPort(item.id, "input"); }}>
        <Plus size={15} aria-hidden="true" />
      </button>
      <div className="board-card__header">
        <span className="board-card__icon">
          <Icon size={15} aria-hidden="true" />
        </span>
        <span>{item.imageEdit ? imageEditKinds[item.imageEdit.kind] : item.imageOperation ? imageOperationLabels[item.imageOperation.kind] : kindLabels[item.kind]}</span>
        {item.group && (
          <span className="board-card__group" title="그룹에 포함된 노드">
            그룹
          </span>
        )}
        <button className="board-card__menu board-card__preview nodrag nopan" type="button"
          title={previewLabel} aria-label={`${item.title || kindLabels[item.kind]} ${previewLabel}`} aria-haspopup="dialog"
          onClick={(event) => {
            event.stopPropagation();
            data.onPreviewNode(item.id, event.currentTarget);
          }}><PreviewIcon size={16} aria-hidden="true" /></button>
        {selected && <button className="board-card__menu nodrag nopan" type="button" aria-label="노드 작업 메뉴"
          aria-haspopup="menu" onClick={(event) => { event.stopPropagation(); openContextMenu?.(item.id, event.currentTarget); }}>
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>}
      </div>
      <div className="board-card__content">
        <h3>{item.title || "제목 없음"}</h3>
        {data.runState && <span className="board-card__run" data-state={data.runState}>
          {{ queued: "실행 대기", running: "실행 중", review: "결과 검토", failed: "실행 실패" }[data.runState]}
        </span>}
        {item.body && <p>{item.body}</p>}
        {item.asset?.type === "image" && (
          <Image
            src={item.asset.url}
            alt={item.asset.name}
            width={222}
            height={170}
            unoptimized
            draggable={false}
          />
        )}
        {item.asset?.type === "video" && (
          <video
            className="nodrag nopan"
            src={item.asset.url}
            controls
            preload="metadata"
            aria-label={item.asset.name}
          />
        )}
        {item.asset?.type === "audio" && (
          <audio
            className="nodrag nopan"
            src={item.asset.url}
            controls
            preload="metadata"
            aria-label={item.asset.name}
          />
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        aria-hidden="true"
        title="끌어서 다음 노드의 입력 포트에 연결합니다."
      />
      <button className="board-port-add board-port-add--output nodrag nopan" type="button"
        aria-label={`${item.title || kindLabels[item.kind]}에서 후속 노드 추가`}
        title="후속 노드 추가"
        onClick={(event) => { event.stopPropagation(); data.onPort(item.id, "output"); }}>
        <Plus size={15} aria-hidden="true" />
      </button>
    </article>
  );
}

function readBoardNodeSizes(board: HTMLDivElement | null): Map<string, BoardNodeSize> {
  const sizes = new Map<string, BoardNodeSize>();
  board?.querySelectorAll<HTMLElement>(".react-flow__node[data-id]").forEach((element) => {
    const { id } = element.dataset;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    if (!id || !width || !height) return;
    const media = element.querySelector(".board-card img, .board-card video");
    const loadingMedia = media instanceof HTMLImageElement && !media.complete
      || media instanceof HTMLVideoElement && media.readyState < HTMLMediaElement.HAVE_METADATA;
    const extraHeight = loadingMedia
      ? Math.max(0, (parseFloat(getComputedStyle(media).maxHeight) || 0) - media.offsetHeight)
      : 0;
    sizes.set(id, { width, height: height + extraHeight });
  });
  return sizes;
}

const nodeTypes = { card: Card };
const makeNodes = (
  graph: Graph, selected: string | null, onPort: BoardProps["onPort"],
  statuses: BoardRunState["nodes"], onPreviewNode: BoardProps["onPreviewNode"],
): BoardNode[] =>
  graph.nodes.map((item) => ({
    id: item.id,
    type: "card",
    position: { x: item.x, y: item.y },
    data: { item, onPort, onPreviewNode, runState: statuses.get(item.id) },
    selected: item.id === selected,
    ariaLabel: `${kindLabels[item.kind]} ${item.title}`,
    domAttributes: {
      title: `${kindLabels[item.kind]} 노드입니다. 선택해 내용을 편집하거나 끌어서 이동합니다.`,
    },
  }));

export default function CanvasBoard({
  ref,
  graph,
  runs,
  selected,
  focusNode,
  onSelect,
  onVideo,
  onChange,
  onAutoLayout,
  onPort,
  onPreviewNode,
  onSavePreset,
  onImportFiles,
  onSaveAsset,
  onLibrary,
  onTool,
  onImageTool,
  onImageAction,
  onImageSplit,
  imageEditor,
  imageEditorTitle,
  onCloseImageEditor,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}: BoardProps) {
  const activity = useMemo(() => boardRunState(graph, runs), [graph, runs]);
  const [menu, setMenu] = useState<BoardMenu | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const flow = useRef<ReactFlowInstance<BoardNode, Edge> | null>(null);
  const menuOpener = useRef<HTMLElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadPoint = useRef<BoardPoint | null>(null);
  const pendingLayout = useRef<PendingLayout | null>(null);

  const showMenu = useCallback((anchor: BoardPoint, target: MenuTarget, view: BoardMenu["view"], trigger?: HTMLElement) => {
    const bounds = board.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    const point = flow.current?.screenToFlowPosition({
      x: Math.max(bounds.left, Math.min(anchor.x, bounds.right)),
      y: Math.max(bounds.top, Math.min(anchor.y, bounds.bottom)),
    });
    if (!point) return;
    menuOpener.current = trigger ?? board.current;
    setMenu({ anchor, point, target, view });
  }, []);

  const nodeMenu = useCallback((id: string, trigger: HTMLElement) => {
    const bounds = trigger.getBoundingClientRect();
    showMenu({ x: bounds.left, y: bounds.bottom }, { kind: "nodes", ids: [id] }, "main", trigger);
  }, [showMenu]);

  useImperativeHandle(ref, () => ({
    openAddMenu(trigger) {
      const bounds = trigger.getBoundingClientRect();
      showMenu({ x: bounds.left, y: bounds.bottom }, { kind: "pane" }, "add", trigger);
    },
    queueLayout(previous, next) {
      const changes = pendingLayout.current?.graph === previous
        ? pendingLayout.current.changes : new Map<string, LayoutChange>();
      if (previous.nodes !== next.nodes) {
        const priorNodes = new Map(previous.nodes.map((node) => [node.id, node]));
        let sizes: Map<string, BoardNodeSize> | undefined;
        for (const node of next.nodes) {
          if (changes.has(node.id)) continue;
          const prior = priorNodes.get(node.id);
          if (!prior) {
            changes.set(node.id, { kind: "added" });
          } else if ((node.asset?.type === "image" || node.asset?.type === "video") &&
                     node.asset.url !== prior.asset?.url) {
            sizes ??= readBoardNodeSizes(board.current);
            changes.set(node.id, { kind: "media", previousSize: sizes.get(node.id) });
          }
        }
      }
      pendingLayout.current = changes.size ? { graph: next, changes } : null;
    },
  }), [showMenu]);

  const [nodes, setNodes] = useState<BoardNode[]>(() =>
    makeNodes(graph, selected, onPort, activity.nodes, onPreviewNode),
  );
  const [edges, setEdges] = useState<Edge[]>(() =>
    graph.edges.map(({ source, target }) => ({
      id: boardEdgeId(source, target),
      source,
      target,
    })),
  );
  const [showMap, setShowMap] = useState(false);
  const [snap, setSnap] = useState(false);
  const [showEdges, setShowEdges] = useState(true);
  const [edgeMotion, setEdgeMotion] = useState(false);
  const [moving, setMoving] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const motionAllowed = edgeMotion && !moving && pageVisible && !reducedMotion;
  const [motionEdges, setMotionEdges] = useState<Set<string>>(() => new Set());
  const [selectionMotion, setSelectionMotion] = useState(true);
  const [viewportRevision, setViewportRevision] = useState(0);
  const [hand, setHand] = useState(true);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [clipboard, setClipboard] = useState<Graph | null>(null);
  const hadNodes = useRef(graph.nodes.length > 0);

  useEffect(() => {
    function updateVisibility() {
      setPageVisible(!document.hidden);
    }
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    function updatePreference() {
      setReducedMotion(preference.matches);
    }
    updateVisibility();
    updatePreference();
    document.addEventListener("visibilitychange", updateVisibility);
    preference.addEventListener("change", updatePreference);
    return () => {
      document.removeEventListener("visibilitychange", updateVisibility);
      preference.removeEventListener("change", updatePreference);
    };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectionMotion(true);
    setMotionEdges(new Set());
  }, [selected]);

  useEffect(() => {
    if (!motionAllowed || !showEdges) return;
    const frame = requestAnimationFrame(() => {
      const element = board.current;
      if (!element) return;
      const bounds = element.getBoundingClientRect();
      const candidates = graph.edges
        .map((edge) => ({
          id: boardEdgeId(edge.source, edge.target),
          running: edge.usage !== "guide" && activity.edges.has(boardEdgeId(edge.source, edge.target)),
          incident: edge.source === selected || edge.target === selected,
        }))
        .filter((edge) => edge.running || (selectionMotion && edge.incident))
        .sort((left, right) => Number(right.running) - Number(left.running));
      const visible = new Set<string>();
      for (const edge of candidates) {
        const path = element.querySelector<SVGElement>(
          `.react-flow__edge[data-id="${CSS.escape(edge.id)}"] .react-flow__edge-path`,
        );
        if (!path) continue;
        const rect = path.getBoundingClientRect();
        if (rect.right < bounds.left || rect.left > bounds.right ||
            rect.bottom < bounds.top || rect.top > bounds.bottom) continue;
        visible.add(edge.id);
        if (visible.size === 6) break;
      }
      setMotionEdges(visible);
    });
    return () => cancelAnimationFrame(frame);
  }, [activity.edges, graph.edges, motionAllowed, selected, selectionMotion, showEdges, viewportRevision]);

  useEffect(() => {
    const element = board.current;
    if (!element) return;
    let width = element.clientWidth;
    let height = element.clientHeight;
    const observer = new ResizeObserver(() => {
      const nextWidth = element.clientWidth;
      const nextHeight = element.clientHeight;
      const instance = flow.current;
      if (instance && width && height && nextWidth && nextHeight && (width !== nextWidth || height !== nextHeight)) {
        const viewport = instance.getViewport();
        void instance.setViewport({ ...viewport, x: viewport.x + (nextWidth - width) / 2, y: viewport.y + (nextHeight - height) / 2 });
      }
      width = nextWidth;
      height = nextHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!focusNode) return;
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220;
    void flow.current?.setCenter(focusNode.x + 125, focusNode.y + 80, { zoom: 1, duration });
  }, [focusNode]);

  useEffect(() => {
    // React Flow keeps transient drag and edge selection state between external graph updates.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNodes((current) => {
      const previous = new Map(current.map((item) => [item.id, item]));
      const preserveSelection = selected !== null && previous.get(selected)?.selected;
      return makeNodes(graph, selected, onPort, activity.nodes, onPreviewNode).map((node) => ({
        ...node,
        selected: node.selected || Boolean(preserveSelection && previous.get(node.id)?.selected),
      }));
    });
  }, [graph, selected, onPort, activity.nodes, onPreviewNode]);

  useEffect(() => {
    const pending = pendingLayout.current;
    if (pending?.graph !== graph || moving || nodes.length !== graph.nodes.length ||
        nodes.some((node, index) => node.data.item !== graph.nodes[index])) return;
    // React Flow syncs controlled nodes to its own store before rendering the cards.
    const frame = requestAnimationFrame(() => {
      if (pendingLayout.current !== pending) return;
      const sizes = readBoardNodeSizes(board.current);
      if (sizes.size < nodes.length) return;

      const added = new Set<string>();
      const grown = new Set<string>();
      for (const [id, change] of pending.changes) {
        const size = sizes.get(id);
        if (!size) continue;
        if (change.kind === "added") {
          added.add(id);
          continue;
        }
        const asset = graph.nodes.find((node) => node.id === id)?.asset;
        if (asset?.type !== "image" && asset?.type !== "video") continue;
        const media = board.current?.querySelector(
          `.react-flow__node[data-id="${CSS.escape(id)}"] .board-card :is(img, video)`,
        );
        if (media?.getAttribute("src") !== asset.url) return;
        if (!change.previousSize || size.width > change.previousSize.width || size.height > change.previousSize.height) {
          grown.add(id);
        }
      }
      pendingLayout.current = null;
      const next = adjustBoardLayout(graph, sizes, { added, grown });
      if (next !== graph) onAutoLayout(graph, next);
    });
    return () => cancelAnimationFrame(frame);
  }, [graph, moving, nodes, onAutoLayout]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEdges((current) => {
      const selectedEdges = new Set(current.filter((edge) => edge.selected).map((edge) => edge.id));
      return graph.edges.map(({ source, target, usage }) => {
        const id = boardEdgeId(source, target);
        const active = usage !== "guide" && activity.edges.has(id);
        const incident = selected !== null && (source === selected || target === selected);
        const animated = motionAllowed && motionEdges.has(id);
        return {
          id,
          source,
          target,
          selected: selectedEdges.has(id),
          className: [
            usage === "guide" && "board-edge--guide",
            incident && "board-edge--incident",
            active && "board-edge--running",
            animated && (active || selectionMotion) && "board-edge--animated",
          ].filter(Boolean).join(" "),
          markerEnd: active ? { type: MarkerType.ArrowClosed, color: "#135fcd" } : undefined,
          ariaLabel: usage === "guide" ? "연출 확인용 연결" : active ? "실행 중인 입력 연결" : "입력 연결",
        };
      });
    });
  }, [graph.edges, activity.edges, motionAllowed, motionEdges, selected, selectionMotion]);

  useEffect(() => {
    const first = graph.nodes[0];
    if (!hadNodes.current && first) {
      void flow.current?.setViewport({
        x: 24 - first.x * 0.8,
        y: 72 - first.y * 0.8,
        zoom: 0.8,
      });
    }
    hadNodes.current = graph.nodes.length > 0;
  }, [graph.nodes]);

  const changeNodes: OnNodesChange<BoardNode> = useCallback(
    (changes) => {
      setNodes((current) => applyNodeChanges(changes, current));
      const selection = changes.find(
        (change) => change.type === "select" && change.selected,
      );
      if (selection?.type === "select") onSelect(selection.id);
      else if (
        changes.some(
          (change) =>
            change.type === "select" &&
            !change.selected &&
            change.id === selected,
        )
      )
        onSelect(null);
      const moves = changes.filter(
        (change) =>
          change.type === "position" &&
          change.position &&
          change.dragging === undefined,
      );
      if (moves.length) {
        onChange({
          ...graph,
          nodes: graph.nodes.map((item) => {
            const move = moves.find(
              (change) => change.type === "position" && change.id === item.id,
            );
            return move?.type === "position" && move.position
              ? { ...item, x: move.position.x, y: move.position.y }
              : item;
          }),
        });
      }
    },
    [graph, onChange, onSelect, selected, setNodes],
  );
  const changeEdges: OnEdgesChange = useCallback((changes) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);
  const connect = useCallback(
    ({ source, target }: Connection) => {
      if (source && target && canConnect(graph, source, target)) {
        const role = defaultCharacterReference(graph.nodes.find((node) => node.id === source)?.kind,
          graph.nodes.find((node) => node.id === target)?.kind);
        onChange({ ...graph, edges: [...graph.edges, { source, target, ...role }] });
      }
    },
    [graph, onChange],
  );
  const chosen = nodes.filter((node) => node.selected).map((node) => node.id);
  const copy = (ids = chosen) => {
    if (!ids.length) return;
    setClipboard(selectedGraph(graph, ids));
    setNotice(`${ids.length}개 노드를 복사했습니다.`);
  };
  const paste = (source = clipboard, point?: BoardPoint) => {
    if (!source?.nodes.length) return;
    const copied = duplicateGraph(source);
    const additions = point ? positionGraph(copied, point) : copied;
    const next = {
      nodes: [...graph.nodes, ...additions.nodes],
      edges: [...graph.edges, ...additions.edges],
    };
    if (next.nodes.length > nodeLimit || !validateGraph(next)) {
      setNotice(
        "노드를 더 추가할 수 없습니다. 연결과 노드 수를 확인해 주세요.",
      );
      return;
    }
    setClipboard(additions);
    setNodes((current) =>
      current.map((item) => ({ ...item, selected: false })),
    );
    onChange(next);
    onSelect(additions.nodes[0].id);
    setNotice(
      `${additions.nodes.length}개 노드를 붙여넣었습니다. 타임라인의 바깥 참조는 유지됩니다.`,
    );
  };
  const group = (remove = false, targets = chosen) => {
    const ids = new Set(targets);
    if (!ids.size || (!remove && ids.size < 2)) return;
    const groupId = crypto.randomUUID();
    onChange({
      ...graph,
      nodes: graph.nodes.map((node) => {
        if (!ids.has(node.id)) return node;
        if (remove) return { ...node, group: undefined };
        return { ...node, group: groupId };
      }),
    });
    setNotice(
      remove
        ? "선택한 노드의 그룹을 해제했습니다."
        : "선택한 노드를 그룹으로 묶었습니다.",
    );
  };
  const addNode = (kind: Kind) => {
    if (!menu || graph.nodes.length >= nodeLimit) return;
    const { point } = menu;
    const id = crypto.randomUUID();
    const next = {
      ...graph,
      nodes: [
        ...graph.nodes,
        { id, kind, title: kindLabels[kind], body: "", ...point },
      ],
    };
    if (!validateGraph(next)) {
      setNotice("이 위치에는 노드를 추가할 수 없습니다.");
      return;
    }
    onChange(next);
    onSelect(id);
  };

  function closeMenu(restoreFocus = true) {
    const trigger = menuOpener.current;
    setMenu(null);
    if (restoreFocus) requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      else board.current?.focus({ preventScroll: true });
    });
  }

  function importAt(files: File[], point: BoardPoint) {
    if (files.length) void onImportFiles(files, point).catch((error) =>
      setNotice(error instanceof Error ? error.message : "파일을 가져오지 못했습니다."),
    );
  }

  async function pasteAt(point: BoardPoint) {
    if (clipboard) {
      paste(clipboard, point);
      return;
    }
    const currentBoard = board.current;
    try {
      const clipboardApi = navigator.clipboard;
      if (!clipboardApi) throw new Error("이 브라우저에서 클립보드를 열 수 없습니다.");
      const entries = clipboardApi.read ? await clipboardApi.read() : [];
      const image = entries.flatMap((item) =>
        item.types.filter((type) => ["image/png", "image/jpeg", "image/webp"].includes(type))
          .map((type) => ({ item, type })),
      )[0];
      if (image) {
        const blob = await image.item.getType(image.type);
        if (board.current === currentBoard && currentBoard)
          importAt([new File([blob], `붙여넣은 이미지.${image.type.split("/")[1]}`, { type: image.type })], point);
        return;
      }
      const textItem = entries.find((item) => item.types.includes("text/plain"));
      const text = textItem ? await (await textItem.getType("text/plain")).text() : await clipboardApi.readText();
      if (board.current !== currentBoard || !currentBoard) return;
      if (text.trim()) importAt([new File([text], "붙여넣은 메모.txt", { type: "text/plain" })], point);
      else setNotice("클립보드에 붙여넣을 노드, 이미지 또는 텍스트가 없습니다.");
    } catch {
      if (board.current === currentBoard && currentBoard)
        setNotice("클립보드를 읽지 못했습니다. 브라우저 권한 또는 붙여넣기 단축키를 확인해 주세요.");
    }
  }

  function remove(nodesToDelete: string[], edgesToDelete = new Set<string>()) {
    onChange(removeBoardItems(graph, nodesToDelete, edgesToDelete));
    if (selected && nodesToDelete.includes(selected)) onSelect(null);
  }

  function targetsFor(id: string) {
    if (chosen.includes(id)) return chosen;
    const groupId = graph.nodes.find((node) => node.id === id)?.group;
    return groupId ? graph.nodes.filter((node) => node.group === groupId).map((node) => node.id) : [id];
  }
  const arrange = () => {
    const depth = new Map(graph.nodes.map((node) => [node.id, 0]));
    for (let i = 0; i < graph.nodes.length; i++) {
      for (const edge of graph.edges) {
        depth.set(
          edge.target,
          Math.max(
            depth.get(edge.target) ?? 0,
            (depth.get(edge.source) ?? 0) + 1,
          ),
        );
      }
    }
    const rows = new Map<number, number>();
    onChange({
      ...graph,
      nodes: graph.nodes.map((node) => {
        const column = depth.get(node.id) ?? 0;
        const row = rows.get(column) ?? 0;
        rows.set(column, row + 1);
        return { ...node, x: column * 340, y: row * 380 };
      }),
    });
  };

  function optimizeLayout() {
    if (graph.nodes.length < 2) return;
    const sizes = readBoardNodeSizes(board.current);
    const next = optimizeBoardLayout(graph, sizes);
    if (next === graph) {
      setNotice("노드 사이에 충분한 간격이 있습니다.");
      return;
    }
    onChange(next);
    setNotice("노드 간격을 정리했습니다.");
  }

  let menuItems: BoardMenuItem[] = [];
  let menuTitle = "캔버스 작업";
  if (menu) {
    const run = (action: () => void, restoreFocus = true) => {
      closeMenu(restoreFocus);
      action();
    };
    const showView = (view: BoardMenu["view"]) => () => setMenu({ ...menu, view });
    const startUpload = () => run(() => {
      uploadPoint.current = menu.point;
      fileInput.current?.click();
    }, false);
    const saveAsset = (id: string) => void onSaveAsset(id).then(
      () => setNotice("내 자산에 저장했습니다."),
      (error: unknown) => setNotice(error instanceof Error ? error.message : "자산을 저장하지 못했습니다."),
    );
    const ids = menu.target.kind === "nodes" ? menu.target.ids : [];
    const item = ids.length === 1 ? graph.nodes.find((entry) => entry.id === ids[0]) : undefined;

    if (menu.view === "add") {
      menuTitle = "노드 추가";
      menuItems = [...menuItems, ...kinds.map((kind): BoardMenuItem => ({
        id: kind, label: kindLabels[kind], icon: icons[kind],
        keywords: nodeKeywords[kind],
        disabled: graph.nodes.length >= nodeLimit, onSelect: () => run(() => addNode(kind), false),
      })),
      { id: "clip", label: "클립 편집", keywords: "스마트 편집", icon: Film, dividerBefore: true, onSelect: () => run(() => onTool("clip"), false) },
      { id: "director", label: "감독 도구", keywords: "디렉터 스튜디오", icon: Clapperboard, onSelect: () => run(() => onTool("director"), false) },
      { id: "agent", label: "프로젝트 에이전트", keywords: "디렉터 콘솔", icon: PanelsTopLeft, onSelect: () => run(() => onTool("agent"), false) },
      { id: "upload", label: "파일 업로드", icon: Upload, dividerBefore: true, onSelect: startUpload },
      { id: "runs", label: "생성 기록에서 선택", icon: Clock3, onSelect: () => run(() => onLibrary("runs", menu.point), false) }];
    } else if (menu.view === "image" && item?.asset?.type === "image") {
      menuTitle = "이미지 편집 도구";
      const toolItems = (Object.keys(imageEditKinds) as ImageEditKind[]).map((kind): BoardMenuItem => ({
        id: kind, label: imageEditKinds[kind], icon: ImageIcon,
        keywords: kind === "story25" ? "25그리드 시트" : kind === "grid9" ? "9그리드 시트" : undefined,
        disabled: graph.nodes.length >= nodeLimit,
        onSelect: () => { setMenu(null); onImageTool(item, kind); },
      }));
      const actions = (Object.keys(imageOperationLabels) as ImageOperation[]).map((kind): BoardMenuItem => ({
        id: kind, label: imageOperationLabels[kind], icon: imageActionIcons[kind],
        disabled: (kind === "upscale" || kind === "rotate") && graph.nodes.length >= nodeLimit,
        onSelect: () => { setMenu(null); onImageAction(item, kind); },
      }));
      menuItems = [...actions, ...toolItems, {
        id: "split-portrait", label: "이미지 시트 분할", icon: Grid3X3, dividerBefore: true,
        onSelect: () => { setMenu(null); onImageSplit(item); },
      }];
    } else if (menu.view === "rating" && item) {
      menuTitle = item.rating ? `노드 평가 · ${item.rating}점` : "노드 평가";
      const updateRating = (rating?: number) => onChange({
        ...graph,
        nodes: graph.nodes.map((entry) => entry.id === item.id ? { ...entry, rating } : entry),
      });
      for (const rating of [1, 2, 3, 4, 5]) {
        menuItems = [...menuItems, {
          id: `rating-${rating}`, label: `${rating}점`, icon: Star, onSelect: () => run(() => updateRating(rating)),
        }];
      }
      menuItems = [...menuItems, { id: "rating-clear", label: "평가 지우기",
        disabled: item.rating === undefined, onSelect: () => run(() => updateRating()) }];
    } else if (menu.target.kind === "pane") {
      const picked = chosen.length === 1 ? graph.nodes.find((entry) => entry.id === chosen[0]) : undefined;
      menuItems = [...menuItems, 
        { id: "upload", label: "파일 업로드", icon: Upload, onSelect: startUpload },
        { id: "save-asset", label: "내 자산에 저장", icon: Archive, disabled: !picked?.asset && !picked?.body.trim(),
          onSelect: () => run(() => { if (picked) saveAsset(picked.id); }) },
        { id: "library", label: "저장한 자산 열기", icon: Archive, onSelect: () => run(() => onLibrary("saved", menu.point), false) },
        { id: "add", label: "노드 추가", icon: Plus, opensSubmenu: true, onSelect: showView("add") },
        { id: "optimize", label: "캔버스 배치 최적화", icon: LayoutGrid,
          disabled: graph.nodes.length < 2, onSelect: () => run(optimizeLayout) },
        { id: "undo", label: "실행 취소", icon: Undo2, shortcut: "⌘/Ctrl Z", disabled: !canUndo, dividerBefore: true, onSelect: () => run(() => onUndo?.()) },
        { id: "redo", label: "다시 실행", icon: Redo2, shortcut: "⇧⌘/Ctrl Z", disabled: !canRedo, onSelect: () => run(() => onRedo?.()) },
        { id: "paste", label: "붙여넣기", icon: Clipboard, shortcut: "⌘/Ctrl V", dividerBefore: true, onSelect: () => run(() => void pasteAt(menu.point)) },
      ];
    } else if (menu.target.kind === "edge") {
      menuTitle = "연결선 작업";
      const edgeId = menu.target.id;
      const edge = graph.edges.find((entry) => boardEdgeId(entry.source, entry.target) === edgeId);
      const editUsage = (usage: "input" | "guide") => onChange({
        ...graph,
        edges: graph.edges.map((entry) => entry === edge ? { ...entry, usage } : entry),
      });
      if (edge) menuItems = [...menuItems, 
        { id: "input", label: "생성 입력으로 사용", icon: Link2, disabled: edge.usage !== "guide", onSelect: () => run(() => editUsage("input")) },
        { id: "guide", label: "연출 확인용으로 사용", icon: Eye, disabled: edge.usage === "guide", onSelect: () => run(() => editUsage("guide")) },
        { id: "remove", label: "연결 끊기", icon: Unlink2, dividerBefore: true, onSelect: () => run(() => remove([], new Set([edgeId]))) },
      ];
    } else if (ids.length) {
      menuTitle = item ? item.title || kindLabels[item.kind] : `선택 노드 ${ids.length}개`;
      if (item) {
        const asset = item.asset;
        menuItems = [...menuItems, 
          { id: "preview-node", label: isDocumentNode(item) ? "문서 보기" : "노드 미리보기",
            icon: isDocumentNode(item) ? BookOpen : Eye,
            onSelect: () => run(() => onPreviewNode(item.id, menuOpener.current ?? undefined), false) },
          { id: "edit", label: "노드 편집", icon: PenLine, onSelect: () => run(() => onSelect(item.id), false) },
          ...(canStartVideo(item) ? [{ id: "generate-video", label: "영상 만들기", icon: Film,
            onSelect: () => run(() => onVideo(item.id), false) }] : []),
          { id: "rating", label: item.rating ? `노드 평가 · ${item.rating}점` : "노드 평가", icon: Star, opensSubmenu: true, onSelect: showView("rating") },
          { id: "save-asset", label: "내 자산에 저장", icon: Archive, disabled: !asset && !item.body.trim(), onSelect: () => run(() => saveAsset(item.id)) },
        ];
        if (asset?.type === "image") menuItems = [...menuItems, 
          { id: "image-edit", label: "연출 추가", icon: ImageIcon, opensSubmenu: true, onSelect: showView("image") },
          { id: "copy-image", label: "이미지 복사", icon: Images, onSelect: () => run(() => {
            if (!navigator.clipboard?.write || typeof ClipboardItem !== "function") {
              setNotice("이 브라우저에서 이미지 복사를 사용할 수 없습니다.");
              return;
            }
            try {
              const png = fetch(asset.url).then(async (response) => {
                if (!response.ok) throw new Error("이미지를 읽지 못했습니다.");
                const blob = await response.blob();
                if (blob.type === "image/png") return blob;
                const bitmap = await createImageBitmap(blob);
                try {
                  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
                  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
                  return await canvas.convertToBlob();
                } finally { bitmap.close(); }
              });
              void navigator.clipboard.write([new ClipboardItem({ "image/png": png })]).then(
                () => setNotice("이미지를 복사했습니다."),
                () => setNotice("이미지를 복사하지 못했습니다."),
              );
            } catch { setNotice("이 브라우저에서 이미지 복사를 사용할 수 없습니다."); }
          }) },
        ];
        if (asset) menuItems = [...menuItems, { id: "download", label: "파일 다운로드", icon: ArrowDownToLine, onSelect: () => run(() => {
          const link = document.createElement("a");
          link.href = asset.url;
          link.download = asset.name;
          link.click();
        }) }];
        if (item.body.trim()) menuItems = [...menuItems, { id: "copy-text", label: "본문 복사", icon: FileText, onSelect: () => run(() => {
          if (!navigator.clipboard) { setNotice("이 브라우저에서 클립보드를 열 수 없습니다."); return; }
          void navigator.clipboard.writeText(item.body).then(
            () => setNotice("본문을 복사했습니다."),
            () => setNotice("본문을 복사하지 못했습니다."),
          );
        }) }];
        menuItems = [...menuItems, 
          { id: "input", label: "입력 연결", icon: Link2, onSelect: () => run(() => onPort(item.id, "input"), false) },
          { id: "output", label: "후속 노드 추가", icon: Plus, onSelect: () => run(() => onPort(item.id, "output"), false) },
        ];
      }
      menuItems = [...menuItems, 
        { id: "copy", label: "노드 복사", icon: Copy, shortcut: "⌘/Ctrl C", dividerBefore: true, onSelect: () => run(() => copy(ids)) },
        { id: "duplicate", label: "사본 만들기", icon: CopyPlus, shortcut: "⌘/Ctrl D", onSelect: () => run(() => paste(selectedGraph(graph, ids))) },
        { id: "paste", label: "붙여넣기", icon: Clipboard, onSelect: () => run(() => void pasteAt(menu.point)) },
        { id: "group", label: "그룹 만들기", icon: Group, disabled: ids.length < 2, onSelect: () => run(() => group(false, ids)) },
        { id: "ungroup", label: "그룹 해제", icon: Ungroup, disabled: !graph.nodes.some((entry) => ids.includes(entry.id) && entry.group),
          onSelect: () => run(() => group(true, ids)) },
        { id: "arrange", label: "캔버스 자동 정렬", icon: LayoutGrid, onSelect: () => run(arrange) },
        { id: "preset", label: "선택 노드를 프리셋으로 저장", icon: BookmarkPlus, onSelect: () => run(() => onSavePreset(ids), false) },
        { id: "delete", label: "노드 삭제", icon: Trash2, dividerBefore: true, onSelect: () => run(() => {
          if (window.confirm(`노드 ${ids.length}개와 연결을 삭제할까요?`)) remove(ids);
        }) },
      ];
    }
  }

  const activeImageNode = chosen.length <= 1 ? graph.nodes.find((item) => item.id === selected &&
    (item.asset?.type === "image" || ((item.imageEdit || item.imageOperation) && imageEditor))) : undefined;
  return (
    <div
      ref={board}
      className="canvas-board"
      aria-label="드라마 제작 캔버스"
      tabIndex={0}
      onPaste={(event) => {
        if ((event.target as HTMLElement).closest("input, textarea, [contenteditable=true]")) return;
        const files = Array.from(event.clipboardData.files);
        const text = event.clipboardData.getData("text/plain");
        const bounds = board.current?.getBoundingClientRect();
        const point = bounds && flow.current?.screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
        if (!point || (!files.length && !text.trim())) return;
        event.preventDefault();
        importAt(files.length ? files : [new File([text], "붙여넣은 메모.txt", { type: "text/plain" })], point);
      }}
      onKeyDown={(event) => {
        if (
          (event.target as HTMLElement).closest(
            "input,textarea,select,[contenteditable=true]",
          )
        )
          return;
        if (event.key === "Escape" && menu) {
          closeMenu();
          return;
        }
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          event.preventDefault();
          const trigger = event.target as HTMLElement;
          const focused = trigger.closest<HTMLElement>(".react-flow__node")?.dataset.id;
          const ids = focused ? targetsFor(focused) : chosen;
          const bounds = trigger.getBoundingClientRect();
          showMenu({ x: bounds.left + Math.min(bounds.width / 2, 80), y: bounds.top + Math.min(bounds.height / 2, 50) },
            ids.length ? { kind: "nodes", ids } : { kind: "pane" }, "main", trigger);
          return;
        }
        const command = event.metaKey || event.ctrlKey;
        if (!command) return;
        const key = event.key.toLowerCase();
        if (key === "c" && chosen.length) {
          event.preventDefault();
          copy();
        }
        if (key === "v" && clipboard) {
          event.preventDefault();
          paste();
        }
        if (key === "d" && chosen.length) {
          event.preventDefault();
          paste(selectedGraph(graph, chosen));
        }
        if (key === "g" && chosen.length) {
          event.preventDefault();
          group(event.shiftKey);
        }
      }}
    >
      <input ref={fileInput} type="file" multiple hidden
        accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,audio/wav,audio/mpeg,.txt,.md"
        onChange={(event) => {
          const point = uploadPoint.current;
          uploadPoint.current = null;
          if (point && event.currentTarget.files) importAt(Array.from(event.currentTarget.files), point);
          event.currentTarget.value = "";
          menuOpener.current?.focus({ preventScroll: true });
        }} />
      <NodeMenuContext.Provider value={nodeMenu}>
      <ReactFlow<BoardNode, Edge>
        ariaLabelConfig={{
          "controls.zoomIn.ariaLabel": "캔버스를 확대합니다.",
          "controls.zoomOut.ariaLabel": "캔버스를 축소합니다.",
          "controls.fitView.ariaLabel":
            "모든 노드가 한 화면에 들어오도록 맞춥니다.",
          "edge.a11yDescription.default":
            "연결을 선택하고 Delete 키를 누르면 연결이 해제됩니다.",
        }}
        nodes={nodes}
        edges={showEdges ? edges : []}
        onInit={(instance) => {
          flow.current = instance;
        }}
        nodeTypes={nodeTypes}
        onNodesChange={changeNodes}
        onEdgesChange={changeEdges}
        onConnect={connect}
        isValidConnection={({ source, target }) =>
          Boolean(source && target && canConnect(graph, source, target))
        }
        onNodeClick={(_, node) => {
          const groupId = node.data.item.group;
          if (groupId)
            setNodes((current) =>
              current.map((item) => ({
                ...item,
                selected: item.data.item.group === groupId,
              })),
            );
          onSelect(node.id);
        }}
        onNodeDoubleClick={(event, node) => {
          const target = event.target;
          if (target instanceof Element && !target.closest("button, a, video, audio")) {
            onPreviewNode(node.id, event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined);
          }
        }}
        onMoveStart={() => {
          setMoving(true);
          setSelectionMotion(false);
        }}
        onMoveEnd={() => {
          setMoving(false);
          setViewportRevision((revision) => revision + 1);
        }}
        onNodeDragStart={() => {
          setMoving(true);
          setSelectionMotion(false);
        }}
        onPaneClick={() => {
          setNodes((current) =>
            current.map((node) => ({ ...node, selected: false })),
          );
          onSelect(null);
          setMenu(null);
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          showMenu({ x: event.clientX, y: event.clientY }, { kind: "pane" }, "main");
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          event.stopPropagation();
          showMenu({ x: event.clientX, y: event.clientY }, { kind: "nodes", ids: targetsFor(node.id) }, "main",
            event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined);
        }}
        onSelectionContextMenu={(event, selection) => {
          event.preventDefault();
          event.stopPropagation();
          showMenu({ x: event.clientX, y: event.clientY }, { kind: "nodes", ids: selection.map((node) => node.id) }, "main");
        }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault();
          event.stopPropagation();
          showMenu({ x: event.clientX, y: event.clientY }, { kind: "edge", id: edge.id }, "main");
        }}
        onDoubleClick={(event) => {
          if (
            !(event.target as HTMLElement).classList.contains(
              "react-flow__pane",
            )
          )
            return;
          showMenu({ x: event.clientX, y: event.clientY }, { kind: "pane" }, "add");
        }}
        onNodeDragStop={(_, node, dragged) => {
          setMoving(false);
          setViewportRevision((revision) => revision + 1);
          onChange({
            ...graph,
            nodes: graph.nodes.map((item) => {
              const moved =
                dragged.find((entry) => entry.id === item.id) ??
                (item.id === node.id ? node : undefined);
              return moved
                ? { ...item, x: moved.position.x, y: moved.position.y }
                : item;
            }),
          });
        }}
        onDelete={({ nodes: removedNodes, edges: removedEdges }) => {
          remove(removedNodes.map((node) => node.id), new Set(removedEdges.map((edge) => edge.id)));
        }}
        fitView={graph.nodes.length > 0}
        defaultViewport={{ x: 24, y: 72, zoom: 0.7 }}
        fitViewOptions={{ padding: 0.14, maxZoom: 0.85 }}
        minZoom={0.2}
        maxZoom={2}
        snapToGrid={snap}
        snapGrid={[22, 22]}
        zoomOnDoubleClick={false}
        panOnScroll
        panOnScrollSpeed={1}
        zoomOnPinch
        selectionOnDrag={!hand}
        panOnDrag={hand ? true : [1, 2]}
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode="Shift"
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
        <Controls
          showInteractive={false}
          aria-label="캔버스 확대 및 화면 맞춤"
        />
        {showMap && <MiniMap pannable zoomable ariaLabel="캔버스 미니맵" />}
        <Panel
          position="bottom-left"
          className="board-tools"
          aria-label="캔버스 정렬 도구"
        >
          <button type="button" aria-label="캔버스 작업 메뉴" aria-haspopup="menu"
            onClick={(event) => {
              const trigger = event.currentTarget;
              const bounds = trigger.getBoundingClientRect();
              showMenu({ x: bounds.left, y: bounds.top }, { kind: "pane" }, "main", trigger);
            }}>
            <MoreHorizontal size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="미니맵"
            title="전체 노드의 위치를 작은 지도로 확인하고 이동합니다."
            aria-pressed={showMap}
            onClick={() => setShowMap(!showMap)}
          >
            <MapIcon size={16} />
          </button>
          <button
            type="button"
            aria-label="격자에 맞추기"
            title="이동하는 노드의 좌표를 격자에 맞춥니다."
            aria-pressed={snap}
            onClick={() => setSnap(!snap)}
          >
            <Grid3X3 size={16} />
          </button>
          <button
            type="button"
            aria-label="노드 자동 정렬"
            title="참조 연결 순서에 따라 노드를 다시 배치하고 저장합니다."
            onClick={arrange}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            title="빈 영역을 드래그해 여러 노드를 선택합니다."
            aria-label="선택 모드"
            aria-pressed={!hand}
            onClick={() => setHand(false)}
          >
            <MousePointer2 size={16} />
          </button>
          <button
            type="button"
            title="빈 영역을 드래그해 캔버스를 이동합니다. 맥에서 세 손가락 드래그를 설정한 경우 같은 동작으로 이동할 수 있습니다."
            aria-label="손 모드"
            aria-pressed={hand}
            onClick={() => setHand(true)}
          >
            <Hand size={16} />
          </button>
          <button
            type="button"
            title="연결선 표시"
            aria-label="연결선 표시"
            aria-pressed={showEdges}
            onClick={() => setShowEdges(!showEdges)}
          >
            <Eye size={16} />
          </button>
          <button
            type="button"
            title="선택하거나 실행하는 연결선에 움직임 표시"
            aria-label="연결선 움직임"
            aria-pressed={edgeMotion}
            onClick={() => {
              setSelectionMotion(true);
              setEdgeMotion((enabled) => !enabled);
            }}
          >
            <Zap size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            title="선택 노드 복사"
            aria-label="노드 복사"
            disabled={!chosen.length}
            onClick={() => copy()}
          >
            <Copy size={16} />
          </button>
          <button
            type="button"
            title="복사한 노드 붙여넣기"
            aria-label="노드 붙여넣기"
            disabled={!clipboard}
            onClick={() => paste()}
          >
            <Clipboard size={16} />
          </button>
          <button
            type="button"
            title="선택한 노드 복제"
            aria-label="노드 복제"
            disabled={!chosen.length}
            onClick={() => paste(selectedGraph(graph, chosen))}
          >
            <CopyPlus size={16} />
          </button>
          <button type="button" title="선택 노드를 프리셋으로 저장" aria-label="선택 노드를 프리셋으로 저장"
            disabled={!chosen.length} onClick={() => onSavePreset(chosen)}>
            <BookmarkPlus size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            title="선택 노드 그룹"
            aria-label="그룹"
            disabled={chosen.length < 2}
            onClick={() => group()}
          >
            <Group size={16} />
          </button>
          <button
            type="button"
            title="선택 그룹 해제"
            aria-label="그룹 해제"
            disabled={!chosen.length}
            onClick={() => group(true)}
          >
            <Ungroup size={16} />
          </button>
          <button
            type="button"
            title="실행 취소"
            aria-label="실행 취소"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            title="다시 실행"
            aria-label="다시 실행"
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Redo2 size={16} />
          </button>
        </Panel>
        {activeImageNode && <CanvasImageTools node={activeImageNode} moving={moving} editor={imageEditor} editorTitle={imageEditorTitle}
          onCreate={(kind) => onImageTool(activeImageNode, kind)}
          onAction={(kind) => onImageAction(activeImageNode, kind)}
          onCloseEditor={() => {
            onCloseImageEditor();
            board.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(activeImageNode.id)}"]`)?.focus({ preventScroll: true });
          }}
          onMore={(trigger) => {
            const bounds = trigger.getBoundingClientRect();
            showMenu({ x: bounds.left, y: bounds.bottom }, { kind: "nodes", ids: [activeImageNode.id] }, "image", trigger);
          }} />}
      </ReactFlow>
      </NodeMenuContext.Provider>
      <div className="board-top-tools">
        <div className="board-search">
          <Search size={15} aria-hidden="true" />
          <input
            aria-label="노드 검색"
            placeholder="노드 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query.trim() && (
            <div className="board-search__results">
              {graph.nodes
                .filter((node) =>
                  `${node.title} ${node.body}`
                    .toLocaleLowerCase()
                    .includes(query.trim().toLocaleLowerCase()),
                )
                .map((node) => (
                  <button
                    type="button"
                    key={node.id}
                    onClick={() => {
                      void flow.current?.setCenter(node.x + 125, node.y + 80, {
                        zoom: 1,
                        duration: 250,
                      });
                      setNodes((current) =>
                        current.map((item) => ({
                          ...item,
                          selected: item.id === node.id,
                        })),
                      );
                      onSelect(node.id);
                      setQuery("");
                    }}
                  >
                    {node.title || kindLabels[node.kind]}
                  </button>
                ))}
            </div>
          )}
        </div>
        <button type="button" className="studio-action board-optimize"
          aria-label="캔버스 배치 최적화" title="겹치거나 가까운 노드의 간격을 정리합니다."
          disabled={graph.nodes.length < 2} onClick={optimizeLayout}>
          <LayoutGrid size={16} aria-hidden="true" /> 배치 최적화
        </button>
      </div>
      {menu && (
        <BoardContextMenu key={`${menu.view}:${menu.anchor.x}:${menu.anchor.y}`} anchor={menu.anchor}
          title={menuTitle} items={menuItems} searchable={menu.view === "add" || menu.view === "image"}
          onBack={menu.view !== "main" ? () => setMenu({ ...menu, view: "main" }) : undefined}
          onClose={closeMenu} />
      )}
      <span className="board-status" role="status">
        {notice}
      </span>
    </div>
  );
}
