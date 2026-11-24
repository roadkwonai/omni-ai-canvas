import type { LocalTtsPhase, LocalTtsProgress } from "./tts-types";

type Generated = { seconds: number; /** 예상하는 전체 음성 길이(초). 모르면 0이고 진행 비율로 남은 시간을 계산한다. */ total: number; part: number; parts: number; fraction: number };

/** 한 작업의 진행률과 남은 시간. 적재는 예상 시간으로, 생성은 실제로 만든 양으로 계산한다. */
export function createProgress({ characters, ahead, loadSeconds, secondsPerCharacter, now = Date.now }: {
  characters: number; ahead: number; loadSeconds: number; secondsPerCharacter: number; now?: () => number;
}) {
  const startedAt = now();
  let phase: LocalTtsPhase = "queued";
  let phaseAt = startedAt;
  let loaded = false;
  let made: Generated | undefined;
  let first: { at: number; seconds: number } | undefined;
  let latestAt = startedAt;
  let peak = 0;
  const since = (from: number) => (now() - from) / 1000;
  const whole = characters * secondsPerCharacter;

  function percent() {
    const generatingFrom = loaded ? 20 : 4;
    switch (phase) {
      case "queued": return 0;
      case "preparing": return 2;
      case "loading": return 4 + 15 * (1 - Math.exp(-since(phaseAt) / loadSeconds));
      case "generating": return generatingFrom + (96 - generatingFrom) *
        Math.max(made?.fraction ?? 0, 0.12 * (1 - Math.exp(-since(phaseAt) / Math.max(4, whole / 4))));
      case "finishing": return 98;
    }
  }

  function remaining() {
    if (phase === "loading") return Math.max(1, loadSeconds - since(phaseAt)) + whole;
    if (phase === "finishing") return 1;
    if (phase !== "generating") return undefined;
    if (!made || !first) return Math.max(1, whole - since(phaseAt));
    if (!made.total) return Math.max(1, (since(phaseAt) * (1 - made.fraction)) / Math.max(0.02, made.fraction));
    const speed = made.seconds > first.seconds ? (made.seconds - first.seconds) / Math.max(0.1, (latestAt - first.at) / 1000) : undefined;
    return Math.max(1, speed ? (made.total - made.seconds) / speed - since(latestAt) : whole - since(phaseAt));
  }

  return {
    enter(next: LocalTtsPhase) {
      if (next === phase) return;
      if (next === "loading") loaded = true;
      phase = next;
      phaseAt = now();
    },
    generated(value: Generated) {
      latestAt = now();
      first ??= { at: latestAt, seconds: value.seconds };
      made = { ...value, fraction: Math.max(made?.fraction ?? 0, Math.min(1, value.fraction)) };
    },
    moveUp() { ahead = Math.max(0, ahead - 1); },
    read(): LocalTtsProgress {
      peak = Math.max(peak, Math.min(99, Math.round(percent())));
      const left = remaining();
      return {
        phase, percent: peak, seconds: made?.seconds ?? 0, elapsed: Math.round(since(startedAt)), ahead: phase === "queued" ? ahead : 0,
        ...(made ? { part: made.part, parts: made.parts } : {}), ...(left === undefined ? {} : { remaining: Math.ceil(left) }),
      };
    },
  };
}
