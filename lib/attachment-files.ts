import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { localAssetPath, MAX_MEDIA_BYTES, storeMedia, storeReferenceVideoFile } from "./media";
import type { AttachmentContent } from "./attachments-types";
import type { Asset } from "./types";
import { MAX_REFERENCE_VIDEO_BYTES, MAX_REFERENCE_VIDEO_SECONDS } from "./reference-limits";
import { createCutSheets, planCutSamples } from "./reference-cut-analysis";

const exec = promisify(execFile);
const limits = { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 };
const textLimit = 12_000;

export function selectReferenceFrameTimes(duration: number, cuts: number[]): number[] {
  if (duration < 0.3) return [duration / 2];
  const eligible = cuts.filter((cut) => cut > 0.3 && cut < duration - 0.3);
  const chosen = eligible.length > 1
    ? [eligible[Math.floor((eligible.length - 1) / 3)], eligible[Math.ceil(2 * (eligible.length - 1) / 3)]]
    : eligible;
  const remaining = 8 - chosen.length * 2;
  return [
    ...Array.from({ length: remaining }, (_, index) => duration * (index + 0.5) / remaining),
    ...chosen.flatMap((cut) => [cut - 0.25, cut + 0.25]),
  ].sort((a, b) => a - b);
}

async function transcribeLocal(input: string, directory: string): Promise<{ text: string; note: string }> {
  const model = process.env.WHISPER_MODEL_PATH;
  if (!model) return { text: "", note: "음성 전사 미실행 · 로컬 모델 경로가 설정되지 않음" };
  try {
    if (!(await stat(model)).isFile()) throw new Error("invalid model");
    const audio = path.join(directory, "audio.wav");
    const output = path.join(directory, "transcript");
    await exec("ffmpeg", ["-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe", "-i", input,
      "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-y", audio], limits);
    await exec("whisper-cli", ["-m", model, "-f", audio, "-l", "auto", "-osrt", "-of", output, "-np"], {
      timeout: 120_000, maxBuffer: 256 * 1024,
      env: { PATH: process.env.PATH, HOME: directory, NODE_ENV: process.env.NODE_ENV },
    });
    const file = `${output}.srt`;
    if ((await stat(file)).size > 256 * 1024) throw new Error("transcript too large");
    const text = (await readFile(file, "utf8")).trim();
    return text
      ? { text, note: "로컬 Whisper 음성 전사 · 구간 시각은 추정값" }
      : { text: "", note: "로컬 Whisper가 인식한 음성이 없습니다." };
  } catch {
    return { text: "", note: "로컬 Whisper 음성 전사 실패 · 모델과 실행기를 확인하세요." };
  }
}

type ScreenTextFrame = {
  candidates: { text: string; confidence: number; language: string; x: number; y: number; width: number; height: number }[];
  error: boolean;
};

async function readScreenText(frames: string[], times: number[]): Promise<string> {
  if (process.platform !== "darwin") return "화면 문자 인식은 이 환경에서 사용할 수 없습니다.";
  try {
    const output = await exec("swift", [path.join(process.cwd(), "scripts/reference-ocr.swift"), ...frames], {
      timeout: 45_000,
      maxBuffer: 128 * 1024,
    });
    const results = JSON.parse(output.stdout) as ScreenTextFrame[];
    if (!Array.isArray(results) || results.length !== frames.length) throw new Error("invalid OCR");
    const lines = results.flatMap((frame, index) => {
      if (frame.error) return [`${times[index].toFixed(1)}초: 화면 문자 인식 실패`];
      if (!Array.isArray(frame.candidates)) throw new Error("invalid OCR");
      return frame.candidates.slice(0, 3).map((item) => {
        const numbers = [item.x, item.y, item.width, item.height, item.confidence];
        if (typeof item.text !== "string" || typeof item.language !== "string" || numbers.some((number) => !Number.isFinite(number) || number < 0 || number > 1))
          throw new Error("invalid OCR");
        const center = item.y + item.height / 2;
        const region = center < 1 / 3 ? "상단" : center < 2 / 3 ? "중단" : "하단";
        return `${times[index].toFixed(1)}초 ${region} (${item.x.toFixed(2)}, ${item.y.toFixed(2)}, ${item.width.toFixed(2)}, ${item.height.toFixed(2)}) 신뢰도 ${item.confidence.toFixed(2)} ${item.language}: ${item.text.slice(0, 120)}`;
      });
    });
    return lines.length
      ? `화면 문자 후보 (자막·간판 등 구분 미확정, 좌표는 왼쪽 위 기준 x·y·너비·높이의 0~1 비율)\n${lines.join("\n")}`
      : "화면 문자 후보가 검출되지 않았습니다.";
  } catch {
    return "화면 문자 인식에 실패했습니다. 영상 프레임은 계속 사용할 수 있습니다.";
  }
}

