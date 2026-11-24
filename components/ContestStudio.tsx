"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, LoaderCircle, X } from "lucide-react";
import {
  contestBoard,
  extractContestBrief,
  type ContestBrief,
} from "../lib/contest";
import type { ContestSource } from "../lib/contest-source";
import { contestExamples } from "../lib/contest-examples";
import { addProductionGraph } from "../lib/production-template";
import type { Graph, Project } from "../lib/types";
import "./contest-studio.css";

type Props = {
  project: Project;
  initialUrl?: string;
  initialIdea?: string;
  onGraphChange: (
    projectId: string,
    update: (graph: Graph) => Graph,
  ) => boolean;
  onBrief: (brief: ContestBrief, idea: string) => void;
  onClose: () => void;
};

const examples = [
  {
    name: "AI 디지털 공모전",
    url: "https://adigong.soldaeng-guri.chatgpt.site/",
  },
  {
    name: "비글루 숏드라마 페스티벌",
    url: "https://vigloostudio.com/ko/contests/2026-short-drama-festival-2",
  },
  {
    name: "Higgsfield Talent Contest",
    url: "https://higgsfield.ai/ko/contests/talent-contest",
  },
];

const fields = [
  ["title", "공모전 이름"],
  ["theme", "주제"],
  ["specs", "영상 규격"],
  ["deadline", "마감"],
  ["judging", "심사 기준"],
  ["deliverables", "출품 방식과 권리"],
  ["eligibility", "참가 자격"],
] as const;

