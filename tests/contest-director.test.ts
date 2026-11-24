import assert from "node:assert/strict";
import { test } from "node:test";
import {
  contestBoard,
  contestRequirements,
  extractContestBrief,
  isContestBrief,
} from "../lib/contest";
import { directorPrompt, parseDirectorPlan } from "../lib/director";
import { buildRunInput } from "../lib/run-input";
import { sampleProject } from "../lib/sample";
import { validateGraph } from "../lib/graph";
const url = "https://vigloostudio.com/ko/contests/2026-short-drama-festival-2";
const brief = extractContestBrief({
  url,
  title: "공식 페이지",
  text: "",
  fetchedAt: "2026-11-22",
  links: [],
  kind: "manual",
});
const base = {
  operation: "plan",
  nodeId: null,
  version: sampleProject.version,
  provider: "codex",
  director: { format: "series", sceneCount: 1 },
  contest: brief,
};
const draft = {
  title: "잃어버린 일요일",
  logline: "매주 하루를 잃는 우체부가 마지막 편지를 배달한다.",
  idea: "편지로 기억을 잇는다",
  theme: "기억",
  causality: "하루가 사라져 수취인을 찾아야 한다",
  conflict: "주소가 흐려진다",
  turningPoint: "주소 대신 흔적을 읽는다",
  ending: "다음 수취인이 등장한다",
  motif: "우편 도장",
  look: "세로 구도",
  constants: "파란 봉투",
  characters: [],
  scenes: [
    {
      title: "비어 있는 창구",
      structure: "1화의 오프닝",
      location: "닫힌 우체국",
      purpose: "문제를 보인다",
      turn: "도장이 사라진다",
      cast: [],
      dialogue: [],
      shots: [
        {
          cast: [],
          method: "references",
          title: "도장",
          start: "선명한 날짜",
          action: "잉크가 바랜다",
          end: "흰 자리",
          camera: "정면 인서트",
          blocking: "봉투는 화면 아래",
          performance: "정지",
          sound: "시계 소리",
          acceptance: "날짜 변화가 보인다",
        },
      ],
    },
  ],
  competition: {
    sketches: [
      {
        title: "사라진 날짜",
        idea: "날짜가 사라진다",
        criterion: "첫 화면의 훅",
      },
      { title: "빈 우체국", idea: "우체국의 기억", criterion: "시리즈 확장" },
    ],
    selected: 1,
    reason: "시각적 훅을 만든다",
    delivery: "영어 자막과 포스터를 준비한다",
    checklist: ["공식 프로젝트 유지", "규격 확인"],
    materials: [
      { kind: "script", title: "영어 자막 초안", body: "The date is gone." },
    ],
  },
};
test("공모전 URL 단독과 추가 아이디어를 분리하고 실제 제출물까지 연결한다", () => {
  assert(isContestBrief(brief));
  assert.match(brief.specs, /확인본.*\n.*9:16/);
  for (const prompt of [undefined, "", "우편함을 중심으로 구성해주세요"]) {
    const input = buildRunInput(sampleProject, { ...base, prompt }, "id");
    assert.equal(input.contest?.url, url);
    assert(directorPrompt(input).includes(brief.title));
    if (prompt) assert(directorPrompt(input).includes(prompt));
  }
  const graph = parseDirectorPlan(
    JSON.stringify(draft),
    { format: "series", sceneCount: 1 },
    brief,
  );
  assert(validateGraph(graph));
  assert(graph.nodes.find((n) => n.kind === "previs")?.timeline?.clips.length);
  assert(
    graph.edges.some(
      (e) => e.source === "contest-concepts" && e.target === "idea",
    ),
  );
  assert.equal(
    graph.nodes.find((n) => n.id === "contest-material-1")?.kind,
    "script",
  );
  assert.throws(() =>
    parseDirectorPlan(
      JSON.stringify({ ...draft, competition: undefined }),
      { format: "series", sceneCount: 1 },
      brief,
    ),
  );
  assert(validateGraph(contestBoard(brief, "")));
  assert(contestRequirements(brief).includes(url));
});
test("공개 요강의 빈 필드는 미확인으로 두며 마감이라는 제목만으로 날짜를 추정하지 않는다", () => {
  const custom = extractContestBrief({
    url: "https://example.org/film",
    title: "공모",
    text: "마감일\n심사\n주제: 이번 도시의 소리\n영상은 30초 이내\n",
    fetchedAt: "2026-11-22",
    kind: "page",
    links: [],
  });
  assert.match(custom.theme, /도시의 소리/);
  assert.match(custom.specs, /30초/);
  assert.equal(custom.deadline, "요강에서 확인 필요");
  assert(!isContestBrief({ ...custom, url: "file:///local" }));
  assert.throws(() =>
    buildRunInput(
      sampleProject,
      { ...base, director: undefined, prompt: "간단" },
      "id",
    ),
  );
});
