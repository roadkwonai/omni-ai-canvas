import { bad, localRequest } from "../../../lib/http";
import { MAX_MEDIA_BYTES, storeMedia } from "../../../lib/media";

export const runtime = "nodejs";
const MAX_BODY_BYTES = MAX_MEDIA_BYTES + 1024 * 1024;

export async function POST(request: Request) {
  const denied = localRequest(request);
  if (denied) return denied;
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES))
    return bad("파일이 너무 큽니다.", 413);
  if (
    !request.body ||
    !request.headers.get("content-type")?.startsWith("multipart/form-data;")
  )
    return bad("파일을 첨부해 주세요.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return bad("파일이 너무 큽니다.", 413);
      }
      chunks.push(value);
    }
    // multipart 경계 문자열은 대소문자를 구분하므로 원래 헤더를 전달한다.
    const body = new Blob(chunks as BlobPart[]);
    const form = await new Response(body, {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File)) return bad("파일을 첨부해 주세요.");
    if (file.size > MAX_MEDIA_BYTES) return bad("파일이 너무 큽니다.", 413);
    const asset = await storeMedia(
      new Uint8Array(await file.arrayBuffer()),
      file.name,
    );
    return Response.json({ asset }, { status: 201 });
  } catch {
    return bad("지원하지 않는 파일이거나 업로드에 실패했습니다.");
  }
}
