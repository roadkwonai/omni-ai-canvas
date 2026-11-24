import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isAsset, localAssetPath, MAX_MEDIA_BYTES } from "./media";
import type { AttachmentContent, AttachmentRecord, ReferenceTiming } from "./attachments-types";
import type { Asset, RunInput } from "./types";
import type { CutAnalysis } from "./reference-cut-analysis";
import { MAX_REFERENCE_VIDEO_SECONDS } from "./reference-limits";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const root = path.join(process.cwd(), ".scene-room", "attachments");
export class AttachmentError extends Error {}

function validReferenceTiming(value: unknown): value is ReferenceTiming {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const timing = value as Record<string, unknown>;
  const duration = timing.durationSeconds;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0 || duration > MAX_REFERENCE_VIDEO_SECONDS)
    return false;
  if (timing.cutDetection !== undefined && timing.cutDetection !== "measured" && timing.cutDetection !== "failed")
    return false;
  return [timing.cutTimes, timing.frameTimes].every((times, index) =>
    Array.isArray(times) && times.length <= (index === 0 ? 6000 : 8) &&
    times.every((time, position) => typeof time === "number" && Number.isFinite(time) && time >= 0 && time < duration && (position === 0 || time >= times[position - 1])),
  );
}

function validCutAnalysis(value: unknown): value is CutAnalysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const a = value as Record<string, unknown>;
  if (!Array.isArray(a.samples) || a.samples.length < 1 || a.samples.length > 96 ||
      typeof a.detectedCuts !== "number" || !Number.isInteger(a.detectedCuts) || a.detectedCuts < 1 || a.detectedCuts > 6001 ||
      typeof a.totalDetectedCuts !== "number" || !Number.isInteger(a.totalDetectedCuts) || a.totalDetectedCuts < a.detectedCuts ||
      typeof a.coveredCuts !== "number" || !Number.isInteger(a.coveredCuts) ||
      typeof a.totalCandidates !== "number" || !Number.isInteger(a.totalCandidates) || a.totalCandidates < a.samples.length ||
      typeof a.truncated !== "boolean" || a.sampleIntervalSeconds !== 0.5) return false;
  if (a.range !== undefined) {
    if (!a.range || typeof a.range !== "object" || Array.isArray(a.range)) return false;
    const range = a.range as Record<string, unknown>;
    if (!Number.isInteger(range.first) || !Number.isInteger(range.last) ||
        (range.first as number) < 1 || (range.first as number) > (range.last as number) ||
        (range.last as number) > a.detectedCuts) return false;
  }
  if (a.unobservableCuts !== undefined &&
      (!Array.isArray(a.unobservableCuts) || a.unobservableCuts.length > 96 ||
      a.unobservableCuts.some((cut) => !Number.isInteger(cut) || cut < 1 || cut > (a.detectedCuts as number)))) return false;
  if (a.boundarySource !== undefined && a.boundarySource !== "automatic" && a.boundarySource !== "manual") return false;
  const samples = a.samples as { time: number; cut: number }[];
  return samples.every((item, i) => item && typeof item.time === "number" && Number.isFinite(item.time) && item.time >= 0 &&
    (i === 0 || item.time >= samples[i - 1].time) && Number.isInteger(item.cut) && item.cut >= 1 && item.cut <= (a.detectedCuts as number)) &&
    new Set(samples.map((item) => item.cut)).size === a.coveredCuts;
}

function checkedId(value: string) {
  if (!uuid.test(value))
    throw new AttachmentError("첨부 주소를 확인해 주세요.");
  return value.toLowerCase();
}
function filePath(projectId: string, id: string) {
  return path.join(root, checkedId(projectId), `${checkedId(id)}.json`);
}
function redact(text: string) {
  return text
    .replace(
      /\b(?:sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._~+/-]{12,})/gi,
      "[비밀값 삭제]",
    )
    .replace(
      /\b(api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*["']?[^\s"'&,;]{8,}/gi,
      "$1=[비밀값 삭제]",
    );
}

function analysisAssets(candidates: Asset[], videoIndex: number, videoCount: number): Asset[] {
  const budget = 8;
  const share = Math.floor(budget / videoCount) + Number(videoIndex < budget % videoCount);
  if (candidates.length <= share) return candidates;
  if (share === 1) return [candidates[Math.floor(candidates.length / 2)]];
  return Array.from({ length: share }, (_, index) =>
    candidates[Math.round(index * (candidates.length - 1) / (share - 1))],
  );
}
export function safePublicUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new AttachmentError("공개 HTTPS 주소를 확인해 주세요.");
  for (const key of [...url.searchParams.keys()])
    if (
      /(token|key|secret|password|signature|credential|auth|session)/i.test(key)
    )
      url.searchParams.delete(key);
  url.hash = "";
  return url.href;
}

