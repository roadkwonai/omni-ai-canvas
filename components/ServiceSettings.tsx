"use client";

import { useEffect, useState } from "react";

type KeyName = "OPENAI_API_KEY" | "GEMINI_API_KEY" | "ARK_API_KEY" | "TRIPO_API_KEY" |
  "FISH_AUDIO_API_KEY" | "ELEVENLABS_API_KEY" | "TYPECAST_API_KEY" | "GEMINI_TTS_API_KEY";
type Status = {
  keys: Record<KeyName, { configured: boolean; source: "local" | "environment" | "none" }>;
};
const keys: { id: KeyName; label: string; help: string }[] = [
  { id: "OPENAI_API_KEY", label: "OpenAI API", help: "OpenAI 이미지 API 작업에 사용합니다." },
  { id: "GEMINI_API_KEY", label: "Gemini API", help: "Gemini 이미지 API 작업에 사용합니다." },
  { id: "ARK_API_KEY", label: "Seedream · BytePlus", help: "Seedream 이미지 API 작업에 사용합니다." },
  { id: "TRIPO_API_KEY", label: "Tripo API", help: "Tripo GLB 업로드와 리깅·동작 작업에 사용합니다." },
  { id: "FISH_AUDIO_API_KEY", label: "Fish Audio TTS", help: "목소리 검색과 대본 음성 생성에 사용합니다." },
  { id: "ELEVENLABS_API_KEY", label: "ElevenLabs TTS", help: "목소리 검색과 대본 음성 생성에 사용합니다." },
  { id: "TYPECAST_API_KEY", label: "Typecast TTS", help: "목소리 검색과 대본 음성 생성에 사용합니다." },
  { id: "GEMINI_TTS_API_KEY", label: "Gemini TTS", help: "등록하지 않으면 위 Gemini API 키를 씁니다." },
];
const testMessages = {
  connected: "연결을 확인했습니다. 조회만 했으며 생성 권한과 과금 한도는 모델마다 다를 수 있습니다.",
  denied: "서비스가 요청을 거부했습니다. 키 값과 조회 권한을 확인해 주세요.",
  missing: "등록된 키가 없습니다.",
  unavailable: "서비스에서 조회 결과를 받지 못했습니다. 잠시 후 다시 시도해 주세요.",
};
export default function ServiceSettings({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [status, setStatus] = useState<Status>();
  const [keyDraft, setKeyDraft] = useState<Partial<Record<KeyName, string>>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [tests, setTests] = useState<Partial<Record<KeyName, string>>>({});
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/settings", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data as Status; })
      .then(setStatus)
      .catch((error) => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "설정을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, []);
  async function update(name: KeyName, value: string | null) {
    if (busy) return;
    setBusy(name); setMessage("");
    try {
      const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: name, value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "설정을 저장하지 못했습니다.");
      setStatus(data as Status);
      setKeyDraft((current) => ({ ...current, [name]: "" }));
      setTests((current) => ({ ...current, [name]: undefined }));
      await onRefresh();
      setMessage(value === null ? "작업실에 저장한 키를 삭제했습니다." : "저장했습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "설정을 저장하지 못했습니다."); }
    finally { setBusy(""); }
  }
  async function testKey(key: KeyName) {
    setBusy(key);
    setTests((current) => ({ ...current, [key]: "연결을 확인하는 중입니다. 조회만 합니다." }));
    try {
      const response = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const { status } = await response.json() as { status?: keyof typeof testMessages };
      setTests((current) => ({ ...current, [key]: (response.ok && status && testMessages[status]) || testMessages.unavailable }));
    } catch {
      setTests((current) => ({ ...current, [key]: testMessages.unavailable }));
    } finally { setBusy(""); }
  }
  return <div className="agent-settings-body service-settings">
    <p><a href="/guide#guide-settings" target="_blank" rel="noreferrer">계정과 API 키 사용 가이드 ↗</a></p>
      <p>서버에서 사용할 API 키를 등록합니다. 저장한 값은 다시 표시하지 않습니다. API를 쓰면 그 서비스 계정의 사용량이 늘어납니다.</p>
      {keys.map((item) => {
        const key = status?.keys[item.id];
        const fallback = item.id === "GEMINI_TTS_API_KEY" && !key?.configured && status?.keys.GEMINI_API_KEY.configured;
        return <fieldset key={item.id}>
          <legend>{item.label}</legend>
          <p>{item.help} {key ? key.configured ? key.source === "environment" ? "환경 설정으로 등록됨" : "이 작업실에 등록됨" : fallback ? "Gemini API 키 사용" : "등록되지 않음" : "상태 확인 중"}</p>
          <div className="service-settings-row">
            <label>{item.label} 키<input type="password" autoComplete="off" value={keyDraft[item.id] ?? ""} onChange={(event) => setKeyDraft({ ...keyDraft, [item.id]: event.target.value })} placeholder="새 키 입력" title="서버에 저장할 새 키를 입력합니다." /></label>
            <button type="button" className="studio-action" data-tone="primary" disabled={!!busy || !keyDraft[item.id]?.trim()} onClick={() => void update(item.id, keyDraft[item.id]!.trim())}>{key?.configured ? "키 변경" : "키 저장"}</button>
            <button type="button" className="studio-action" disabled={!!busy || (!key?.configured && !fallback) || !!keyDraft[item.id]?.trim()} title="저장된 키로 모델 목록 또는 잔액을 조회합니다. 생성 요청은 보내지 않습니다." onClick={() => void testKey(item.id)}>연결 테스트</button>
            {key?.source === "local" && <button type="button" className="studio-action" data-tone="quiet" title="작업실에 저장한 키를 삭제합니다. 환경 파일의 등록값이 있으면 그 값을 사용합니다." disabled={!!busy} onClick={() => void update(item.id, null)}>등록 키 삭제</button>}
          </div>
          {tests[item.id] && <p role="status">{tests[item.id]}</p>}
        </fieldset>;
      })}
    {message && <p role="status">{message}</p>}
  </div>;
}
