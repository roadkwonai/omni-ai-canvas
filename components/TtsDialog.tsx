"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Toggle, ToggleGroup } from "@ui-sdk/react/toggle";
import { dialogueSpeakers, parseDialogue } from "@/lib/dialogue";
import { voiceoverLine } from "@/lib/character-identity";
import type { Asset, CanvasNode } from "@/lib/types";
import DialogueStudio from "./DialogueStudio";
import TtsStudio from "./TtsStudio";
import "./tts-dialog.css";

export default function TtsDialog({ projectId, node, characters, trigger, onApply, onClose }: {
  projectId: string;
  node: CanvasNode;
  characters: CanvasNode[];
  trigger: HTMLButtonElement;
  onApply: (asset: Asset, text: string) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [busy, setBusy] = useState(false);
  const script = node.kind !== "audioCue";
  const [mode, setMode] = useState<"one" | "many">(() => script && dialogueSpeakers(parseDialogue(node.body).lines).length > 1 ? "many" : "one");
  // 연 화면만 올리고, 오가도 작업을 잃지 않게 한 번 연 화면은 남긴다.
  const [opened, setOpened] = useState<("one" | "many")[]>([mode]);
  const applyLabel = script ? "음향 큐로 추가" : "음향 큐에 적용";
  const apply = async (asset: Asset, text: string) => {
    await onApply(asset, text);
    dialog.current?.close();
  };
  useEffect(() => { dialog.current?.showModal(); }, []);

  return (
    <dialog ref={dialog} className="project-library tts-dialog" aria-labelledby={title}
      onCancel={(event) => { if (busy) event.preventDefault(); }}
      onClose={() => { trigger.focus({ preventScroll: true }); onClose(); }}>
      <header>
        <div><h2 id={title}>대사 음성 만들기</h2><p>{node.title}</p></div>
        <button type="button" className="studio-action" data-tone="quiet" data-size="icon" aria-label="닫기"
          disabled={busy} onClick={() => dialog.current?.close()}><X size={18} aria-hidden="true" /></button>
      </header>
      <div className="project-library-body tts-dialog-body">
        {script && <ToggleGroup className="tts-mode" aria-label="합성 방식" value={[mode]} disabled={busy}
          onValueChange={([next]) => {
            if (!next) return;
            setMode(next as typeof mode);
            setOpened((current) => [...new Set([...current, next as typeof mode])]);
          }}>
          <Toggle className="tts-filter-chip" value="one">한 목소리</Toggle>
          <Toggle className="tts-filter-chip" value="many">여러 화자 대화</Toggle>
        </ToggleGroup>}
        {opened.includes("many") && <div hidden={mode !== "many"}>
          <DialogueStudio projectId={projectId} script={node.body} characters={characters} applyLabel={applyLabel} onBusyChange={setBusy} onApply={apply} />
        </div>}
        {opened.includes("one") && <div hidden={mode !== "one"}>
          <TtsStudio projectId={projectId} initialText={script ? node.body : voiceoverLine(node.body) || node.body}
            applyLabel={applyLabel} onBusyChange={setBusy} onApply={apply} />
        </div>}
      </div>
    </dialog>
  );
}
