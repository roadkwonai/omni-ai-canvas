import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { localAssetPath, storeMedia } from "../lib/media";
import {
  remapTimeline,
  validateTimeline,
  type TimelineSpec,
} from "../lib/timeline-spec";
import { renderTimeline, slateLines, timelineWarnings } from "../lib/timeline";
import type { Asset, Graph } from "../lib/types";
const exec = promisify(execFile);

const spec: TimelineSpec = {
  aspect: "16:9",
  clips: [
    {
      nodeId: "one",
      durationFrames: 30,
      inFrame: 0,
      transition: "cut",
      transitionFrames: 0,
    },
    {
      nodeId: "two",
      durationFrames: 30,
      inFrame: 0,
      transition: "cut",
      transitionFrames: 0,
    },
  ],
  audio: [
    {
      nodeId: "sound",
      startFrame: 30,
      inFrame: 0,
      durationFrames: 15,
      gain: 1,
      fadeInFrames: 0,
      fadeOutFrames: 0,
    },
  ],
};

test("타임라인의 범위·전환·참조 재매핑을 확인한다", () => {
  assert.ok(validateTimeline(spec));
  assert.ok(
    !validateTimeline({
      ...spec,
      audio: [{ ...spec.audio[0], startFrame: 60 }],
    }),
  );
  assert.ok(
    !validateTimeline({
      ...spec,
      clips: [
        { ...spec.clips[0], transition: "dissolve", transitionFrames: 15 },
      ],
    }),
  );
  const remapped = remapTimeline(
    spec,
    new Map([
      ["one", "copy"],
      ["two", null],
      ["sound", null],
    ]),
  );
  assert.deepEqual(
    remapped.clips.map((item) => item.nodeId),
    ["copy", null],
  );
  assert.deepEqual(remapped.audio, []);
});

test("7분·60컷·40개 음향 경계와 초과를 검증한다", () => {
  const full: TimelineSpec = {
    aspect: "16:9",
    clips: Array.from({ length: 60 }, () => ({
      nodeId: null,
      durationFrames: 210,
      inFrame: 0,
      transition: "cut",
      transitionFrames: 0,
    })),
    audio: Array.from({ length: 40 }, (_, index) => ({
      nodeId: `audio-${index}`,
      startFrame: 12_599,
      inFrame: 12_600,
      durationFrames: 1,
      gain: 1,
      fadeInFrames: 1,
      fadeOutFrames: 1,
    })),
  };
  assert.ok(validateTimeline(full));
  assert.ok(
    !validateTimeline({ ...full, clips: [...full.clips, full.clips[0]] }),
  );
  assert.ok(
    !validateTimeline({ ...full, audio: [...full.audio, full.audio[0]] }),
  );
  assert.ok(
    !validateTimeline({
      ...full,
      clips: [
        { ...full.clips[0], durationFrames: 211 },
        ...full.clips.slice(1),
      ],
    }),
  );
  assert.ok(
    !validateTimeline({
      ...full,
      audio: [{ ...full.audio[0], startFrame: 12_600 }, ...full.audio.slice(1)],
    }),
  );
});

test(
  "비어 있는 카드도 세로 프리비즈로 재생된다",
  { timeout: 120_000 },
  async () => {
    const asset = await renderTimeline(
      { nodes: [], edges: [] },
      {
        aspect: "9:16",
        clips: [
          {
            nodeId: null,
            durationFrames: 15,
            inFrame: 0,
            transition: "cut",
            transitionFrames: 0,
          },
        ],
        audio: [],
      },
    );
    try {
      const probe = JSON.parse(
        (
          await exec("ffprobe", [
            "-v",
            "error",
            "-show_entries",
            "stream=width,height",
            "-of",
            "json",
            localAssetPath(asset),
          ])
        ).stdout,
      );
      assert.ok(
        probe.streams.some(
          (stream: { width: number; height: number }) =>
            stream.width === 720 && stream.height === 1280,
        ),
      );
    } finally {
      await rm(localAssetPath(asset), { force: true });
    }
  },
);

