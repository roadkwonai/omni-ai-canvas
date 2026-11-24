import { stat, unlink } from "node:fs/promises";
import { inspectAttachmentFile } from "@/lib/attachment-files";
import {
  AttachmentError,
  createAttachment,
  getAttachment,
} from "@/lib/attachment-store";
import { MAX_REFERENCE_VIDEO_BYTES } from "@/lib/reference-limits";
import type { AttachmentContent } from "@/lib/attachments-types";
import { getProject } from "@/lib/db";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import { localAssetPath } from "@/lib/media";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const { attachmentId, first, last, cutTimes } = await jsonObject(request);
    const hasRange = first !== undefined || last !== undefined;
    const range = typeof first === "number" && typeof last === "number" && Number.isInteger(first) && Number.isInteger(last)
      && first >= 1 && last >= first && last - first < 96 ? { first, last } : undefined;
    if (
      !uuid(id) ||
      !uuid(attachmentId) ||
      (hasRange && !range) || (!hasRange && cutTimes === undefined)
    )
      return bad("연속된 컷을 1~96개 선택해 주세요.");
    if (!(await getProject(id)))
      return bad("프로젝트를 찾을 수 없습니다.", 404);
    let content: AttachmentContent | undefined;
    let sharedSourceUrl: string | undefined;
    try {
      const source = await getAttachment(id, attachmentId);
      if (
        source.kind !== "video" ||
        source.asset?.type !== "video" ||
        !source.cutAnalysis || !source.referenceTiming
      )
        return bad("이 영상에서 검출된 컷 범위를 선택해 주세요.");
      const duration = source.referenceTiming.durationSeconds;
      if (cutTimes !== undefined && (!Array.isArray(cutTimes) || cutTimes.length > 6000 ||
          cutTimes.some((value, i, values) => typeof value !== "number" || !Number.isFinite(value) || value <= 0 ||
            value >= duration || (i > 0 && value <= values[i - 1]))))
        return bad("컷 경계는 영상 안의 서로 다른 시각을 오름차순으로 지정해 주세요.");
      const manualCutTimes = Array.isArray(cutTimes) ? cutTimes as number[] :
        source.cutAnalysis.boundarySource === "manual" ? source.referenceTiming.cutTimes : undefined;
      if (range && range.last > (manualCutTimes ? manualCutTimes.length + 1 : source.cutAnalysis.totalDetectedCuts))
        return bad("존재하는 컷 번호를 선택해 주세요.");
      const inputPath = localAssetPath(source.asset);
      sharedSourceUrl = source.asset.url;
      const info = await stat(inputPath);
      if (!info.isFile() || info.size > MAX_REFERENCE_VIDEO_BYTES)
        return bad("원본 영상 파일을 확인해 주세요.");
      const subtitle = source.text.match(
        /\[(YouTube (?:제공|자동 생성) 자막 \((?:ko|en)\)|로컬 Whisper 음성 전사 · 구간 시각은 추정값|내장 자막 추출)\]\n([\s\S]+)$/,
      );
      content = await inspectAttachmentFile(
        inputPath,
        source.name,
        {
          referenceVideo: true,
          existingAsset: source.asset,
          sourceUrl: source.url,
          cutRange: range,
          manualCutTimes,
          ...(subtitle
            ? { externalSubtitle: { text: subtitle[2], note: subtitle[1] } }
            : {}),
        },
      );
      // 재분석은 같은 프로젝트의 원본 영상을 공유하고 새 표본만 소유한다.
      if (content.asset && content.asset.url !== source.asset.url)
        await unlink(localAssetPath(content.asset));
      const attachment = await createAttachment(id, {
        ...content,
        asset: source.asset,
      });
      return Response.json(
        { attachment },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      if (content)
        await Promise.all(
          [...(content.frames ?? []), ...(content.analysisSheets ?? []),
            ...(content.asset && content.asset.url !== sharedSourceUrl ? [content.asset] : [])].map(
            (frame) => unlink(localAssetPath(frame)).catch(() => {}),
          ),
        );
      if (error instanceof AttachmentError) return bad(error.message, 404);
      return bad(
        "구간 자료를 준비하지 못했습니다. 원본 파일과 컷 번호를 확인해 주세요.",
        422,
      );
    }
  });
}
