import assert from "node:assert/strict";
import { test } from "node:test";
import { parseVideoOptions } from "../lib/video-options";
import { estimate, higgsfieldArguments } from "../lib/runner";
import type { RunInput } from "../lib/types";

const video = {
  type: "video" as const,
  url: "/sample/preview.mp4",
  name: "video.mp4",
};
const image = {
  type: "image" as const,
  url: "/sample/frame.webp",
  name: "frame.webp",
};
const base: RunInput = {
  projectId: "p",
  requestId: "r",
  nodeId: "n",
  provider: "higgsfield",
  operation: "video",
  prompt: "장면",
  references: [],
};

test("영상 설정의 모드별 허용 조합을 검사한다", () => {
  assert.deepEqual(
    parseVideoOptions({
      mode: "auto",
      aspect: "9:16",
      duration: 8,
      resolution: "720p",
    }),
    { mode: "auto", aspect: "9:16", duration: 8, resolution: "720p" },
  );
  for (const invalid of [
    { mode: "auto", duration: 4 },
    { mode: "auto", resolution: "4k" },
    { mode: "auto", direction: "forward" },
    { mode: "remake", aspect: "9:16" },
    { mode: "remake", duration: 5 },
    { mode: "extend", aspect: "1:1" },
    { mode: "extend", direction: "sideways" },
    { mode: "extend", extra: true },
  ])
    assert.equal(parseVideoOptions(invalid), null);
});

test("영상 리메이크·이어쓰기는 원본과 역할을 확인하고 CLI 모드를 명시한다", async () => {
  const source = {
    title: "원본",
    body: "",
    role: "motion" as const,
    asset: video,
  };
  const remake = {
    ...base,
    references: [source],
    videoOptions: { mode: "remake", resolution: "720p" } as const,
  };
  const args = higgsfieldArguments(remake);
  assert.ok(args.includes("video_edit"));
  assert.ok(args.includes("--video-references"));
  assert.ok(args.includes("--resolution"));
  const extended = higgsfieldArguments({
    ...remake,
    videoOptions: { mode: "extend", direction: "backward", duration: 10 },
  });
  assert.ok(extended.includes("video_extension"));
  assert.equal(extended[extended.indexOf("--extension-mode") + 1], "backward");
  assert.equal(extended[extended.indexOf("--duration") + 1], "10");
  const defaultDirection = higgsfieldArguments({
    ...remake,
    videoOptions: { mode: "extend" },
  });
  assert.equal(
    defaultDirection[defaultDirection.indexOf("--extension-mode") + 1],
    "forward",
  );
  assert.throws(
    () => higgsfieldArguments({ ...base, videoOptions: { mode: "extend" } }),
    /원본 영상/,
  );
  assert.throws(
    () => higgsfieldArguments({ ...remake, references: [source, source] }),
    /원본 영상/,
  );
  assert.throws(
    () =>
      higgsfieldArguments({
        ...remake,
        references: [
          source,
          { title: "시작", body: "", role: "start", asset: image },
        ],
      }),
    /시작·끝/,
  );
  assert.match(
    (await estimate({ ...remake, references: [] })).reason || "",
    /원본 영상/,
  );
  assert.match((await estimate(remake)).reason || "", /업로드하지 않고/);
});

test("자동 모드는 기존 참조와 포맷 옵션을 정확히 전달한다", () => {
  const args = higgsfieldArguments({
    ...base,
    references: [{ title: "시작", body: "", role: "start", asset: image }],
    videoOptions: { mode: "auto", aspect: "9:16", duration: 5 },
  });
  assert.ok(args.includes("omni_reference"));
  assert.equal(args[args.indexOf("--aspect-ratio") + 1], "9:16");
  assert.equal(args[args.indexOf("--duration") + 1], "5");
  assert.ok(args.includes("--start-image"));
});
