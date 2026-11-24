import { bindImageEditSource } from "@/lib/image-edit-server";
import { getProject } from "@/lib/db";
import { AttachmentError, bindAttachments } from "@/lib/attachment-store";
import { bad, jsonObject, localApi, uuid } from "@/lib/http";
import {
  buildRunInput,
  resolveProviderInput,
  RunInputError,
} from "@/lib/run-input";
import { estimate, getProvider } from "@/lib/runner";
import { MediaInputError } from "@/lib/media-request";
import { PaidImageAccessError, requirePaidImageAccess } from "@/lib/workspace-settings-store";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return localApi(request, async () => {
    const { id } = await context.params;
    const body = await jsonObject(request);
    if (!uuid(id)) return bad("프로젝트 주소를 확인해 주세요.");
    const project = await getProject(id);
    if (!project) return bad("프로젝트를 찾을 수 없습니다.", 404);
    try {
      const pending = buildRunInput(project, body, "");
      await requirePaidImageAccess(pending.provider);
      const account = await getProvider(pending.provider);
      const input = await bindAttachments(
        id,
        resolveProviderInput(pending, account),
        body.attachmentIds,
      );
      let checked;
      try { checked = await bindImageEditSource(input); } catch (error) {
        return bad(error instanceof Error ? error.message : "편집 원본을 확인해 주세요.", 422);
      }
      return Response.json(await estimate(checked), {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      if (error instanceof RunInputError)
        return bad(error.message, error.status);
      if (error instanceof AttachmentError) return bad(error.message);
      if (error instanceof MediaInputError) return bad(error.message, 422);
      if (error instanceof PaidImageAccessError) return bad(error.message, 403);
      throw error;
    }
  });
}
