"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Fingerprint, ImagePlus, Mic, X } from "lucide-react";
import { elementNoteField, isCharacterIdentity, isSoulId, isVoiceId, readyCharacterSoul, type CharacterIdentity, type CharacterSoul, type CharacterVoice } from "@/lib/character-identity";
import type { Asset, CanvasNode } from "@/lib/types";
import "./character-identity.css";

type SoulEntry = CharacterSoul & { name: string };
type VoiceEntry = CharacterVoice & { name: string };
type Props = {
  projectId: string;
  node: CanvasNode;
  prepare: () => Promise<void>;
  onSave: (value: CharacterIdentity) => Promise<void>;
  onPortrait: () => void;
};

const variants = { soul_2: "Soul 2.0", soul_cinematic: "Soul Cinematic" } as const;
const variantOptions = [
  ["soul_2", "인물 사진·스타일"],
  ["soul_cinematic", "영화 스틸·키프레임"],
] as const;
const states = { training: "학습 중", ready: "준비됨", failed: "학습 실패" } as const;
const voiceStates = { training: "등록 처리 중", ready: "등록됨", failed: "등록 실패" } as const;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error ?? "요청을 완료하지 못했습니다.");
  return data;
}

export default function CharacterIdentityPanel({ node, onPortrait, ...props }: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { soul, voice } = node.characterIdentity ?? {};
  return (
    <section className="character-identity-panel" aria-label="캐릭터 외형과 목소리">
      <button ref={trigger} type="button" className="studio-action" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Fingerprint size={17} aria-hidden="true" /> 외형과 목소리 설정
      </button>
      <p className="footnote">외형 {soul ? states[soul.status ?? "ready"] : "미등록"} · 목소리 {voice ? voiceStates[voice.status ?? "ready"] : "미등록"}{node.characterIdentity?.voiceSample && " · 샘플 저장됨"}</p>
      {readyCharacterSoul(node) && (
        <button type="button" className="studio-action" onClick={onPortrait}>
          <ImagePlus size={17} aria-hidden="true" /> Soul 기준 이미지 만들기
        </button>
      )}
      {open && <IdentityDialog {...props} node={node} onClose={() => {
        setOpen(false);
        trigger.current?.focus({ preventScroll: true });
      }} />}
    </section>
  );
}

