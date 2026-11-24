import { TIMELINE_MAX_WORDS, type TimelineWord } from "./timeline-spec";

function time(frame: number, separator: string) {
  const ms = Math.round(frame * (1000 / 30));
  return (
    [
      Math.floor(ms / 3600000),
      Math.floor(ms / 60000) % 60,
      Math.floor(ms / 1000) % 60,
    ]
      .map((value) => String(value).padStart(2, "0"))
      .join(":") +
    separator +
    String(ms % 1000).padStart(3, "0")
  );
}

export function serializeTimelineWords(
  words: TimelineWord[],
  format: "srt" | "vtt",
) {
  const delimiter = format === "srt" ? "," : ".";
  return (
    (format === "vtt" ? "WEBVTT\n\n" : "") +
    words
      .map((word, index) => {
        const escaped = word.text.replace(
          /[&<>]/g,
          (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]!,
        );
        return `${index + 1}\n${time(word.startFrame, delimiter)} --> ${time(word.endFrame, delimiter)}\n${escaped}\n`;
      })
      .join("\n")
  );
}

type Token = { text?: string; offsets?: { from?: number; to?: number } };
export function wordsFromWhisper(
  value: unknown,
  durationFrames: number,
  timelineStart: number,
): TimelineWord[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("transcription" in value) ||
    !Array.isArray(value.transcription)
  )
    return [];
  const words: TimelineWord[] = [];
  for (const segment of value.transcription) {
    if (!segment || !Array.isArray(segment.tokens)) continue;
    let pending: { text: string; from: number; to: number } | undefined;
    function flush() {
      if (!pending || words.length >= TIMELINE_MAX_WORDS) return;
      const text = pending.text.trim();
      const begin = Math.max(
        0,
        Math.round(pending.from * 0.03),
        (words.at(-1)?.endFrame ?? timelineStart) - timelineStart,
      );
      const end = Math.min(
        durationFrames,
        Math.max(begin + 1, Math.round(pending.to * 0.03)),
      );
      if (text && text.length <= 150 && end > begin)
        words.push({
          text,
          startFrame: begin + timelineStart,
          endFrame: end + timelineStart,
        });
      pending = undefined;
    }
    for (const token of segment.tokens as Token[]) {
      if (
        !token ||
        typeof token.text !== "string" ||
        /^\s*\[_.*\]/.test(token.text)
      )
        continue;
      const { from, to } = token.offsets ?? {};
      if (
        typeof from !== "number" ||
        typeof to !== "number" ||
        !Number.isFinite(from) ||
        !Number.isFinite(to) ||
        to <= from
      )
        continue;
      if (/^\s/.test(token.text)) flush();
      const part = token.text.replace(/[\x00-\x1f\x7f]/g, " ");
      if (pending) {
        pending.text += part;
        pending.to = Math.max(pending.to, to);
      } else pending = { text: part, from, to };
    }
    flush();
  }
  return words;
}