const officeReader = String.raw`
import sys, zipfile, xml.etree.ElementTree as ET, re
p,kind=sys.argv[1:]
with zipfile.ZipFile(p) as z:
    infos=z.infolist()
    if len(infos)>5000 or sum(i.file_size for i in infos)>33554432: raise ValueError('archive limit')
    names=[i.filename for i in infos]
    if len(set(names))!=len(names): raise ValueError('duplicate entries')
    if kind=='docx': selected=['word/document.xml']
    else:
        selected=sorted((n for n in names if re.fullmatch(r'ppt/slides/slide\d+\.xml',n)),key=lambda n:int(re.search(r'(\d+)\.xml$',n).group(1)))
    if not selected: raise ValueError('missing document')
    total=0
    for name in selected:
        info=z.getinfo(name)
        if info.file_size>8388608: raise ValueError('document limit')
        with z.open(info) as f: raw=f.read(8388609)
        if len(raw)>8388608: raise ValueError('document limit')
        xml=raw.decode('utf-8-sig')
        if re.search(r'<!\s*(DOCTYPE|ENTITY)',xml,re.I): raise ValueError('unsafe xml')
        root=ET.fromstring(xml)
        paragraphs=[]
        for el in root.iter():
            if el.tag.rsplit('}',1)[-1]=='p':
                line=''.join((x.text or '') if x.tag.rsplit('}',1)[-1]=='t' else '\t' if x.tag.rsplit('}',1)[-1]=='tab' else '' for x in el.iter())
                if line.strip(): paragraphs.append(line)
        body='\n'.join(paragraphs)
        if kind=='pptx': print('--- 슬라이드 '+re.search(r'(\d+)\.xml$',name).group(1)+' ---')
        print(body)
        total+=len(body)
        if total>100000: print('[텍스트 한도 도달]'); break
`;

function limitText(value: string): { text: string; truncated: boolean } {
  const characters: string[] = [];
  for (const character of value.trim()) {
    if (character === "\0") continue;
    if (characters.length === textLimit)
      return { text: characters.join(""), truncated: true };
    characters.push(character);
  }
  return { text: characters.join(""), truncated: false };
}

