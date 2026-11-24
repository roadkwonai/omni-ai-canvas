import type { Project } from "./types";

export const sampleProject: Project = {
  id: "55a121ed-7df3-4a4d-b88f-c7f53077a640",
  title: "마지막 상영",
  version: 1,
  updatedAt: "2026-11-22T00:00:00.000Z",
  graph: {
    nodes: [
      {
        id: "concept",
        kind: "brief",
        x: 0,
        y: 125,
        title: "불이 꺼지기 전에",
        body: "오래된 단관 극장의 마지막 밤. 영사기사 정우는 객석에서 발신인을 알 수 없는 필름 한 통을 발견한다.",
      },
      {
        id: "screenplay",
        kind: "script",
        x: 334,
        y: 0,
        title: "01. 영사실의 밤",
        body: "내부. 영사실 — 밤\n정우가 낡은 필름을 건다. 불 꺼진 객석 너머, 영사창에 오래전 자신의 얼굴이 비친다.",
      },
      {
        id: "projectionist",
        kind: "character",
        x: 334,
        y: 222,
        title: "한정우 · 영사기사",
        body: "67세. 짙은 남색 작업복. 말하기 전에 영사기 소리부터 듣는 사람.",
        asset: {
          url: "/sample/portrait.webp",
          type: "image",
          name: "한정우 인물 참조",
        },
      },
      {
        id: "still",
        kind: "keyframe",
        x: 668,
        y: 76,
        title: "영사창 너머",
        body: "장면 01 · 텅스텐 조명 아래 마지막 필름을 거는 정우.",
        asset: {
          url: "/sample/frame.webp",
          type: "image",
          name: "장면 01 키프레임",
        },
      },
      {
        id: "motion",
        kind: "video",
        x: 1002,
        y: 125,
        title: "마지막 불빛",
        body: "장면 01 · 스틸 확대 모션 테스트 · 5초",
        asset: {
          url: "/sample/preview.mp4",
          type: "video",
          name: "5초 모션 테스트",
        },
      },
    ],
    edges: [
      { source: "concept", target: "screenplay" },
      { source: "concept", target: "projectionist" },
      { source: "screenplay", target: "still" },
      { source: "projectionist", target: "still" },
      { source: "still", target: "motion" },
    ],
  },
};
