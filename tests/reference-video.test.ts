import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import {
  inspectAttachmentFile,
  selectReferenceFrameTimes,
} from "../lib/attachment-files";
import { localAssetPath } from "../lib/media";
import { canonicalYouTubeUrl } from "../lib/reference-video";

const exec = promisify(execFile);

test("화면 변화 앞뒤와 전체 시간에서 프레임을 선택한다", () => {
  const times = selectReferenceFrameTimes(30, [4, 12, 25]);
  assert.equal(times.length, 8);
  assert.ok(times.includes(3.75) && times.includes(4.25));
  assert.ok(times.includes(24.75) && times.includes(25.25));
  assert.ok(times.some((time) => time < 5) && times.some((time) => time > 25));
  assert.ok(
    times.every((time, index) => index === 0 || time >= times[index - 1]),
  );
});

test("실제 화면 전환 전후의 프레임을 보존한다", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "scene-cut-test-"));
  const saved: NonNullable<
    Awaited<ReturnType<typeof inspectAttachmentFile>>["asset"]
  >[] = [];
  try {
    const video = path.join(directory, "cuts.mp4");
    await exec("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=black:s=160x90:r=10:d=1",
      "-f",
      "lavfi",
      "-i",
      "color=white:s=160x90:r=10:d=1",
      "-filter_complex",
      "[0:v][1:v]concat=n=2:v=1:a=0[out]",
      "-map",
      "[out]",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-y",
      video,
    ]);
    const result = await inspectAttachmentFile(
      await readFile(video),
      "cuts.mp4",
      { referenceVideo: true },
    );
    saved.push(
      result.asset!,
      ...(result.frames ?? []),
      ...(result.analysisSheets ?? []),
    );
    const timing = result.referenceTiming!;
    assert.ok(timing.cutTimes.length > 0);
    const cut = timing.cutTimes[0];
    assert.ok(timing.frameTimes.includes(cut - 0.25));
    assert.ok(timing.frameTimes.includes(cut + 0.25));
  } finally {
    await Promise.all(
      saved.map((asset) => unlink(localAssetPath(asset)).catch(() => {})),
    );
    await rm(directory, { recursive: true, force: true });
  }
});

test("전달된 VTT 자막과 로컬 전사를 출처별로 전달한다", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "scene-whisper-test-"),
  );
  const saved: NonNullable<
    Awaited<ReturnType<typeof inspectAttachmentFile>>["asset"]
  >[] = [];
  const originalPath = process.env.PATH;
  const originalModel = process.env.WHISPER_MODEL_PATH;
  try {
    const video = path.join(directory, "audio.mp4");
    await exec("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=black:s=160x90:r=10:d=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-t",
      "2",
      "-y",
      video,
    ]);
    const bytes = await readFile(video);
    const supplied = await inspectAttachmentFile(bytes, "audio.mp4", {
      referenceVideo: true,
      externalSubtitle: {
        text: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n자막 검증",
        note: "YouTube 제공 자막 (ko)",
      },
    });
    saved.push(
      supplied.asset!,
      ...(supplied.frames ?? []),
      ...(supplied.analysisSheets ?? []),
    );
    assert.match(supplied.text, /YouTube 제공 자막 \(ko\)/);
    assert.match(supplied.text, /자막 검증/);
    const model = path.join(directory, "model.bin");
    await writeFile(model, "fixture");
    const fake = path.join(directory, "whisper-cli");
    await writeFile(
      fake,
      '#!/bin/sh\nwhile [ "$1" != "-of" ]; do shift; done\nprintf "1\\n00:00:00,000 --> 00:00:01,000\\n전사 검증\\n" > "$2.srt"\n',
      { mode: 0o700 },
    );
    process.env.PATH = `${directory}:${originalPath}`;
    process.env.WHISPER_MODEL_PATH = model;
    const transcribed = await inspectAttachmentFile(bytes, "audio.mp4", {
      referenceVideo: true,
    });
    saved.push(
      transcribed.asset!,
      ...(transcribed.frames ?? []),
      ...(transcribed.analysisSheets ?? []),
    );
    assert.match(
      transcribed.text,
      /로컬 Whisper 음성 전사 · 구간 시각은 추정값/,
    );
    assert.match(transcribed.text, /전사 검증/);
  } finally {
    process.env.PATH = originalPath;
    if (originalModel === undefined) delete process.env.WHISPER_MODEL_PATH;
    else process.env.WHISPER_MODEL_PATH = originalModel;
    await Promise.all(
      saved.map((asset) => unlink(localAssetPath(asset)).catch(() => {})),
    );
    await rm(directory, { recursive: true, force: true });
  }
});

