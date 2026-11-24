"use client";

import { useEffect, useRef, useState } from "react";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@ui-sdk/react/collapsible";
import { ArrowUpRight, ChevronDown, LoaderCircle, Plug, RefreshCw, Unplug } from "lucide-react";
import type { ProviderInfo } from "../lib/types";
import "./provider-connections.css";

type Props = { providers: ProviderInfo[]; onRefresh: () => Promise<void>; refreshing: boolean; snapshotAt: string | null; backgroundRefresh: boolean };
const statusTime = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" });
type ConnectionAction = "connect" | "disconnect";
type ConnectionProvider = "codex" | "claude" | "agy" | "higgsfield" | "kling" | "topview" | "higgsfield-mcp";
type Confirmation = { card: string; provider: ConnectionProvider; action: ConnectionAction; label: string };
type Feedback = { card: string; text: string };

export default function ProviderConnections({ providers, onRefresh, refreshing, snapshotAt, backgroundRefresh }: Props) {
  const [feedback, setFeedback] = useState<Feedback>();
  const [confirm, setConfirm] = useState<Confirmation>();
  const [busy, setBusy] = useState<string>();
  const [higgsfieldMcp, setHiggsfieldMcp] = useState<boolean | null>(null);
  const confirmOpener = useRef<HTMLButtonElement>(null);
  const confirmCancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/providers/higgsfield-mcp/tools", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json() as { connected?: boolean };
        if (!controller.signal.aborted) setHiggsfieldMcp(result.connected === true);
      }).catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (confirm) confirmCancel.current?.focus();
  }, [confirm]);

  function dismiss() {
    setConfirm(undefined);
    confirmOpener.current?.focus();
  }

  async function change({ card, provider, action }: Confirmation) {
    setBusy(card);
    setFeedback(undefined);
    setConfirm(undefined);
    try {
      const response = await fetch(`/api/providers/${provider}/connection`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const result = await response.json() as { message?: string; error?: string; completed?: boolean };
      setFeedback({ card, text: result.message || result.error || "연결 상태를 확인해 주세요." });
      if (response.ok && provider === "higgsfield-mcp" && action === "disconnect") setHiggsfieldMcp(false);
      if (response.ok && (action === "disconnect" || provider === "agy")) await onRefresh();
    } catch { setFeedback({ card, text: "계정 연결 요청을 처리하지 못했습니다." }); }
    finally { setBusy(undefined); }
  }

  function actionButton(card: ProviderInfo, provider: ConnectionProvider, action: ConnectionAction, text: string, label: string) {
    const Icon = action === "connect" ? Plug : Unplug;
    return <button type="button" className="studio-action" data-tone={action === "disconnect" ? "quiet" : undefined}
      disabled={!!busy} onClick={(event) => {
        confirmOpener.current = event.currentTarget;
        setConfirm({ card: card.id, provider, action, label });
      }}><Icon size={15} aria-hidden="true" />{text}</button>;
  }

  return <div className="agent-settings-body provider-connections">
    <div className="provider-connections-toolbar">
      <div>
        <p>요금제, 크레딧, 모델을 조회만 합니다.</p>
        {snapshotAt && <p className="provider-last-checked">최근 조회 <time dateTime={snapshotAt}>{statusTime.format(new Date(snapshotAt))}</time>{backgroundRefresh && " · 갱신 중"}</p>}
      </div>
      <button type="button" className="studio-action" onClick={() => void onRefresh()} disabled={refreshing || !!busy}>
        {refreshing ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
        {refreshing ? "연결 확인 중" : "연결 상태 새로고침"}
      </button>
    </div>
    <ul className="agent-settings-connections">
      {providers.map((provider) => {
        const media = provider.id === "higgsfield" || provider.id === "kling" || provider.id === "topview";
        const subscription = provider.id === "codex" || provider.id === "claude" || provider.id === "agy";
        const cli = provider.id === "codex" || provider.id === "claude" || provider.id === "agy" || provider.id === "higgsfield" || provider.id === "kling" ? provider.id : null;
        const connected = provider.id !== "agy" && provider.available;
        const status = provider.id === "agy" && provider.available ? "로그인 확인 필요" : connected ? "연결됨" : "설정 확인";
        const confirmation = confirm?.card === provider.id ? confirm : undefined;
        return <li key={provider.id} className="provider-connection-card">
          <div className="provider-connection-heading">
            <h3>{provider.label}</h3>
            <span className="provider-connection-status" data-connected={connected}>{status}</span>
          </div>
          <p>{provider.detail}</p>
          {(media || subscription) && <dl className="provider-account-stats">
            <div><dt>요금제</dt><dd>{provider.account?.plan ?? "조회 불가"}</dd></div>
            {media && <div><dt>잔여 크레딧</dt><dd>{provider.account?.credits?.toLocaleString("ko-KR") ?? "조회 불가"}</dd></div>}
          </dl>}
          <small>{provider.billing}</small>
          {media && !!provider.models?.length && <Collapsible className="provider-model-list">
            <CollapsibleTrigger className="studio-action" data-tone="quiet">
              모델 {provider.models.length}개 <ChevronDown size={15} aria-hidden="true" />
            </CollapsibleTrigger>
            <CollapsiblePanel>
              <ul>{provider.models.map((model) => <li key={model.id}>
                <span>{model.label}</span>
                <small>{model.operations.map((operation) => operation === "image" ? "이미지" : "영상").join(" / ")}</small>
              </li>)}</ul>
            </CollapsiblePanel>
          </Collapsible>}
          {cli && <div className="provider-connection-actions">
            {actionButton(provider, cli, "connect",
              cli === "agy" ? "계정 연결·변경" : connected ? "계정 변경·재연결" : "계정 연결", provider.label)}
            {(connected || cli === "agy") && actionButton(provider, cli, "disconnect", "연결 해제", provider.label)}
          </div>}
          {(provider.id === "topview" || provider.id === "higgsfield") && <div className="provider-mcp">
            {provider.id === "higgsfield" && <p>MCP {higgsfieldMcp === null ? "상태 미확인" : higgsfieldMcp ? "연결됨" : "연결 필요"}</p>}
            <div className="provider-connection-actions">
              <a className="studio-action" data-tone={provider.id === "higgsfield" ? "quiet" : undefined}
                href={`/api/providers/${provider.id === "higgsfield" ? "higgsfield-mcp" : "topview"}/connect`}>
                MCP {(provider.id === "higgsfield" ? higgsfieldMcp : connected) ? "재연결" : "연결"}
                <ArrowUpRight size={15} aria-hidden="true" />
              </a>
              {provider.id === "higgsfield" && higgsfieldMcp && actionButton(provider, "higgsfield-mcp", "disconnect", "MCP 연결 해제", "Higgsfield MCP")}
              {provider.id === "topview" && connected && actionButton(provider, "topview", "disconnect", "MCP 연결 해제", "Topview MCP")}
            </div>
          </div>}
          {confirmation && <div className="provider-confirm" onKeyDown={(event) => {
            if (event.key === "Escape") { event.preventDefault(); dismiss(); }
          }}>
            <strong>{confirmation.action === "connect" ? `${confirmation.label} 공식 로그인 열기` : `${confirmation.label} 연결 해제`}</strong>
            <p>{confirmation.provider === "agy" ? "이 컴퓨터의 Terminal에서 Antigravity 인증을 직접 완료합니다." :
              confirmation.action === "connect" ? "인증이 완료되면 이 컴퓨터에서 사용하는 CLI 계정이 바뀔 수 있습니다." :
              confirmation.provider === "topview" || confirmation.provider === "higgsfield-mcp" ? "이 작업실에서 저장한 MCP 연결을 지웁니다." :
              "이 컴퓨터의 공유 CLI 로그인에 적용됩니다. 같은 CLI를 사용하는 다른 작업실에도 영향을 줄 수 있습니다."}</p>
            <div className="provider-connection-actions">
              <button ref={confirmCancel} type="button" className="studio-action" onClick={dismiss}>취소</button>
              <button type="button" className="studio-action" data-tone={confirmation.action === "disconnect" ? "danger" : "primary"}
                onClick={() => void change(confirmation)}>{confirmation.action === "connect" ? "인증 열기" : "연결 해제 확인"}</button>
            </div>
          </div>}
          {busy === provider.id && <p role="status">연결 요청을 처리하는 중입니다.</p>}
          {feedback?.card === provider.id && <p className="provider-feedback" role="status">{feedback.text}</p>}
        </li>;
      })}
    </ul>
    {!providers.length && <p role="status">{backgroundRefresh || refreshing ? "계정을 처음 확인하는 중입니다." : "계정 정보를 읽지 못했습니다. 연결 상태를 새로고침해 주세요."}</p>}
  </div>;
}
