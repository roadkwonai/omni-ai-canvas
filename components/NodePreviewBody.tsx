"use client";

import Image from "next/image";
import { Download, Expand } from "lucide-react";
import { useState } from "react";
import type { Asset } from "@/lib/types";
import ImagePreviewDialog from "./ImagePreviewDialog";
import NodeMarkdown from "./NodeMarkdown";
import NodePromptPair, { type ApplyPrompt } from "./NodePromptPair";
import type { PromptVersions } from "@/lib/node-prompt";
import "./node-markdown.css";
import "./node-preview.css";

export default function NodePreviewBody({ title, body, asset, missingAssetType, promptKorean, initiallyEditing, onApplyPrompt }: {
  title: string;
  body: string;
  asset?: Asset;
  missingAssetType?: Asset["type"];
  promptKorean?: PromptVersions["promptKorean"];
  initiallyEditing?: boolean;
  onApplyPrompt?: ApplyPrompt;
}) {
  const [previewTrigger, setPreviewTrigger] = useState<HTMLButtonElement>();
  const [failedUrl, setFailedUrl] = useState<string>();
  const mediaType = asset?.type ?? missingAssetType;
  const label = mediaType === "video" ? "영상" : mediaType === "audio" ? "음향" : "이미지";
  const image = mediaType === "image";
  const failed = asset && failedUrl === asset.url;

  return (
    <div className="node-preview-body" data-has-asset={Boolean(asset)}>
      {(asset || missingAssetType) && <section className="node-preview-media" aria-label={label}>
        <div className="node-preview-media-header">
          <h3>{label}</h3>
          {asset && <div className="node-preview-media-actions">
            {asset.type === "image" && !failed &&
              <button type="button" className="studio-action" aria-haspopup="dialog"
                onClick={(event) => setPreviewTrigger(event.currentTarget)}>
                <Expand size={16} aria-hidden="true" /> 이미지 확대
              </button>}
            <a className="studio-action" href={asset.url} download={asset.name}>
              <Download size={16} aria-hidden="true" /> 원본 다운로드
            </a>
          </div>}
        </div>
        {!asset ? <p className="node-preview-placeholder">첨부된 {label}{image ? "가" : "이"} 없습니다.</p> :
          failed ? <p className="node-preview-placeholder" role="alert">{label}{image ? "를" : "을"} 불러오지 못했습니다.</p> :
          <div className="node-preview-media-frame">
            {asset.type === "image" ?
              <Image src={asset.url} alt={asset.name || title} width={1000} height={800} unoptimized
                onError={() => setFailedUrl(asset.url)} /> :
              asset.type === "video" ?
              <video src={asset.url} controls playsInline preload="metadata" aria-label={asset.name || title}
                onError={() => setFailedUrl(asset.url)} /> :
              <audio src={asset.url} controls preload="metadata" aria-label={asset.name || title}
                onError={() => setFailedUrl(asset.url)} />}
          </div>}
      </section>}
      <section className="node-preview-text" aria-label="노드 내용">
        {onApplyPrompt ? <NodePromptPair body={body} promptKorean={promptKorean} initiallyEditing={initiallyEditing} onApply={onApplyPrompt} /> : <>
          <h3>내용</h3>
          {body.trim() ? <NodeMarkdown text={body} /> : <p className="node-preview-empty">작성된 내용이 없습니다.</p>}
        </>}
      </section>
      {asset?.type === "image" && previewTrigger && <ImagePreviewDialog asset={asset} title={title}
        trigger={previewTrigger} onClose={() => setPreviewTrigger(undefined)} />}
    </div>
  );
}