export default function ContestStudio({
  project,
  initialUrl = "",
  initialIdea = "",
  onGraphChange,
  onBrief,
  onClose,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);
  const [url, setUrl] = useState(initialUrl);
  const [idea, setIdea] = useState(initialIdea);
  const [source, setSource] = useState<ContestSource | null>(null);
  const [brief, setBrief] = useState<ContestBrief | null>(null);
  const [manual, setManual] = useState("");
  const [manualDirty, setManualDirty] = useState(false);
  const [entered, setEntered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      generation.current += 1;
    };
  }, []);

  const validUrl = () => {
    try {
      const parsed = new URL(url);
      return (
        parsed.protocol === "https:" && !parsed.username && !parsed.password
      );
    } catch {
      return false;
    }
  };
  const applySource = (next: ContestSource, pasted = false) => {
    setSource(next);
    setEntered(pasted || manualDirty);
    if (!manualDirty || pasted) setManual(next.text);
    setBrief(
      extractContestBrief(
        manualDirty && !pasted ? { ...next, text: manual, kind: "page" } : next,
      ),
    );
    setManualDirty(false);
  };
  const read = async (target = url) => {
    try {
      const parsed = new URL(target);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password)
        throw new Error();
    } catch {
      setMessage("공모전의 https 주소를 입력해 주세요.");
      return;
    }
    const ticket = ++generation.current;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/contests/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target.trim() }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "요강을 가져오지 못했습니다.",
        );
      if (ticket === generation.current) {
        const result = data.source as ContestSource;
        setUrl(result.url);
        applySource(result);
        setMessage(
          "요강을 확인하고 필요한 항목을 수정한 뒤 원하는 작업을 다시 선택해 주세요.",
        );
      }
    } catch (error) {
      if (ticket === generation.current) {
        applySource({
          url: target.trim(),
          title: "공모전 요강",
          text: "",
          fetchedAt: "",
          links: [],
          kind: "manual",
        });
        setMessage(
          `${(error as Error).message} 원문을 직접 붙여넣거나 요강 항목을 보완해 주세요.`,
        );
      }
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  };
  useEffect(() => {
    try {
      const parsed = new URL(initialUrl);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password)
        return;
      const timer = window.setTimeout(() => {
        void read(initialUrl);
      }, 0);
      return () => window.clearTimeout(timer);
    } catch {
      return;
    }
    // This initial handoff is scoped to the mounted dialog, not subsequent edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]);
  const useManual = () => {
    if (!validUrl()) {
      setMessage("출처 주소를 입력해 주세요.");
      return;
    }
    applySource(
      {
        url: url.trim(),
        title: source?.title || "공모전 요강",
        text: manual,
        fetchedAt: new Date().toISOString(),
        links: [],
        kind: "page",
      },
      true,
    );
    setMessage(
      "붙여넣은 내용으로 요강을 정리했습니다. 비어 있는 항목을 확인해 주세요.",
    );
  };
  const currentBrief = async () => {
    if (!validUrl()) {
      setMessage("출처 주소를 입력해 주세요.");
      return null;
    }
    if (!source || source.url !== url.trim()) {
      await read();
      return null;
    }
    if (
      (source?.url === url.trim() && source.kind === "directory") ||
      /^https?:\/\/adigong\.soldaeng-guri\.chatgpt\.site\/?$/i.test(url.trim())
    ) {
      setMessage("목록에서 개별 공모전을 선택해 상세 요강을 가져와 주세요.");
      return null;
    }
    let current = brief;
    if (manualDirty) {
      const extracted = extractContestBrief({
        ...source,
        kind: "page",
        text: manual,
      });
      if (current) {
        for (const [key] of fields) {
          if (current[key].trim() && current[key] !== "요강에서 확인 필요")
            extracted[key] = current[key];
        }
      }
      current = extracted;
    }
    if (!current) return null;
    const factualFields = fields.filter(([key]) => key !== "title");
    if (
      source.kind === "manual" &&
      !manual.trim() &&
      !source.text.trim() &&
      factualFields.every(
        ([key]) =>
          !current![key].trim() || current![key] === "요강에서 확인 필요",
      )
    ) {
      setMessage(
        "공고 원문을 붙여넣거나 주제·규격 등 확인한 요강 항목을 입력해 주세요.",
      );
      return null;
    }
    return current;
  };
  const example = source
    ? (contestExamples[source.url] ??
      contestExamples[source.url.replace(/\/$/, "")])
    : undefined;
  const directory =
    source?.kind === "directory" || example?.kind === "directory";
  const links = source?.links.length ? source.links : example?.links || [];
  const makeBoard = async () => {
    const current = await currentBrief();
    if (!current) return;
    try {
      const additions = contestBoard(current, idea.trim());
      if (
        onGraphChange(project.id, (graph) =>
          addProductionGraph(graph, additions),
        )
      ) {
        setBrief(current);
        setMessage("공모전 준비 노드를 추가했습니다.");
      } else setMessage("프로젝트가 변경되어 노드를 추가하지 못했습니다.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "노드를 추가하지 못했습니다.",
      );
    }
  };

  return (
    <dialog
      ref={dialog}
      className="contest-dialog"
      aria-labelledby="contest-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="contest-header">
        <div>
          <h2 id="contest-title">공모전 준비</h2>
          <p>{project.title} 프로젝트에 요강과 아이디어를 정리합니다.</p>
        </div>
        <button
          type="button"
          className="contest-close"
          aria-label="공모전 준비 닫기"
          title="공모전 준비 화면을 닫습니다."
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="contest-body">
        <label htmlFor="contest-url">
          공모전 주소 <span>필수</span>
        </label>
        <div className="contest-url">
          <input
            id="contest-url"
            type="url"
            value={url}
            placeholder="https://..."
            title="공식 공고 또는 공모전 목록의 HTTPS 주소를 입력합니다."
            onChange={(event) => {
              generation.current += 1;
              setLoading(false);
              setUrl(event.target.value);
              setSource(null);
              setBrief(null);
              if (!manualDirty) setManual("");
              setMessage("");
            }}
            autoFocus
          />
          <button
            type="button"
            title="공개 공고의 본문과 링크를 불러와 요강을 정리합니다."
            disabled={loading}
            onClick={() => void read()}
          >
            {loading ? (
              <>
                <LoaderCircle size={16} /> 가져오는 중
              </>
            ) : (
              "요강 가져오기"
            )}
          </button>
        </div>
        <div className="contest-examples">
          <span>예시 주소</span>
          {examples.map((item) => (
            <button
              type="button"
              title={`${item.name} 주소를 입력합니다.`}
              key={item.url}
              onClick={() => {
                generation.current += 1;
                setLoading(false);
                setUrl(item.url);
                setSource(null);
                setBrief(null);
                if (!manualDirty) setManual("");
                setMessage("");
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
        <label htmlFor="contest-idea">
          아이디어와 추가 자료 <span>선택</span>
        </label>
        <textarea
          id="contest-idea"
          rows={3}
          value={idea}
          title="요강과 별도로 제작자의 줄거리나 참고 자료를 적습니다."
          onChange={(event) => setIdea(event.target.value)}
          placeholder="떠오른 줄거리나 참고할 내용을 적어 주세요."
        />
        <div className="contest-manual">
          <label htmlFor="contest-source">
            공고 원문 직접 붙여넣기 <span>선택</span>
          </label>
          <textarea
            id="contest-source"
            rows={5}
            value={manual}
            title="직접 확인한 공고의 원문을 붙여넣습니다."
            onChange={(event) => {
              setManual(event.target.value);
              setManualDirty(true);
            }}
            placeholder="사이트에서 읽을 수 없는 요강은 여기에 붙여넣으세요."
          />
          <button
            type="button"
            title="붙여넣은 공고에서 요강 항목을 추출합니다."
            onClick={useManual}
          >
            붙여넣은 원문 정리
          </button>
        </div>
        {source && (
          <section className="contest-source">
            <h3>출처와 원문</h3>
            <p>
              <a
                title="공모전 출처를 새 창에서 엽니다."
                href={source.url}
                target="_blank"
                rel="noreferrer"
              >
                {source.title || source.url} <ExternalLink size={14} />
              </a>{" "}
              ·{" "}
              {entered
                ? "직접 입력"
                : source.kind === "manual"
                  ? "자동 조회 실패"
                  : "실시간 조회"}{" "}
              ·{" "}
              {source.fetchedAt
                ? new Date(source.fetchedAt).toLocaleString("ko-KR")
                : "시각 미확인"}
            </p>
            {source.kind === "manual" && (
              <p>
                자동으로 원문을 읽지 못했습니다.{" "}
                {example
                  ? `아래 참고 요약은 ${example.verifiedOn} 기준이며 실시간 확인 결과가 아닙니다.`
                  : "원문을 직접 붙여넣어 주세요."}
              </p>
            )}
            {directory && (
              <p>
                공모전 목록입니다. 아래 개별 공고를 선택해 상세 요강을
                가져오세요.
              </p>
            )}
            {links.length > 0 && (
              <ul>
                {links.map((link) => (
                  <li key={link.url}>
                    <a
                      title="개별 공고 원문을 새 창에서 엽니다."
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {link.title || link.url} <ExternalLink size={14} />
                    </a>
                    {directory && link.url !== source.url && (
                      <button
                        type="button"
                        title="선택한 공모전의 상세 요강을 불러옵니다."
                        disabled={loading}
                        onClick={() => {
                          setUrl(link.url);
                          setBrief(null);
                          void read(link.url);
                        }}
                      >
                        상세 요강 가져오기
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <details>
              <summary title="조회한 원문을 펼치거나 접습니다.">
                가져온 원문 보기
              </summary>
              <pre>{source.text || "원문을 확인하지 못했습니다."}</pre>
            </details>
          </section>
        )}
        {brief && (
          <section className="contest-brief">
            <h3>확인할 공모 요강</h3>
            <p>
              자동 정리는 초안입니다. 미확인 항목과 출처를 확인하고 수정하세요.
              {source?.kind === "manual" && example && brief.fetchedAt
                ? ` 예시 요약 기준: ${brief.fetchedAt}`
                : ""}
            </p>
            <div className="contest-fields">
              {fields.map(([key, label]) => (
                <label key={key}>
                  {label}
                  <textarea
                    rows={2}
                    value={brief[key]}
                    placeholder="미확인"
                    title={`공고에서 확인한 ${label}을 검토하고 수정합니다.`}
                    onChange={(event) =>
                      setBrief({ ...brief, [key]: event.target.value })
                    }
                  />
                </label>
              ))}
            </div>
          </section>
        )}
        {message && (
          <p className="contest-message" role="status">
            {message}
          </p>
        )}
      </div>
      <footer className="contest-actions">
        <button
          type="button"
          title="확인한 요강과 아이디어 스케치, 출품 준비 노드를 추가합니다."
          disabled={loading}
          onClick={() => void makeBoard()}
        >
          공모전 준비 보드 만들기
        </button>
        <button
          type="button"
          title="확인한 요강을 감독 기획 요청에 전달합니다."
          disabled={loading}
          className="contest-primary"
          onClick={() =>
            void currentBrief().then((current) => {
              if (current) {
                onBrief(current, idea.trim());
                onClose();
              }
            })
          }
        >
          감독 기획으로 이동
        </button>
      </footer>
    </dialog>
  );
}
