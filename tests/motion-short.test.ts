import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, unlink, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import sharp from "sharp";
import { localAssetPath, storeMedia } from "../lib/media";
import { validateGraph } from "../lib/graph";
import { addProductionGraph } from "../lib/production-template";
import { renderMotionShort } from "../lib/motion-short";
import {
  parseMotionShort,
  scenesFromBeats,
  type MotionShortSpec,
} from "../lib/motion-short-spec";

const exec = promisify(execFile);
async function frameAt(file: string, second: number) {
  const { stdout } = await exec(
    "ffmpeg",
    ["-v", "error", "-ss", String(second), "-i", file, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"],
    { encoding: "buffer", maxBuffer: 8_000_000 },
  );
  return stdout;
}
test("기존 모션 노드의 소수 초 장면 길이를 다시 편집할 수 있다", () => {
  const saved = { ...spec, scenes: [{ text: "기존 컷", seconds: 2.25 }] };
  assert.deepEqual(parseMotionShort(saved), saved);
});
const spec: MotionShortSpec = {
  scenes: [{ text: "한글 화면 <테스트>", seconds: 1 }],
  aspect: "9:16",
  background: "#1a1c20",
  foreground: "#ffffff",
  layout: "center",
  motion: "fade",
};

test("손상된 장면 캐시는 다시 렌더해 복구한다", { timeout: 60000 }, async () => {
  const projectId = crypto.randomUUID();
  const directory = path.join(process.cwd(), ".scene-room", "motion-cache", projectId);
  const outputs: string[] = [];
  let report: { reused: number[]; rendered: number[] } | undefined;
  try {
    const first = await renderMotionShort(spec, { projectId, report: (value) => { report = value; } });
    outputs.push(localAssetPath(first));
    assert.deepEqual(report?.rendered, [1]);
    const names = (await readdir(directory)).filter((name) => name.endsWith(".mp4"));
    assert.equal(names.length, 1);
    await writeFile(path.join(directory, names[0]), Buffer.from("broken video"));
    const second = await renderMotionShort(spec, { projectId, report: (value) => { report = value; } });
    outputs.push(localAssetPath(second));
    assert.deepEqual(report?.rendered, [1]);
    assert.deepEqual(report?.reused, []);
    const third = await renderMotionShort(spec, { projectId, report: (value) => { report = value; } });
    outputs.push(localAssetPath(third));
    assert.deepEqual(report?.reused, [1]);
  } finally {
    await Promise.all(outputs.map((file) => unlink(file).catch(() => {})));
    await rm(directory, { recursive: true, force: true });
  }
});

test("장면·색상·길이와 허용되지 않은 입력을 검증한다", () => {
  assert.ok(parseMotionShort(spec));
  assert.equal(parseMotionShort({ ...spec, background: "red;evil" }), null);
  assert.equal(
    parseMotionShort({ ...spec, scenes: [{ text: "", seconds: 1 }] }),
    null,
  );
  assert.equal(
    parseMotionShort({
      ...spec,
      scenes: Array.from({ length: 21 }, () => ({ text: "장면", seconds: 30 })),
    }),
    null,
  );
});

test("선택한 비트 구간 길이를 조정하고 문구는 사용자가 작성한다", () => {
  const beats = [{ endPercent: 10 }, { endPercent: 40 }, { endPercent: 100 }];
  const scenes = scenesFromBeats(beats, [2, 0]);
  assert.deepEqual(scenes, [
    { text: "", seconds: 3.5 },
    { text: "", seconds: 8 },
  ]);
  assert.deepEqual(scenesFromBeats(beats, [0, 0]), []);
  assert.deepEqual(scenesFromBeats(beats, [3]), []);
});

test("영상 노드에 렌더 설정을 보관하고 보드 복사와 JSON 복원에서 유지한다", () => {
  const node = {
    id: "motion",
    kind: "video" as const,
    title: "숏",
    body: "",
    x: 0,
    y: 0,
    motionShort: spec,
  };
  const graph = { nodes: [node], edges: [] };
  assert.equal(validateGraph(graph), true);
  assert.equal(
    validateGraph({ nodes: [{ ...node, kind: "script" }], edges: [] }),
    false,
  );
  assert.equal(
    validateGraph({
      nodes: [{ ...node, motionShort: { ...spec, aspect: "invalid" } }],
      edges: [],
    }),
    false,
  );
  const copied = addProductionGraph({ nodes: [], edges: [] }, graph);
  const restored = JSON.parse(JSON.stringify(copied));
  assert.equal(validateGraph(restored), true);
  assert.deepEqual(restored.nodes[0].motionShort, spec);
});

test("각 움직임으로 한글이 표시되는 재생 가능한 MP4를 만든다", async () => {
  for (const motion of ["fade", "zoom", "rise"] as const) {
    const asset = await renderMotionShort({ ...spec, motion });
    const file = localAssetPath(asset);
    try {
      const { stdout } = await exec("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=width,height",
        "-of",
        "json",
        file,
      ]);
      const probe = JSON.parse(stdout);
      assert.equal(probe.streams[0].width, 720);
      assert.equal(probe.streams[0].height, 1280);
      assert.ok(Math.abs(Number(probe.format.duration) - 1) < 0.15);
      const frame = await exec(
        "ffmpeg",
        [
          "-v",
          "error",
          "-ss",
          "0.5",
          "-i",
          file,
          "-frames:v",
          "1",
          "-f",
          "image2pipe",
          "-vcodec",
          "png",
          "-",
        ],
        { encoding: "buffer", maxBuffer: 8_000_000 },
      );
      const { data } = await sharp(frame.stdout)
        .raw()
        .toBuffer({ resolveWithObject: true });
      let brightPixels = 0;
      for (let i = 0; i < data.length; i += 3)
        if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200)
          brightPixels++;
      assert.ok(brightPixels > 200, `문구가 표시되어야 합니다 (${motion})`);
      assert.ok((await readFile(file)).length > 1000);
    } finally {
      await unlink(file);
    }
  }
});

