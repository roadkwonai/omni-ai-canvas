import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const exec = promisify(execFile);
const frameLimit = 96;
const framesPerSheet = 12;

export type CutSample = { time: number; cut: number };
export type CutAnalysis = {
  samples: CutSample[];
  detectedCuts: number;
  totalDetectedCuts: number;
  coveredCuts: number;
  totalCandidates: number;
  truncated: boolean;
  sampleIntervalSeconds: number;
  unobservableCuts?: number[];
  boundarySource?: "automatic" | "manual";
  range?: { first: number; last: number };
};

function evenSample<T>(items: T[], limit: number): T[] {
  if (limit <= 0) return [];
  if (items.length <= limit) return items;
  if (limit === 1) return [items[Math.floor(items.length / 2)]];
  return Array.from(
    { length: limit },
    (_, index) => items[Math.floor((index * (items.length - 1)) / (limit - 1))],
  );
}

/** 우선 컷마다 한 화면을 확보하고 남는 공간을 컷 안의 시간 표본에 사용한다. */
export function planCutSamples(
  duration: number,
  cuts: number[],
  range?: { first: number; last: number },
  frameDurationSeconds = 0.1,
  boundarySource: "automatic" | "manual" = "automatic",
): CutAnalysis {
  const boundaries = [
    0,
    ...cuts.filter(
      (time, index) =>
        Number.isFinite(time) &&
        time > 0 &&
        time < duration &&
        (index === 0 || time > cuts[index - 1]),
    ),
    duration,
  ];
  const segments = boundaries.slice(0, -1).map((start, index) => ({
    start,
    end: boundaries[index + 1],
    cut: index + 1,
  }));
  if (
    range &&
    (!Number.isInteger(range.first) ||
      !Number.isInteger(range.last) ||
      range.first < 1 ||
      range.first > range.last ||
      range.last > segments.length)
  )
    throw new Error("재분석할 컷 번호 범위를 확인해 주세요.");
  const eligible = range
    ? segments.slice(range.first - 1, range.last)
    : segments;
  const selected = evenSample(eligible, frameLimit);
  const frameDuration = Number.isFinite(frameDurationSeconds) && frameDurationSeconds > 0
    ? Math.min(frameDurationSeconds, duration / 2)
    : Math.min(0.1, duration / 2);
  const lastSafeTime = Math.max(0, duration - frameDuration + 0.00001);
  const unobservableCuts = selected.filter((segment) => segment.start > lastSafeTime).map((segment) => segment.cut);
  const key = (time: number) => Math.round(time * 1000);
  const result = new Map<number, CutSample>();
  for (const segment of selected) {
    if (segment.start > lastSafeTime) continue;
    const time = Math.min(lastSafeTime, (segment.start + segment.end) / 2);
    result.set(key(time), { time, cut: segment.cut });
  }
  const candidates: CutSample[] = [];
  for (const segment of eligible) {
    const length = segment.end - segment.start;
    if (length >= 0.15) {
      candidates.push({
        time: segment.start + length * 0.15,
        cut: segment.cut,
      });
      candidates.push({ time: segment.end - length * 0.15, cut: segment.cut });
    }
    for (let time = segment.start + 0.25; time < segment.end; time += 0.5)
      candidates.push({ time, cut: segment.cut });
  }
  const extra = candidates
    .filter(
      (sample) => sample.time <= lastSafeTime && !result.has(key(sample.time)),
    )
    .sort((a, b) => a.time - b.time);
  const slots = frameLimit - result.size;
  for (const sample of evenSample(extra, slots))
    result.set(key(sample.time), sample);
  const samples = [...result.values()].sort((a, b) => a.time - b.time);
  return {
    samples,
    detectedCuts: segments.length,
    totalDetectedCuts: segments.length,
    coveredCuts: new Set(samples.map((sample) => sample.cut)).size,
    totalCandidates: eligible.length + extra.length,
    truncated:
      eligible.length + extra.length > frameLimit ||
      selected.length > new Set(samples.map((sample) => sample.cut)).size,
    sampleIntervalSeconds: 0.5,
    boundarySource,
    ...(range ? { range } : {}),
    ...(unobservableCuts.length ? { unobservableCuts } : {}),
  };
}

export async function createCutSheets(
  input: string,
  directory: string,
  analysis: CutAnalysis,
): Promise<Buffer[]> {
  const frames: Buffer[] = new Array(analysis.samples.length);
  let next = 0;
  async function extract() {
    while (next < analysis.samples.length) {
      const index = next++;
      const sample = analysis.samples[index];
      const frame = path.join(directory, `cut-frame-${index}.jpg`);
      await exec(
        "ffmpeg",
        [
          "-v",
          "error",
          "-nostdin",
          "-protocol_whitelist",
          "file,pipe",
          "-ss",
          String(Math.max(0, sample.time - 0.001)),
          "-i",
          input,
          "-map",
          "0:v:0",
          "-frames:v",
          "1",
          "-vf",
          "scale=768:768:force_original_aspect_ratio=decrease",
          "-threads",
          "1",
          "-q:v",
          "5",
          "-y",
          frame,
        ],
        { timeout: 30_000, maxBuffer: 128_000 },
      );
      frames[index] = await readFile(frame);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(6, analysis.samples.length) }, extract),
  );
  const dimensions = await sharp(frames[0]).metadata();
  const portrait = (dimensions.height ?? 0) > (dimensions.width ?? 0);
  const columns = portrait ? 4 : 3;
  const tileWidth = portrait ? 270 : 360;
  const tileHeight = portrait ? 400 : 200;
  const thumbs = await Promise.all(frames.map((frame) => sharp(frame)
    .resize(tileWidth, tileHeight, { fit: "contain", background: "#171717" })
    .jpeg({ quality: 82 }).toBuffer()));
  const sheets: Buffer[] = [];
  for (
    let start = 0;
    start < analysis.samples.length;
    start += framesPerSheet
  ) {
    const chunk = analysis.samples.slice(start, start + framesPerSheet);
    const rows = Math.ceil(chunk.length / columns);
    const cells = chunk.flatMap((sample, index) => {
      const left = (index % columns) * tileWidth;
      const top = Math.floor(index / columns) * (tileHeight + 30);
      const label = Buffer.from(
        `<svg width="${tileWidth}" height="30"><rect width="${tileWidth}" height="30" fill="#fff"/><text x="8" y="21" font-size="16" fill="#111">#${start + index + 1}  CUT ${sample.cut}  ${sample.time.toFixed(2)}s</text></svg>`,
      );
      return [
        { input: thumbs[start + index], left, top },
        { input: label, left, top: top + tileHeight },
      ];
    });
    let sheet = await sharp({
      create: {
        width: columns * tileWidth,
        height: rows * (tileHeight + 30),
        channels: 3,
        background: "#171717",
      },
    })
      .composite(cells)
      .jpeg({ quality: 82 })
      .toBuffer();
    if (sheet.length > 1536 * 1024)
      sheet = await sharp(sheet).jpeg({ quality: 55 }).toBuffer();
    if (sheet.length > 1536 * 1024)
      throw new Error("컷 분석 시트가 허용 크기를 초과했습니다.");
    sheets.push(sheet);
  }
  return sheets;
}