function IdentityDialog({ projectId, node, prepare, onSave, onClose }: Omit<Props, "onPortrait"> & { onClose: () => void }) {
  const titleId = useId();
  const soulGuideId = `${titleId}-soul-guide`;
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const uploaded = useRef(new Map<File, Asset>());
  const [soul, setSoul] = useState<CharacterSoul | undefined>(node.characterIdentity?.soul);
  const [voice, setVoice] = useState<CharacterVoice | undefined>(node.characterIdentity?.voice);
  const [souls, setSouls] = useState<SoulEntry[]>();
  const [voices, setVoices] = useState<VoiceEntry[]>();
  const [name, setName] = useState(node.title.slice(0, 80));
  const [trainingVariant, setTrainingVariant] = useState<CharacterSoul["variant"]>("soul_cinematic");
  const [files, setFiles] = useState<File[]>([]);
  const [includePortrait, setIncludePortrait] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [needsLookup, setNeedsLookup] = useState(false);
  const [retryOffered, setRetryOffered] = useState(false);
  const [retryConfirmed, setRetryConfirmed] = useState(false);
  const [voiceCapability, setVoiceCapability] = useState<{ available: boolean; reason?: string }>();
  const [voiceName, setVoiceName] = useState(node.title.slice(0, 80));
  const [voiceSample, setVoiceSample] = useState<File>();
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [voiceNeedsLookup, setVoiceNeedsLookup] = useState(false);
  const [voiceRetryOffered, setVoiceRetryOffered] = useState(false);
  const [voiceRetryConfirmed, setVoiceRetryConfirmed] = useState(false);
  const endpoint = `/api/projects/${projectId}/character-identity`;
  const voiceEndpoint = `/api/projects/${projectId}/character-voice`;
  const imageCount = files.length + Number(includePortrait && Boolean(node.asset));
  const previousVoiceId = elementNoteField(node.body, "Voice ID").trim();
  const savedSample = node.characterIdentity?.voiceSample;
  const hasVoiceSample = Boolean(voiceSample || savedSample);

  useEffect(() => { dialog.current?.showModal(); }, []);

  async function perform(label: string, action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setNotice("");
    setError("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "요청을 완료하지 못했습니다."); }
    finally {
      lock.current = false;
      setBusy("");
    }
  }

  function identity(nextSoul = soul, nextVoice = voice): CharacterIdentity {
    return { ...(nextSoul?.id.trim() ? { soul: { ...nextSoul, id: nextSoul.id.trim() } } : {}),
      ...(nextVoice?.id.trim() ? { voice: { ...nextVoice, id: nextVoice.id.trim() } } : {}),
      ...(savedSample ? { voiceSample: savedSample } : {}) };
  }

  async function save(value: CharacterIdentity) {
    if (!isCharacterIdentity(value)) throw new Error("Soul ID 또는 목소리 ID 형식을 확인해 주세요.");
    await onSave(value);
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void perform("저장 중", async () => {
      await save(identity());
      dialog.current?.close();
    });
  }

  async function loadSouls() {
    const data = await api<{ souls: SoulEntry[] }>(`${endpoint}?kind=souls`);
    setSouls(data.souls);
    if (needsLookup) setRetryOffered(true);
    setNeedsLookup(false);
    setNotice(data.souls.length ? "연결할 Soul을 선택해 주세요." : "이 계정에 등록된 Soul이 없습니다.");
  }

  async function refreshSoul() {
    if (!isSoulId(soul?.id)) throw new Error("조회할 Soul ID를 확인해 주세요.");
    const { soul: entry } = await api<{ soul: SoulEntry }>(`${endpoint}?kind=soul&id=${encodeURIComponent(soul.id)}`);
    const updated = { id: entry.id, variant: entry.variant, status: entry.status };
    setSoul(updated);
    await save({ ...node.characterIdentity, soul: updated });
    setNotice(`Soul 상태를 저장했습니다. ${states[updated.status ?? "ready"]}`);
  }

  async function train() {
    if (imageCount < 5 || imageCount > 20 || !confirmed || !name.trim() || needsLookup || (retryOffered && !retryConfirmed)) return;
    await prepare();
    const images = includePortrait && node.asset ? [node.asset] : [];
    for (const file of files) {
      let asset = uploaded.current.get(file);
      if (!asset) {
        const form = new FormData();
        form.append("file", file);
        ({ asset } = await api<{ asset: Asset }>("/api/assets", { method: "POST", body: form }));
        if (asset.type !== "image") throw new Error("Soul 학습에는 이미지 파일만 사용할 수 있습니다.");
        uploaded.current.set(file, asset);
      }
      images.push(asset);
    }
    setNeedsLookup(true);
    const { soul: entry } = await api<{ soul: SoulEntry }>(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId: node.id, name: name.trim(), variant: trainingVariant, images, confirmed: true,
        ...(retryConfirmed ? { retryConfirmed: true } : {}) }),
    });
    const created = { id: entry.id, variant: entry.variant, status: entry.status };
    setSoul(created);
    setNeedsLookup(false);
    setRetryOffered(false);
    setRetryConfirmed(false);
    setFiles([]);
    setConfirmed(false);
    try {
      await save({ ...node.characterIdentity, soul: created });
      setNotice(`Soul을 등록했습니다. ${states[created.status ?? "ready"]}`);
    } catch (cause) {
      setNotice("발급된 Soul ID를 위에 표시했습니다.");
      throw cause;
    }
  }

  async function listVoices() {
    const data = await api<{ voices: VoiceEntry[] }>(`${endpoint}?kind=voices`);
    setVoices(data.voices);
    if (voiceNeedsLookup) setVoiceRetryOffered(true);
    setVoiceNeedsLookup(false);
    setNotice(data.voices.length ? "등록할 목소리를 선택해 주세요." : "이 계정에서 사용할 목소리가 없습니다.");
  }

  async function checkVoiceCapability() {
    const result = await api<{ available: boolean; reason?: string }>(voiceEndpoint);
    setVoiceCapability(result);
  }

  async function checkVoice() {
    if (!voice || !isVoiceId(voice.id) || voice.type !== "element") return;
    const { voice: updated } = await api<{ voice: CharacterVoice | null }>(`${voiceEndpoint}?id=${encodeURIComponent(voice.id)}`);
    if (!updated) {
      setNotice("아직 목록에서 이 목소리를 확인할 수 없습니다. 잠시 후 다시 조회해 주세요.");
      return;
    }
    setVoice(updated);
    await save({ ...node.characterIdentity, voice: updated });
    setNotice(`목소리 상태를 저장했습니다. ${voiceStates[updated.status ?? "ready"]}`);
  }

  async function cloneVoice() {
    if (!voiceCapability?.available || !hasVoiceSample || !voiceConsent || !voiceName.trim() || voiceNeedsLookup ||
        (voiceRetryOffered && !voiceRetryConfirmed)) return;
    await prepare();
    let asset = voiceSample ? uploaded.current.get(voiceSample) : savedSample;
    if (!asset && voiceSample) {
      const form = new FormData();
      form.append("file", voiceSample);
      ({ asset } = await api<{ asset: Asset }>("/api/assets", { method: "POST", body: form }));
      if (asset.type !== "audio") throw new Error("MP3 또는 WAV 형식의 목소리 샘플을 선택해 주세요.");
      uploaded.current.set(voiceSample, asset);
    }
    if (!asset) throw new Error("등록할 목소리 샘플을 선택해 주세요.");
    setVoiceNeedsLookup(true);
    const { voice: created } = await api<{ voice: CharacterVoice }>(voiceEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId: node.id, name: voiceName.trim(), asset, confirmed: true, consent: true,
        ...(voiceRetryConfirmed ? { retryConfirmed: true } : {}) }),
    });
    setVoice(created);
    setVoiceNeedsLookup(false);
    setVoiceRetryOffered(false);
    setVoiceRetryConfirmed(false);
    setVoiceSample(undefined);
    setVoiceConsent(false);
    try {
      await save({ ...node.characterIdentity, voice: created });
      setNotice(voiceStates[created.status ?? "ready"]);
    } catch (cause) {
      setNotice("등록한 목소리 ID를 위에 표시했습니다.");
      throw cause;
    }
  }

  return (
    <dialog ref={dialog} className="project-library project-settings-dialog character-identity-dialog" aria-labelledby={titleId}
      onCancel={(event) => { if (lock.current) event.preventDefault(); }} onClose={onClose}>
      <header>
        <div><h2 id={titleId}>외형과 목소리 설정</h2><p>{node.title || "캐릭터 시트"}</p></div>
        <button type="button" className="studio-action" data-tone="quiet" data-size="icon" aria-label="닫기"
          disabled={Boolean(busy)} onClick={() => dialog.current?.close()}><X size={18} aria-hidden="true" /></button>
      </header>
      <form className="character-identity-form" onSubmit={handleSave}>
        <div className="project-settings-body character-identity-body">
          <fieldset disabled={Boolean(busy)}>
            <legend><Fingerprint size={18} aria-hidden="true" /> 외형</legend>
            <button type="button" className="studio-action" onClick={() => void perform("Soul 목록 조회 중", loadSouls)}>
              Higgsfield Soul 불러오기
            </button>
            {souls && souls.length > 0 && <label>기존 Soul
              <select value={souls.some((entry) => entry.id === soul?.id) ? soul?.id : ""} onChange={(event) => {
                const entry = souls.find((item) => item.id === event.target.value);
                if (entry) setSoul({ id: entry.id, variant: entry.variant, status: entry.status });
              }}>
                <option value="">Soul 선택</option>
                {souls.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {variants[entry.variant]} · {states[entry.status ?? "ready"]}</option>)}
              </select>
            </label>}
            <label>Soul ID
              <input value={soul?.id ?? ""} autoComplete="off" spellCheck={false} maxLength={36}
                onChange={(event) => setSoul({ id: event.target.value, variant: soul?.variant ?? "soul_cinematic" })} />
            </label>
            <label>Soul 유형
              <select aria-describedby={soulGuideId} value={soul?.variant ?? "soul_cinematic"} onChange={(event) =>
                setSoul({ id: soul?.id ?? "", variant: event.target.value as CharacterSoul["variant"], status: soul?.status })}>
                {variantOptions.map(([id, purpose]) => <option key={id} value={id}>{variants[id]} · {purpose}</option>)}
              </select>
            </label>
            <div id={soulGuideId} className="character-identity-soul-guide">
              <p><strong>Soul 2.0</strong>은 프로필, 캐스팅 사진, 패션 룩북처럼 인물의 스타일을 다양하게 탐색할 때 적합합니다.</p>
              <p><strong>Soul Cinematic</strong>은 영화풍 조명과 질감이 중요한 스틸, 감정 클로즈업, 영상 시작 프레임에 적합합니다.</p>
              <p>캔버스는 저장한 유형에 맞춰 기준 이미지 모델을 고릅니다. 두 모델의 이미지 모두 영상 참조로 쓸 수 있습니다.</p>
            </div>
            {soul?.id && <div className="character-identity-actions">
              {soul.status && <span>{states[soul.status]}</span>}
              <button type="button" className="studio-action" disabled={!isSoulId(soul.id)}
                onClick={() => void perform("Soul 상태 조회 중", refreshSoul)}>학습 상태 확인</button>
              <button type="button" className="studio-action" data-tone="quiet" onClick={() => setSoul(undefined)}>외형 연결 해제</button>
            </div>}
            <details>
              <summary>새 Soul 캐릭터 학습</summary>
              <div className="character-identity-training">
                <p>같은 인물의 정면과 여러 각도가 담긴 이미지 5~20장을 준비하세요. 학습에는 연결된 Higgsfield 계정의 이용 조건이 적용됩니다.</p>
                <label>캐릭터 이름<input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
                <label>학습 유형
                  <select aria-describedby={soulGuideId} value={trainingVariant} onChange={(event) => setTrainingVariant(event.target.value as CharacterSoul["variant"])}>
                    {variantOptions.map(([id, purpose]) => <option key={id} value={id}>{variants[id]} · {purpose}</option>)}
                  </select>
                </label>
                <label>학습 사진
                  <input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => {
                    uploaded.current.clear();
                    setFiles(Array.from(event.target.files ?? []));
                    setConfirmed(false);
                    event.target.value = "";
                  }} />
                </label>
                {node.asset?.type === "image" && <label className="character-identity-checkbox">
                  <input type="checkbox" checked={includePortrait} onChange={(event) => {
                    setIncludePortrait(event.target.checked);
                    setConfirmed(false);
                  }} /> 시트에 적용된 이미지 포함
                </label>}
                <p aria-live="polite">선택한 사진 {imageCount}장</p>
                <label className="character-identity-checkbox">
                  <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                  사진 사용 권한이 있으며 Higgsfield로 전송해 학습을 시작하는 데 동의합니다.
                </label>
                {needsLookup && <p role="status">학습을 다시 요청하려면 먼저 Higgsfield Soul 목록을 확인해 주세요.</p>}
                {retryOffered && <label className="character-identity-checkbox">
                  <input type="checkbox" checked={retryConfirmed} onChange={(event) => setRetryConfirmed(event.target.checked)} />
                  계정의 기존 Soul을 확인했고 새 학습을 요청합니다.
                </label>}
                <button type="button" className="studio-action"
                  disabled={!confirmed || !name.trim() || imageCount < 5 || imageCount > 20 || needsLookup || (retryOffered && !retryConfirmed) || soul?.status === "training"}
                  onClick={() => void perform("Soul 학습 요청 중", train)}>학습 시작</button>
              </div>
            </details>
          </fieldset>
          <fieldset disabled={Boolean(busy)}>
            <legend><Mic size={18} aria-hidden="true" /> 목소리</legend>
            <p>같은 Higgsfield 계정의 개인 목소리나 프리셋을 등록하세요.</p>
            <div className="character-identity-actions">
              <button type="button" className="studio-action" onClick={() => void perform("목소리 목록 조회 중", listVoices)}>목소리 불러오기</button>
              <a className="studio-action" data-tone="quiet" href="https://higgsfield.ai/audio" target="_blank" rel="noreferrer">
                Higgsfield Audio 열기 <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            </div>
            {voices && voices.length > 0 && <label>Higgsfield 목소리
              <select value={voices.some((entry) => entry.id === voice?.id && entry.type === voice.type) ? `${voice?.type}:${voice?.id}` : ""}
                onChange={(event) => {
                  const entry = voices.find((item) => `${item.type}:${item.id}` === event.target.value);
                  if (entry) setVoice({ id: entry.id, type: entry.type });
                }}>
                <option value="">목소리 선택</option>
                {(["element", "preset"] as const).map((type) => <optgroup key={type} label={type === "element" ? "개인 목소리" : "프리셋"}>
                  {voices.filter((entry) => entry.type === type).map((entry) =>
                    <option key={entry.id} value={`${type}:${entry.id}`}>{entry.name}</option>)}
                </optgroup>)}
              </select>
            </label>}
            <label>목소리 ID
              <input value={voice?.id ?? ""} autoComplete="off" spellCheck={false} maxLength={36}
                onChange={(event) => setVoice({ id: event.target.value, type: voice?.type ?? "element" })} />
            </label>
            {!voice?.id && isVoiceId(previousVoiceId) && <button type="button" className="studio-action"
              onClick={() => setVoice({ id: previousVoiceId, type: "element" })}>이전 기록에서 목소리 ID 가져오기</button>}
            <label>목소리 유형
              <select value={voice?.type ?? "element"} onChange={(event) =>
                setVoice({ id: voice?.id ?? "", type: event.target.value as CharacterVoice["type"] })}>
                <option value="element">개인 목소리</option><option value="preset">프리셋</option>
              </select>
            </label>
            {voice?.id && <div className="character-identity-actions">
              {voice.status && <span>{voiceStates[voice.status]}</span>}
              {voice.type === "element" && <button type="button" className="studio-action" disabled={!isVoiceId(voice.id)}
                onClick={() => void perform("목소리 상태 조회 중", checkVoice)}>목소리 상태 확인</button>}
              <button type="button" className="studio-action" data-tone="quiet" onClick={() => setVoice(undefined)}>목소리 연결 해제</button>
            </div>}
            <details>
              <summary>Higgsfield 개인 목소리 등록</summary>
              <div className="character-identity-training">
                <p>영상·VO 작업에도 사용할 Higgsfield 계정으로 MCP를 연결하세요. 등록 시 계정 크레딧이 차감될 수 있습니다.</p>
                {savedSample && !voiceSample && <div className="character-identity-sample">
                  <strong>저장한 TTS 샘플</strong>
                  <audio controls preload="metadata" src={savedSample.url} aria-label="등록 샘플 듣기" />
                  <div className="character-identity-actions">
                    <a className="studio-action" href={savedSample.url} download={savedSample.name}>샘플 다운로드</a>
                    <button type="button" className="studio-action" data-tone="quiet" onClick={() => void perform("샘플 연결 해제 중", async () => {
                      await save({ ...node.characterIdentity, voiceSample: undefined });
                      setVoiceConsent(false);
                    })}>샘플 연결 해제</button>
                  </div>
                </div>}
                <div className="character-identity-actions">
                  <button type="button" className="studio-action" onClick={() => void perform("등록 가능 여부 확인 중", checkVoiceCapability)}>등록 가능 여부 확인</button>
                  {voiceCapability?.available === false && <a className="studio-action" data-tone="quiet"
                    href="/api/providers/higgsfield-mcp/connect" target="_blank" rel="noreferrer">Higgsfield MCP 연결 <ArrowUpRight size={15} aria-hidden="true" /></a>}
                </div>
                {voiceCapability?.available === false && <p>{voiceCapability.reason || "현재 연결에서 목소리 등록을 사용할 수 없습니다."} Higgsfield Audio에서도 개인 목소리를 만들 수 있습니다.</p>}
                {voiceCapability?.available && <>
                  <label>목소리 이름<input value={voiceName} maxLength={80} onChange={(event) => setVoiceName(event.target.value)} /></label>
                  <label>목소리 샘플 (MP3 또는 WAV)
                    <input type="file" accept="audio/mpeg,audio/wav,audio/x-wav,.wav,.mp3" onChange={(event) => {
                      setVoiceSample(event.target.files?.[0]);
                      setVoiceConsent(false);
                      event.target.value = "";
                    }} />
                  </label>
                  {voiceSample && <p>{voiceSample.name}</p>}
                  <label className="character-identity-checkbox">
                    <input type="checkbox" checked={voiceConsent} onChange={(event) => setVoiceConsent(event.target.checked)} />
                    이 목소리를 Higgsfield에서 복제할 권한이 있습니다. 샘플을 전송해 개인 목소리를 등록하는 데 동의합니다.
                  </label>
                  {voiceNeedsLookup && <p role="status">다시 요청하기 전에 목소리 목록에서 이전 등록을 확인해 주세요.</p>}
                  {voiceRetryOffered && <label className="character-identity-checkbox">
                    <input type="checkbox" checked={voiceRetryConfirmed} onChange={(event) => setVoiceRetryConfirmed(event.target.checked)} />
                    계정의 기존 목소리를 확인했고 새 등록을 요청합니다.
                  </label>}
                  <button type="button" className="studio-action" disabled={!hasVoiceSample || !voiceName.trim() || !voiceConsent ||
                    voiceNeedsLookup || (voiceRetryOffered && !voiceRetryConfirmed) || voice?.status === "training"}
                    onClick={() => void perform("목소리 등록 요청 중", cloneVoice)}>개인 목소리 등록</button>
                </>}
              </div>
            </details>
          </fieldset>
          {(busy || notice) && <p role="status">{busy || notice}</p>}
          {error && <p className="project-library-error" role="alert">{error}</p>}
        </div>
        <footer className="character-identity-actions">
          <button type="button" className="studio-action" disabled={Boolean(busy)} onClick={() => dialog.current?.close()}>취소</button>
          <button type="submit" className="studio-action" data-tone="primary" disabled={Boolean(busy)}>저장</button>
        </footer>
      </form>
    </dialog>
  );
}
