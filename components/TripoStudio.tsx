"use client";
import { useEffect, useRef, useState } from "react";
import "./blender-scene-studio.css";
import "./tripo-studio.css";

type Props = { projectId: string; onClose: () => void };
export default function TripoStudio({ projectId, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [input, setInput] = useState("");
  const [task, setTask] = useState("");
  const [animation, setAnimation] = useState("preset:walk");
  const [result, setResult] = useState("");
  const [history, setHistory] = useState<
    { id: string; action: string; createdAt: string }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [assets, setAssets] = useState<{ id: string; name: string }[]>([]);
  const [assetId, setAssetId] = useState("");
  useEffect(() => {
    const element = dialog.current;
    const signal = new AbortController();
    element?.showModal();
    fetch(`/api/projects/${projectId}/tripo`, { signal: signal.signal })
      .then((response) => response.json())
      .then((data) => setHistory(data.tasks ?? []))
      .catch(() => {});
    fetch(`/api/projects/${projectId}/blender/assets`, {
      signal: signal.signal,
    })
      .then((response) => response.json())
      .then((data) => setAssets(data.assets ?? []))
      .catch(() => {});
    return () => {
      signal.abort();
      element?.close();
    };
  }, [projectId]);
  async function uploadModel() {
    const asset = assets.find((item) => item.id === assetId);
    if (
      busy ||
      !asset ||
      !window.confirm(`‘${asset.name}’을 Tripo 계정에 업로드하시겠어요?`)
    )
      return;
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/tripo/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, confirmed: true }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "GLB를 등록하지 못했습니다.");
      setInput(data.token);
      setResult("GLB를 Tripo에 등록했습니다. 리깅 검사를 실행할 수 있습니다.");
    } catch (error) {
      setResult(
        error instanceof Error ? error.message : "GLB를 등록하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function call(action: string) {
    setBusy(true);
    setResult("");
    try {
      const response = await fetch(
        `/api/projects/${projectId}/tripo${action === "status" ? `?task=${encodeURIComponent(task)}` : ""}`,
        action === "status"
          ? {}
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action,
                input,
                ...(action === "retarget" ? { animation } : {}),
              }),
            },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "작업을 확인하지 못했습니다.");
      if (body.data?.task_id && action !== "status") setTask(body.data.task_id);
      setResult(
        (body.warning ? body.warning + "\n" : "") +
          JSON.stringify(body.data ?? body, null, 2),
      );
      if (action !== "status") {
        const listing = await fetch(`/api/projects/${projectId}/tripo`);
        const data = await listing.json();
        setHistory(data.tasks ?? []);
      }
    } catch (error) {
      setResult(
        error instanceof Error ? error.message : "요청에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function importModel() {
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/tripo/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "모델을 가져오지 못했습니다.");
      setResult(
        `Blender 자산에 ‘${body.asset.name}’을 추가했습니다. Blender 장면 도구에서 선택하세요.`,
      );
    } catch (error) {
      setResult(
        error instanceof Error ? error.message : "모델을 가져오지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="blender-scene tripo-studio"
      aria-labelledby="tripo-studio-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="blender-scene-header">
        <h2 id="tripo-studio-title">Tripo 3D 작업</h2>
        <button type="button" disabled={busy} onClick={onClose}>
          닫기
        </button>
      </header>
      <div className="blender-scene-content tripo-content">
        <p>
          기존 Tripo 모델 작업 번호로 리깅 상태를 검사하고 사람형 리그와 동작을
          적용합니다. 리깅과 동작 적용에는 Tripo API 요금이 적용됩니다.
        </p>
        <section className="tripo-section" aria-labelledby="tripo-model">
          <h3 id="tripo-model">모델 준비</h3>
          <p>프로젝트 GLB를 등록하거나 기존 Tripo 작업 번호를 입력하세요.</p>
          {assets.length > 0 && (
            <div className="blender-section">
              <label>
                프로젝트 GLB{" "}
                <select
                  value={assetId}
                  disabled={busy}
                  onChange={(event) => setAssetId(event.target.value)}
                >
                  <option value="">자산 선택</option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!assetId || busy}
                onClick={() => void uploadModel()}
              >
                선택한 GLB를 Tripo에 등록
              </button>
            </div>
          )}
          <label>
            작업 번호 또는 파일 번호{" "}
            <input
              title="Tripo에서 받은 작업 UUID 또는 업로드 후 발급된 파일 번호를 입력합니다."
              placeholder="작업 UUID 또는 file_로 시작하는 번호"
              value={input}
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
            />
          </label>
          <div className="tripo-actions">
            <button
              title="모델에 리깅을 적용할 수 있는지 확인합니다."
              disabled={busy || !input}
              onClick={() => void call("rig-check")}
            >
              리깅 검사
            </button>{" "}
            <button
              title="사람형 뼈대를 만드는 유료 작업을 제출합니다."
              disabled={busy || !input}
              onClick={() => void call("rig")}
            >
              리깅 제출
            </button>
          </div>
        </section>
        <section className="tripo-section" aria-labelledby="tripo-motion">
          <h3 id="tripo-motion">동작 적용</h3>
          <p>리깅이 완료된 작업 번호를 위 입력란에 넣고 동작을 선택합니다.</p>
          <label>
            동작 프리셋{" "}
            <input
              title="Tripo가 지원하는 동작 프리셋 ID입니다. 예: preset:walk"
              value={animation}
              onChange={(e) => setAnimation(e.target.value)}
            />
          </label>{" "}
          <button
            title="완료된 리깅 작업에 선택한 동작을 적용합니다. Tripo API 요금이 적용됩니다."
            disabled={busy || !input || input.startsWith("file_")}
            onClick={() => void call("retarget")}
          >
            동작 적용 제출
          </button>
        </section>
        <section className="tripo-section" aria-labelledby="tripo-result">
          <h3 id="tripo-result">작업 확인과 가져오기</h3>
          <p>
            제출 후 발급된 작업 번호로 진행 상태를 조회하세요. 완료된 GLB는
            Blender 장면에서 사용할 수 있습니다.
          </p>
          <label>
            조회 작업 번호{" "}
            <input
              title="상태를 확인할 Tripo 작업 UUID를 입력합니다."
              placeholder="조회할 작업 UUID"
              value={task}
              onChange={(e) => setTask(e.target.value)}
            />
          </label>{" "}
          <div className="tripo-actions">
            <button
              title="작업의 진행 상태와 결과를 읽습니다."
              disabled={busy || !task}
              onClick={() => void call("status")}
            >
              상태 조회
            </button>
            <button
              title="완료된 결과 GLB를 이 프로젝트의 Blender 자산에 등록합니다."
              disabled={busy || !task}
              onClick={() => void importModel()}
            >
              완료된 GLB를 Blender 자산으로 가져오기
            </button>
          </div>
          {history.length > 0 && (
            <label>
              이 프로젝트의 작업{" "}
              <select value={task} onChange={(e) => setTask(e.target.value)}>
                <option value="">작업 선택</option>
                {history.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.action} ·{" "}
                    {new Date(item.createdAt).toLocaleString("ko-KR")} ·{" "}
                    {item.id}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>
        {result && (
          <pre className="tripo-result" role="status">
            {result}
          </pre>
        )}
        <p>
          <a
            href="https://developers.tripo3d.ai/en/docs/quick-start"
            target="_blank"
            rel="noreferrer"
          >
            Tripo 공식 작업 안내 ↗
          </a>
        </p>
      </div>
    </dialog>
  );
}