export async function createAttachment(
  projectId: string,
  content: AttachmentContent,
): Promise<AttachmentRecord> {
  if (content.referenceTiming !== undefined && (content.kind !== "video" || !validReferenceTiming(content.referenceTiming)))
    throw new AttachmentError("영상 분석 시간 정보를 확인해 주세요.");
  if (content.cutAnalysis !== undefined && (content.kind !== "video" || !validCutAnalysis(content.cutAnalysis) ||
      !content.referenceTiming || content.cutAnalysis.samples.some((sample) => sample.time >= content.referenceTiming!.durationSeconds) ||
      !content.analysisSheets || content.analysisSheets.length !== Math.ceil(content.cutAnalysis.samples.length / 12) ||
      content.analysisSheets.some((asset) => !isAsset(asset) || asset.type !== "image")))
    throw new AttachmentError("컷 분석 시트와 시간 정보를 확인해 주세요.");
  const id = randomUUID();
  const directory = path.dirname(filePath(projectId, id));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const record: AttachmentRecord = {
    ...content,
    name: redact(content.name.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 255)),
    text: redact(content.text).slice(0, 60_000),
    detail: redact(content.detail).slice(0, 1000),
    ...(content.asset
      ? { asset: { ...content.asset, name: redact(content.asset.name) } }
      : {}),
    ...(content.frames
      ? {
          frames: content.frames.map((frame) => ({
            ...frame,
            name: redact(frame.name),
          })),
        }
      : {}),
    ...(content.analysisSheets
      ? { analysisSheets: content.analysisSheets.map((sheet) => ({ ...sheet, name: redact(sheet.name) })) }
      : {}),
    ...(content.url ? { url: safePublicUrl(content.url) } : {}),
    id,
    projectId: checkedId(projectId),
    createdAt: new Date().toISOString(),
  };
  await writeFile(filePath(projectId, id), JSON.stringify(record), {
    mode: 0o600,
    flag: "wx",
  });
  return record;
}

export async function getAttachment(
  projectId: string,
  id: string,
): Promise<AttachmentRecord> {
  const location = filePath(projectId, id);
  try {
    const info = await lstat(location);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 512 * 1024)
      throw new Error("invalid");
    const record = JSON.parse(
      await readFile(location, "utf8"),
    ) as AttachmentRecord;
    if (
      record.id !== checkedId(id) ||
      record.projectId !== checkedId(projectId) ||
      !["image", "video", "document", "link"].includes(record.kind) ||
      typeof record.name !== "string" ||
      typeof record.text !== "string" ||
      typeof record.detail !== "string" ||
      (record.referenceTiming !== undefined &&
        (record.kind !== "video" || !validReferenceTiming(record.referenceTiming))) ||
      (record.asset && !isAsset(record.asset)) ||
      (record.cutAnalysis !== undefined &&
        (record.kind !== "video" || !validCutAnalysis(record.cutAnalysis) || !record.referenceTiming ||
          record.cutAnalysis.samples.some((sample) => sample.time >= record.referenceTiming!.durationSeconds) ||
          !Array.isArray(record.analysisSheets) || record.analysisSheets.length !== Math.ceil(record.cutAnalysis.samples.length / 12))) ||
      (record.analysisSheets && (!Array.isArray(record.analysisSheets) || record.analysisSheets.length > 8 ||
        record.analysisSheets.some((asset) => !isAsset(asset) || asset.type !== "image"))) ||
      (record.frames &&
        (!Array.isArray(record.frames) ||
          record.frames.length > 12 ||
          record.frames.some(
            (asset) => !isAsset(asset) || asset.type !== "image",
          )))
    )
      throw new Error("invalid");
    return record;
  } catch {
    throw new AttachmentError(
      "첨부를 찾을 수 없습니다. 파일을 다시 첨부해 주세요.",
    );
  }
}

