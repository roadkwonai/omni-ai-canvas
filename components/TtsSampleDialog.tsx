"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Asset, CanvasNode } from "@/lib/types";
import TtsStudio from "./TtsStudio";
import "./tts-sample-dialog.css";

const sampleText = "오늘은 일찍 눈을 떴어요. 창밖에는 밤새 내린 비가 아직 흐르고 있었죠. 서두르지 않고 물 한 잔을 마시고, 조용히 창문을 열었습니다. 문득 오늘은 어제와 조금 다르게 보내고 싶다는 생각이 들었어요.";

export default function TtsSampleDialog({ projectId, characters, initialCharacterId, trigger, onApply, onClose, prepareRecommendation }: {
  projectId: string;
  characters: CanvasNode[];
  initialCharacterId?: string;
  trigger?: HTMLElement;
  onApply: (characterId: string, asset: Asset) => Promise<void>;
  onClose: () => void;
  prepareRecommendation: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [characterId, setCharacterId] = useState(initialCharacterId ?? (characters.length === 1 ? characters[0].id : ""));
  const [busy, setBusy] = useState(false);
  const character = characters.find((node) => node.id === characterId);
  useEffect(() => { dialog.current?.showModal(); }, []);

  return (
    <dialog ref={dialog} className="project-library tts-sample-dialog" aria-labelledby={titleId}
      onCancel={(event) => { if (busy) event.preventDefault(); }}
      onClose={() => { trigger?.focus({ preventScroll: true }); onClose(); }}>
      <header>
        <h2 id={titleId}>TTS 등록 샘플 만들기</h2>
        <button type="button" className="studio-action" data-tone="quiet" data-size="icon"
          aria-label="닫기" disabled={busy} onClick={() => dialog.current?.close()}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="project-library-body tts-sample-body">
        <div className="tts-sample-destination">
          <label>샘플을 추가할 캐릭터
            <select value={character?.id ?? ""} disabled={busy || !characters.length}
              onChange={(event) => setCharacterId(event.target.value)}>
              <option value="">{characters.length ? "캐릭터 시트 선택" : "캐릭터 시트 없음"}</option>
              {characters.map((node) => <option key={node.id} value={node.id}>{node.title || "제목 없는 캐릭터"}</option>)}
            </select>
          </label>
          <p>{!characters.length ? "캐릭터 시트를 만들면 생성한 음성을 등록 샘플로 추가할 수 있습니다."
            : character?.characterIdentity?.voiceSample ? "이 캐릭터에 샘플이 있습니다. 추가하면 등록용 샘플이 바뀝니다."
              : "추가한 샘플은 캐릭터 시트의 Higgsfield 개인 목소리 등록에서 사용할 수 있습니다."}</p>
        </div>
        <TtsStudio projectId={projectId} initialText={sampleText}
          applyLabel="캐릭터에 샘플 추가" canApply={Boolean(character)} onBusyChange={setBusy}
          characterId={character?.id} characterText={character ? `${character.title}\n${character.body}` : undefined} prepareRecommendation={prepareRecommendation}
          onApply={async (asset) => {
            if (!character) throw new Error("샘플을 추가할 캐릭터를 선택해 주세요.");
            await onApply(character.id, asset);
          }} />
      </div>
    </dialog>
  );
}