test("레시피와 프로젝트 이미지 설정을 저장하고 잘못된 데이터는 거절한다", () => {
  const image = {
    type: "image" as const,
    name: "인물",
    url: "/sample/portrait.webp",
  };
  const design = {
    ...spec,
    accent: "#ff6600",
    easing: "snappy",
    scenes: [
      {
        text: "진행률",
        seconds: 2,
        recipe: "number",
        value: 74,
        detail: "결과",
      },
      { text: "인물", seconds: 2, recipe: "parallax", image },
    ],
  };
  assert.deepEqual(parseMotionShort(design), design);
  assert.equal(
    parseMotionShort({
      ...design,
      scenes: [{ text: "실패", seconds: 2, recipe: "parallax" }],
    }),
    null,
  );
  assert.equal(
    parseMotionShort({
      ...design,
      scenes: [{ text: "실패", seconds: 2, recipe: "number", value: 101 }],
    }),
    null,
  );
  assert.equal(
    parseMotionShort({
      ...design,
      scenes: [
        {
          text: "실패",
          seconds: 2,
          recipe: "parallax",
          image: { ...image, url: "/etc/passwd" },
        },
      ],
    }),
    null,
  );
});

test(
  "투명 캐릭터가 배경과 분리되어 움직이고 말풍선과 합성된다",
  { timeout: 60000 },
  async () => {
    const png = await sharp(
      Buffer.from(
        '<svg width="200" height="300" xmlns="http://www.w3.org/2000/svg"><circle cx="100" cy="70" r="50" fill="#ffffff"/><rect x="30" y="120" width="140" height="150" fill="#ff6600"/></svg>',
      ),
    )
      .png()
      .toBuffer();
    const character = await storeMedia(png, "캐릭터.png", "image");
    let output;
    try {
      const scene = {
        text: "안녕하세요",
        seconds: 3,
        recipe: "character" as const,
        character,
      };
      assert.ok(parseMotionShort({ ...spec, scenes: [scene] }));
      assert.equal(
        parseMotionShort({
          ...spec,
          scenes: [{ ...scene, character: undefined }],
        }),
        null,
      );
      output = await renderMotionShort({
        ...spec,
        aspect: "16:9",
        scenes: [
          scene,
          {
            ...scene,
            seconds: 1,
            image: { type: "image", name: "배경", url: "/sample/portrait.webp" },
          },
        ],
      });
      const file = localAssetPath(output);
      const frames = [];
      for (const second of [0.8, 1.5]) {
        frames.push(
          await sharp(await frameAt(file, second))
            .extract({ left: 50, top: 150, width: 500, height: 500 })
            .raw()
            .toBuffer(),
        );
      }
      // 주황 몸통의 폭과 진하기로 크기 변화와 페이드를 확인한다.
      const bodyAt = async (second: number) => {
        const row = await sharp(await frameAt(file, second))
          .extract({ left: 100, top: 480, width: 420, height: 1 })
          .removeAlpha()
          .raw()
          .toBuffer();
        const reds = Array.from({ length: 420 }, (_, x) => row[x * 3]);
        const peak = Math.max(...reds);
        return { peak, width: reds.filter((red) => red > (peak + 26) / 2).length };
      };
      const fading = await bodyAt(0.25);
      const large = await bodyAt(0.8);
      const small = await bodyAt(2.35);
      assert.ok(fading.peak > 60 && fading.peak < large.peak - 60, "캐릭터가 서서히 나타나야 합니다.");
      assert.ok(large.width - small.width >= 4, "캐릭터 크기가 시간에 따라 바뀌어야 합니다.");
      const overImage = await sharp(await frameAt(file, 3.6))
        .extract({ left: 300, top: 480, width: 1, height: 1 })
        .removeAlpha()
        .raw()
        .toBuffer();
      assert.ok(overImage[0] > 200 && overImage[2] < 80, "배경 이미지 위에도 캐릭터가 보여야 합니다.");
      assert.notDeepEqual(frames[0], frames[1]);
    } finally {
      await unlink(localAssetPath(character));
      if (output) await unlink(localAssetPath(output));
    }
  },
);

