"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { Asset, Graph, Kind, Project } from "../lib/types";
import "./clip-lab.css";

type Props = {
  project: Project;
  selected: string | null;
  onGraphChange: (
    projectId: string,
    update: (graph: Graph) => Graph,
  ) => boolean;
  onClose: () => void;
};
type Action = "frame" | "sheet" | "audio" | "trim";
type Result = {
  asset: Asset;
  kind: Kind;
  source: string;
  sourceNode: string;
  title: string;
};

export default function ClipLab({
  project,
  selected,
  onGraphChange,
  onClose,
}: Props) {
  const node = project.graph.nodes.find((item) => item.id === selected);
  const [action, setAction] = useState<Action>("frame");
  const [duration, setDuration] = useState(0);
  const [hasAudio, setHasAudio] = useState(false);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [aspect, setAspect] = useState("source");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [applied, setApplied] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const sourceUrl = node?.asset?.url;
  const sourceType = node?.asset?.type;
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    if (
      !selected ||
      !sourceUrl ||
      !["video", "audio"].includes(sourceType ?? "")
    )
      return;
    const controller = new AbortController();
    fetch(`/api/projects/${project.id}/clip-tools`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: project.version,
        nodeId: selected,
        sourceUrl,
        action: "inspect",
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data;
      })
      .then((data) => {
        setDuration(data.duration);
        setEnd(Math.min(data.duration, 120));
        setHasAudio(data.hasAudio);
        setAction(sourceType === "audio" ? "trim" : "frame");
        setStart(0);
        setResult(null);
        setApplied(false);
        setError("");
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause.message || "미디어를 읽지 못했습니다.");
      });
    return () => controller.abort();
  }, [project.id, project.version, selected, sourceUrl, sourceType]);

  async function generate() {
    if (!selected || !node?.asset) return;
    setBusy(true);
    setError("");
    setResult(null);
    setApplied(false);
    try {
      const response = await fetch(`/api/projects/${project.id}/clip-tools`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: project.version,
          nodeId: selected,
          sourceUrl: node.asset.url,
          action,
          start,
          end,
          speed,
          aspect,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "미디어 작업에 실패했습니다.");
      setResult({
        asset: data.asset,
        kind: data.kind,
        source: node.asset.url,
        sourceNode: node.id,
        title: `${node.title} · ${action === "frame" ? "키프레임" : action === "sheet" ? "콘택트 시트" : action === "audio" ? "추출 음향" : "편집본"}`,
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "미디어 작업에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!result || selected !== result.sourceNode) {
      setError("원본 노드를 다시 선택해 주세요.");
      return;
    }
    let added = false;
    const accepted = onGraphChange(project.id, (graph) => {
      const source = graph.nodes.find((item) => item.id === result.sourceNode);
      if (!source || source.asset?.url !== result.source) return graph;
      const id = crypto.randomUUID();
      added = true;
      return {
        ...graph,
        nodes: [
          ...graph.nodes,
          {
            id,
            kind: result.kind,
            title: result.title.slice(0, 160),
            body: "",
            x: Math.min(source.x + 340, 100000),
            y: source.y,
            asset: result.asset,
          },
        ],
        edges: [...graph.edges, { source: source.id, target: id }],
      };
    });
    if (accepted && added) setApplied(true);
    else
      setError(
        "원본 노드가 바뀌었거나 새 노드를 추가할 수 없습니다. 원본을 다시 확인해 주세요.",
      );
  }

  return (
    <dialog
      ref={dialog}
      className="clip-lab"
      aria-labelledby="clip-lab-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <h2 id="clip-lab-title">미디어 도구</h2>
          <p>{node?.title || "노드를 선택해 주세요"}</p>
        </div>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          aria-label="미디어 도구 닫기"
          title="미디어 도구를 닫고 캔버스로 돌아갑니다."
        >
          ✕
        </button>
      </header>
      {!node?.asset || !["video", "audio"].includes(node.asset.type) ? (
        <p>영상 또는 음향 파일이 있는 노드를 선택해 주세요.</p>
      ) : (
        <>
          <p className="clip-lab-help">
            원본은 그대로 두고 결과를 새 파일로 만듭니다. 결과를 확인한 뒤 캔버스에 추가하세요.
          </p>
          {node.asset.type === "video" ? (
            <video controls src={node.asset.url} />
          ) : (
            <audio controls src={node.asset.url} />
          )}
          <div className="clip-lab-fields">
            <label>
              작업
              <select
                title="프레임·콘택트 시트·오디오 추출 또는 구간 편집을 선택합니다."
                value={action}
                onChange={(event) => {
                  setAction(event.target.value as Action);
                  setResult(null);
                }}
              >
                {node.asset.type === "video" && (
                  <>
                    <option value="frame">프레임 추출</option>
                    <option value="sheet">3×3 콘택트 시트</option>
                    <option value="audio">오디오 추출</option>
                  </>
                )}
                <option value="trim">구간 편집</option>
              </select>
            </label>
            <label>
              {action === "frame" ? "추출 시점 (초)" : "시작 (초)"}
              <input
                type="number"
                title="원본에서 시작하거나 프레임을 추출할 시점을 초 단위로 정합니다."
                min="0"
                max={duration}
                step="0.01"
                value={start}
                onChange={(event) => setStart(Number(event.target.value))}
              />
            </label>
            {action !== "frame" && (
              <label>
                끝 (초)
                <input
                  type="number"
                  title="원본에서 편집 또는 추출을 마칠 시점을 초 단위로 정합니다."
                  min="0"
                  max={duration}
                  step="0.01"
                  value={end}
                  onChange={(event) => setEnd(Number(event.target.value))}
                />
              </label>
            )}
            {action === "trim" && (
              <>
                <label>
                  재생 속도
                  <select
                    title="선택 구간의 재생 속도를 원본 대비 배율로 정합니다."
                    value={speed}
                    onChange={(event) => setSpeed(Number(event.target.value))}
                  >
                    <option value="0.5">0.5배</option>
                    <option value="0.75">0.75배</option>
                    <option value="1">1배</option>
                    <option value="1.5">1.5배</option>
                    <option value="2">2배</option>
                  </select>
                </label>
                {node.asset.type === "video" && (
                  <label>
                    화면 비율
                    <select
                      title="편집 영상의 화면 비율을 선택합니다. 세로와 가로는 중앙을 잘라 맞춥니다."
                      value={aspect}
                      onChange={(event) => setAspect(event.target.value)}
                    >
                      <option value="source">원본 비율</option>
                      <option value="9:16">세로 9:16</option>
                      <option value="16:9">가로 16:9</option>
                    </select>
                  </label>
                )}
              </>
            )}
          </div>
          <p className="clip-lab-help">
            원본 {duration ? `${duration.toFixed(2)}초` : "길이 확인 중"} · 선택
            구간과 결과는 최대 2분입니다.
            {node.asset.type === "video" && !hasAudio && duration > 0
              ? " 원본에 오디오가 없습니다."
              : ""}
          </p>
          <button
            type="button"
            className="clip-lab-primary"
            title="선택한 구간으로 새 미디어 파일을 만들어 미리 봅니다."
            disabled={busy || !duration || (action === "audio" && !hasAudio)}
            onClick={generate}
          >
            {busy ? "처리 중…" : "결과 만들기"}
          </button>
          {error && (
            <p role="alert" className="clip-lab-error">
              {error}
            </p>
          )}
          {result && (
            <div className="clip-lab-result">
              <h3>결과 미리보기</h3>
              {result.asset.type === "image" ? (
                <Image
                  src={result.asset.url}
                  alt={result.title}
                  width={960}
                  height={540}
                  unoptimized
                />
              ) : result.asset.type === "audio" ? (
                <audio controls src={result.asset.url} />
              ) : (
                <video controls src={result.asset.url} />
              )}
              <button
                type="button"
                title="미리 본 결과를 원본과 연결된 새 노드로 추가합니다."
                disabled={applied}
                onClick={apply}
              >
                {applied ? "캔버스에 추가됨" : "새 노드로 추가"}
              </button>
            </div>
          )}
        </>
      )}
    </dialog>
  );
}
