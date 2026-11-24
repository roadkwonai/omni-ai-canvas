import { bad, jsonObject, localApi } from "@/lib/http";
import { nodeDocumentPdf } from "@/lib/node-document-pdf";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return localApi(request, async () => {
    const { title, body } = await jsonObject(request);
    if (typeof title !== "string" || title.length > 160 || typeof body !== "string" || body.length > 24_000) {
      return bad("문서 제목과 내용의 길이를 확인해 주세요.");
    }
    try {
      const pdf = await nodeDocumentPdf(title, body);
      return new Response(pdf, {
        headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" },
      });
    } catch (error) {
      return bad(error instanceof Error ? error.message : "PDF를 만들지 못했습니다.", 503);
    }
  });
}