test(
  "미생성 컷은 지시가 표시된 슬레이트로, 미생성 음향은 무음으로 출력한다",
  { timeout: 120_000 },
  async () => {
    const graph: Graph = {
      nodes: [
        {
          id: "shot",
          kind: "shot",
          title: "테스트 샷 <A>",
          body: "인물이 창문을 바라본다",
          x: 0,
          y: 0,
        },
        {
          id: "sound",
          kind: "audioCue",
          title: "배경음",
          body: "",
          x: 0,
          y: 0,
        },
      ],
      edges: [],
    };
    const draft: TimelineSpec = {
      aspect: "16:9",
      clips: [
        {
          nodeId: "shot",
          durationFrames: 30,
          inFrame: 0,
          transition: "cut",
          transitionFrames: 0,
        },
      ],
      audio: [
        {
          nodeId: "sound",
          startFrame: 0,
          inFrame: 0,
          durationFrames: 30,
          gain: 1,
          fadeInFrames: 0,
          fadeOutFrames: 0,
        },
      ],
    };
    assert.deepEqual(slateLines("테스트 샷 <A>", "인물이 창문을 바라본다"), [
      "테스트 샷 <A>",
      "인물이 창문을 바라본다",
    ]);
    assert.match(
      timelineWarnings(graph, draft).join(" "),
      /테스트 샷.*슬레이트.*배경음.*무음/,
    );
    await assert.rejects(
      renderTimeline(graph, draft, "final"),
      /빈 컷이나 파일이 없는 음향/,
    );
    const asset = await renderTimeline(graph, draft, "preview");
    try {
      const frame = (
        await exec(
          "ffmpeg",
          [
            "-v",
            "error",
            "-ss",
            "0.5",
            "-i",
            localAssetPath(asset),
            "-vf",
            "scale=320:180",
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
          ],
          { encoding: "buffer" },
        )
      ).stdout;
      let bright = 0;
      for (let i = 0; i + 2 < frame.length; i += 3)
        if (frame[i] > 160 && frame[i + 1] > 160 && frame[i + 2] > 160)
          bright++;
      assert.ok(bright > 20, "슬레이트에 글자가 렌더되어야 합니다");
      const sound = (
        await exec(
          "ffmpeg",
          [
            "-v",
            "error",
            "-i",
            localAssetPath(asset),
            "-f",
            "s16le",
            "-ac",
            "1",
            "-ar",
            "8000",
            "pipe:1",
          ],
          { encoding: "buffer" },
        )
      ).stdout;
      assert.ok(
        sound.every((byte) => byte === 0),
        "미생성 음향은 무음이어야 합니다",
      );
    } finally {
      await rm(localAssetPath(asset), { force: true });
    }
    const missing = {
      ...graph,
      nodes: [
        {
          ...graph.nodes[0],
          asset: {
            url: "/api/assets/00000000-0000-4000-8000-000000000000.mp4",
            type: "video" as const,
            name: "missing.mp4",
          },
        },
        graph.nodes[1],
      ],
    };
    await assert.rejects(
      renderTimeline(missing, draft, "preview"),
      /원본 파일을 찾을 수 없습니다/,
    );
  },
);

test(
  "영상 원음과 이미지 컷, 지연된 효과음 및 디졸브를 렌더한다",
  { timeout: 120_000 },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "timeline-test-"));
    const assets: Asset[] = [];
    try {
      const red = path.join(dir, "red.mp4"),
        blue = path.join(dir, "blue.png"),
        sound = path.join(dir, "sound.wav");
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
        "color=blue:s=320x240",
        "-frames:v",
        "1",
        "-y",
        blue,
      ]);
      await exec("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=1000:duration=1",
        "-y",
        sound,
      ]);
      assets.push(
        await storeMedia(await readFile(red), "red.mp4"),
        await storeMedia(await readFile(blue), "blue.png"),
        await storeMedia(await readFile(sound), "sound.wav"),
      );
      const graph: Graph = {
        nodes: [
          {
            id: "one",
            kind: "video",
            title: "빨강",
            body: "",
            x: 0,
            y: 0,
            asset: assets[0],
          },
          {
            id: "two",
            kind: "keyframe",
            title: "파랑",
            body: "",
            x: 0,
            y: 0,
            asset: assets[1],
          },
          {
            id: "sound",
            kind: "audioCue",
            title: "효과음",
            body: "",
            x: 0,
            y: 0,
            asset: assets[2],
          },
        ],
        edges: [],
      };
      const result = await renderTimeline(graph, spec);
      assets.push(result);
      const final = await renderTimeline(
        graph,
        { ...spec, clips: [spec.clips[0]], audio: [] },
        "final",
      );
      assets.push(final);
      assert.equal(final.name, "Omni AI Canvas-납품본.mp4");
      const file = localAssetPath(result);
      const probe = JSON.parse(
        (
          await exec("ffprobe", [
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_name",
            "-of",
            "json",
            file,
          ])
        ).stdout,
      );
      assert.ok(
        Number(probe.format.duration) >= 1.95 &&
          Number(probe.format.duration) < 2.1,
      );
      assert.ok(
        probe.streams.some(
          (item: { codec_name: string }) => item.codec_name === "aac",
        ),
      );
      for (const [time, channel] of [
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
            file,
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
          frame.stdout[channel] > 180 && frame.stdout[2 - channel] < 60,
        );
      }
      const rms = async (time: string) => {
        const pcm = (
          await exec(
            "ffmpeg",
            [
              "-v",
              "error",
              "-ss",
              time,
              "-t",
              "0.15",
              "-i",
              file,
              "-f",
              "s16le",
              "-ac",
              "1",
              "-ar",
              "8000",
              "pipe:1",
            ],
            { encoding: "buffer" },
          )
        ).stdout;
        let sum = 0;
        for (let i = 0; i + 1 < pcm.length; i += 2)
          sum += pcm.readInt16LE(i) ** 2;
        return Math.sqrt(sum / (pcm.length / 2));
      };
      assert.ok((await rms("0.4")) > 300, "원본 음성이 유지되어야 합니다");
      assert.ok((await rms("1.1")) > 300, "1초부터 효과음이 재생되어야 합니다");
      assert.ok((await rms("1.7")) < 100, "효과음이 끝나면 무음이어야 합니다");
      const fade = await renderTimeline(graph, {
        ...spec,
        clips: [
          spec.clips[0],
          { ...spec.clips[1], transition: "dissolve", transitionFrames: 15 },
        ],
        audio: [],
      });
      assets.push(fade);
      const fadeProbe = JSON.parse(
        (
          await exec("ffprobe", [
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            localAssetPath(fade),
          ])
        ).stdout,
      );
      assert.ok(
        Number(fadeProbe.format.duration) >= 1.45 &&
          Number(fadeProbe.format.duration) < 1.65,
      );
    } finally {
      await Promise.all(
        assets.map((asset) => rm(localAssetPath(asset), { force: true })),
      );
      await rm(dir, { recursive: true, force: true });
    }
  },
);
