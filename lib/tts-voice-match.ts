import { fishVoiceAgeLabels, type TtsGender, type TtsVoice } from "./tts-types";

type Age = keyof typeof fishVoiceAgeLabels;
export type VoiceTarget = { gender?: TtsGender; age?: Age; language?: string; traits: string[] };

const traits: [string, RegExp][] = [
  ["calm", /차분|침착|잔잔|조용|담담|calm|gentle|quiet/i],
  ["warm", /따뜻|다정|온화|포근|warm|caring/i],
  ["soft", /부드럽|섬세|여린|soft|tender/i],
  ["deep", /저음|낮은\s*(?:목소리|음성|톤)|deep|low.pitch/i],
  ["energetic", /활기|밝은|명랑|쾌활|energetic|cheerful/i],
  ["dramatic", /극적|강렬|긴장|dramatic|intense/i],
  ["narration", /내레이션|나레이션|나레이터|narrat/i],
];

export function readExplicitVoiceTarget(text: string): VoiceTarget {
  const identity = text.split(/[\r\n.!?。;]+/).flatMap((part) => {
    const labeled = /^\s*[-*\s]*(?:나이|연령(?:대)?|성별|발화 언어|목소리 언어|age|gender|language)\s*\**\s*[:：]/i.test(part);
    if (labeled || !/아버지|어머니|할아버지|할머니|남편|아내|친구(?:가|는|의)|시절|회상|\b(?:father|mother|grandfather|grandmother|husband|wife|childhood)\b/i.test(part)) return [part];
    const direct = part.match(/^\s*[-*]*(?:만\s*)?\d{1,3}\s*(?:세|살|대)\s*(?:(?:초반|중반|후반)\s*)?[,·]?\s*(?:여성|남성|여자|남자)(?!\s*의)/);
    return direct ? [direct[0]] : [];
  }).join("\n");
  const female = /여성|여자|소녀|\b(?:female|woman|girl)\b/i.test(identity);
  const male = /남성|남자|소년|\b(?:male|man|boy)\b/i.test(identity);
  const number = [...identity.matchAll(/(?:^|[^\d])((?:[1-9]\d?|100))\s*(?:세|살|years?\s*old)/gi)];
  const decades = [...identity.matchAll(/(?:^|[^\d])([1-9])0\s*대/g)];
  const years = [...number.map((item) => Number(item[1])), ...decades.map((item) => Number(item[1]) * 10)];
  const categories = new Set<Age>(years.map((n) => n < 13 ? "Child" : n < 20 ? "Teenage"
    : n < 40 ? "young" : n < 60 ? "middle-aged" : "old"));
  if (!years.length) {
    const ageWords: [Age, RegExp][] = [
      ["Child", /어린이|어린\s*(?:아이|남자|여자)|\bchild\b/i],
      ["Teenage", /청소년|십대|\bteen(?:age|ager)?\b/i],
      ["young", /청년|젊은|\byoung\b/i],
      ["middle-aged", /중년|\bmiddle[- ]aged\b/i],
      ["old", /노년|노인|\b(?:elderly|senior)\b/i],
    ];
    for (const [label, pattern] of ageWords) if (pattern.test(identity)) categories.add(label);
  }
  const age = categories.size === 1 ? categories.values().next().value : undefined;
  const languages: [string, RegExp][] = [
    ["ko", /한국어|한국말|korean/i], ["en", /영어|english/i], ["ja", /일본어|japanese/i],
    ["zh", /중국어|mandarin|chinese/i], ["es", /스페인어|spanish/i], ["ru", /러시아어|russian/i],
  ];
  const mentioned = languages.filter(([, pattern]) => pattern.test(identity));
  return {
    ...(female !== male ? { gender: female ? "female" : "male" } : {}),
    ...(age ? { age } : {}),
    ...(mentioned.length === 1 ? { language: mentioned[0][0] } : {}),
    traits: traits.filter(([, pattern]) => pattern.test(text)).map(([name]) => name),
  };
}

export function matchesVoiceTarget(voice: TtsVoice, target: VoiceTarget): boolean {
  const tags = (voice.tags ?? []).map((tag) => tag.toLowerCase());
  const ageTags = Object.keys(fishVoiceAgeLabels).map((tag) => tag.toLowerCase());
  const description = target.age || target.gender ? readExplicitVoiceTarget(voice.descriptionKo ?? voice.description ?? "") : undefined;
  return (!target.gender || (voice.gender === target.gender && (!description?.gender || description.gender === target.gender))) &&
    (!target.age || (tags.includes(target.age.toLowerCase()) && !ageTags.some((tag) => tag !== target.age!.toLowerCase() && tags.includes(tag)))) &&
    (!target.age || !description?.age || description.age === target.age) &&
    (!target.language || Boolean(voice.languages?.some((language) => language.toLowerCase().split("-")[0] === target.language)));
}

export function shortlistVoices(voices: TtsVoice[], target: VoiceTarget, limit = 24): TtsVoice[] {
  const groups = new Map<string, { voice: TtsVoice; score: number; index: number }[]>();
  voices.filter((voice) => matchesVoiceTarget(voice, target)).forEach((voice, index) => {
    const data = [voice.description, voice.descriptionKo, ...(voice.tags ?? [])].join(" ");
    const score = traits.reduce((total, [name, pattern]) => total + Number(target.traits.includes(name) && pattern.test(data)), 0);
    const age = Object.keys(fishVoiceAgeLabels).find((item) => voice.tags?.some((tag) => tag.toLowerCase() === item.toLowerCase())) ?? "unknown";
    const key = `${target.gender ? "" : voice.gender ?? "unknown"}:${target.age ? "" : age}`;
    const group = groups.get(key) ?? [];
    group.push({ voice, score, index });
    groups.set(key, group);
  });
  for (const group of groups.values()) group.sort((a, b) => b.score - a.score || a.index - b.index);
  const result: TtsVoice[] = [];
  while (result.length < limit && groups.size) {
    const ordered = [...groups.entries()].sort((a, b) => b[1][0].score - a[1][0].score || a[1][0].index - b[1][0].index);
    for (const [key, group] of ordered) {
      if (result.length >= limit) break;
      result.push(group.shift()!.voice);
      if (!group.length) groups.delete(key);
    }
  }
  return result;
}
