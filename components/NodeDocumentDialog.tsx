"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import type { Asset } from "@/lib/types";
import type { NodeDocument } from "@/lib/node-document";
import NodeMarkdown from "./NodeMarkdown";
import NodePreviewBody from "./NodePreviewBody";
import "./node-markdown.css";
import "./node-document-dialog.css";

export default function NodeDocumentDialog({ initial, asset, kindLabel, trigger, onSave, onClose }: {
  initial: NodeDocument;
  asset?: Asset;
  kindLabel: string;
  trigger?: HTMLElement;
  onSave: (draft: NodeDocument, baseline: NodeDocument) => Promise<void>;
  onClose: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const viewButton = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const dirty = draft.title !== saved.title || draft.body !== saved.body;
  const title = draft.title.trim() || "제목 없는 문서";

  useEffect(() => {
    const modal = dialog.current;
    if (modal && !modal.open) modal.showModal();
  }, []);

  useEffect(() => {
    if (editing) input.current?.focus();
    else viewButton.current?.focus({ preventScroll: true });
  }, [editing]);

  function showDocument() {
    viewport.current?.scrollTo(0, 0);
    setEditing(false);
  }

  function close() {
    if (saving || (dirty && !window.confirm("저장하지 않은 변경을 취소하고 닫을까요?"))) return;
    dialog.current?.close();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    setError("");
    setStatus("");
    try {
      await onSave(draft, saved);
      setSaved(draft);
      showDocument();
      setStatus("문서를 저장했습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "문서를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function downloadFile(blob: Blob, extension: "md" | "pdf") {
    const filename = title.replace(/[\\/:*?"<>|\p{Cc}]/gu, "_").replace(/[. ]+$/, "") || "문서";
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.${extension}`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadMarkdown() {
    downloadFile(new Blob([draft.body], { type: "text/markdown;charset=utf-8" }), "md");
  }

  async function downloadPdf() {
    if (downloadingPdf) return;
    setDownloadingPdf(true);
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/node-document/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body: draft.body }),
      });
      if (!response.ok || !response.headers.get("Content-Type")?.startsWith("application/pdf")) {
        const failure = await response.json().catch(() => null);
        throw new Error(failure?.error || "PDF를 만들지 못했습니다. 다시 시도해 주세요.");
      }
      downloadFile(await response.blob(), "pdf");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "PDF를 내려받지 못했습니다.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <dialog ref={dialog} className="node-document-dialog" aria-labelledby={`${id}-heading`}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClose={() => {
        trigger?.focus({ preventScroll: true });
        onClose();
      }}>
      <header className="node-document-header">
        <div>
          <p>{kindLabel}</p>
          <h2 id={`${id}-heading`}>{title}</h2>
        </div>
        <button className="studio-action" data-tone="quiet" data-size="icon" type="button" aria-label="문서 닫기"
          disabled={saving} onClick={close}><X size={18} aria-hidden="true" /></button>
      </header>
      <div className="node-document-mode" role="group" aria-label="문서 모드">
        <button ref={viewButton} type="button" className="studio-action" aria-pressed={!editing} disabled={saving}
          onClick={showDocument}>보기</button>
        <button type="button" className="studio-action" aria-pressed={editing} disabled={saving}
          onClick={() => { setStatus(""); setEditing(true); }}>편집</button>
      </div>
      <div ref={viewport} className="node-document-viewport" role="region" aria-label="문서 내용" tabIndex={editing ? undefined : 0}>
        {editing ? <form id={`${id}-edit`} className="node-document-form" onSubmit={(event) => void submit(event)}>
          <label>제목
            <input maxLength={160} value={draft.title} disabled={saving}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </label>
          <label>내용 (Markdown)
            <textarea ref={input} maxLength={24000} value={draft.body} disabled={saving}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
          </label>
        </form> : asset ? (
          <NodePreviewBody title={title} body={draft.body} asset={asset} />
        ) : (
          <div className="node-document-content">
            {draft.body.trim() ? <NodeMarkdown text={draft.body} /> :
              <p className="node-document-empty">본문이 비어 있습니다. 편집에서 내용을 입력할 수 있습니다.</p>}
          </div>
        )}
      </div>
      <footer className="node-document-footer">
        <div className="node-document-status">
          {error ? <p role="alert">{error}</p> : <p role="status">{status || (dirty ? "저장하지 않은 변경 사항" : "")}</p>}
        </div>
        <div className="node-document-actions">
          {editing ? <>
            <button type="button" className="studio-action" disabled={saving} onClick={() => {
              setDraft(saved);
              setError("");
              showDocument();
            }}>편집 취소</button>
            <button type="submit" form={`${id}-edit`} className="studio-action" data-tone="primary" disabled={!dirty || saving}>
              {saving ? "저장 중" : "저장"}
            </button>
          </> : <>
            <button type="button" className="studio-action" onClick={downloadMarkdown}>
              <Download size={16} aria-hidden="true" /> Markdown 내려받기
            </button>
            <button type="button" className="studio-action" disabled={downloadingPdf}
              aria-busy={downloadingPdf} onClick={() => void downloadPdf()}>
              <Download size={16} aria-hidden="true" /> {downloadingPdf ? "PDF 만드는 중" : "PDF 다운로드"}
            </button>
          </>}
        </div>
      </footer>
    </dialog>
  );
}