export async function inspectAttachmentFile(
  source: Uint8Array | string,
  name: string,
  options: { referenceVideo?: boolean; sourceUrl?: string; externalSubtitle?: { text: string; note: string }; cutRange?: {first:number;last:number}; manualCutTimes?: number[]; existingAsset?: Asset } = {},
): Promise<AttachmentContent> {
  const sourcePath = typeof source === "string" ? source : undefined;
  const bytes = typeof source === "string" ? undefined : source;
  if (sourcePath && !options.referenceVideo) throw new Error("파일 경로는 레퍼런스 분석에만 사용할 수 있습니다.");
  if (bytes && (!bytes.length || bytes.length > MAX_MEDIA_BYTES))
    throw new Error("첨부 파일은 64 MiB 이하여야 합니다.");
  const safeName =
    path.basename(name.replace(/[\x00-\x1f\x7f]/g, "")).slice(0, 255) ||
    "첨부 파일";
  const extension = path.extname(safeName).toLowerCase();
  const image = [".png", ".jpg", ".jpeg", ".webp"].includes(extension);
  const video = [".mp4", ".webm"].includes(extension);
  const textFile = [".txt", ".md", ".srt", ".csv", ".json"].includes(extension);
  if (options.manualCutTimes !== undefined && (!video || !options.referenceVideo))
    throw new Error("수동 컷 경계는 레퍼런스 영상 분석에서 사용해 주세요.");
  if (
    !image &&
    !video &&
    !textFile &&
    ![".pdf", ".docx", ".pptx"].includes(extension)
  )
    throw new Error(
      "지원하는 첨부 형식은 이미지, MP4/WebM, 텍스트, PDF, DOCX, PPTX입니다.",
    );
  if (sourcePath && !video) throw new Error("레퍼런스 분석에 MP4 또는 WebM 영상을 첨부해 주세요.");
  const directory = await mkdtemp(path.join(os.tmpdir(), "scene-attachment-"));
  const input = sourcePath ?? path.join(directory, `source${extension}`);
  const created: Asset[] = [];
  const save = async (
    data: Uint8Array,
    filename: string,
    type: Asset["type"],
  ) => {
    const asset = await storeMedia(data, filename, type);
    created.push(asset);
    return asset;
  };
  try {
    if (bytes) await writeFile(input, bytes, { mode: 0o600, flag: "wx" });
    if (sourcePath) {
      const info = await stat(sourcePath);
      if (!info.isFile() || info.size < 1 || info.size > MAX_REFERENCE_VIDEO_BYTES)
        throw new Error("레퍼런스 영상은 1 GiB 이하여야 합니다.");
    }
    if (image && bytes) {
      try {
        await exec(
          "ffmpeg",
          [
            "-v",
            "error",
            "-nostdin",
            "-protocol_whitelist",
            "file,pipe",
            "-i",
            input,
            "-frames:v",
            "1",
            "-f",
            "null",
            "-",
          ],
          limits,
        );
      } catch {
        throw new Error("이미지 파일을 읽을 수 없습니다.");
      }
      const asset = await save(bytes, safeName, "image");
      return {
        kind: "image",
        name: safeName,
        text: "",
        asset,
        detail: "이미지 원본을 첨부했습니다.",
      };
    }
    if (video) {
      let probe: {
        format?: { duration?: string };
        streams?: { codec_type?: string; width?: number; height?: number; display_aspect_ratio?: string; avg_frame_rate?: string }[];
      };
      try {
        probe = JSON.parse(
          (
            await exec(
              "ffprobe",
              [
                "-v",
                "error",
                "-protocol_whitelist",
                "file,pipe",
                "-show_entries",
                "format=duration:stream=codec_type,width,height,display_aspect_ratio,avg_frame_rate",
                "-of",
                "json",
                input,
              ],
              limits,
            )
          ).stdout,
        );
      } catch {
        throw new Error("영상 형식이나 길이를 확인할 수 없습니다.");
      }
      const duration = Number(probe.format?.duration);
      if (
        !Number.isFinite(duration) ||
        duration <= 0 ||
        duration > 7200 ||
        !probe.streams?.some((stream) => stream.codec_type === "video")
      )
        throw new Error(
          "영상은 2시간 이내의 유효한 MP4 또는 WebM이어야 합니다.",
        );
      if (options.referenceVideo && duration > MAX_REFERENCE_VIDEO_SECONDS)
        throw new Error("레퍼런스 분석 영상은 60분 이하여야 합니다.");
      if (options.manualCutTimes !== undefined &&
          (!options.referenceVideo || !Array.isArray(options.manualCutTimes) || options.manualCutTimes.length > 6000 ||
          options.manualCutTimes.some((time, index, times) => typeof time !== "number" || !Number.isFinite(time) ||
            time <= 0 || time >= duration || (index > 0 && time <= times[index - 1]))))
        throw new Error("수동 컷 경계는 영상 길이 안에서 중복 없이 오름차순으로 입력해 주세요.");
      let sceneTimes: number[] = [];
      let sceneStatus = "실행하지 않음";
      let cutDetection: "measured" | "failed" = "failed";
      if (options.referenceVideo && options.manualCutTimes !== undefined) {
        sceneTimes = [...options.manualCutTimes];
        cutDetection = "measured";
        sceneStatus = sceneTimes.length ? `${sceneTimes.slice(0, 100).map((time) => `${time.toFixed(2)}초`).join(", ")}${sceneTimes.length > 100 ? ` (총 ${sceneTimes.length}개 중 앞의 100개만 표시)` : ""}` : "수동 컷 경계 없음 · 전체 한 컷";
      } else if (options.referenceVideo) {
        try {
          const result = await exec("ffmpeg", [
            "-hide_banner", "-nostdin", "-protocol_whitelist", "file,pipe",
            "-i", input, "-an", "-vf",
            "fps=10,scale=320:-2,select='gt(scene,0.35)',showinfo",
            "-f", "null", "-",
          ], { ...limits, timeout: Math.max(60_000, Math.min(600_000, duration * 300)) });
          const detected = [...result.stderr.matchAll(/pts_time:([\d.]+)/g)]
            .map((match) => Number(match[1]))
            .filter((time, index, all) => Number.isFinite(time) && time > 0 &&
              time < duration && (index === 0 || time > all[index - 1]));
          sceneTimes = detected.slice(0, 6000);
          cutDetection = "measured";
          sceneStatus = sceneTimes.length
            ? `${sceneTimes.slice(0, 100).map((time) => `${time.toFixed(1)}초`).join(", ")}${detected.length > 6000 ? ` (총 ${detected.length}개 중 앞의 6000개만 분석)` : detected.length > 100 ? ` (총 ${detected.length}개 중 앞의 100개만 표시)` : ""}`
            : "검출된 급격한 화면 변화 없음";
        } catch {
          sceneStatus = "화면 변화 검출 실패";
        }
      }
      const times =
        duration < 0.3
          ? [duration / 2]
          : options.referenceVideo
            ? selectReferenceFrameTimes(duration, sceneTimes)
            : [0.1, 0.5, 0.9].map((part) => duration * part);
      const frameBytes: Buffer[] = [];
      const framePaths: string[] = [];
      for (const [index, time] of times.entries()) {
        const output = path.join(directory, `frame-${index}.${options.referenceVideo ? "jpg" : "png"}`);
        try {
          await exec(
            "ffmpeg",
            [
              "-v",
              "error",
              "-nostdin",
              "-protocol_whitelist",
              "file,pipe",
              "-ss",
              String(time),
              "-i",
              input,
              "-map",
              "0:v:0",
              "-frames:v",
              "1",
              "-vf",
              options.referenceVideo ? "scale=768:768:force_original_aspect_ratio=decrease" : "scale=1280:1280:force_original_aspect_ratio=decrease",
              ...(options.referenceVideo ? ["-q:v", "5"] : []),
              "-y",
              output,
            ],
            limits,
          );
          let data = await readFile(output);
          let framePath = output;
          if (options.referenceVideo && data.length > 1536 * 1024) {
            framePath = path.join(directory, `frame-${index}-small.jpg`);
            await exec("ffmpeg", ["-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe", "-i", output,
              "-frames:v", "1", "-vf", "scale=512:512:force_original_aspect_ratio=decrease", "-q:v", "12", "-y", framePath], limits);
            data = await readFile(framePath);
            if (data.length > 1536 * 1024) throw new Error("frame size");
          }
          frameBytes.push(data);
          framePaths.push(framePath);
        } catch {
          throw new Error("영상의 대표 프레임을 추출하지 못했습니다.");
        }
      }
      const screenText = options.referenceVideo ? await readScreenText(framePaths, times) : "";
      const videoStream = probe.streams.find((stream) => stream.codec_type === "video");
      const rate = videoStream?.avg_frame_rate?.match(/^(\d+)\/(\d+)$/);
      const frameDuration = rate && Number(rate[1]) > 0 && Number(rate[2]) > 0
        ? Number(rate[2]) / Number(rate[1]) : 0.1;
      const cutAnalysis = options.referenceVideo ? planCutSamples(duration, sceneTimes, options.cutRange, frameDuration,
        options.manualCutTimes === undefined ? "automatic" : "manual") : undefined;
      if (cutAnalysis && !cutAnalysis.samples.length)
        throw new Error("선택한 컷에 관찰 가능한 프레임이 없습니다. 앞 구간을 포함해 다시 선택해 주세요.");
      const sheetBytes = cutAnalysis ? await createCutSheets(input, directory, cutAnalysis) : [];
      let cutScreenText = "";
      if (cutAnalysis) {
        const count = Math.min(32, cutAnalysis.samples.length);
        const indices = Array.from({ length: count }, (_, index) =>
          count === 1 ? 0 : Math.floor(index * (cutAnalysis.samples.length - 1) / (count - 1)));
        const batches = Array.from({ length: Math.ceil(indices.length / 8) }, (_, index) => indices.slice(index * 8, index * 8 + 8));
        const results: string[] = [];
        for (const batch of batches) results.push(await readScreenText(
          batch.map((index) => path.join(directory, `cut-frame-${index}.jpg`)),
          batch.map((index) => cutAnalysis.samples[index].time),
        ));
        cutScreenText = `컷별 화면 문자 추가 분석 표본 ${count}/${cutAnalysis.samples.length}개\n${results.join("\n")}`;
      }
      let subtitle = options.externalSubtitle?.text ?? "";
      let subtitleNote = options.externalSubtitle?.note ?? "자막 없음";
      if (!subtitle && probe.streams.some((stream) => stream.codec_type === "subtitle")) {
        try {
          subtitle = (
            await exec(
              "ffmpeg",
              [
                "-v",
                "error",
                "-nostdin",
                "-protocol_whitelist",
                "file,pipe",
                "-i",
                input,
                "-map",
                "0:s:0",
                "-f",
                "srt",
                "pipe:1",
              ],
              limits,
            )
          ).stdout;
          subtitleNote = subtitle.trim()
            ? "내장 자막 추출"
            : "내장 자막이 비어 있음";
        } catch {
          subtitleNote = "내장 자막을 텍스트로 추출하지 못함";
        }
      }
      let audioNote = probe.streams.some((stream) => stream.codec_type === "audio")
        ? "음성 전사 미실행" : "오디오 없음";
      if (options.referenceVideo && duration > 600 && !subtitle.trim() && audioNote !== "오디오 없음") {
        audioNote = "오디오 트랙 있음 · 긴 영상의 음성 전사 미실행";
      } else if (options.referenceVideo && !subtitle.trim() && audioNote !== "오디오 없음") {
        const transcript = await transcribeLocal(input, directory);
        subtitle = transcript.text;
        audioNote = transcript.note;
        if (transcript.text) subtitleNote = transcript.note;
      } else if (options.referenceVideo && audioNote !== "오디오 없음") {
        audioNote = "오디오 트랙 있음 · 별도 음성 전사 미실행";
      }
      const limited = limitText(subtitle);
      const asset = sourcePath
        ? options.existingAsset ?? await storeReferenceVideoFile(sourcePath, safeName)
        : await save(bytes!, safeName, "video");
      if (sourcePath && !options.existingAsset) created.push(asset);
      const frames: Asset[] = [];
      for (const [index, data] of frameBytes.entries())
        frames.push(
          await save(
            data,
            `${safeName} ${times[index].toFixed(1)}초.${options.referenceVideo ? "jpg" : "png"}`,
            "image",
          ),
        );
      const analysisSheets: Asset[] = [];
      for (const [index, data] of sheetBytes.entries())
        analysisSheets.push(await save(data, `컷 분석 시트 ${index + 1}.jpg`, "image"));
      const details = [
        `${duration.toFixed(1)}초`,
        `대표 프레임 ${times.map((time) => `${time.toFixed(1)}초`).join(", ")}`,
        subtitleNote,
        audioNote,
        ...(limited.truncated ? ["자막 12,000자까지만 포함"] : []),
      ];
      const evidence = options.referenceVideo
        ? [
            "[레퍼런스 영상 분석 근거]",
            ...(options.sourceUrl ? [`원본 주소: ${options.sourceUrl}`] : ["원본: 사용자가 첨부한 영상 파일"]),
            `길이: ${duration.toFixed(1)}초`,
            `프레임 크기: ${videoStream?.width ?? "미확인"} × ${videoStream?.height ?? "미확인"}, 표시 화면비: ${videoStream?.display_aspect_ratio || "미확인"}`,
            `대표 프레임 시각: ${times.map((time) => `${time.toFixed(1)}초`).join(", ")}`,
            `${options.manualCutTimes === undefined ? "급격한 화면 변화 후보(초당 10프레임, 임계값 0.35)" : "제작자가 정정한 수동 컷 경계"}: ${sceneStatus}`,
            `분석 컷 ${cutAnalysis!.coveredCuts}/${cutAnalysis!.totalDetectedCuts}개, 표본 ${cutAnalysis!.samples.length}/${cutAnalysis!.totalCandidates}개. 시트의 각 칸은 #표본, CUT 번호, 영상 시각 순서입니다. ${cutAnalysis!.truncated ? "표본 또는 컷 상한으로 전체를 표시하지 못했습니다." : "검출된 각 컷에 표본이 있습니다."}`,
            `시간순 표본: ${cutAnalysis!.samples.map((sample, index) => `#${index + 1} CUT ${sample.cut} ${sample.time.toFixed(2)}초`).join(", ")}`,
            ...(cutAnalysis!.unobservableCuts?.length ? [`관찰 가능한 영상 프레임이 없는 마지막 컷: ${cutAnalysis!.unobservableCuts.join(", ")}`] : []),
            options.manualCutTimes === undefined
              ? "화면 변화는 자동 검출 후보이며 모든 편집점을 나타내지 않습니다. 일부 대표 프레임은 검출 후보의 앞뒤이며 그 사이의 실제 동작은 직접 확인되지 않았습니다."
              : "컷 경계는 제작자가 직접 정한 시각입니다. 표본 사이의 실제 동작은 직접 확인되지 않았습니다.",
            screenText,
            cutScreenText,
            subtitleNote,
            `${audioNote} · 소리 특성 분석 미실행`,
            ...(limited.text ? [`[${subtitleNote}]\n${limited.text}`] : []),
          ].join("\n")
        : limited.text;
      return {
        kind: "video",
        name: safeName,
        text: evidence,
        asset,
        frames,
        ...(cutAnalysis ? { analysisSheets, cutAnalysis } : {}),
        ...(options.referenceVideo
          ? { referenceTiming: { durationSeconds: duration, cutTimes: sceneTimes, frameTimes: times, cutDetection } }
          : {}),
        detail: [...details, ...(options.referenceVideo ? ["레퍼런스 분석 근거 포함"] : [])].join(" · "),
        ...(options.sourceUrl ? { url: options.sourceUrl } : {}),
      };
    }
    let raw = "";
    let extra = "";
    let sourceTruncated = false;
    if (textFile) {
      try {
        raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes!);
      } catch {
        throw new Error("텍스트 파일은 UTF-8 인코딩이어야 합니다.");
      }
    } else if (extension === ".pdf") {
      if (Buffer.from(bytes!.subarray(0, 5)).toString("ascii") !== "%PDF-")
        throw new Error("유효한 PDF 파일이 아닙니다.");
      try {
        raw = (
          await exec("pdftotext", ["-layout", input, "-"], {
            ...limits,
            maxBuffer: 256_000,
          })
        ).stdout;
      } catch (error) {
        const failure = error as { code?: string; stdout?: string };
        if (
          failure.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" &&
          typeof failure.stdout === "string"
        ) {
          raw = failure.stdout;
          sourceTruncated = true;
        } else
          throw new Error(
            "PDF 텍스트를 읽지 못했습니다. pdftotext 설치와 파일 상태를 확인하세요.",
          );
      }
      if (!raw.trim()) {
        const page = path.join(directory, "page");
        try {
          await exec(
            "pdftoppm",
            [
              "-f",
              "1",
              "-l",
              "1",
              "-scale-to",
              "1280",
              "-singlefile",
              "-png",
              input,
              page,
            ],
            limits,
          );
        } catch {
          throw new Error(
            "텍스트 없는 PDF의 첫 페이지를 읽지 못했습니다. pdftoppm 설치와 파일 상태를 확인하세요.",
          );
        }
        const frame = await save(
          await readFile(`${page}.png`),
          `${safeName} 첫 페이지.png`,
          "image",
        );
        return {
          kind: "document",
          name: safeName,
          text: "",
          frames: [frame],
          detail:
            "텍스트 없는 PDF의 첫 페이지만 이미지로 첨부했습니다. OCR은 실행하지 않았습니다.",
        };
      }
      extra = "PDF 텍스트 추출";
    } else {
      if (bytes![0] !== 0x50 || bytes![1] !== 0x4b)
        throw new Error("유효한 Office 문서가 아닙니다.");
      try {
        raw = (
          await exec(
            "python3",
            ["-c", officeReader, input, extension.slice(1)],
            limits,
          )
        ).stdout;
      } catch {
        throw new Error(
          "Office 문서를 읽지 못했습니다. 문서 형식과 크기를 확인하세요.",
        );
      }
      extra =
        extension === ".pptx" ? "슬라이드 텍스트 추출" : "문서 텍스트 추출";
    }
    const limited = limitText(raw);
    if (
      !limited.text ||
      (extension === ".pptx" &&
        !limited.text.replace(/--- 슬라이드 \d+ ---/g, "").trim())
    )
      throw new Error("읽을 수 있는 텍스트가 없는 문서입니다.");
    return {
      kind: "document",
      name: safeName,
      text: limited.text,
      detail: [
        extra || "텍스트 첨부",
        ...(limited.truncated || sourceTruncated
          ? ["12,000자까지만 포함"]
          : []),
      ].join(" · "),
    };
  } catch (error) {
    await Promise.all(
      created.map((asset) => unlink(localAssetPath(asset)).catch(() => {})),
    );
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
