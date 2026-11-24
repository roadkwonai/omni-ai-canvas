/** 타임라인 시간 단위는 30fps 프레임이다. */
export type TimelineClip = {
  nodeId: string | null;
  durationFrames: number;
  inFrame: number;
  transition: "cut" | "dissolve";
  transitionFrames: number;
};
export type TimelineAudio = {
  nodeId: string;
  startFrame: number;
  inFrame: number;
  durationFrames: number;
  gain: number;
  fadeInFrames: number;
  fadeOutFrames: number;
};
export type TimelineWord = { text: string; startFrame: number; endFrame: number };
export type TimelineSpec = {
  aspect: "16:9" | "9:16" | "1:1";
  clips: TimelineClip[];
  audio: TimelineAudio[];
  words?: TimelineWord[];
};
export const TIMELINE_MAX_FRAMES = 12_600;
export const TIMELINE_MAX_CLIPS = 60;
export const TIMELINE_MAX_AUDIO = 40;
export const TIMELINE_MAX_WORDS = 2400;

const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);

export function validateTimeline(value: unknown): value is TimelineSpec {
  if (
    !object(value) ||
    !["16:9", "9:16", "1:1"].some((aspect) => aspect === value.aspect) ||
    !Array.isArray(value.clips) ||
    value.clips.length > TIMELINE_MAX_CLIPS ||
    !Array.isArray(value.audio) ||
    value.audio.length > TIMELINE_MAX_AUDIO
  )
    return false;
  let frames = 0;
  for (const [index, item] of value.clips.entries()) {
    if (
      !object(item) ||
      !(item.nodeId === null || id(item.nodeId)) ||
      !integer(item.durationFrames, 1, TIMELINE_MAX_FRAMES) ||
      !integer(item.inFrame, 0, TIMELINE_MAX_FRAMES) ||
      !["cut", "dissolve"].some(
        (transition) => transition === item.transition,
      ) ||
      !integer(item.transitionFrames, 0, 150)
    )
      return false;
    if (
      (index === 0 || item.transition === "cut") &&
      item.transitionFrames !== 0
    )
      return false;
    if (
      item.transition === "dissolve" &&
      (index === 0 ||
        item.transitionFrames < 1 ||
        item.transitionFrames >= item.durationFrames ||
        item.transitionFrames >= value.clips[index - 1].durationFrames)
    )
      return false;
    frames += item.durationFrames - item.transitionFrames;
  }
  if (frames > TIMELINE_MAX_FRAMES) return false;
  if (value.words !== undefined) {
    if (!Array.isArray(value.words) || value.words.length > TIMELINE_MAX_WORDS) return false;
    let previousEnd = 0;
    for (const word of value.words) {
      if (!object(word) || typeof word.text !== "string" || !word.text.trim() || word.text.length > 150 ||
          /[\x00-\x1f\x7f]/.test(word.text) ||
          !integer(word.startFrame, previousEnd, frames - 1) || !integer(word.endFrame, word.startFrame + 1, frames))
        return false;
      previousEnd = word.endFrame;
    }
  }
  for (const item of value.audio) {
    if (
      !object(item) ||
      !id(item.nodeId) ||
      !integer(item.startFrame, 0, TIMELINE_MAX_FRAMES - 1) ||
      !integer(item.inFrame, 0, TIMELINE_MAX_FRAMES) ||
      !integer(item.durationFrames, 1, TIMELINE_MAX_FRAMES) ||
      typeof item.gain !== "number" ||
      !Number.isFinite(item.gain) ||
      item.gain < 0 ||
      item.gain > 2 ||
      !integer(item.fadeInFrames, 0, item.durationFrames) ||
      !integer(item.fadeOutFrames, 0, item.durationFrames) ||
      item.startFrame + item.durationFrames > frames
    )
      return false;
  }
  return true;
}

export function remapTimeline(
  spec: TimelineSpec,
  mapping: ReadonlyMap<string, string | null>,
): TimelineSpec {
  return {
    ...spec,
    clips: spec.clips.map((clip) => {
      const nodeId =
        clip.nodeId && mapping.has(clip.nodeId)
          ? (mapping.get(clip.nodeId) ?? null)
          : clip.nodeId;
      return { ...clip, nodeId, inFrame: nodeId ? clip.inFrame : 0 };
    }),
    audio: spec.audio.flatMap((track) =>
      mapping.has(track.nodeId)
        ? mapping.get(track.nodeId)
          ? [{ ...track, nodeId: mapping.get(track.nodeId)! }]
          : []
        : [track],
    ),
  };
}
