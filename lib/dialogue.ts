import { designFromCharacter, parseDesign, plainSpeech, type VoiceDesign } from "./local-tts-options";
import { fromKorean, isPoint, isStyle } from "./speech-markup";
import { ttsTextLimit, voiceIdPattern } from "./tts-types";

export type DialogueLine = { speaker: string; text: string };
/** 참조할 프로젝트 음성이나 설계한 목소리. 설계한 목소리는 같은 시드로 언제나 같은 소리를 낸다. */
type CastVoice = { name: string; voiceId: string } | { name: string; design: VoiceDesign; seed: number };
type DialogueRequest = { lines: (DialogueLine & { /** 같은 줄을 다시 만든 횟수. */ take: number })[]; cast: CastVoice[]; gap: number; seed: number };

export const dialogueLimits = { lines: 120, speakers: 8, gap: { min: 0, max: 2, step: 0.1 } } as const;
/** 설계한 목소리를 정하는 문장. 대화에는 들어가지 않고 그 인물의 모든 줄이 이 소리를 참조한다. */
export const castSample = "오늘은 일찍 눈을 떴어요. 창밖에는 밤새 내린 비가 아직 흐르고 있었죠.";

const notSpeaker = /^(?:(?:지문|SFX|BGM|M|자막|효과음|음악|음향|화면 ?문자|画面文字|CG|타이틀|INSERT|인서트)(?=$|[\s\d])|(?:장소|시간|때|인물|등장인물|출연|배역|목적|목표|배경|길이|러닝타임|화면|카메라|샷|씬|장면|제목|장르|콘셉트|컨셉|대본|참고|주의|의상|소품|조명|설명|형식|화면비|언어|분량)(?:\s*\d+)?$|\d+$)/i;
const note = String.raw`(?:\s*[（(]([^）)]*)[）)])?`;
const formats = [
  new RegExp(String.raw`^\*\*([^*:：]{1,20})[:：]?\*\*${note}[\s:：]+(.+)$`),
  new RegExp(String.raw`^\[([^\]]{1,20})\]${note}\s*[:：]?\s*(.+)$`),
  new RegExp(String.raw`^([^\s:：\[\]<>*#.,!?…·][^:：\[\]<>*#.,!?…·（(]{0,19}?)${note}\s*[:：]\s*(.+)$`),
];

