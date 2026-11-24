import { cuePattern, plainSpeech, speechStyles, speechTags, type LocalTtsOptions } from "./local-tts-options";
import { dialogueLimits } from "./dialogue";
import { isLocalTtsModel, ttsTextLimit, type LocalTtsModel } from "./tts-types";

export type DirectionLine = { speaker?: string; text: string };
type DirectionRequest = { model: LocalTtsModel; lines: DirectionLine[]; /** 감정과 상황을 읽을 대본이나 캐릭터 설명. */ context: string };
export type DirectedLine = { text: string; style?: NonNullable<LocalTtsOptions["style"]>; reason: string; changed: boolean };

const contextLimit = 20_000;
const maxNewTags = 4;

export function parseDirectionRequest(value: unknown): DirectionRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { model, lines, context = "" } = value as Record<string, unknown>;
  if (!isLocalTtsModel(model) || typeof context !== "string" || context.length > contextLimit || !Array.isArray(lines) || !lines.length || lines.length > dialogueLimits.lines) return null;
  const read: DirectionLine[] = [];
  for (const line of lines as (Record<string, unknown> | null)[]) {
    const { speaker, text } = line ?? {};
    if (typeof text !== "string" || text.includes("<|") || !plainSpeech(text) || (speaker !== undefined && (typeof speaker !== "string" || !speaker || speaker.length > 20))) return null;
    read.push({ ...(speaker ? { speaker: speaker as string } : {}), text });
  }
  return read.reduce((sum, { text }) => sum + text.length, 0) > ttsTextLimit ? null : { model, lines: read, context };
}

/** 문장과 그 뒤의 빈칸으로 나눈다. 소리 낼 글자가 없는 조각은 앞 문장에, 맨 앞이면 다음 문장에 붙이고 감싼 지시의 가운데는 자르지 않는다. */
export function splitSentences(text: string): { text: string; gap: string }[] {
  const sentences: { text: string; gap: string }[] = [];
  const pieces = text.trim().split(/(?<=[.!?…。！？]["'”’)]*(?:<\/[a-z-]+>)*)(?=\s)|(?=\n)/);
  for (const piece of pieces) {
    const body = piece.trimStart();
    const gap = piece.slice(0, piece.length - body.length);
    const last = sentences.at(-1);
    const unclosed = last && (last.text.match(/<[a-z][a-z-]*>/gi)?.length ?? 0) > (last.text.match(/<\/[a-z][a-z-]*>/gi)?.length ?? 0);
    if (last && body && (unclosed || !/[\p{L}\p{N}]/u.test(plainSpeech(last.text)))) {
      last.text += last.gap + gap + body;
      last.gap = "";
      continue;
    }
    if (last && !body) { last.gap += gap; continue; }
    if (last && (!/[\p{L}\p{N}]/u.test(plainSpeech(body)) || sentences.length >= dialogueLimits.lines)) {
      last.text += last.gap + gap + body;
      last.gap = "";
    } else {
      if (last) last.gap += gap;
      sentences.push({ text: body, gap: "" });
    }
  }
  return sentences;
}

/** 지시와 그 앞까지의 말. 앞말이 같으면 같은 자리다. */
const tags = (text: string) => [...text.matchAll(cuePattern)].map(({ 0: raw, 1: point, 2: close, 3: span, index }) =>
  ({ raw, point, close: Boolean(close), span, before: text.slice(0, index).replace(cuePattern, "").replace(/\s/g, "") }));

/** AI가 돌려준 줄이 대사를 그대로 두고 허용한 지시만 더했는지 확인한다. */
function accepted(text: string, original: string, model: LocalTtsModel): boolean {
  if (!text || text.includes("<|") || (/[\r\n]/.test(text) && !/[\r\n]/.test(original)) || plainSpeech(text) !== plainSpeech(original)) return false;
  const kept = tags(original);
  const open: string[] = [];
  let added = 0;
  for (const { raw, point, close, span, before } of tags(text)) {
    if (span && !close) open.push(span);
    if (close && open.pop() !== span) return false;
    const index = kept.findIndex((tag) => tag.raw === raw && tag.before === before);
    if (index >= 0) { kept.splice(index, 1); continue; }
    if (!close) added++;
    if (!Object.hasOwn(span ? speechTags[model].spans : speechTags[model].points, span ?? point)) return false;
  }
  return !open.length && !kept.length && added <= maxNewTags;
}

export function applyDirections(output: string, lines: DirectionLine[], model: LocalTtsModel): DirectedLine[] {
  let items: unknown;
  try { items = JSON.parse(output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")).lines; } catch { /* 아래에서 알린다. */ }
  if (!Array.isArray(items)) throw new Error("AI가 고른 연기 지시를 읽지 못했습니다. 다시 시도해 주세요.");
  const byId = new Map<number, Record<string, unknown>>();
  for (const item of items as Record<string, unknown>[]) if (Number.isInteger(item?.id) && !byId.has(item.id as number)) byId.set(item.id as number, item);
  return lines.map(({ text: original }, id) => {
    const { text, style, reason } = byId.get(id) ?? {};
    const directed = typeof text === "string" && text.trim() !== original && accepted(text.trim(), original, model) ? text.trim().replace(/\](?=[\p{L}\p{N}“"‘'])/gu, "] ") : original;
    const tone = typeof style === "string" && Object.hasOwn(speechStyles, style) ? style as DirectedLine["style"] : undefined;
    const changed = directed !== original || Boolean(tone);
    return {
      text: directed, ...(tone ? { style: tone } : {}), changed,
      reason: changed && typeof reason === "string" && /[가-힣]/.test(reason) ? reason.trim().slice(0, 120) : "",
    };
  });
}

/** 대사에 든 지시를 화면에 보여줄 이름으로 바꾼다. */
export function directionLabels(text: string, model: LocalTtsModel): string[] {
  const { points, weak, spans } = speechTags[model];
  const names: Record<string, string> = { ...weak, ...points };
  return tags(text).filter(({ close }) => !close).map(({ point, span }) => span ? spans[span] ?? span : names[point] ?? point);
}

/** 작업실 텍스트 에이전트에게 보내는 요청 본문. */
export function directionSource({ model, lines, context }: DirectionRequest) {
  const { points, spans } = speechTags[model];
  return JSON.stringify({
    styles: Object.fromEntries(Object.entries(speechStyles).map(([key, { label }]) => [key, label])), points, spans,
    context, lines: lines.map(({ speaker, text }, id) => ({ id, ...(speaker ? { speaker } : {}), text })),
  });
}
