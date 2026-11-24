import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { exportCuts } from "../lib/cut-export";
import { localAssetPath, storeMedia } from "../lib/media";
import type { Asset, Graph } from "../lib/types";

const exec = promisify(execFile);

test(
  "서로 다른 영상과 무음 장면을 순서대로 MP4로 합친다",
  { timeout: 120_000 },
  async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "scene-room-cut-test-"),
    );
    const assets: Asset[] = [];
    try {
      const red = path.join(directory, "red.mp4");
      const blue = path.join(directory, "blue.mp4");
      await exec("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=red:s=320x240:r=24:d=1",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=1",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-shortest",
        "-y",
        red,
      ]);
      await exec("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=blue:s=640x360:r=15:d=1",
        "-c:v",
        "libx264",
        "-y",
        blue,
      ]);
      assets.push(
        await storeMedia(await readFile(red), "red.mp4"),
        await storeMedia(await readFile(blue), "blue.mp4"),
      );
      const graph: Graph = {
        nodes: assets.map((asset, index) => ({
          id: String(index),
          kind: "video",
          title: "컷",
          body: "",
          x: 0,
          y: 0,
          asset,
        })),
        edges: [],
      };
      await assert.rejects(exportCuts(graph, ["0", "0"]), /중복/);
      await assert.rejects(exportCuts(graph, ["missing"]), /영상 노드/);
      const result = await exportCuts(graph, ["0", "1"]);
      assets.push(result);
      const resultPath = localAssetPath(result);
      const { stdout } = await exec("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,codec_name,width,height",
        "-of",
        "json",
        resultPath,
      ]);
      const probe = JSON.parse(stdout);
      assert.ok(
        Number(probe.format.duration) >= 1.9 &&
          Number(probe.format.duration) < 2.3,
      );
      assert.ok(
        probe.streams.some(
          (stream: { codec_name: string; width: number; height: number }) =>
            stream.codec_name === "h264" &&
            stream.width === 1280 &&
            stream.height === 720,
        ),
      );
      assert.ok(
        probe.streams.some(
          (stream: { codec_name: string }) => stream.codec_name === "aac",
        ),
      );
      for (const [time, dominant] of [
        ["0.5", 0],
        ["1.5", 2],
      ] as const) {
        const frame = await exec(
          "ffmpeg",
          [
            "-v",
            "error",
            "-ss",
            time,
            "-i",
            resultPath,
            "-vf",
            "crop=2:2:iw/2:ih/2,scale=1:1",
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
          ],
          { encoding: "buffer" },
        );
        assert.ok(
          frame.stdout[dominant] > 180 && frame.stdout[2 - dominant] < 60,
        );
      }
    } finally {
      await Promise.all(
        assets.map((asset) => rm(localAssetPath(asset), { force: true })),
      );
      await rm(directory, { recursive: true, force: true });
    }
  },
);
