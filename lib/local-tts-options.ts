import type { LocalTtsModel } from "./tts-types";
import { readExplicitVoiceTarget } from "./tts-voice-match";

export const designGenders = { female: "여성", male: "남성" } as const;
export const designAges = { child: "어린이", teen: "청소년", young: "청년", middle: "중년", old: "노년" } as const;
export const designPitches = { low: { label: "낮게", prompt: "deep, low-pitched voice" }, high: { label: "높게", prompt: "high-pitched voice" } } as const;
export const designTones = {
  soft: { label: "부드러운", prompt: "soft and gentle" }, clear: { label: "맑은", prompt: "clear and bright" }, warm: { label: "따뜻한", prompt: "warm" },
  husky: { label: "허스키한", prompt: "husky, breathy" }, deep: { label: "묵직한", prompt: "rich and resonant" }, gravelly: { label: "거친", prompt: "gravelly and rough" },
  thin: { label: "가녀린", prompt: "thin and delicate" }, cold: { label: "차가운", prompt: "cold and flat" },
} as const;
export const designEnergies = {
  calm: { label: "차분하게", prompt: "calm, slow and gentle" }, lively: { label: "활기차게", prompt: "energetic, fast-talking and lively" },
  confident: { label: "당당하게", prompt: "confident and assertive" }, shy: { label: "수줍게", prompt: "shy and hesitant" }, tired: { label: "지친 듯", prompt: "tired and low-energy" },
} as const;
export const speechStyles = {
  happy: { label: "기쁨", prompt: "with bright eager excitement" }, sad: { label: "슬픔", prompt: "heavy, deflated sadness" },
  angry: { label: "분노", prompt: "furious, shouting" }, restrained: { label: "참는 분노", prompt: "furious, barely holding it together" },
  scared: { label: "두려움", prompt: "breathless and terrified" }, tender: { label: "다정함", prompt: "warm, gentle bedtime voice" },
  icy: { label: "냉정함", prompt: "icy calm" }, sarcastic: { label: "비꼼", prompt: "sarcastic and deadpan" },
  whisper: { label: "속삭임", prompt: "whispering softly" }, shout: { label: "외침", prompt: "shouting" },
  excited: { label: "들뜸", prompt: "more excited" }, loud: { label: "크게", prompt: "louder" },
  fast: { label: "빠르게", prompt: "faster" }, slow: { label: "천천히", prompt: "slower, with more pauses" },
  high: { label: "높은 음", prompt: "higher pitch" }, low: { label: "낮은 음", prompt: "lower pitch" },
  narration: { label: "내레이션", prompt: "calm documentary narration" }, broadcast: { label: "방송", prompt: "professional broadcast tone" },
} as const;
/** 대사 안에 넣는 지시. points·spans는 2026-11-24 한국어 시험에서 바뀌는 것을 확인했거나 공식 데모가 쓰는 것, weak는 효과가 뚜렷하지 않았던 공식 태그다. */
export const speechTags: Record<LocalTtsModel, { points: Record<string, string>; weak: Record<string, string>; spans: Record<string, string> }> = {
  "drama-3": {
    points: {
      pause: "쉼", "long pause": "긴 쉼", hesitates: "머뭇", laughs: "웃음", giggles: "키득", chuckles: "피식", scoffs: "코웃음", sighs: "한숨", gasps: "헉",
      inhales: "들숨", exhales: "날숨", panting: "헐떡임", sobs: "흐느낌", cries: "울음", sniffles: "훌쩍", coughs: "기침", "clears throat": "헛기침",
      yawns: "하품", groans: "끙", hums: "흥얼",
    },
    weak: {},
    spans: {
      whisper: "속삭임", slow: "느리게", fast: "빠르게", emphasis: "강조", loud: "크게", shout: "외침", "high-pitched": "높은 음",
      sad: "슬프게", angry: "화내며", scared: "겁먹고", crying: "울먹임", laughing: "웃으며", singing: "노래하듯",
    },
  },
  "s2-pro": {
    points: { laughing: "웃음", chuckling: "키득", sigh: "한숨", coughing: "기침", "clearing throat": "헛기침", moaning: "끙" },
    weak: {
      pause: "쉼", "short pause": "짧은 쉼", emphasis: "강조", inhale: "들숨", exhale: "날숨", panting: "헐떡임", chuckle: "피식", tsk: "쯧", singing: "노래",
      "laughing tone": "웃는 말투", excited: "들뜸", "excited tone": "들뜬 말투", delight: "기쁨", sad: "슬픔", angry: "분노", surprised: "놀람", shocked: "충격",
      whisper: "속삭임", shouting: "외침", screaming: "비명", loud: "큰 소리", "volume up": "음량 크게", "low volume": "작은 소리", "volume down": "음량 작게",
      "low voice": "낮은 목소리", "with strong accent": "강한 억양", interrupting: "끼어들기", echo: "울림", "audience laughter": "관객 웃음",
    },
    spans: {},
  },
};
export const supportsDesign = (model: LocalTtsModel) => model === "drama-3";

