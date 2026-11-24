import { executeVoiceRecommendation } from "./runner";
import { textAgentInput } from "./text-agent";
import { elementNoteEnd, elementNoteStart } from "./character-identity";
import type { CanvasNode } from "./types";
import type { TtsVoice } from "./tts-types";
import { readExplicitVoiceTarget, shortlistVoices, type VoiceTarget } from "./tts-voice-match";

export type RecommendedVoice = TtsVoice & { reason: string };
export type VoiceRecommendationResult = { voices: RecommendedVoice[]; target: VoiceTarget };

export function parseVoiceRecommendations(output: string, candidates: TtsVoice[]): RecommendedVoice[] {
  const raw = output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error("추천 결과를 읽지 못했습니다. 다시 시도해 주세요."); }
  const items = data && typeof data === "object" && "items" in data ? data.items : undefined;
  if (!Array.isArray(items)) throw new Error("추천 결과를 읽지 못했습니다. 다시 시도해 주세요.");
  if (!items.length) return [];
  const byId = new Map(candidates.map((voice) => [voice.id, voice]));
  const seen = new Set<string>();
  const results: RecommendedVoice[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || typeof item.reason !== "string") continue;
    const voice = byId.get(item.id);
    const reason = item.reason.trim();
    if (!voice || seen.has(item.id) || !/[가-힣]/.test(reason) || reason.length > 250) continue;
    seen.add(item.id);
    results.push({ ...voice, reason });
    if (results.length === 5) break;
  }
  if (!results.length) throw new Error("추천할 목소리를 확인하지 못했습니다. 다시 시도해 주세요.");
  return results;
}

export async function recommendVoices(character: CanvasNode, readCandidates: (target: VoiceTarget) => Promise<TtsVoice[]>): Promise<VoiceRecommendationResult> {
  const noteStart = character.body.indexOf(elementNoteStart);
  const noteEnd = character.body.indexOf(elementNoteEnd);
  const description = noteStart >= 0 && noteEnd >= noteStart
    ? character.body.slice(0, noteStart) + character.body.slice(noteEnd + elementNoteEnd.length)
    : character.body;
  const target = readExplicitVoiceTarget(`${character.title}\n${description}`);
  const shortlist = shortlistVoices(await readCandidates(target), target, 24);
  if (!shortlist.length) return { voices: [], target };
  const input = await textAgentInput();
  const source = JSON.stringify({
    character: { name: character.title.slice(0, 160), description: description.slice(0, 4000) },
    target,
    candidates: shortlist.map(({ id, description, descriptionKo, gender, tags, languages }) => ({
      id, description: (descriptionKo ?? description)?.slice(0, 320), gender, tags, languages,
    })),
  });
  const result = await executeVoiceRecommendation(input, source);
  return { voices: parseVoiceRecommendations(result.text ?? "", shortlist), target };
}
