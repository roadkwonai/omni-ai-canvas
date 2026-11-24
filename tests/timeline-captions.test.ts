import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { unlink } from "node:fs/promises";
import { test } from "node:test";
import { promisify } from "node:util";
import { localAssetPath } from "../lib/media";
import { renderTimeline } from "../lib/timeline";
import {
  serializeTimelineWords,
  wordsFromWhisper,
} from "../lib/timeline-captions";
import { validateTimeline, type TimelineSpec } from "../lib/timeline-spec";

const exec = promisify(execFile);
const base: TimelineSpec = {
  aspect: "16:9",
  clips: [
    {
      nodeId: null,
      durationFrames: 30,
      inFrame: 0,
      transition: "cut",
      transitionFrames: 0,
    },
  ],
  audio: [],
};

test("전사의 토큰을 단어로 묶고 편집 시간축의 구간 위치를 적용한다", () => {
  const token = (text: string, from: number, to: number) => ({
    text,
    offsets: { from, to },
  });
  const input = {
    transcription: [
      {
        tokens: [
          token("[_BEG_]", 0, 50),
          token(" 안녕", 100, 300),
          token("하세요", 300, 500),
          token(" 씬룸", 550, 920),
        ],
      },
    ],
  };
  const words = wordsFromWhisper(input, 28, 30);
  assert.deepEqual(words, [
    { text: "안녕하세요", startFrame: 33, endFrame: 45 },
    { text: "씬룸", startFrame: 47, endFrame: 58 },
  ]);
  assert.equal(validateTimeline({ ...base, words }), false);
  assert.match(
    serializeTimelineWords(words, "srt"),
    /00:00:01,100 --> 00:00:01,500/,
  );
});

test("한글 단어 자막을 실제 MP4의 mov_text 트랙에 보관한다", async () => {
  const words = [{ text: "씬룸", startFrame: 3, endFrame: 18 }];
  assert.ok(validateTimeline({ ...base, words }));
  const asset = await renderTimeline(
    { nodes: [], edges: [] },
    { ...base, words },
  );
  const filename = localAssetPath(asset);
  try {
    const info = await exec("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "s",
      "-show_entries",
      "stream=codec_name",
      "-of",
      "csv=p=0",
      filename,
    ]);
    assert.match(info.stdout, /mov_text/);
    const captions = await exec("ffmpeg", [
      "-v",
      "error",
      "-i",
      filename,
      "-map",
      "0:s:0",
      "-f",
      "srt",
      "-",
    ]);
    assert.match(captions.stdout, /00:00:00,100 --> 00:00:00,600\n씬룸/);
  } finally {
    await unlink(filename);
  }
});
