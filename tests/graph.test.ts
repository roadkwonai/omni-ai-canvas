import test from "node:test";
import assert from "node:assert/strict";
import { canConnect, validateGraph } from "../lib/graph";
import { localOrigin, localRequest } from "../lib/http";
import { sampleProject } from "../lib/sample";

test("예제와 다중 참조를 허용하고 역방향 순환·중복·없는 노드를 거절한다", () => {
  const graph = sampleProject.graph;
  assert.equal(validateGraph(graph), true);
  assert.equal(canConnect(graph, "projectionist", "motion"), true);
  for (const [from, to] of [
    ["motion", "concept"],
    ["still", "still"],
    ["still", "motion"],
    ["missing", "motion"],
  ]) {
    assert.equal(canConnect(graph, from, to), false);
  }
  assert.equal(
    validateGraph({ nodes: [graph.nodes[0], graph.nodes[0]], edges: [] }),
    false,
  );
  assert.equal(
    validateGraph({ nodes: [{ ...graph.nodes[0], x: NaN }], edges: [] }),
    false,
  );
});
test("참조 노드 자산과 연결 역할을 검증하고 기존 연결을 허용한다", () => {
  const base = { title: "", body: "", x: 0, y: 0 };
  const graph = {
    nodes: [
      {
        ...base,
        id: "image",
        kind: "referenceImage",
        asset: { url: "/sample/frame.webp", type: "image", name: "이미지" },
      },
      {
        ...base,
        id: "video",
        kind: "referenceVideo",
        asset: { url: "/sample/preview.mp4", type: "video", name: "영상" },
      },
      { ...base, id: "shot", kind: "shot" },
      { ...base, id: "scenario", kind: "scenario" },
      { ...base, id: "scene", kind: "scene" },
    ],
    edges: [
      { source: "image", target: "shot", usage: "input", role: "start" },
      { source: "video", target: "shot", usage: "guide", role: "motion" },
      { source: "scenario", target: "scene" },
    ],
  };
  assert.equal(validateGraph(graph), true);
  assert.equal(
    validateGraph({
      ...graph,
      edges: [{ source: "video", target: "shot", role: "start" }],
    }),
    false,
  );
  assert.equal(
    validateGraph({
      ...graph,
      edges: [{ source: "image", target: "shot", role: "motion" }],
    }),
    false,
  );
  assert.equal(
    validateGraph({
      ...graph,
      edges: [{ source: "image", target: "shot", usage: "invalid" }],
    }),
    false,
  );
  assert.equal(
    validateGraph({
      ...graph,
      edges: [{ source: "image", target: "shot", role: "invalid" }],
    }),
    false,
  );
  assert.equal(
    validateGraph({
      ...graph,
      nodes: [
        {
          ...graph.nodes[1],
          asset: { url: "/sample/frame.webp", type: "image", name: "이미지" },
        },
      ],
      edges: [],
    }),
    false,
  );
  assert.equal(
    validateGraph({
      ...graph,
      edges: [
        ...graph.edges,
        { source: "image", target: "shot", role: "look" },
      ],
    }),
    false,
  );
});
test("데이터 API는 루프백과 같은 출처에서만 브라우저 변경을 허용한다", () => {
  function check(host: string, origin: string) {
    return localRequest(
      new Request("http://127.0.0.1/api/projects", {
        method: "POST",
        headers: { host, origin },
      }),
    )?.status;
  }
  assert.equal(check("127.0.0.1:3000", "http://127.0.0.1:3000"), undefined);
  assert.equal(check("example.org", "http://example.org"), 403);
  assert.equal(check("localhost:3000", "https://example.org"), 403);
});

test("OAuth 콜백 주소는 Next.js가 정규화한 URL 대신 브라우저의 로컬 호스트를 사용한다", () => {
  const request = (host: string) => new Request("http://localhost:3000/api/providers/topview/connect", {
    headers: { host },
  });
  assert.equal(localOrigin(request("127.0.0.1:3000")), "http://127.0.0.1:3000");
  assert.equal(localOrigin(request("localhost:3000")), "http://localhost:3000");
  assert.equal(localOrigin(request("example.org")), null);
});

test("간편 내보내기는 채택한 테이크와 렌더된 타임라인을 포함하고 참고 소스는 따로 둔다", async () => {
  const { isCutSource } = await import("../lib/types");
  const video = sampleProject.graph.nodes.find(
    (node) => node.kind === "video",
  )!;
  assert(isCutSource({ ...video, kind: "switch" }));
  assert(isCutSource({ ...video, kind: "previs" }));
  assert(!isCutSource({ ...video, kind: "referenceVideo" }));
  assert(!isCutSource({ ...video, asset: undefined }));
});
