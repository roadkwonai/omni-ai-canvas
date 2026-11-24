import assert from "node:assert/strict";
import { test } from "node:test";
import {
  estimate,
  higgsfieldArguments,
  parseEstimate,
  parseHiggsfieldJobId,
} from "../lib/runner";
import { snapshotReferences } from "../lib/run-input";
import type { Graph, RunInput } from "../lib/types";

const input: RunInput = {
  projectId: "project",
  requestId: "request",
  nodeId: "video",
  provider: "higgsfield",
  operation: "video",
  prompt: "장면",
  references: [{ title: "기획", body: "참고" }],
};

test("견적과 생성이 동일한 모델 및 요청 설정을 사용한다", () => {
  assert.deepEqual(higgsfieldArguments(input), [
    "seedance_2_5",
    "--prompt=장면\n\n참고 자료\n기획\n참고",
  ]);
  assert.deepEqual(parseEstimate('{"credits":35}'), { estimate: "35 크레딧" });
  assert.equal(parseEstimate('{"credits":-1}').estimate, null);
  assert.equal(parseEstimate("오류").estimate, null);
});

test("제출 응답에서 정확한 한 작업의 ID만 보존한다", () => {
  assert.equal(parseHiggsfieldJobId('["job-123"]'), "job-123");
  assert.equal(parseHiggsfieldJobId('["job-1", "job-2"]'), null);
  assert.equal(parseHiggsfieldJobId('["../secret"]'), null);
});

test("참조 파일은 비용 조회 시 업로드하지 않고 사유를 반환한다", async () => {
  const withAsset: RunInput = {
    ...input,
    references: [
      {
        title: "이미지",
        body: "",
        asset: {
          type: "image",
          url: "/sample/frame.webp",
          name: "missing.png",
        },
      },
    ],
  };
  assert.match((await estimate(withAsset)).reason || "", /업로드하지 않고/);
});

test("현재 노드의 결과 파일은 자동 참조하지 않고 연결된 파일은 참조한다", () => {
  const asset = {
    type: "image" as const,
    url: "/sample/test.png",
    name: "test.png",
  };
  const graph: Graph = {
    nodes: [
      {
        id: "source",
        kind: "keyframe",
        title: "원본",
        body: "",
        x: 0,
        y: 0,
        asset,
      },
      { id: "video", kind: "video", title: "영상", body: "설명", x: 1, y: 0 },
    ],
    edges: [{ source: "source", target: "video" }],
  };
  const refs = snapshotReferences(graph, "source", "image");
  assert.equal(refs[0].asset, undefined);
  assert.equal(
    snapshotReferences(graph, "video", "video")[0].asset?.url,
    asset.url,
  );
});

test("시작·끝·인물·동작 참조를 모델의 각 입력으로 전달하고 중복을 거절한다", async () => {
  const image = {
    type: "image" as const,
    url: "/sample/frame.webp",
    name: "frame.webp",
  };
  const video = {
    type: "video" as const,
    url: "/sample/preview.mp4",
    name: "preview.mp4",
  };
  const references: RunInput["references"] = [
    { title: "시작", body: "닫힌 문", role: "start", asset: image },
    { title: "끝", body: "열린 문", role: "end", asset: image },
    { title: "인물", body: "남색 옷", role: "identity", asset: image },
    { title: "동작", body: "손으로 문을 민다", role: "motion", asset: video },
  ];
  const request = { ...input, references };
  const args = higgsfieldArguments(request);
  for (const flag of [
    "--mode",
    "omni_reference",
    "--start-image",
    "--end-image",
    "--image-references",
    "--video-references",
  ])
    assert.ok(args.includes(flag));
  for (const phrase of ["닫힌 문", "열린 문", "남색 옷", "손으로 문을 민다"])
    assert.ok(args[1].includes(phrase));
  const duplicate = { ...request, references: [...references, references[0]] };
  assert.throws(() => higgsfieldArguments(duplicate), /하나만/);
  assert.match((await estimate(duplicate)).reason ?? "", /하나만/);
  assert.throws(
    () =>
      higgsfieldArguments({
        ...request,
        references: [{ ...references[0], asset: undefined }],
      }),
    /이미지가 필요/,
  );
  assert.throws(
    () =>
      higgsfieldArguments({
        ...request,
        references: [{ ...references[3], asset: image }],
      }),
    /영상이 필요/,
  );
  assert.throws(
    () =>
      higgsfieldArguments({
        ...request,
        references: [{ ...references[3], asset: undefined }],
      }),
    /영상이 필요/,
  );
});
