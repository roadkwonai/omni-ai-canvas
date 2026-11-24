"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  AudioLines, BookOpen, Camera, Check, ChevronRight, Clapperboard, FileText, Film, GitCompare,
  Image as ImageIcon, ImagePlus, Images, ListVideo, Plus, StickyNote, UserRound, X,
  type LucideIcon,
} from "lucide-react";
import { kinds, kindLabels, type CanvasNode, type Kind } from "@/lib/types";
import "./node-connection-dialog.css";

export type NodePort = { id: string; direction: "input" | "output" };

const kindGroups: { label: string; kinds: Kind[] }[] = [
  { label: "제작", kinds: ["keyframe", "video", "audioCue", "previs", "note", "switch"] },
  { label: "이야기", kinds: ["brief", "scenario", "script", "scene", "shot"] },
  { label: "자료", kinds: ["character", "referenceImage", "referenceVideo"] },
];

const kindIcons: Record<Kind, LucideIcon> = {
  brief: FileText,
  scenario: BookOpen,
  script: Clapperboard,
  scene: ListVideo,
  shot: Camera,
  character: UserRound,
  keyframe: ImageIcon,
  video: Film,
  referenceImage: Images,
  referenceVideo: Film,
  audioCue: AudioLines,
  previs: ListVideo,
  note: StickyNote,
  switch: GitCompare,
};

export default function NodeConnectionDialog({
  node, direction, nodes, onClose, onLink, onAdd, onImageEdit,
}: {
  node: CanvasNode;
  direction: NodePort["direction"];
  nodes: CanvasNode[];
  onClose: () => void;
  onLink: (id: string) => void;
  onAdd: (kind: Kind) => void;
  onImageEdit: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const kindName = useId();
  const input = direction === "input";
  const [existing, setExisting] = useState("");
  const [kind, setKind] = useState<Kind>(
    input ? "referenceImage" : node.asset?.type === "image" ? "video" : "note",
  );
  const [error, setError] = useState("");
  useEffect(() => {
    const modal = dialog.current;
    if (modal && !modal.open) modal.showModal();
  }, []);

  function apply(action: () => void) {
    try {
      setError("");
      action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "노드 연결을 확인해 주세요.");
    }
  }

  return (
    <dialog ref={dialog} className="project-library project-settings-dialog node-connection-dialog" aria-labelledby={`${kindName}-title`} aria-describedby={`${kindName}-source`} onClose={onClose}>
      <header>
        <div>
          <h2 id={`${kindName}-title`}>{input ? "입력 노드 연결" : "후속 노드 추가"}</h2>
          <p id={`${kindName}-source`}>{node.title || kindLabels[node.kind]}</p>
        </div>
        <button type="button" className="studio-action" data-tone="quiet" data-size="icon" aria-label="닫기"
          onClick={() => dialog.current?.close()}><X size={18} aria-hidden="true" /></button>
      </header>
      <div className="project-settings-body node-connection-body">
        {!input && node.asset?.type === "image" && (
          <button type="button" className="studio-action node-connection-image-action" onClick={onImageEdit}>
            <ImagePlus size={16} aria-hidden="true" /> 이 이미지 편집 <ChevronRight size={16} aria-hidden="true" />
          </button>
        )}
        {input && nodes.length > 0 && (
          <div className="node-port-field">
            <label>기존 노드
              <select value={existing} onChange={(event) => setExisting(event.target.value)}>
                <option value="">노드 선택</option>
                {nodes.map((item) => <option key={item.id} value={item.id}>{item.title || kindLabels[item.kind]}</option>)}
              </select>
            </label>
            <button type="button" className="studio-action" disabled={!existing} onClick={() => apply(() => onLink(existing))}>연결</button>
          </div>
        )}
        {input ? <label>새 노드 종류
          <select value={kind} onChange={(event) => setKind(event.target.value as Kind)}>
            {kinds.map((item) => <option key={item} value={item}>{kindLabels[item]}</option>)}
          </select>
        </label> : <fieldset className="node-connection-kinds">
          <legend>새 노드 종류</legend>
          {kindGroups.map((group) => <div className="node-connection-group" key={group.label}>
            <p>{group.label}</p>
            <div className="node-connection-grid">
              {group.kinds.map((item) => {
                const Icon = kindIcons[item];
                return <label className="node-connection-option" key={item}>
                  <input type="radio" name={kindName} value={item} checked={kind === item} onChange={() => setKind(item)} />
                  <span>
                    {kind === item ? <Check size={17} aria-hidden="true" /> : <Icon size={17} aria-hidden="true" />}
                    {kindLabels[item]}
                  </span>
                </label>;
              })}
            </div>
          </div>)}
        </fieldset>}
        {error && <p className="project-library-error" role="alert">{error}</p>}
      </div>
      <footer className="node-connection-footer">
        <button type="button" className="studio-action" onClick={() => dialog.current?.close()}>취소</button>
        <button type="button" className="studio-action" data-tone="primary" onClick={() => apply(() => onAdd(kind))}>
          <Plus size={16} aria-hidden="true" /> 추가하고 연결
        </button>
      </footer>
    </dialog>
  );
}
