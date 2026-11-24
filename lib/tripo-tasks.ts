import { readSecretSync } from "./service-settings";
import { uuid } from "./http";

export type TripoRequest = {
  action: "rig-check" | "rig" | "retarget";
  input: string;
  animation?: string;
};
const fileToken = /^file_[A-Za-z0-9_-]{1,160}$/;
export function parseTripoRequest(value: unknown): TripoRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.input !== "string" ||
    (!uuid(v.input) && (v.action === "retarget" || !fileToken.test(v.input))) ||
    !["rig-check", "rig", "retarget"].includes(String(v.action))
  )
    return null;
  if (
    v.action === "retarget" &&
    (typeof v.animation !== "string" ||
      !/^preset:[a-z0-9_-]{1,64}$/i.test(v.animation))
  )
    return null;
  if (v.action !== "retarget" && v.animation !== undefined) return null;
  return {
    action: v.action as TripoRequest["action"],
    input: v.input,
    ...(typeof v.animation === "string" ? { animation: v.animation } : {}),
  };
}
export async function tripoRequest(
  path: string,
  method: "GET" | "POST",
  body?: object,
): Promise<unknown> {
  const key = readSecretSync("TRIPO_API_KEY");
  if (!key) throw new Error("TRIPO_API_KEY를 서버에 설정해 주세요.");
  const multipart = body instanceof FormData;
  const response = await fetch(`https://openapi.tripo3d.ai/v3/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body && !multipart ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(multipart ? 120_000 : 30_000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      `Tripo 요청 실패 (${response.status}). 작업 기록을 확인하세요.`,
    );
  const result: unknown = await response.json();
  if (
    !result ||
    typeof result !== "object" ||
    !("code" in result) ||
    result.code !== 0
  )
    throw new Error(
      "Tripo가 작업을 처리하지 못했습니다. Tripo에서 작업 기록을 확인하세요.",
    );
  return result;
}
export function tripoFileToken(value: unknown) {
  const token = (value as { data?: { file_token?: unknown } } | null)?.data
    ?.file_token;
  return typeof token === "string" && fileToken.test(token) ? token : null;
}
export function tripoPayload(request: TripoRequest) {
  if (request.action === "rig")
    return {
      input: request.input,
      model: "v3.0-20260909",
      rig_type: "biped",
      spec: "mixamo",
    };
  return {
    input: request.input,
    ...(request.animation ? { animation: request.animation } : {}),
  };
}