test("공개 YouTube 영상 주소만 고정된 단일 영상 주소로 변환한다", () => {
  assert.equal(
    canonicalYouTubeUrl("https://youtu.be/abcdefghijk?t=20"),
    "https://www.youtube.com/watch?v=abcdefghijk",
  );
  assert.equal(
    canonicalYouTubeUrl("https://www.youtube.com/shorts/abcdefghijk"),
    "https://www.youtube.com/watch?v=abcdefghijk",
  );
  for (const url of [
    "http://youtube.com/watch?v=abcdefghijk",
    "https://youtube.com.evil.example/watch?v=abcdefghijk",
    "https://www.youtube.com/watch?v=abcdefghijk&v=12345678901",
    "https://youtu.be/too-short",
    "https://user@youtube.com/watch?v=abcdefghijk",
    "https://localhost/watch?v=abcdefghijk",
  ])
    assert.throws(() => canonicalYouTubeUrl(url), /YouTube/);
});

test(
  "한국어와 영문 화면 글자의 시간·위치 근거를 추출한다",
  { skip: process.platform !== "darwin" },
  async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "scene-ocr-test-"));
    const saved: NonNullable<
      Awaited<ReturnType<typeof inspectAttachmentFile>>["asset"]
    >[] = [];
    try {
      const script = path.join(directory, "draw.swift");
      const frame = path.join(directory, "frame.png");
      const video = path.join(directory, "text.mp4");
      await writeFile(
        script,
        `import AppKit
let image = NSImage(size: NSSize(width: 960, height: 540))
image.lockFocus()
NSColor.black.setFill()
NSRect(x: 0, y: 0, width: 960, height: 540).fill()
let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 52, weight: .bold), .foregroundColor: NSColor.white]
("안녕하세요" as NSString).draw(at: NSPoint(x: 80, y: 110), withAttributes: attributes)
("HELLO WORLD" as NSString).draw(at: NSPoint(x: 80, y: 40), withAttributes: attributes)
image.unlockFocus()
let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
`,
      );
      await exec("swift", [script, frame], { timeout: 30_000 });
      await exec("ffmpeg", [
        "-v",
        "error",
        "-loop",
        "1",
        "-i",
        frame,
        "-t",
        "2",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-y",
        video,
      ]);
      const result = await inspectAttachmentFile(
        await readFile(video),
        "글자.mp4",
        { referenceVideo: true },
      );
      saved.push(
        result.asset!,
        ...(result.frames ?? []),
        ...(result.analysisSheets ?? []),
      );
      assert.match(result.text, /화면 문자 후보/);
      assert.match(result.text, /HELLO WORLD/i);
      assert.match(result.text, /안녕하세요/);
      assert.match(result.text, /초 하단 \(0\./);
      assert.match(result.text, /신뢰도/);
    } finally {
      await Promise.all(
        saved.map((asset) => unlink(localAssetPath(asset)).catch(() => {})),
      );
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("영상 분석 근거와 시간별 프레임을 함께 전달한다", async () => {
  const result = await inspectAttachmentFile(
    await readFile("public/sample/preview.mp4"),
    "preview.mp4",
    { referenceVideo: true },
  );
  try {
    assert.equal(result.frames?.length, 8);
    assert.equal(result.referenceTiming?.frameTimes.length, 8);
    assert.ok((result.referenceTiming?.durationSeconds ?? 0) > 0);
    assert.ok(
      result.referenceTiming?.cutTimes.every(
        (time) => time < result.referenceTiming!.durationSeconds,
      ),
    );
    assert.ok(
      ["measured", "failed"].includes(
        result.referenceTiming?.cutDetection ?? "",
      ),
    );
    assert.match(result.text, /길이: .*초/);
    assert.match(result.text, /프레임 크기:/);
    assert.match(result.text, /화면 변화 후보/);
    assert.match(result.text, /모든 편집점을 나타내지 않습니다/);
    assert.match(result.frames![0].name, /초\.jpg$/);
    assert.match(result.detail, /레퍼런스 분석 근거/);
  } finally {
    await Promise.all(
      [
        result.asset!,
        ...(result.frames ?? []),
        ...(result.analysisSheets ?? []),
      ].map((asset) => unlink(localAssetPath(asset)).catch(() => {})),
    );
  }
});

test("빠른 다중 컷과 컷 안의 화면 변화를 시간순 시트에 보존한다", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "scene-fast-cut-test-"),
  );
  const saved: NonNullable<
    Awaited<ReturnType<typeof inspectAttachmentFile>>["asset"]
  >[] = [];
  try {
    const video = path.join(directory, "fast.mp4");
    await exec("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=black:s=240x160:r=20:d=5",
      "-vf",
      "drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='lt(mod(t,0.6),0.3)'",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-y",
      video,
    ]);
    const result = await inspectAttachmentFile(
      await readFile(video),
      "fast.mp4",
      { referenceVideo: true },
    );
    saved.push(
      result.asset!,
      ...(result.frames ?? []),
      ...(result.analysisSheets ?? []),
    );
    assert.ok((result.referenceTiming?.cutTimes.length ?? 0) > 8);
    assert.ok((result.cutAnalysis?.coveredCuts ?? 0) > 8);
    assert.ok((result.analysisSheets?.length ?? 0) > 1);
    assert.ok(
      result.cutAnalysis!.samples.length > result.cutAnalysis!.coveredCuts,
    );
    assert.match(result.text, /CUT 1/);
    assert.match(result.text, /초당 10프레임/);
  } finally {
    await Promise.all(
      saved.map((asset) => unlink(localAssetPath(asset)).catch(() => {})),
    );
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  "같은 화면의 자막 변화도 중간 표본의 화면 문자에 담는다",
  { skip: process.platform !== "darwin" },
  async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "scene-caption-change-"),
    );
    const saved: NonNullable<
      Awaited<ReturnType<typeof inspectAttachmentFile>>["asset"]
    >[] = [];
    try {
      const script = path.join(directory, "draw.swift");
      const video = path.join(directory, "captions.mp4");
      await writeFile(
        script,
        `import AppKit
for (index, title) in ["FIRST MESSAGE", "SECOND MESSAGE"].enumerated() {
  let image = NSImage(size: NSSize(width: 960, height: 540))
  image.lockFocus()
  NSColor.black.setFill()
  NSRect(x: 0, y: 0, width: 960, height: 540).fill()
  let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 48, weight: .bold), .foregroundColor: NSColor.white]
  (title as NSString).draw(at: NSPoint(x: 80, y: 50), withAttributes: attrs)
  image.unlockFocus()
  let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
  try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1] + "/frame" + String(index) + ".png"))
}`,
      );
      await exec("swift", [script, directory], { timeout: 30_000 });
      await exec("ffmpeg", [
        "-v",
        "error",
        "-loop",
        "1",
        "-t",
        "1",
        "-i",
        path.join(directory, "frame0.png"),
        "-loop",
        "1",
        "-t",
        "1",
        "-i",
        path.join(directory, "frame1.png"),
        "-filter_complex",
        "[0:v][1:v]concat=n=2:v=1:a=0[out]",
        "-map",
        "[out]",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-y",
        video,
      ]);
      const result = await inspectAttachmentFile(
        await readFile(video),
        "captions.mp4",
        { referenceVideo: true },
      );
      saved.push(
        result.asset!,
        ...(result.frames ?? []),
        ...(result.analysisSheets ?? []),
      );
      assert.match(result.text, /컷별 화면 문자 추가 분석/);
      assert.match(result.text, /FIRST MESSAGE/i);
      assert.match(result.text, /SECOND MESSAGE/i);
    assert.equal(result.referenceTiming?.cutTimes.length, 0);
      assert.ok((result.cutAnalysis?.samples.length ?? 0) > 2);
    } finally {
      await Promise.all(
        saved.map((asset) => unlink(localAssetPath(asset)).catch(() => {})),
      );
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("컷이 96개를 넘어도 원본 번호를 유지하고 원하는 범위만 다시 표본화한다", async () => {
  const { planCutSamples } = await import("../lib/reference-cut-analysis");
  const cuts = Array.from({ length: 149 }, (_, i) => (i + 1) * 0.2);
  const all = planCutSamples(30, cuts);
  assert.equal(all.detectedCuts, 150);
  assert.equal(all.coveredCuts, 96);
  assert.equal(all.truncated, true);
  assert.equal(all.samples[0].cut, 1);
  assert.equal(all.samples.at(-1)?.cut, 150);
  const subset = planCutSamples(30, cuts, { first: 102, last: 110 });
  assert.equal(subset.coveredCuts, 9);
  assert.equal(subset.samples[0].cut, 102);
  assert.equal(subset.samples.at(-1)?.cut, 110);
  assert.deepEqual(subset.range, { first: 102, last: 110 });
  assert.throws(
    () => planCutSamples(30, cuts, { first: 111, last: 110 }),
    /범위/,
  );
});

test("세로 영상은 고해상도 OCR 원본과 큰 세로 시트로 저장한다", async () => {
  const sharp = (await import("sharp")).default;
  const { createCutSheets, planCutSamples } = await import("../lib/reference-cut-analysis");
  const directory = await mkdtemp(path.join(os.tmpdir(), "scene-portrait-sheet-"));
  try {
    const video = path.join(directory, "portrait.mp4");
    await exec("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=black:s=720x1280:r=10:d=1",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", video]);
    const plan = planCutSamples(1, Array.from({ length: 11 }, (_, index) => (index + 1) / 12), undefined, 0.1);
    const sheets = await createCutSheets(video, directory, plan);
    assert.equal(sheets.length, 1);
    const sheet = await sharp(sheets[0]).metadata();
    const source = await sharp(path.join(directory, "cut-frame-0.jpg")).metadata();
    assert.deepEqual([sheet.width, sheet.height], [1080, 1290]);
    assert.deepEqual([source.width, source.height], [432, 768]);
    assert.ok(sheets[0].length <= 1536 * 1024);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("마지막 0.1초의 유효 컷을 실제 마지막 프레임으로 읽는다", async () => {
  const sharp = (await import("sharp")).default;
  const { createCutSheets, planCutSamples } = await import("../lib/reference-cut-analysis");
  const directory = await mkdtemp(path.join(os.tmpdir(), "scene-last-frame-"));
  try {
    const video = path.join(directory, "last.mp4");
    await exec("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=black:s=160x90:r=20:d=2",
      "-vf", "drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='gte(t,1.95)'",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", video]);
    const plan = planCutSamples(2, [1.95], { first: 2, last: 2 }, 0.05);
    assert.equal(plan.coveredCuts, 1);
    assert.ok(plan.samples[0].time >= 1.95);
    await createCutSheets(video, directory, plan);
    const stats = await sharp(path.join(directory, "cut-frame-0.jpg")).stats();
    assert.ok(stats.channels[0].mean > 230, "실제 마지막 흰색 프레임이어야 함");
    assert.deepEqual(planCutSamples(2, [1.99], { first: 2, last: 2 }, 0.05).unobservableCuts, [2]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("수동 컷 경계와 빈 경계를 보존하고 잘못된 범위는 거절한다", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "scene-manual-cut-"));
  const saved: NonNullable<Awaited<ReturnType<typeof inspectAttachmentFile>>["asset"]>[] = [];
  try {
    const video = path.join(directory, "manual.mp4");
    await exec("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=black:s=160x90:r=20:d=2",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", video]);
    const bytes = await readFile(video);
    for (const boundaries of [[0.5, 0.5], [1, 0.5], [0], [2], [Number.NaN]]) {
      await assert.rejects(inspectAttachmentFile(bytes, "manual.mp4", { referenceVideo: true, manualCutTimes: boundaries }), /수동 컷 경계/);
    }
    const manual = await inspectAttachmentFile(bytes, "manual.mp4", { referenceVideo: true, manualCutTimes: [0.45, 1.95], cutRange: { first: 3, last: 3 } });
    saved.push(manual.asset!, ...(manual.frames ?? []), ...(manual.analysisSheets ?? []));
    assert.deepEqual(manual.referenceTiming?.cutTimes, [0.45, 1.95]);
    assert.equal(manual.cutAnalysis?.boundarySource, "manual");
    assert.equal(manual.cutAnalysis?.samples[0].cut, 3);
    assert.match(manual.text, /제작자가 정정한 수동 컷 경계/);
    const whole = await inspectAttachmentFile(bytes, "manual.mp4", { referenceVideo: true, manualCutTimes: [] });
    saved.push(whole.asset!, ...(whole.frames ?? []), ...(whole.analysisSheets ?? []));
    assert.deepEqual(whole.referenceTiming?.cutTimes, []);
    assert.equal(whole.cutAnalysis?.detectedCuts, 1);
    assert.equal(whole.cutAnalysis?.boundarySource, "manual");
  } finally {
    await Promise.all(saved.map((asset) => unlink(localAssetPath(asset)).catch(() => {})));
    await rm(directory, { recursive: true, force: true });
  }
});