export type VoiceDesign = {
  gender?: keyof typeof designGenders; age?: keyof typeof designAges; pitch?: keyof typeof designPitches;
  tones?: (keyof typeof designTones)[]; energy?: keyof typeof designEnergies; note?: string; scene?: string;
};
export type LocalTtsOptions = {
  design?: VoiceDesign; style?: keyof typeof speechStyles; styleNote?: string;
  seconds?: number; speed?: number; semitones?: number; normalize?: boolean;
  temperature?: number; topP?: number; topK?: number; seed?: number;
};
/** 아무것도 고르지 않은 목소리의 설명. */
export const plainVoice = "natural speaking voice";
export const maxTones = 3;
export const optionRanges = {
  speed: { min: 0.7, max: 1.5, step: 0.05 }, semitones: { min: -4, max: 4, step: 1 },
  temperature: { min: 0.3, max: 1.3, step: 0.1 }, topP: { min: 0.5, max: 1, step: 0.05 }, topK: { min: 1, max: 100, step: 1 }, seed: { min: 0, max: 2 ** 31 - 1, step: 1 },
} as const;
/** 목표 길이의 범위(초). 자연스러운 길이보다 짧으면 Drama 3가 뒤쪽 말을 빠뜨린다. */
export const secondsRange = (characters: number) => ({ min: Math.ceil(characters * 0.4) / 2, max: Math.max(3, Math.ceil(characters * 0.8) / 2), step: 0.5 });
export const samplingDefaults: Record<LocalTtsModel, { temperature: number; topP: number; topK?: number }> = {
  "drama-3": { temperature: 1, topP: 0.9 }, "s2-pro": { temperature: 0.7, topP: 0.7, topK: 30 },
};

const ageNouns: Record<keyof typeof designAges, Record<"female" | "male" | "any", string>> = {
  child: { female: "little girl, about seven years old", male: "little boy, about seven years old", any: "child, about seven years old" },
  teen: { female: "teenage girl, about sixteen", male: "teenage boy, about sixteen", any: "teenager, about sixteen" },
  young: { female: "young woman in her twenties", male: "young man in his twenties", any: "young adult in their twenties" },
  middle: { female: "middle-aged woman in her late forties", male: "middle-aged man in his late forties", any: "middle-aged person in their late forties" },
  old: { female: "elderly woman, about seventy-five, slightly shaky", male: "elderly man, about seventy-five, gravelly and slightly shaky", any: "elderly person, about seventy-five" },
};

export function describeVoiceDesign({ gender, age, pitch, tones = [], energy, note }: VoiceDesign): string {
  const person = age ? ageNouns[age][gender ?? "any"] : gender ? `adult ${gender === "female" ? "woman" : "man"}` : "";
  return [person, pitch && designPitches[pitch].prompt, ...tones.map((tone) => designTones[tone].prompt), energy && designEnergies[energy].prompt, note]
    .filter(Boolean).join(", ");
}

export const withDirection = ({ style, styleNote }: LocalTtsOptions) => styleNote || (style ? speechStyles[style].prompt : "");

/** 대사에 든 지시 표시. 1은 [지시], 2는 닫는 표시, 3은 감싸는 지시의 이름이다. */
export const cuePattern = /\[([^[\]\n]+)\]|<(\/?)([a-z][a-z-]*)>/gi;

/** 대사에서 지시 표시를 뺀, 실제로 소리 내는 말. */
export const plainSpeech = (text: string) =>
  text.replace(/<\/?[a-z][a-z-]*>/gi, "").replace(/\[[^\[\]\n]*\]/g, " ").replace(/[ \t]+/g, " ").replace(/ ([.,!?…。！？])/g, "$1").trim();

/** 앞부분만 자르되 열린 지시는 빼고 감싼 지시는 닫는다. */
export function previewText(text: string, limit: number): string {
  let cut = Array.from(text.trim()).slice(0, limit).join("");
  if (cut !== text.trim()) cut = cut.replace(/\[[^\]]*$|<\/?[a-z-]*$/i, "").trim();
  const open = [...cut.matchAll(/<(\/?)([a-z][a-z-]*)>/gi)].reduce<string[]>((stack, [, close, name]) => close ? stack.slice(0, -1) : [...stack, name], []);
  return cut.replace(/(?:<[a-z][a-z-]*>\s*)+$/i, (empty) => { open.splice(-empty.match(/</g)!.length); return ""; }).trim() + open.reverse().map((name) => `</${name}>`).join("");
}