export async function bindAttachments(
  projectId: string,
  input: RunInput,
  value: unknown,
): Promise<RunInput> {
  if (checkedId(projectId) !== checkedId(input.projectId))
    throw new AttachmentError("프로젝트와 첨부가 일치하지 않습니다.");
  if (value === undefined && !input.media) return input;
  const ids = value === undefined ? [] : value;
  if (
    !Array.isArray(ids) ||
    ids.length > 8 ||
    ids.some((id) => typeof id !== "string" || !uuid.test(id)) ||
    new Set(ids.map((id) => id.toLowerCase())).size !== ids.length
  )
    throw new AttachmentError("첨부는 중복 없이 최대 8개까지 선택해 주세요.");
  if (!ids.length && !input.media) return input;
  const records = await Promise.all(
    ids.map((id) => getAttachment(projectId, id)),
  );
  const references = [...input.references];
  const attachments: NonNullable<RunInput["attachments"]> = [];
  const analysis = input.presetDesign?.mode === "analyze";
  const textShare = analysis && records.length > 1 ? Math.floor(90_000 / records.length) : Infinity;
  let totalBytes = 0;
  const seenFiles = new Set<string>();
  for (const [recordIndex, record] of records.entries()) {
    const sourceName = records.length > 1 ? `영상 ${recordIndex + 1} · ${record.name}` : record.name;
    const visual: Asset[] = [];
    const textAgent =
      (input.operation === "text" || input.operation === "plan") &&
      (input.provider === "codex" || input.provider === "claude");
    const imageOperation =
      input.operation === "image" &&
      [
        "codex",
        "higgsfield",
        "openai-image",
        "gemini-image",
        "seedream",
        "kling",
      ].includes(input.provider);
    const videoMotion =
      input.operation === "video" &&
      input.provider === "higgsfield" &&
      record.kind === "video";
    if (input.media && (record.kind === "image" || record.kind === "video")) {
      if (!record.asset || record.asset.type !== record.kind)
        throw new AttachmentError("첨부 원본을 찾을 수 없습니다. 파일을 다시 첨부해 주세요.");
      visual.push(record.asset);
    } else if (
      record.kind === "image" &&
      (textAgent ||
        imageOperation ||
        (input.provider === "higgsfield" && input.operation === "video"))
    ) {
      if (!record.asset || record.asset.type !== "image")
        throw new AttachmentError(
          "첨부 이미지가 없습니다. 다시 첨부해 주세요.",
        );
      visual.push(record.asset);
    } else if (
      (record.kind === "video" || record.kind === "document") &&
      !videoMotion &&
      (textAgent || imageOperation)
    ) {
      const candidates = analysis && record.analysisSheets?.length ? record.analysisSheets : record.frames ?? [];
      visual.push(...(analysis ? analysisAssets(candidates, recordIndex, records.length) : candidates));
      if (record.kind === "video" && !visual.length)
        throw new AttachmentError(
          "영상에서 읽을 프레임이 없습니다. 영상을 다시 첨부해 주세요.",
        );
    } else if (videoMotion) {
      if (!record.asset || record.asset.type !== "video")
        throw new AttachmentError("첨부 영상이 없습니다. 다시 첨부해 주세요.");
      visual.push(record.asset);
    } else if (
      record.kind === "image" ||
      record.kind === "video" ||
      ((record.frames?.length ?? 0) > 0 && !record.text.trim())
    ) {
      throw new AttachmentError(
        "선택한 서비스는 첨부 이미지를 읽지 못합니다. 내용을 글로 설명하거나 이미지를 읽는 서비스를 선택해 주세요.",
      );
    }
    if (record.kind === "document" && !record.text.trim() && !visual.length)
      throw new AttachmentError(
        "문서에서 읽을 내용이 없습니다. 텍스트를 직접 입력해 주세요.",
      );
    if (record.kind === "link" && !record.text.trim())
      throw new AttachmentError(
        "링크 본문이 없습니다. 내용을 직접 입력해 주세요.",
      );
    for (const asset of visual) {
      const file = localAssetPath(asset);
      if (!seenFiles.has(file)) {
        try {
          const info = await lstat(file);
          if (!info.isFile() || info.isSymbolicLink() || info.size < 1)
            throw new Error("missing");
          totalBytes += info.size;
          seenFiles.add(file);
        } catch {
          throw new AttachmentError(
            "첨부 파일을 찾을 수 없습니다. 다시 첨부해 주세요.",
          );
        }
      }
    }
    if (record.text.trim()) {
      const body = record.text.length > textShare
        ? record.text.slice(0, textShare) + "\n[여러 영상에 분석 분량을 배분해 이 영상의 텍스트 일부를 생략했습니다.]"
        : record.text;
      references.push({ title: sourceName, body });
    }
    for (const asset of visual)
      references.push({
        title: [...(record.frames ?? []), ...(record.analysisSheets ?? [])].some((frame) => frame.url === asset.url)
          ? `${sourceName} · ${asset.name}`
          : sourceName,
        body: "",
        asset,
        ...(input.media ? { attachmentId: record.id } : {}),
        ...((videoMotion || (input.media && asset.type === "video"))
          ? { role: "motion" as const }
          : {}),
      });
    attachments.push({
      id: record.id,
      kind: record.kind,
      name: record.name,
      detail: record.detail,
      ...(record.url ? { url: record.url } : {}),
    });
  }
  const transmitsAsset = (reference: RunInput["references"][number]) => reference.asset &&
    (!reference.nodeId || input.media?.assignments?.[`node:${reference.nodeId}`] !== "$text") ? reference.asset : undefined;
  for (const reference of input.references) {
    const asset = transmitsAsset(reference);
    if (!asset) continue;
    const file = localAssetPath(asset);
    if (seenFiles.has(file)) continue;
    try {
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink() || info.size < 1)
        throw new Error("missing");
      totalBytes += info.size;
      seenFiles.add(file);
    } catch {
      throw new AttachmentError("연결된 참조 파일을 찾을 수 없습니다.");
    }
  }
  if (
    totalBytes > MAX_MEDIA_BYTES ||
    references.filter(transmitsAsset).length > 12 ||
    JSON.stringify(references).length > 120_000
  )
    throw new AttachmentError(
      "첨부 자료의 크기 또는 개수 한도를 초과했습니다.",
    );
  return { ...input, references, ...(attachments.length ? { attachments } : {}),
    ...(input.presetDesign?.mode === "analyze" && records.length === 1 && records[0]?.cutAnalysis
      ? { presetDesign: { ...input.presetDesign, analyzedCuts: [...new Set(records[0].cutAnalysis.samples.map((sample) => sample.cut))] } }
      : {}),
  };
}
