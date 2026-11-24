"use client";

import Image from "next/image";
import { Expand } from "lucide-react";
import { useState } from "react";
import type { ImageEditSpec } from "@/lib/image-edit";
import type { Asset, CanvasNode, Run } from "@/lib/types";
import ImagePreviewDialog from "./ImagePreviewDialog";
import "./image-edit-results.css";

type Preview = {
  asset: Asset;
  title: string;
  trigger: HTMLButtonElement;
};

function ComparisonImage({ asset, label, title, onPreview }: {
  asset: Asset;
  label: string;
  title: string;
  onPreview: (preview: Preview) => void;
}) {
  return (
    <figure className="image-result-figure">
      <button type="button" className="image-result-thumb" aria-label={`${label} 미리보기`} aria-haspopup="dialog"
        onClick={(event) => onPreview({ asset, title: title ? `${label} · ${title}` : label, trigger: event.currentTarget })}>
        <Image src={asset.url} alt="" width={240} height={180} unoptimized draggable={false} />
        <span className="image-result-expand"><Expand size={16} aria-hidden="true" /></span>
      </button>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export default function ImageEditResults({ node, edit, source, runs, onEdit, onBind, onAdopt }: {
  node: CanvasNode;
  edit: ImageEditSpec;
  source?: CanvasNode;
  runs: readonly Run[];
  onEdit?: () => void;
  onBind: (asset: Asset) => void;
  onAdopt: (run: Run) => void;
}) {
  const [preview, setPreview] = useState<Preview>();
  const editingRuns = runs.filter((run) => run.input.nodeId === node.id && run.input.operation === "image");
  const latest = editingRuns[0];
  const sourceChanged = source?.asset?.type === "image" && source.asset.url !== edit.sourceAsset?.url;
  const candidates = editingRuns.flatMap((run) => {
    const asset = run.result?.asset;
    return asset?.type === "image" && asset.url !== node.asset?.url ? [{ run, asset }] : [];
  }).slice(0, 4);
  const adopted = node.asset?.type === "image" ? node.asset : undefined;
  return (
    <section className="image-edit-comparison" aria-label="이미지 편집 원본과 결과">
      <div className="image-edit-results-heading">
        <h3>원본과 결과</h3>
        {onEdit && (source || edit.sourceAsset) &&
          <button type="button" className="studio-action" onClick={onEdit}>연출 설정 편집</button>}
      </div>
      {(edit.sourceAsset || adopted) && <div className="image-edit-comparison-grid">
        {edit.sourceAsset && <ComparisonImage asset={edit.sourceAsset} label="편집 원본" title={source?.title ?? node.title} onPreview={setPreview} />}
        {adopted && <ComparisonImage asset={adopted} label="채택한 결과" title={node.title} onPreview={setPreview} />}
      </div>}
      {sourceChanged && source.asset && <div className="image-edit-source-update">
        {edit.sourceAsset && <p className="footnote">새 입력을 사용할 수 있습니다. 현재 결과는 보존됩니다.</p>}
        <button type="button" className="studio-action" onClick={() => source.asset && onBind(source.asset)}>
          {edit.sourceAsset ? "새 이미지를 편집 원본으로 사용" : "연결된 이미지를 편집 원본으로 사용"}
        </button>
      </div>}
      {!source && <p className="footnote">편집 원본 노드가 보드에서 제거됐습니다.</p>}
      {source && !edit.sourceAsset && source.asset?.type !== "image" &&
        <p className="footnote">연결된 입력 노드에 이미지를 추가해 주세요.</p>}
      {latest && latest.status !== "succeeded" && <p className="footnote" role="status">
        {latest.status === "queued" ? "실행 대기 중" : latest.status === "running" ? "이미지 생성 중" :
          latest.error || "이미지를 생성하지 못했습니다."}
      </p>}
      {candidates.length > 0 && <div className="image-edit-candidates">
        <h4>결과 후보</h4>
        <ul className="image-edit-candidate-grid">
          {candidates.map(({ run, asset }, index) => {
            const label = `후보 ${index + 1}`;
            return <li className="image-edit-candidate" key={run.id}>
              <ComparisonImage asset={asset} label={label} title={node.title} onPreview={setPreview} />
              <button type="button" className="studio-action" aria-label={`${label} 테이크 채택`} onClick={() => onAdopt(run)}>테이크 채택</button>
            </li>;
          })}
        </ul>
      </div>}
      {preview && <ImagePreviewDialog {...preview} onClose={() => setPreview(undefined)} />}
    </section>
  );
}