test(
  "레시피별 화면과 45초보다 긴 여러 장면을 로컬 MP4로 렌더한다",
  { timeout: 120000 },
  async () => {
    const image = {
      type: "image" as const,
      name: "인물",
      url: "/sample/portrait.webp",
    };
    const asset = await renderMotionShort({
      ...spec,
      aspect: "16:9",
      motion: "rise",
      accent: "#ff6600",
      easing: "snappy",
      scenes: [
        { text: "도입", seconds: 1, recipe: "type" },
        { text: "진행", seconds: 1, recipe: "number", value: 74 },
        {
          text: "순서",
          seconds: 1,
          recipe: "steps",
          detail: "준비 / 촬영 / 완성",
        },
        { text: "카드", seconds: 1, recipe: "cards" },
        { text: "인물", seconds: 1, recipe: "parallax", image },
        { text: "긴 장면", seconds: 30 },
        { text: "마무리", seconds: 12 },
      ],
    });
    const file = localAssetPath(asset);
    try {
      const { stdout } = await exec("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        file,
      ]);
      assert.ok(
        Math.abs(Number(JSON.parse(stdout).format.duration) - 47) < 0.4,
      );
      const snapshots = [];
      for (const second of [1.5, 2.5, 3.5, 4.5]) {
        const frame = await exec(
          "ffmpeg",
          [
            "-v",
            "error",
            "-ss",
            String(second),
            "-i",
            file,
            "-frames:v",
            "1",
            "-f",
            "image2pipe",
            "-vcodec",
            "png",
            "-",
          ],
          { encoding: "buffer", maxBuffer: 8_000_000 },
        );
        snapshots.push(
          await sharp(frame.stdout).resize(16, 9).raw().toBuffer(),
        );
      }
      assert.equal(
        new Set(snapshots.map((item) => item.toString("base64"))).size,
        4,
      );
      for (const start of [1, 2]) {
        const frames = [];
        for (const offset of [0.3, 0.7]) {
          const frame = await exec(
            "ffmpeg",
            [
              "-v",
              "error",
              "-ss",
              String(start + offset),
              "-i",
              file,
              "-frames:v",
              "1",
              "-f",
              "image2pipe",
              "-vcodec",
              "png",
              "-",
            ],
            { encoding: "buffer", maxBuffer: 8_000_000 },
          );
          frames.push(
            await sharp(frame.stdout)
              .extract({ left: 150, top: 240, width: 980, height: 250 })
              .raw()
              .toBuffer(),
          );
        }
        assert.notDeepEqual(
          frames[0],
          frames[1],
          "숫자와 단계가 시간에 따라 변화해야 합니다.",
        );
      }
    } finally {
      await unlink(file);
    }
  },
);
