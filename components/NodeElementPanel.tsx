"use client";

import { useState } from "react";
import { ArrowUpRight, ChevronDown, Clipboard, Link2, List, Plus, Save } from "lucide-react";
import "./node-element-panel.css";
import { elementNoteEnd as end, elementNoteField as existing, elementNoteStart as begin } from "@/lib/character-identity";
import type { CanvasNode } from "../lib/types";

type Props = { node: CanvasNode; onChange: (patch: Partial<CanvasNode>) => void };

export default function NodeElementPanel({ node, onChange }: Props) {
  const [elementId, setElementId] = useState(() => existing(node.body, "Element ID"));
  const [voiceId, setVoiceId] = useState(() => existing(node.body, "Voice ID"));
  const [status, setStatus] = useState(() => existing(node.body, "상태"));
  const [source, setSource] = useState(() => existing(node.body, "출처"));
  const [elements, setElements] = useState<{id:string;name:string;status:string}[]>([]);
  const [mediaId, setMediaId] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<"media_input" | "image_job">("media_input");
  const [mediaList, setMediaList] = useState<{id:string;url:string;type:"media_input"|"image_job"}[]>([]);
  const [elementName, setElementName] = useState("");
  const [category, setCategory] = useState("character");
  const [busy, setBusy] = useState<"list" | "create" | null>(null);
  const [mcpStatus, setMcpStatus] = useState("");
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ready = uuidPattern.test(elementId.trim()) && status.trim().toLowerCase() === "completed";
  async function copyPlaceholder() {
    if (!ready) { setMessage("Element UUID와 completed 상태를 확인해 주세요."); return; }
    try {
      await navigator.clipboard.writeText(`<<<${elementId.trim()}>>>`);
      setMessage("공식 MCP 이미지·영상 생성의 prompt에 넣을 참조 표식을 복사했습니다.");
    } catch { setMessage("복사에 실패했습니다. 아래 표식을 직접 선택해 복사하세요."); }
  }
  async function checkMcp() {
    setChecking(true);
    try {
      const response = await fetch("/api/providers/higgsfield-mcp/tools");
      const data = await response.json();
      setMcpStatus(data.connected ? `연결됨 · 제공 도구 ${data.tools.length}개` : data.error || "계정 연결이 필요합니다.");
    } catch { setMcpStatus("연결을 확인하지 못했습니다."); }
    finally { setChecking(false); }
  }
  async function loadElements() {
    setBusy("list");
    setMessage("");
    try {
      const response = await fetch("/api/providers/higgsfield-mcp/elements");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "목록을 불러오지 못했습니다.");
      const items = Array.isArray(data.items) ? data.items.filter((item: { id?: unknown; name?: unknown; status?: unknown }) =>
        typeof item?.id === "string" && typeof item.name === "string" && typeof item.status === "string") : [];
      setElements(items);
      setMessage(items.length ? "" : "이 계정에 저장된 참조가 없습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "목록을 불러오지 못했습니다."); }
    finally { setBusy(null); }
  }
  async function createElement() {
    if (!mediaList.length || busy || !window.confirm("확인해 선택한 이미지로 Higgsfield 계정에 참조 엘리먼트를 생성할까요?")) return;
    setBusy("create");
    setMessage("");
    try {
      const response = await fetch("/api/providers/higgsfield-mcp/elements", { method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({confirmed:true,name:elementName,category,medias:mediaList}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "생성하지 못했습니다. Higgsfield 생성 기록을 확인하세요.");
      const item = data.element ?? data.items?.[0];
      if (!item?.id) throw new Error("응답에 엘리먼트 ID가 없습니다. Higgsfield 생성 기록을 확인하세요.");
      setElementId(item.id); setStatus(item.status ?? "processing");
      setMessage("참조를 생성했습니다. completed 상태를 확인한 뒤 노드에 기록하세요.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "생성 요청을 확인하지 못했습니다."); }
    finally { setBusy(null); }
  }
  function save() {
    const rows = [
      "## Higgsfield 참조 기록",
      elementId.trim() && `Element ID: ${elementId.trim()}`,
      voiceId.trim() && `Voice ID: ${voiceId.trim()}`,
      status.trim() && `상태: ${status.trim()}`,
      source.trim() && `출처: ${source.trim()}`,
    ].filter(Boolean).join("\n");
    const previous = node.body;
    const start = previous.indexOf(begin), finish = previous.indexOf(end);
    const cleaned = start >= 0 && finish >= start
      ? previous.slice(0, start) + previous.slice(finish + end.length)
      : previous;
    const body = `${cleaned.trim()}\n\n${begin}\n${rows}\n${end}`.trim();
    if (body.length > 24000) { setMessage("노드 내용이 너무 깁니다."); return; }
    onChange({ body });
    setMessage("참조 기록을 노드에 적용했습니다.");
  }
  function addImage() {
    const id = mediaId.trim();
    if (!uuidPattern.test(id)) {
      setMessage("이미지 UUID를 확인해 주세요.");
      return;
    }
    try {
      const url = new URL(mediaUrl.trim());
      if (url.protocol !== "https:" || url.username || url.password || url.port ||
          !(url.hostname === "higgsfield.ai" || url.hostname.endsWith(".higgsfield.ai"))) throw new Error();
      setMediaList([...mediaList, { id, url: url.href, type: mediaType }]);
      setMediaId("");
      setMediaUrl("");
      setMessage("");
    } catch {
      setMessage("Higgsfield에서 발급한 HTTPS 이미지 주소를 입력해 주세요.");
    }
  }

  const hasRecord = Boolean(existing(node.body, "Element ID") || (node.kind !== "character" && existing(node.body, "Voice ID")));
  return (
    <details className="node-element-panel">
      <summary className="node-element-summary">
        <Link2 size={18} aria-hidden="true" />
        <span><strong>Higgsfield Element</strong><small>{hasRecord ? "기록 있음" : "참조 ID 관리"}</small></span>
        <ChevronDown className="node-element-chevron" size={17} aria-hidden="true" />
      </summary>
      <div className="node-element-content">
        <div className="node-element-account">
          <p>Higgsfield 계정의 참조를 불러오거나 갖고 있는 ID를 직접 적으세요.</p>
          <div className="node-element-actions">
            <a className="studio-action" href="/api/providers/higgsfield-mcp/connect" target="_blank" rel="noreferrer">
              MCP 계정 연결 <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            <button type="button" className="studio-action" data-tone="quiet" disabled={checking} onClick={() => void checkMcp()}>
              {checking ? "연결 확인 중" : "연결 확인"}
            </button>
          </div>
          <p className="node-element-feedback" role="status">{mcpStatus}</p>
          <button type="button" className="studio-action" disabled={Boolean(busy)} onClick={() => void loadElements()}>
            <List size={16} aria-hidden="true" /> {busy === "list" ? "참조 불러오는 중" : "계정 참조 불러오기"}
          </button>
          {elements.length > 0 && <label>계정 참조
            <select value={elements.some((item) => item.id === elementId) ? elementId : ""} onChange={(event) => {
              const item = elements.find((entry) => entry.id === event.target.value);
              if (item) {
                setElementId(item.id);
                setStatus(item.status);
                setMessage("");
              }
            }}>
              <option value="">참조 선택</option>
              {elements.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}
            </select>
          </label>}
        </div>
        <form className="node-element-record" onSubmit={(event) => { event.preventDefault(); save(); }}>
          <label>Element ID<input value={elementId} maxLength={160} spellCheck={false} autoComplete="off" onChange={(event) => setElementId(event.target.value)} /></label>
          {node.kind !== "character" && <label>Voice ID<input value={voiceId} maxLength={160} spellCheck={false} autoComplete="off" onChange={(event) => setVoiceId(event.target.value)} /></label>}
          <label>상태<input value={status} maxLength={300} onChange={(event) => setStatus(event.target.value)} placeholder="예: completed" /></label>
          <label>출처<input value={source} maxLength={300} onChange={(event) => setSource(event.target.value)} /></label>
          <div className="node-element-actions">
            <button type="submit" className="studio-action" data-tone="primary" disabled={Boolean(busy)}><Save size={16} aria-hidden="true" /> 노드에 기록</button>
          </div>
        </form>
        {ready && <div className="node-element-copy">
          <p>아래 표식을 지원 모델의 MCP 프롬프트에 넣으세요.</p>
          <code>{`<<<${elementId.trim()}>>>`}</code>
          <button type="button" className="studio-action" onClick={() => void copyPlaceholder()}>
            <Clipboard size={16} aria-hidden="true" /> 표식 복사
          </button>
        </div>}
        <details className="node-element-create">
          <summary className="node-element-summary">
            <span><strong>새 참조 만들기</strong></span>
            <ChevronDown className="node-element-chevron" size={16} aria-hidden="true" />
          </summary>
          <div className="node-element-create-fields">
            <p>Higgsfield에서 업로드를 마친 이미지의 ID와 주소를 추가하세요.</p>
            <div className="node-element-pair">
              <label>이름<input value={elementName} maxLength={32} onChange={(event) => setElementName(event.target.value)} /></label>
              <label>참조 종류
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="character">인물</option><option value="environment">장소</option>
                  <option value="prop">소품</option><option value="auto">자동</option>
                </select>
              </label>
            </div>
            <label>이미지 종류
              <select value={mediaType} onChange={(event) => setMediaType(event.target.value as typeof mediaType)}>
                <option value="media_input">확인된 업로드</option><option value="image_job">완료된 이미지 작업</option>
              </select>
            </label>
            <label>이미지 UUID<input value={mediaId} spellCheck={false} autoComplete="off" onChange={(event) => setMediaId(event.target.value)} /></label>
            <label>이미지 HTTPS 주소<input value={mediaUrl} inputMode="url" autoComplete="off" spellCheck={false} onChange={(event) => setMediaUrl(event.target.value)} /></label>
            {mediaList.length > 0 && <ul className="node-element-images" aria-label="추가한 이미지">
              {mediaList.map((item, index) => <li key={`${item.id}:${index}`}>
                <code>{item.id}</code>
                <button type="button" className="studio-action" data-tone="quiet" aria-label={`이미지 ${index + 1} 제거`}
                  onClick={() => setMediaList(mediaList.filter((_, entry) => entry !== index))}>제거</button>
              </li>)}
            </ul>}
            <div className="node-element-actions">
              <button type="button" className="studio-action" disabled={Boolean(busy) || mediaList.length >= 8 || !mediaId.trim() || !mediaUrl.trim()} onClick={addImage}>
                <Plus size={16} aria-hidden="true" /> 이미지 추가
              </button>
              <button type="button" className="studio-action" disabled={Boolean(busy) || !mediaList.length} onClick={() => void createElement()}>
                {busy === "create" ? "참조 생성 중" : "참조 생성"}
              </button>
            </div>
          </div>
        </details>
        <p role="status" className="node-element-feedback">{busy ? "Higgsfield에 요청 중…" : message}</p>
        <a className="studio-action node-element-external" data-tone="quiet" href="https://higgsfield.ai/" target="_blank" rel="noreferrer">
          Higgsfield 열기 <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </div>
    </details>
  );
}