const nameLimit = 20;
/** 이름으로 쓸 수 없는 부호를 띄어쓰기로 바꾼다. */
const cleanName = (name: string) => name.replace(/[^\p{L}\p{N}'’_-]+/gu, " ").trim();
/** 글로 바꿨다가 다시 읽어도 남는 화자 이름인지 확인한다. 문장처럼 긴 말은 화자로 보지 않는다. */
export const isSpeaker = (name: string) =>
  name !== "" && name.length <= nameLimit && name === cleanName(name) && name.split(" ").length <= 3 && !notSpeaker.test(name);

/** 대본에서 화자가 적힌 줄만 읽는다. 화자 없는 줄은 지문으로 보고 센다. */
export function parseDialogue(script: string): { lines: DialogueLine[]; ignored: number } {
  const lines: DialogueLine[] = [];
  let ignored = 0;
  for (const raw of script.split(/\r?\n/)) {
    let line = raw.trim().replace(/^[-•]\s+/, "").replace(/^\[(?:VO|OS|V\.O\.|O\.S\.|N)\]\s*/i, "");
    const tag = line.match(/^\[([^\]]+)\]\s*/)?.[1] ?? "";
    const rest = line.slice(line.indexOf("]") + 1).trim();
    const cue = isPoint(tag) || (isStyle(tag) && formats[2].test(rest)) ? `[${tag}]` : "";
    line = cue ? rest : line;
    if (!line || /^[#|]/.test(line)) continue;
    const found = formats.map((format) => line.match(format)).find(Boolean);
    // 마침표로 끝나는 굵은 글씨는 이름이 아니라 항목 제목이다.
    const speaker = found?.[1].endsWith(".") ? "" : cleanName(found?.[1] ?? "");
    // 주소(https://)와 시각(밤 11:40)의 쌍점은 화자 표시가 아니다.
    if (!found || !isSpeaker(speaker) || found[3].startsWith("//") || (/\d$/.test(speaker) && /^\d/.test(found[3]))) { ignored++; continue; }
    const words = found[3].trim().replace(/^[（(]([^）)]+)[）)]\s*/, "[$1] ");
    lines.push({ speaker, text: fromKorean([cue, found[2]?.trim() && `[${found[2].trim()}]`, words].filter(Boolean).join(" ").trim()) });
  }
  return { lines, ignored };
}

export const dialogueText = (lines: DialogueLine[]) => lines.map(({ speaker, text }) => `${speaker}: ${text}`).join("\n");

export function dialogueSpeakers(lines: DialogueLine[]) {
  const counts = new Map<string, number>();
  for (const { speaker } of lines) counts.set(speaker, (counts.get(speaker) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, lines: count }));
}

const speakerColorCount = 8;
/** 화자마다 정한 색 번호. 정한 색은 지키고 새 화자는 이 대화에서 아직 쓰지 않은 색을 받는다. */
export function speakerColors(names: string[], saved: Record<string, number>): Record<string, number> {
  const colors = Object.fromEntries(Object.entries(saved).filter(([, color]) => Number.isInteger(color) && color >= 0 && color < speakerColorCount));
  for (const name of names) {
    if (Object.hasOwn(colors, name)) continue;
    const here = new Set(names.filter((other) => Object.hasOwn(colors, other)).map((other) => colors[other]));
    const all = new Set(Object.values(colors));
    const free = [...Array(speakerColorCount).keys()];
    colors[name] = free.find((color) => !all.has(color)) ?? free.find((color) => !here.has(color)) ?? Object.keys(colors).length % speakerColorCount;
  }
  return colors;
}

/** 성을 뺀 이름이나 띄어쓰기만 다른 이름 쌍. */
export function similarSpeakers(names: string[]): [string, string][] {
  const plain = names.map((name) => name.replace(/\s/g, ""));
  return names.flatMap((name, index) => names.slice(index + 1).flatMap((other, offset): [string, string][] => {
    const [short, long] = [plain[index], plain[index + 1 + offset]].sort((a, b) => a.length - b.length);
    return short === long || (short.length > 1 && long.length - short.length <= 2 && long.endsWith(short)) ? [[name, other]] : [];
  }));
}

export type DialogueRow = DialogueLine & { id: string; take: number };
/** 글로 고친 줄에 원래 줄의 번호를 잇는다. 같은 줄을 먼저 찾고, 줄 수가 같으면 고친 줄도 같은 자리의 번호를 쓴다. */
export function matchRows(rows: DialogueRow[], lines: DialogueLine[], newId: () => string): DialogueRow[] {
  const left = new Set(rows);
  const same = lines.map((line) => {
    const row = [...left].find(({ speaker, text }) => speaker === line.speaker && text === line.text);
    if (row) left.delete(row);
    return row;
  });
  return lines.map(({ speaker, text }, index) => {
    const row = same[index] ?? (lines.length === rows.length && left.has(rows[index]) ? rows[index] : undefined);
    return { id: row?.id ?? newId(), take: row?.take ?? 0, speaker, text };
  });
}

export type LineStatus = "new" | "changed" | "done";
export type MadeLine = DialogueLine & { take: number; voice: string };
export const lineStatus = (line: DialogueLine & { take: number }, voice: string, made: MadeLine | undefined): LineStatus =>
  !made ? "new" : made.speaker === line.speaker && made.text === line.text && made.take === line.take && made.voice === voice ? "done" : "changed";

/** 글자로 정해지는 31비트 시드(FNV-1a). */
export function textSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) hash = Math.imul(hash ^ byte, 0x01000193);
  return hash >>> 1;
}
export const castSeed = (name: string, design: VoiceDesign, variant: number) =>
  textSeed(JSON.stringify([name, Object.entries(design).filter(([, value]) => value?.length).sort(([a], [b]) => a.localeCompare(b)), variant]));

