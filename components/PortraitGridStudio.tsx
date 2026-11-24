"use client";
import { useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import {
  emptyGridSpacing,
  gridCellBounds,
  gridLayouts,
  gridRectangles,
  isPortraitGridConfig,
  samePortraitGrid,
  type GridCellBounds,
  type GridLayout,
  type GridSpacing,
  type PortraitGridConfig,
} from "../lib/portrait-grid";
import type { CanvasNode, Project } from "../lib/types";
import "./portrait-grid-studio.css";

type Props = {
  project: Project;
  node: CanvasNode;
  save: () => Promise<Project | null>;
  onAdopt: (project: Project) => void;
  onClose: () => void;
  initialLayout?: GridLayout;
  onUpdate: (config: PortraitGridConfig) => void;
  onVideo?: (nodeIds: string[], config: PortraitGridConfig) => Promise<void>;
};
export default function PortraitGridStudio({
  project,
  node,
  save,
  onAdopt,
  onClose,
  initialLayout,
  onUpdate,
  onVideo,
}: Props) {
  const savedConfig = node.portraitGrid?.assetUrl === node.asset?.url && isPortraitGridConfig(node.portraitGrid)
    ? node.portraitGrid : undefined;
  const [layout, setLayout] = useState<GridLayout>(
    savedConfig?.layout ?? initialLayout ?? (node.title.includes("3면도") ? "1x3" : "5x5"),
  );
  const { columns, rows } = gridLayouts[layout];
  const [spacing, setSpacing] = useState<GridSpacing>(savedConfig?.spacing ?? emptyGridSpacing);
  const [cells, setCells] = useState<Record<string, GridCellBounds>>(savedConfig?.cells ?? {});
  const [editingCell, setEditingCell] = useState(0);
  const [accepted, setAccepted] = useState<number[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inspected, setInspected] = useState(false);
  const [numbers, setNumbers] = useState<number[]>([]);

  let rectangles: ReturnType<typeof gridRectangles> = [];
  if (imageSize) {
    try {
      rectangles = gridRectangles(imageSize.width, imageSize.height, columns, rows, spacing, cells);
    } catch {
      // Invalid or too-small cells are reported before preview.
    }
  }

  const config: PortraitGridConfig = { assetUrl: node.asset?.url ?? "", layout, spacing, cells };

  function updateConfig(next: PortraitGridConfig) {
    setLayout(next.layout);
    setSpacing(next.spacing);
    setCells(next.cells);
    onUpdate(next);
    setNotice("");
    clearPreview();
  }

  const currentBounds = imageSize && rectangles.length === rows * columns
    ? gridCellBounds(editingCell, imageSize.width, imageSize.height, columns, rows, spacing, cells)
    : null;

  const selectedNodes = imageSize && rectangles.length === rows * columns
    ? selected.map((index) => {
      const bounds = gridCellBounds(index, imageSize.width, imageSize.height, columns, rows, spacing, cells);
      return project.graph.nodes.find((item) =>
        item.asset?.type === "image" && item.gridCell?.sourceNodeId === node.id &&
        project.graph.edges.some((edge) => edge.source === node.id && edge.target === item.id) &&
        item.gridCell.sourceAssetUrl === node.asset?.url && item.gridCell.index === index &&
        item.gridCell.rows === rows && item.gridCell.columns === columns &&
        Object.keys(bounds).every((key) =>
          item.gridCell!.bounds[key as keyof GridCellBounds] === bounds[key as keyof GridCellBounds]));
    })
    : [];

  async function saveConfig() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!isPortraitGridConfig(config) || !imageSize || rectangles.length !== rows * columns)
        throw new Error("시트 경계를 확인해 주세요.");
      if (!samePortraitGrid(node.portraitGrid, config)) onUpdate(config);
      const current = await save();
      if (!current || current.graph.nodes.find((item) => item.id === node.id)?.asset?.url !== config.assetUrl)
        throw new Error("분할 설정을 저장하지 못했습니다. 시트를 다시 확인해 주세요.");
      setNotice("분할 설정을 저장했습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "분할 설정을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function connectVideo() {
    if (!onVideo || selectedNodes.length !== selected.length || selectedNodes.some((item) => !item)) return;
    setBusy(true);
    setError("");
    try {
      await onVideo(selectedNodes.map((item) => item!.id), config);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "선택한 컷을 영상에 연결하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function clearPreview() {
    setNumbers([]);
    setAccepted([]);
  }

  function preview() {
    setError("");
    if (!imageSize || rectangles.length !== rows * columns) {
      setError("이미지 크기와 시트 여백을 확인해 주세요.");
      return;
    }
    setNumbers(selected);
    setAccepted(selected);
  }

  async function adopt() {
    setBusy(true);
    setError("");
    try {
      if (!samePortraitGrid(node.portraitGrid, config)) onUpdate(config);
      const current = await save();
      if (!current || current.id !== project.id ||
          current.graph.nodes.find((item) => item.id === node.id)?.asset?.url !== node.asset?.url)
        throw new Error("시트가 변경됐습니다. 다시 선택해 주세요.");
      const response = await fetch(`/api/projects/${project.id}/portrait-grid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId: node.id,
          version: current.version,
          columns,
          rows,
          cells: numbers.filter((index) => accepted.includes(index)),
          spacing,
          cellBounds: cells,
          adopt: true,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      onAdopt(result.project as Project);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "선택한 칸을 추가하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="portrait-grid" aria-label="이미지 시트 분할">
      <div className="portrait-grid-header">
        <h3>이미지 시트 분할</h3>
        <button className="studio-action" data-tone="quiet" data-size="icon" type="button"
          disabled={busy} onClick={onClose} aria-label="시트 분할 닫기"><X size={18} aria-hidden="true" /></button>
      </div>
      <p>분할 경계와 원하는 칸을 확인하고 추출한 이미지를 노드로 추가합니다.</p>
      <label>
        시트 형식{" "}
        <select
          value={layout}
          disabled={busy}
          onChange={(event) => {
            updateConfig({ ...config, layout: event.target.value as GridLayout, cells: {} });
            setSelected([]);
            setEditingCell(0);
            setError("");
          }}
        >
          {(Object.entries(gridLayouts) as [GridLayout, (typeof gridLayouts)[GridLayout]][]).map(([key, item]) => (
            <option key={key} value={key}>{item.label}</option>
          ))}
        </select>
      </label>
      {node.asset && (
        <div className="portrait-grid-source">
          <Image
            src={node.asset.url}
            alt="분할할 이미지 원본"
            width={400}
            height={300}
            unoptimized
            className="portrait-grid-image"
            onLoad={(event) => setImageSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })}
          />
          <div className="portrait-grid-overlay" aria-hidden="true">
            {rectangles.map((rect, index) => (
              <span
                key={index}
                className={selected.includes(index) ? "selected" : ""}
                style={{
                  left: `${rect.left / imageSize!.width * 100}%`,
                  top: `${rect.top / imageSize!.height * 100}%`,
                  width: `${rect.width / imageSize!.width * 100}%`,
                  height: `${rect.height / imageSize!.height * 100}%`,
                }}
              >{index + 1}</span>
            ))}
          </div>
        </div>
      )}
      <fieldset className="portrait-grid-spacing" disabled={busy}>
        <legend>시트 여백과 칸 사이 간격 (%)</legend>
        {(
          [
            ["top", "위"],
            ["bottom", "아래"],
            ["left", "왼쪽"],
            ["right", "오른쪽"],
            ["horizontal", "가로 간격"],
            ["vertical", "세로 간격"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}{" "}
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={spacing[key]}
              onChange={(event) => {
                updateConfig({ ...config, spacing: { ...spacing, [key]: Number(event.target.value) } });
              }}
            />
          </label>
        ))}
      </fieldset>
      <fieldset className="portrait-grid-spacing" disabled={busy || !currentBounds}>
        <legend>개별 칸 경계 보정 (%)</legend>
        <label>
          보정할 칸
          <select value={editingCell} onChange={(event) => setEditingCell(Number(event.target.value))}>
            {Array.from({ length: columns * rows }, (_, index) => (
              <option key={index} value={index}>{Math.floor(index / columns) + 1}행 {index % columns + 1}열</option>
            ))}
          </select>
        </label>
        {currentBounds && ([
          ["left", "왼쪽"], ["top", "위"], ["right", "오른쪽"], ["bottom", "아래"],
        ] as const).map(([key, label]) => (
          <label key={key}>
            {label}
            <input type="number" min="0" max="100" step="0.1"
              value={Number((cells[String(editingCell)]?.[key] ?? currentBounds[key]).toFixed(2))}
              onChange={(event) => {
                if (!event.currentTarget.value) return;
                const nextBounds = { ...(cells[String(editingCell)] ?? currentBounds), [key]: Number(event.currentTarget.value) };
                if (nextBounds.left >= nextBounds.right || nextBounds.top >= nextBounds.bottom ||
                    nextBounds[key] < 0 || nextBounds[key] > 100) return;
                updateConfig({ ...config, cells: { ...cells, [String(editingCell)]: nextBounds } });
              }} />
          </label>
        ))}
        <button type="button" className="subtle-button studio-action" onClick={() => {
          const nextCells = { ...cells };
          delete nextCells[String(editingCell)];
          updateConfig({ ...config, cells: nextCells });
        }}>이 칸 초기화</button>
      </fieldset>
      <button type="button" className="outline-button studio-action" disabled={busy || !rectangles.length} onClick={() => void saveConfig()}>
        분할 설정 저장
      </button>
      {layout === "5x5" && (
        <label>
          <input type="checkbox" checked={inspected} disabled={busy}
            onChange={(event) => { setInspected(event.target.checked); clearPreview(); }} />
          시트가 실제 25개 장면으로 구성됐는지 확인했습니다.
        </label>
      )}
      <fieldset className="portrait-grid-choices" disabled={busy}>
        <legend>분할할 칸 선택</legend>
        <div style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns * rows }, (_, index) => (
            <label key={index}>
              <input
                type="checkbox"
                checked={selected.includes(index)}
                onChange={(event) => {
                  setSelected(
                    event.target.checked
                      ? [...selected, index].sort((a, b) => a - b)
                      : selected.filter((item) => item !== index),
                  );
                  clearPreview();
                }}
              />
              {index + 1}번
            </label>
          ))}
        </div>
      </fieldset>
      {onVideo && selected.length > 0 && (
        <button type="button" className="outline-button studio-action"
          disabled={busy || selectedNodes.length !== selected.length || selectedNodes.some((item) => !item)}
          onClick={() => void connectVideo()}>
          선택 컷을 영상으로 연결
        </button>
      )}
      {onVideo && selected.length > 0 && selectedNodes.some((item) => !item) &&
        <p>현재 경계로 추출한 컷을 선택하면 영상에 연결할 수 있습니다.</p>}
      <button className="outline-button studio-action" type="button" disabled={busy || !selected.length || (layout === "5x5" && !inspected)} onClick={preview}>
        선택한 칸 미리보기
      </button>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {numbers.length > 0 && node.asset && imageSize && (
        <>
          <p>추출 결과를 확인하고 노드로 추가할 칸을 선택하세요.</p>
          <div className="portrait-grid-results">
            {numbers.map((number) => {
              const rect = rectangles[number];
              return (
                <figure key={number}>
                  <div className="portrait-grid-crop" style={{ aspectRatio: `${rect.width} / ${rect.height}` }}>
                    <Image
                      src={node.asset!.url}
                      alt={`${number + 1}번 칸 미리보기`}
                      width={imageSize.width}
                      height={imageSize.height}
                      unoptimized
                      style={{
                        width: `${imageSize.width / rect.width * 100}%`,
                        height: `${imageSize.height / rect.height * 100}%`,
                        left: `${-rect.left / rect.width * 100}%`,
                        top: `${-rect.top / rect.height * 100}%`,
                      }}
                    />
                  </div>
                  <figcaption>
                    <label>
                      <input
                        type="checkbox"
                        checked={accepted.includes(number)}
                        disabled={busy}
                        onChange={(event) =>
                          setAccepted(
                            event.target.checked
                              ? [...accepted, number]
                              : accepted.filter((item) => item !== number),
                          )
                        }
                      />
                      {number + 1}번
                    </label>
                  </figcaption>
                </figure>
              );
            })}
          </div>
          <button
            className="primary-button studio-action"
            type="button"
            disabled={busy || !accepted.length}
            onClick={() => void adopt()}
          >
            {busy ? "추가 중" : "확인한 칸을 노드로 추가"}
          </button>
        </>
      )}
    </section>
  );
}
