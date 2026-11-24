import { directorReferenceMap, readDirectorReferences } from "@/lib/director-references";
import { localApi } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return localApi(request, async () =>
    Response.json({ items: directorReferenceMap(await readDirectorReferences()) }, { headers: { "Cache-Control": "no-store" } }));
}
