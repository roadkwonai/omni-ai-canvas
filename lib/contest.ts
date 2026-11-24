import { contestExamples } from "./contest-examples";
import type { ContestSource } from "./contest-source";
import type { Graph } from "./types";

export type ContestBrief = {
  url: string;
  title: string;
  fetchedAt: string;
  theme: string;
  specs: string;
  deadline: string;
  judging: string;
  deliverables: string;
  eligibility: string;
  sourceText: string;
};
const missing = "요강에서 확인 필요";
const fields = {
  theme: /공모\s*주제|주제|기획 의도|theme|challenge theme|creative brief/i,
  specs:
    /[0-9]+\s*(?:분|초|fps|MB|minutes?|seconds?)|화면비|해상도|세로 영상|aspect ratio|resolution/i,
  deadline:
    /접수.{0,15}마감|접수\s*기간|마감일|응모\s*기간|deadline|submissions? (?:close|end)|ends? on/i,
  judging: /심사\s*(기준|항목|점수)|배점|평가 기준|judging|judged|criteria/i,
  deliverables:
    /출품\s*(요건|자료|항목)|제출.{0,10}(파일|서류|자료)|포스터|시놉시스|자막|deliverables?|submit your|subtitle|poster/i,
  eligibility:
    /참가\s*(자격|조건)|응모\s*자격|저작권|허용|금지|필수|eligib|must use|licen[cs]e|rights/i,
} as const;

export function isContestBrief(value: unknown): value is ContestBrief {
  if (!value || typeof value !== "object") return false;
  const b = value as Record<string, unknown>;
  if (
    Object.keys(b).some(
      (k) =>
        ![
          "url",
          "title",
          "fetchedAt",
          "sourceText",
          "theme",
          "specs",
          "deadline",
          "judging",
          "deliverables",
          "eligibility",
        ].includes(k),
    )
  )
    return false;
  for (const [key, max] of Object.entries({
    url: 2048,
    title: 240,
    fetchedAt: 80,
    sourceText: 8000,
    theme: 1800,
    specs: 1800,
    deadline: 1800,
    judging: 1800,
    deliverables: 1800,
    eligibility: 1800,
  })) {
    if (typeof b[key] !== "string" || b[key].length > max) return false;
  }
  try {
    const u = new URL(String(b.url));
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !!String(b.title).trim()
    );
  } catch {
    return false;
  }
}

export function extractContestBrief(source: ContestSource): ContestBrief {
  const text = source.text.replace(/\r/g, "").trim();
  const lines = text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const extract = (pattern: RegExp) => {
    const found = new Set<string>();
    for (let i = 0; i < lines.length && found.size < 4; i++) {
      if (!pattern.test(lines[i])) continue;
      const snippet = (
        lines[i].length < 65 && lines[i + 1]
          ? lines[i] + " — " + lines[i + 1]
          : lines[i]
      ).slice(0, 330);
      found.add(snippet);
    }
    if (
      pattern === fields.deadline &&
      ![...found].some((line) =>
        /(?:[0-9]{1,2}월|[0-9]{4}[-./]|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(
          line,
        ),
      )
    )
      return missing;
    return [...found].join("\n") || missing;
  };
  const known =
    contestExamples[source.url] ??
    contestExamples[source.url.replace(/\/$/, "")];
  const fromExample = known && source.kind === "manual" && !text;
  const b: ContestBrief = {
    url: source.url,
    title: (source.title || "공모전 요강").slice(0, 240),
    fetchedAt: source.fetchedAt,
    sourceText: text.slice(0, 8000),
    theme: "",
    specs: "",
    deadline: "",
    judging: "",
    deliverables: "",
    eligibility: "",
  };
  for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
    const live = extract(fields[key]);
    if (
      known &&
      (fromExample || (source.kind === "page" && known.kind === "page"))
    ) {
      const reviewed = `공식 요강 확인본 (${known.verifiedOn})\n${known[key]}`;
      b[key] =
        !fromExample && live !== missing
          ? (reviewed + "\n\n현재 페이지 발췌\n" + live).slice(0, 1800)
          : reviewed;
    } else b[key] = live;
  }
  if (fromExample) {
    b.title = known.title;
    b.fetchedAt = known.verifiedOn;
  }
  return b;
}

export function contestRequirements(brief: ContestBrief) {
  return [
    ["공모전", brief.title],
    ["주최 측 원문", brief.url],
    ["확인 일자", brief.fetchedAt],
    ["주제", brief.theme],
    ["제작 규격", brief.specs],
    ["마감과 시간대", brief.deadline],
    ["심사 기준", brief.judging],
    ["필수 제출물", brief.deliverables],
    ["참가 자격·도구·권리", brief.eligibility],
  ]
    .map(([label, value]) => `${label}\n${value || missing}`)
    .join("\n\n");
}

export function contestBoard(brief: ContestBrief, idea: string): Graph {
  if (!isContestBrief(brief))
    throw new Error("공모전 제목, URL, 요강 분량을 확인해 주세요.");
  const note = idea.trim().slice(0, 8000);
  return {
    nodes: [
      {
        id: "contest",
        kind: "brief",
        title: "공모 요강 · " + brief.title.slice(0, 95),
        body: contestRequirements(brief),
        x: 0,
        y: 0,
      },
      {
        id: "sketch",
        kind: "brief",
        title: "아이디어 스케치",
        body:
          (note ? "제작자가 추가한 아이디어\n" + note + "\n\n" : "") +
          "서로 다른 소재를 두 가지 이상 비교하세요. 각 후보의 첫 장면, 인물의 선택, 심사 기준과의 접점을 적습니다.",
        x: 360,
        y: 0,
      },
      {
        id: "story",
        kind: "scenario",
        title: "공모전 시나리오",
        body: "채택한 스케치의 훅, 갈등, 전환, 결말을 정하고 공모전의 필수 요소가 등장하는 장면을 표시하세요.",
        x: 720,
        y: 0,
      },
      {
        id: "script",
        kind: "script",
        title: "출품용 대본",
        body: "화자·지문·대사를 적고, 지정 언어와 러닝타임에 맞춰 장면을 나눕니다.",
        x: 1080,
        y: 0,
      },
      {
        id: "submission",
        kind: "note",
        title: "출품 준비 목록",
        body: [
          brief.deliverables,
          brief.specs,
          brief.eligibility,
          brief.deadline,
          "최종 제출 전 공식 공고의 최신 조건을 확인하세요.",
        ].join("\n\n"),
        x: 720,
        y: 320,
      },
    ],
    edges: [
      { source: "contest", target: "sketch" },
      { source: "sketch", target: "story" },
      { source: "story", target: "script" },
      { source: "contest", target: "submission" },
    ],
  };
}

/** 감독 입력창에 붙인 공고 주소와 제작자 메모를 분리한다. */
export function parseContestPrompt(
  prompt: string,
): { url: string; idea: string } | null {
  const link = prompt.match(/https:\/\/[^\s<>()[\]]+/i);
  if (!link) return null;
  const value = link[0].replace(/[.,;!?]+$/, "");
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return null;
  }
  if (u.username || u.password) return null;
  const idea = (
    prompt.slice(0, link.index) + prompt.slice((link.index ?? 0) + value.length)
  )
    .trim()
    .replace(/^\s*[-:·,]+\s*/, "");
  if (
    idea &&
    !/공모|요강|경연|출품|콘테스트|festival|contest|competition/i.test(
      prompt,
    ) &&
    u.hostname !== "adigong.soldaeng-guri.chatgpt.site"
  )
    return null;
  return { url: u.href, idea };
}
