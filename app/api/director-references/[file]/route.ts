import { readDirectorReferenceFile } from "@/lib/director-references";
import { bad, localApi } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ file: string }> }) {
  return localApi(request, async () => {
    const { file } = await context.params;
    const content = await readDirectorReferenceFile(file);
    if (!content) return bad("참고 예제를 찾을 수 없습니다.", 404);
    const headers = new Headers({
      "Content-Type": file.endsWith(".mp4") ? "video/mp4" : "image/webp",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    });
    const size = content.length;
    const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get("range") ?? "");
    if (!match) return new Response(new Uint8Array(content), { headers });
    const start = Number(match[1]);
    const end = Math.min(match[2] ? Number(match[2]) : size - 1, size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    return new Response(new Uint8Array(content.subarray(start, end + 1)), { status: 206, headers });
  });
}
