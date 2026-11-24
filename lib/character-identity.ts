import type { Asset, CanvasNode, Graph, Kind, RunInput } from "./types";
import { isAsset } from "./asset-shape";

export const soulModels = {
  soul_2: "text2image_soul_v2",
  soul_cinematic: "soul_cinematic",
} as const;

export type CharacterSoul = {
  id: string;
  variant: keyof typeof soulModels;
  status?: "training" | "ready" | "failed";
};

export type CharacterVoice = { id: string; type: "preset" | "element"; status?: "training" | "ready" | "failed" };
export type CharacterIdentity = { soul?: CharacterSoul; voice?: CharacterVoice; voiceSample?: Asset };

export function isSoulId(value: unknown): value is string {
  return typeof value === "string" && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value);
}

export function isVoiceId(value: unknown): value is string {
  return isSoulId(value);
}

export const elementNoteStart = "<!-- scene-room:element:start -->";
export const elementNoteEnd = "<!-- scene-room:element:end -->";

export function elementNoteField(body: string, label: string) {
  const section = body.split(elementNoteStart)[1]?.split(elementNoteEnd)[0] ?? "";
  const prefix = `${label}: `;
  return section.split("\n").find((line) => line.startsWith(prefix))?.slice(prefix.length) ?? "";
}

function onlyKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.includes(key));
}

export function isCharacterIdentity(value: unknown): value is CharacterIdentity {
  if (!onlyKeys(value, ["soul", "voice", "voiceSample"])) return false;
  const { soul, voice, voiceSample } = value;
  return (soul === undefined || (onlyKeys(soul, ["id", "variant", "status"]) && isSoulId(soul.id) &&
    (soul.variant === "soul_2" || soul.variant === "soul_cinematic") &&
    (soul.status === undefined || soul.status === "ready" || soul.status === "training" || soul.status === "failed"))) &&
    (voice === undefined || (onlyKeys(voice, ["id", "type", "status"]) && isVoiceId(voice.id) &&
    (voice.type === "preset" || voice.type === "element") &&
    (voice.status === undefined || voice.status === "ready" || (voice.type === "element" && (voice.status === "training" || voice.status === "failed"))))) &&
    (voiceSample === undefined || (isAsset(voiceSample) && voiceSample.type === "audio"));
}

export function readyCharacterSoul(node: CanvasNode | undefined): CharacterSoul | undefined {
  const soul = node?.kind === "character" ? node.characterIdentity?.soul : undefined;
  return soul && (soul.status === "ready" || soul.status === undefined) ? soul : undefined;
}

export function readyCharacterVoice(node: CanvasNode | undefined): CharacterVoice | undefined {
  const voice = node?.kind === "character" ? node.characterIdentity?.voice : undefined;
  return voice && (voice.status === "ready" || voice.status === undefined) ? voice : undefined;
}

export function soulVideoReferenceError(references: RunInput["references"], usedAssets: Asset[], hasStart: boolean) {
  const missing = !hasStart && references.some((ref) => ref.characterSoul && (!ref.asset ||
    !usedAssets.some((asset) => asset.type === "image" && asset.url === ref.asset?.url)));
  return missing ? "Soul 캐릭터의 기준 이미지 또는 해당 인물로 만든 시작 프레임을 영상 참조에 연결해 주세요." : "";
}

export function characterInputs(graph: Graph, target: string): CanvasNode[] {
  const ids = new Set(graph.edges.filter((edge) =>
    edge.target === target && edge.role === "identity" && edge.usage !== "guide",
  ).map((edge) => edge.source));
  return graph.nodes.filter((node) => node.kind === "character" && ids.has(node.id));
}

export function defaultCharacterReference(source: Kind | undefined, target: Kind | undefined) {
  return source === "character" && (target === "video" || target === "keyframe" || target === "audioCue")
    ? { role: "identity" as const } : {};
}

export function voiceoverLine(body: string): string {
  const lines = body.split(/\r?\n/);
  const heading = lines.findIndex((line) => line.trimEnd() === "## 녹음할 대사");
  const end = heading < 0 ? -1 : lines.findIndex((line, index) => index > heading && line.startsWith("## "));
  const block = heading < 0 ? body : lines.slice(heading + 1, end < 0 ? undefined : end).join("\n");
  return block.trim().match(/^\[VO\][\t ]+[^\r\n：:]+[：:][\t ]*([\s\S]+)$/)?.[1]?.trim() ?? "";
}
