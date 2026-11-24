import { record } from "./graph";

const localHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/i;
export const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const bad = (error: string, status = 400) =>
  Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );

export function localOrigin(request: Request): string | null {
  const host = request.headers.get("host") || "";
  if (!localHost.test(host)) return null;
  const protocol = new URL(request.url).protocol;
  return protocol === "http:" || protocol === "https:"
    ? `${protocol}//${host.toLowerCase()}`
    : null;
}

export function localRequest(request: Request): Response | null {
  const host = request.headers.get("host") || "";
  const origin = request.headers.get("origin");
  if (
    !localHost.test(host) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return bad("이 제작실은 로컬 컴퓨터에서만 열 수 있습니다.", 403);
  if (origin && origin !== "http://" + host && origin !== "https://" + host)
    return bad("같은 제작실에서 다시 시도해 주세요.", 403);
  if (
    !["GET", "HEAD"].includes(request.method) &&
    !origin &&
    request.headers.has("sec-fetch-mode")
  )
    return bad("요청 출처를 확인할 수 없습니다.", 403);
  return null;
}

class InputError extends Error {}

export async function jsonObject(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new InputError("JSON 요청이 필요합니다.");
  const reader = request.body?.getReader();
  if (!reader) throw new InputError("요청 내용이 비어 있습니다.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 4 * 1024 * 1024) {
      await reader.cancel();
      throw new InputError("요청 크기 한도를 초과했습니다.");
    }
    chunks.push(value);
  }
  let object: unknown;
  try {
    object = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new InputError("JSON 형식을 확인해 주세요.");
  }
  if (!record(object)) throw new InputError("요청 필드를 확인해 주세요.");
  return object;
}

export async function localApi(
  request: Request,
  action: () => Promise<Response>,
) {
  const denied = localRequest(request);
  if (denied) return denied;
  try {
    return await action();
  } catch (error) {
    if (error instanceof InputError) return bad(error.message);
    return bad(
      "제작실 요청을 처리하지 못했습니다. 서버 연결과 데이터베이스 설정을 확인한 뒤 다시 시도해 주세요.",
      503,
    );
  }
}
