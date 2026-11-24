import { cuePattern, speechStyles, speechTags } from "./local-tts-options";
import type { LocalTtsModel } from "./tts-types";

const flip = (table: Record<string, string>) => Object.fromEntries(Object.entries(table).map(([key, label]) => [label, key]));
const tables = (model: LocalTtsModel) => {
  const { points, weak, spans } = speechTags[model];
  const cues: Record<string, string> = { ...Object.fromEntries(Object.values(speechStyles).map(({ prompt, label }) => [prompt, label])), ...weak, ...points };
  return { cues, spans, cueKeys: flip(cues), spanKeys: flip(spans) };
};
const models = { "drama-3": tables("drama-3"), "s2-pro": tables("s2-pro") };
const { cues, spans } = models["drama-3"];
const find = (table: Record<string, string>, key: string) => Object.hasOwn(table, key) ? table[key] : undefined;

const swap = (text: string, cueTable: Record<string, string>, spanTable: Record<string, string>) => text
  .replace(/\[([^[\]\n]+)\]/g, (raw, cue) => `[${find(cueTable, cue.trim()) ?? raw.slice(1, -1)}]`)
  .replace(/<(\/?)([^<>/\n]+)>/g, (raw, close, span) => { const name = find(spanTable, span.trim()); return name ? `<${close}${name}>` : raw; });

/** 모델에 보내는 지시를 화면에 보이는 한국어로 바꾼다. */
export const toKorean = (text: string, model: LocalTtsModel = "drama-3") => swap(text, models[model].cues, models[model].spans);
/** 한국어로 적은 지시를 모델에 보내는 지시로 바꾼다. 모르는 지시는 그대로 둔다. */
export const fromKorean = (text: string, model: LocalTtsModel = "drama-3") => swap(text, models[model].cueKeys, models[model].spanKeys);
/** 줄 앞에 홀로 적은 지시를 화자 이름과 구분한다. 말투는 화자가 이어 적혀 있을 때만 지시로 본다. */
export const isPoint = (name: string) => Object.hasOwn(speechTags["drama-3"].points, name) || Object.values(speechTags["drama-3"].points).includes(name);
export const isStyle = (name: string) => Object.values(speechStyles).some(({ label, prompt }) => label === name || prompt === name);

type MarkupPiece = { cue: string } | { text: string; spans: string[] };

/** 대사를 지시와, 감싼 지시가 걸린 말로 나눈다. */
export function markupPieces(text: string): MarkupPiece[] {
  const pieces: MarkupPiece[] = [];
  const open: string[] = [];
  const say = (words: string) => {
    if (words.trim() || (words && pieces.length && "text" in pieces.at(-1)!)) pieces.push({ text: pieces.length && "cue" in pieces.at(-1)! ? words.trimStart() : words, spans: [...open] });
  };
  let at = 0;
  for (const match of text.matchAll(cuePattern)) {
    const label = match[1] === undefined ? find(spans, match[3]) : find(cues, match[1]) ?? match[1];
    if (!label) continue;
    say(text.slice(at, match.index));
    at = match.index + match[0].length;
    if (match[1] !== undefined) pieces.push({ cue: label });
    else if (match[2]) open.splice(open.lastIndexOf(label), open.includes(label) ? 1 : 0);
    else open.push(label);
  }
  say(text.slice(at));
  return pieces;
}