export function postFilters({ speed = 1, semitones = 0, normalize }: LocalTtsOptions, rate: number): string | null {
  const ratio = 2 ** (semitones / 12);
  const tempo = Number((speed / ratio).toFixed(4));
  const filters = [
    ...(semitones ? [`asetrate=${Math.round(rate * ratio)}`, `aresample=${rate}`] : []),
    ...(tempo !== 1 ? [`atempo=${tempo}`] : []),
    ...(normalize ? ["loudnorm=I=-16:TP=-1.5:LRA=11", `aresample=${rate}`] : []),
  ];
  return filters.length ? filters.join(",") : null;
}

const oneOf = <T extends object>(table: T, value: unknown): value is keyof T => typeof value === "string" && Object.hasOwn(table, value);
const line = (value: unknown, limit: number) => typeof value === "string" && value.trim().length <= limit && !/[\u0000-\u001f\u007f\[\]]|<\|/.test(value.trim())
  ? value.trim() : null;

export function parseDesign(value: unknown): VoiceDesign | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { gender, age, pitch, tones, energy, note, scene, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length) return null;
  const choices = [[gender, designGenders], [age, designAges], [pitch, designPitches], [energy, designEnergies]] as const;
  if (choices.some(([choice, table]) => choice !== undefined && choice !== "" && !oneOf(table, choice))) return null;
  const list = tones === undefined ? [] : tones;
  if (!Array.isArray(list) || list.length > maxTones || !list.every((tone) => oneOf(designTones, tone))) return null;
  const texts = [note === undefined ? "" : line(note, 200), scene === undefined ? "" : line(scene, 200)];
  if (texts.includes(null)) return null;
  return {
    ...(gender ? { gender: gender as VoiceDesign["gender"] } : {}), ...(age ? { age: age as VoiceDesign["age"] } : {}),
    ...(pitch ? { pitch: pitch as VoiceDesign["pitch"] } : {}), ...(list.length ? { tones: [...new Set(list)] as VoiceDesign["tones"] } : {}),
    ...(energy ? { energy: energy as VoiceDesign["energy"] } : {}), ...(texts[0] ? { note: texts[0] } : {}), ...(texts[1] ? { scene: texts[1] } : {}),
  };
}

export function parseLocalTtsOptions(value: unknown, { model, reference, characters }: {
  model: LocalTtsModel; reference: boolean; characters: number;
}): LocalTtsOptions | null {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { design, style, styleNote, normalize, seconds, speed, semitones, temperature, topP, topK, seed, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length) return null;
  const numbers = { seconds, speed, semitones, temperature, topP, topK, seed };
  const ranges = { ...optionRanges, seconds: secondsRange(characters) };
  if (seconds !== undefined && model !== "drama-3") return null;
  for (const [key, number] of Object.entries(numbers)) {
    const { min, max } = ranges[key as keyof typeof ranges];
    if (number !== undefined && (typeof number !== "number" || !(number >= min && number <= max) ||
        (["semitones", "topK", "seed"].includes(key) && !Number.isInteger(number)))) return null;
  }
  if (normalize !== undefined && typeof normalize !== "boolean") return null;
  if (style !== undefined && style !== "" && !oneOf(speechStyles, style)) return null;
  const note = styleNote === undefined ? "" : line(styleNote, 120);
  if (note === null || (style && note)) return null;
  const parsedDesign = design === undefined ? {} : parseDesign(design);
  if (!parsedDesign) return null;
  const hasDesign = Object.keys(parsedDesign).length > 0;
  if (hasDesign && (reference || !supportsDesign(model))) return null;
  const given = Object.fromEntries(Object.entries(numbers).filter(([key, number]) =>
    number !== undefined && !(key === "speed" && number === 1) && !(key === "semitones" && number === 0)));
  return {
    ...(hasDesign ? { design: parsedDesign } : {}), ...(style ? { style: style as LocalTtsOptions["style"] } : {}), ...(note ? { styleNote: note } : {}),
    ...(normalize ? { normalize } : {}), ...given,
  };
}

export function optionSummary({ design = {}, style, styleNote, seconds, speed, semitones, normalize }: LocalTtsOptions): string {
  return [
    design.gender && designGenders[design.gender], design.age && designAges[design.age], design.pitch && `음높이 ${designPitches[design.pitch].label}`,
    ...(design.tones ?? []).map((tone) => designTones[tone].label), design.energy && designEnergies[design.energy].label, design.note, design.scene && `장면 ${design.scene}`,
    style && speechStyles[style].label, styleNote, seconds && `${seconds}초에 맞춤`, speed && speed !== 1 && `${speed}배속`,
    semitones && `음정 ${semitones > 0 ? "+" : ""}${semitones}`, normalize && "음량 고르게",
  ].filter(Boolean).join(" · ");
}

const characterAges = { Child: "child", Teenage: "teen", young: "young", "middle-aged": "middle", old: "old" } as const;
export function designFromCharacter(text: string): VoiceDesign {
  const { gender, age } = readExplicitVoiceTarget(text);
  return { ...(gender ? { gender } : {}), ...(age ? { age: characterAges[age] } : {}) };
}
