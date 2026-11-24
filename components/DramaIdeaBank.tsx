"use client";

import { useState } from "react";
import { readDramaPremises, type DramaPremise } from "../lib/drama-premises";

export default function DramaIdeaBank({
  onChoose,
}: {
  onChoose: (item: DramaPremise) => void;
}) {
  const [items, setItems] = useState<DramaPremise[]>([]);
  const [selected, setSelected] = useState(1);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const matches = items.filter((item) =>
    `${item.number} ${item.title} ${item.description}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const current =
    matches.find((item) => item.number === selected) ?? matches[0];
  async function load() {
    if (items.length || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        "/api/guidance?source=short-drama-screenwriter",
      );
      const result = await response.json();
      if (!response.ok || typeof result.content !== "string")
        throw new Error(result.error || "로컬 원본을 열 수 없습니다.");
      const bank = readDramaPremises(result.content);
      if (!bank.length)
        throw new Error(
          "현재 원본에서 100개 아이디어 부록을 읽을 수 없습니다.",
        );
      setItems(bank);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "아이디어를 불러올 수 없습니다.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open) void load();
      }}
    >
      <summary>제작자 아이디어 100개에서 출발하기</summary>
      {loading && <p role="status">프로젝트에 보관한 원문을 읽고 있습니다.</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => void load()}>
            다시 읽기
          </button>
        </p>
      )}
      {items.length > 0 && (
        <div className="higgs-idea-bank">
          <label>
            원문 아이디어 검색
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="번호 또는 영문 단어"
            />
          </label>
          {current ? (
            <>
              <label>
                아이디어
                <select
                  value={current.number}
                  onChange={(event) => setSelected(Number(event.target.value))}
                >
                  {matches.map((item) => (
                    <option key={item.number} value={item.number}>
                      {item.number}. {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <p lang="en">{current.description}</p>
              <button type="button" onClick={() => onChoose(current)}>
                이 아이디어를 기획 참조로 선택
              </button>
            </>
          ) : (
            <p>검색에 맞는 아이디어가 없습니다.</p>
          )}
        </div>
      )}
    </details>
  );
}
