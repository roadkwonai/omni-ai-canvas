import type { TimelineAudio, TimelineWord } from "./timeline-spec";

export function acceptsTimelineEdit(
  baseline: string | null,
  current: string | null,
  attempted: string | null,
) {
  return current === baseline || (attempted !== null && current === attempted);
}

export function transcriptSignature(value: {
  projectId: string;
  track: TimelineAudio | undefined;
  assetUrl: string | undefined;
  words: TimelineWord[];
  frames: number;
}) {
  return JSON.stringify(value);
}
