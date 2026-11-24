import type { TimelineWord } from "./timeline-spec";

export function lipCuesFromWords(
  words: TimelineWord[],
  key: string,
  seconds: number,
  offsetSeconds = 0,
) {
  if (
    !key.trim() ||
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    !Number.isFinite(offsetSeconds)
  )
    throw new Error("입 모양 키와 시작 시각을 확인해 주세요.");
  const cues = new Map<number, { key: string; time: number; value: number }>();
  for (const word of words) {
    const start = word.startFrame / 30 - offsetSeconds;
    const end = word.endFrame / 30 - offsetSeconds;
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      end <= 0 ||
      start >= seconds
    )
      continue;
    const a = Math.max(0, start),
      b = Math.min(seconds, end);
    for (const [time, value] of [
      [a, 0],
      [(a + b) / 2, 1],
      [b, 0],
    ]) {
      const position = Math.round(time * 1000);
      cues.set(position, { key: key.trim(), time: position / 1000, value });
    }
  }
  const result = [...cues.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, cue]) => cue);
  if (result.length > 120)
    throw new Error("큐는 배역당 120개까지입니다. 단어 범위를 줄여 주세요.");
  return result;
}

export function parseTimedWords(text: string): TimelineWord[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("대본 타이밍은 JSON 배열이어야 합니다.");
  }
  if (
    !Array.isArray(value) ||
    value.length > 2400 ||
    value.some(
      (word) =>
        !word ||
        typeof word !== "object" ||
        typeof word.text !== "string" ||
        !Number.isInteger(word.startFrame) ||
        !Number.isInteger(word.endFrame) ||
        word.startFrame < 0 ||
        word.endFrame <= word.startFrame,
    )
  )
    throw new Error(
      "단어마다 text, startFrame, endFrame을 입력해 주세요. 시간 단위는 30fps 프레임입니다.",
    );
  return value as TimelineWord[];
}