/** 화면에서 화자마다 고른 목소리. voiceId가 비어 있으면 설계한 목소리를 쓴다. */
export type CastChoice = { voiceId: string; design: VoiceDesign; variant: number };

/** 이름이 맞는 캐릭터의 등록 샘플을 쓰고, 없으면 시트에 적힌 성별과 나이로 새 목소리를 정한다. */
export function suggestVoice(name: string, characters: { title: string; body: string; sampleId?: string }[], voiceIds: string[]): CastChoice {
  const names = characters.map(({ title }) => title.split(/[·(（,|]/)[0].trim());
  const exact = names.indexOf(name);
  const character = characters[exact >= 0 ? exact : names.findIndex((full) => name.length > 1 && full.endsWith(name))];
  return {
    voiceId: character?.sampleId && voiceIds.includes(character.sampleId) ? character.sampleId : "",
    design: character ? designFromCharacter(`${character.title}\n${character.body}`) : {}, variant: 0,
  };
}
/** 실제로 같은 소리를 내는 목소리인지 비교하는 값. */
export const voiceKey = (name: string, choice: CastChoice) => choice.voiceId || String(castSeed(name, choice.design, choice.variant));
export const castVoice = (name: string, { voiceId, design, variant }: CastChoice): CastVoice =>
  voiceId ? { name, voiceId } : { name, design, seed: castSeed(name, design, variant) };

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const hasOnly = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every((key) => keys.includes(key));
const isSeed = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) < 2 ** 31;

function parseVoice(value: unknown): CastVoice | null {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name || value.name.length > nameLimit) return null;
  const { name, voiceId, design, seed } = value;
  if (voiceId !== undefined) return hasOnly(value, ["name", "voiceId"]) && typeof voiceId === "string" && voiceIdPattern.test(voiceId) ? { name, voiceId } : null;
  const parsed = parseDesign(design);
  return parsed && hasOnly(value, ["name", "design", "seed"]) && isSeed(seed) ? { name, design: parsed, seed } : null;
}

export function parseDialogueRequest(value: unknown): DialogueRequest | null {
  if (!isRecord(value) || !hasOnly(value, ["lines", "cast", "gap", "seed"])) return null;
  const { lines, cast, gap, seed } = value;
  if (!Array.isArray(lines) || !lines.length || lines.length > dialogueLimits.lines || !Array.isArray(cast) || cast.length > dialogueLimits.speakers || !isSeed(seed) ||
      typeof gap !== "number" || !(gap >= dialogueLimits.gap.min && gap <= dialogueLimits.gap.max)) return null;
  const voices = cast.map(parseVoice);
  const names = new Set(voices.map((voice) => voice?.name));
  if (voices.includes(null) || names.size !== voices.length) return null;
  const read: DialogueRequest["lines"] = [];
  for (const line of lines) {
    if (!isRecord(line) || !hasOnly(line, ["speaker", "text", "take"])) return null;
    const { speaker, text, take = 0 } = line;
    if (typeof speaker !== "string" || !names.has(speaker) || typeof text !== "string" || text.includes("<|") || !plainSpeech(text) ||
        !Number.isInteger(take) || Number(take) < 0 || Number(take) > 1000) return null;
    read.push({ speaker, text: text.trim(), take: Number(take) });
  }
  const used = new Set(read.map(({ speaker }) => speaker));
  if (used.size !== names.size || read.reduce((sum, { text }) => sum + text.length, 0) > ttsTextLimit) return null;
  return { lines: read, cast: voices as CastVoice[], gap, seed };
}
