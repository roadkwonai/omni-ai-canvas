import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { runClipTool } from "../lib/clip-tools";
import { localAssetPath, storeMedia } from "../lib/media";
import type { Asset, Graph } from "../lib/types";

const exec = promisify(execFile);

test("로컬 영상 프레임·시트·음향 추출과 영상/음향 편집은 새 파일을 만든다", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "clip-test-"));
  const stored: Asset[] = [];
  try {
    const source = path.join(tmp, "source.mp4");
    await exec("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=160x90:rate=12:duration=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=8000:duration=2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      "-y",
      source,
    ]);
    const asset = await storeMedia(await readFile(source), "원본.mp4");
    stored.push(asset);
    const graph: Graph = {
      nodes: [
        { id: "v", kind: "video", title: "원본", body: "", x: 0, y: 0, asset },
      ],
      edges: [],
    };
    const info = await runClipTool(graph, { nodeId: "v", action: "inspect" });
    assert.ok(info.duration >= 1.9 && info.hasAudio);
    const frame = await runClipTool(graph, {
      nodeId: "v",
      action: "frame",
      start: 0.5,
      end: 1,
    });
    assert.equal(frame.kind, "keyframe");
    assert.equal(frame.asset?.type, "image");
    stored.push(frame.asset!);
    const sheet = await runClipTool(graph, {
      nodeId: "v",
      action: "sheet",
      start: 0,
      end: 2,
    });
    assert.equal(sheet.kind, "referenceImage");
    stored.push(sheet.asset!);
    const dimensions = (
      await exec("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0",
        localAssetPath(sheet.asset!),
      ])
    ).stdout.trim();
    assert.equal(dimensions, "960,540");
    const audio = await runClipTool(graph, {
      nodeId: "v",
      action: "audio",
      start: 0,
      end: 1,
      speed: 2,
    });
    assert.equal(audio.kind, "audioCue");
    assert.equal(audio.asset?.type, "audio");
    stored.push(audio.asset!);
    const audioDuration = Number(
      (
        await exec("ffprobe", [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "csv=p=0",
          localAssetPath(audio.asset!),
        ])
      ).stdout.trim(),
    );
    assert.ok(audioDuration > 0.9 && audioDuration < 1.1);
    const trimmed = await runClipTool(graph, {
      nodeId: "v",
      action: "trim",
      start: 0,
      end: 2,
      speed: 2,
      aspect: "9:16",
    });
    assert.equal(trimmed.asset?.type, "video");
    stored.push(trimmed.asset!);
    const probe = JSON.parse(
      (
        await exec("ffprobe", [
          "-v",
          "error",
          "-show_entries",
          "stream=width,height:format=duration",
          "-of",
          "json",
          localAssetPath(trimmed.asset!),
        ])
      ).stdout,
    );
    assert.deepEqual(
      [probe.streams[0].width, probe.streams[0].height],
      [720, 1280],
    );
    assert.ok(
      Number(probe.format.duration) > 0.8 &&
        Number(probe.format.duration) < 1.3,
    );
    const audioGraph: Graph = {
      nodes: [
        {
          id: "a",
          kind: "audioCue",
          title: "오디오",
          body: "",
          x: 0,
          y: 0,
          asset: audio.asset,
        },
      ],
      edges: [],
    };
    const audioTrim = await runClipTool(audioGraph, {
      nodeId: "a",
      action: "trim",
      start: 0,
      end: 0.5,
      speed: 0.5,
    });
    stored.push(audioTrim.asset!);
    assert.equal(audioTrim.asset?.type, "audio");
    await assert.rejects(
      runClipTool(graph, { nodeId: "v", action: "trim", start: 1, end: 4 }),
      /원본 길이/,
    );
    const silent: Graph = {
      nodes: [
        {
          id: "v",
          kind: "video",
          title: "무음",
          body: "",
          x: 0,
          y: 0,
          asset: {
            url: "/sample/preview.mp4",
            type: "video",
            name: "preview.mp4",
          },
        },
      ],
      edges: [],
    };
    await assert.rejects(
      runClipTool(silent, { nodeId: "v", action: "audio" }),
      /오디오가 없습니다/,
    );
    assert.deepEqual(
      await readFile(localAssetPath(asset)),
      await readFile(source),
    );
  } finally {
    await Promise.all(
      stored.map((asset) => rm(localAssetPath(asset), { force: true })),
    );
    await rm(tmp, { recursive: true, force: true });
  }
});
