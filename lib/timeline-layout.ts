import { TIMELINE_MAX_FRAMES, validateTimeline, type TimelineAudio, type TimelineClip, type TimelineSpec } from "./timeline-spec";
import type { CanvasNode } from "./types";

/** blocking이 false면 저장은 되지만 합성할 수 없다. */
export type TimelineIssue = { kind: "clip" | "audio" | "words" | "timeline"; index: number; text: string; blocking: boolean };
export type TimelineNodes = ReadonlyMap<string, Pick<CanvasNode, "kind" | "asset">>;

const slateKinds = ["shot", "keyframe", "video"];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function clipRanges(clips: readonly TimelineClip[]) {
  let end = 0;
  return clips.map((clip) => {
    const start = end - clip.transitionFrames;
    end = start + clip.durationFrames;
    return { start, end };
  });
}

// 브라우저는 길이를 마이크로초에서 잘라 마지막 프레임이 조금 모자라게 읽힌다.
const sourceFrames = (seconds: number) => Math.floor(seconds * 30 + 0.01);

export function clipSource(nodeId: string | null, nodes: TimelineNodes) {
  const node = nodeId === null ? undefined : nodes.get(nodeId);
  if (nodeId === null) return "slate";
  if (!node) return "missing";
  if (!node.asset) return slateKinds.includes(node.kind) ? "slate" : "unusable";
  return node.asset.type === "audio" ? "unusable" : node.asset.type;
}

export function audioSource(nodeId: string, nodes: TimelineNodes) {
  const node = nodes.get(nodeId);
  if (!node) return "missing";
  if (!node.asset) return node.kind === "audioCue" ? "silent" : "unusable";
  return node.asset.type === "audio" ? "audio" : "unusable";
}

export const timelineFrames = (clips: readonly TimelineClip[]) => clipRanges(clips).at(-1)?.end ?? 0;

/** 재생 위치에 보이는 컷을 아래부터 쌓는 순서로 돌려준다. */
export function layersAt(clips: readonly TimelineClip[], frame: number) {
  const ranges = clipRanges(clips);
  const progress = (index: number) => {
    const length = clips[index]?.transitionFrames;
    return length ? clamp((frame - ranges[index].start) / length, 0, 1) : 1;
  };
  return ranges.flatMap(({ start, end }, index) => {
    if (frame < start || frame >= end) return [];
    const opacity = progress(index);
    const next = ranges[index + 1];
    const fade = next && frame >= next.start ? 1 - progress(index + 1) : 1;
    return [{ index, sourceFrame: clips[index].inFrame + frame - start, opacity, volume: opacity * fade }];
  });
}

export function audioGainAt(track: TimelineAudio, frame: number) {
  const local = frame - track.startFrame;
  if (local < 0 || local >= track.durationFrames) return 0;
  const fadeIn = track.fadeInFrames ? Math.min(1, local / track.fadeInFrames) : 1;
  const fadeOut = track.fadeOutFrames ? Math.min(1, (track.durationFrames - local) / track.fadeOutFrames) : 1;
  return track.gain * fadeIn * fadeOut;
}

const startWithCut = (clips: TimelineClip[]) =>
  clips.map((clip, index) => index ? clip : { ...clip, transition: "cut" as const, transitionFrames: 0 });

export function moveClip(clips: TimelineClip[], from: number, to: number) {
  if (from === to || !clips[from] || !clips[to]) return clips;
  const rest = clips.filter((_, index) => index !== from);
  return startWithCut([...rest.slice(0, to), clips[from], ...rest.slice(to)]);
}

export const removeClip = (clips: TimelineClip[], target: number) =>
  startWithCut(clips.filter((_, index) => index !== target));

/** 원본 길이(초)를 알면 그 안에서만 늘린다. */
export function trimClip(clips: TimelineClip[], target: number, durationFrames: number, sourceSeconds = Infinity) {
  const clip = clips[target];
  const min = Math.max(clip.transitionFrames, clips[target + 1]?.transitionFrames ?? 0) + 1;
  const room = TIMELINE_MAX_FRAMES - timelineFrames(clips) + clip.durationFrames;
  const source = sourceFrames(sourceSeconds) - clip.inFrame;
  const duration = clamp(durationFrames, min, Math.max(min, Math.min(room, source)));
  return clips.map((item, index) => index === target ? { ...item, durationFrames: duration } : item);
}

export const moveAudio = (track: TimelineAudio, frames: number, startFrame: number) =>
  ({ ...track, startFrame: clamp(startFrame, 0, Math.max(0, frames - track.durationFrames)) });

export function trimAudio(track: TimelineAudio, frames: number, durationFrames: number, sourceSeconds = Infinity) {
  const source = sourceFrames(sourceSeconds) - track.inFrame;
  const duration = clamp(durationFrames, 1, Math.max(1, Math.min(frames - track.startFrame, source)));
  return { ...track, durationFrames: duration,
    fadeInFrames: Math.min(track.fadeInFrames, duration), fadeOutFrames: Math.min(track.fadeOutFrames, duration) };
}

export function timecode(frames: number) {
  const tenths = Math.round(frames / 3);
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, "0")}.${tenths % 10}`;
}

export const rulerSeconds = (frames: number, marks: number) =>
  [0.5, 1, 2, 5, 10, 15, 30, 60].find((step) => frames / 30 / step <= marks) ?? 60;

/** 노드를 넘기면 합성 때 거절될 원본도 알린다. seconds는 길이를 읽은 자산 URL과 초다. */
export function timelineIssues(spec: TimelineSpec, board?: { nodes: TimelineNodes; seconds: ReadonlyMap<string, number> }): TimelineIssue[] {
  const issues: TimelineIssue[] = [];
  const frames = timelineFrames(spec.clips);
  const overSource = (nodeId: string, item: { inFrame: number; durationFrames: number }) =>
    (item.inFrame + item.durationFrames) / 30 > (board?.seconds.get(board.nodes.get(nodeId)?.asset?.url ?? "") ?? Infinity) + 1 / 30;
  spec.clips.forEach((clip, index) => {
    const add = (text: string, blocking = true) => issues.push({ kind: "clip", index, text: `컷 ${index + 1}: ${text}`, blocking });
    const previous = spec.clips[index - 1];
    if (clip.durationFrames < 1) add("길이를 0.04초 이상으로 정해 주세요.");
    else if (clip.transitionFrames && !previous) add("첫 컷에는 전환을 넣을 수 없습니다.");
    else if (clip.transitionFrames && (clip.transitionFrames >= clip.durationFrames || clip.transitionFrames >= previous.durationFrames))
      add("디졸브가 이어지는 두 컷보다 짧아야 합니다.");
    else if (board) {
      const source = clipSource(clip.nodeId, board.nodes);
      if (source === "missing") add("연결한 노드가 보드에 없습니다. 화면을 다시 골라 주세요.");
      else if (source === "unusable") add("화면으로 쓸 파일이 없는 노드입니다. 화면을 다시 골라 주세요.", board.nodes.get(clip.nodeId!)?.kind === "audioCue");
      else if (source === "image" && clip.inFrame) add("이미지는 원본 시작을 0으로 정해 주세요.", false);
      else if (source === "video" && overSource(clip.nodeId!, clip)) add("선택한 구간이 원본보다 깁니다.", false);
    }
  });
  if (frames > TIMELINE_MAX_FRAMES) issues.push({ kind: "timeline", index: 0, text: "전체 길이를 7분 이하로 줄여 주세요.", blocking: true });
  spec.audio.forEach((track, index) => {
    const add = (text: string, blocking = true) => issues.push({ kind: "audio", index, text: `음향 ${index + 1}: ${text}`, blocking });
    if (track.durationFrames < 1) add("길이를 0.04초 이상으로 정해 주세요.");
    else if (track.startFrame + track.durationFrames > frames) add("영상이 끝난 뒤까지 이어집니다. 시작이나 길이를 줄여 주세요.");
    else if (track.fadeInFrames > track.durationFrames || track.fadeOutFrames > track.durationFrames) add("페이드가 음향보다 깁니다.");
    else if (!(track.gain >= 0 && track.gain <= 2)) add("음량은 0에서 2 사이로 정해 주세요.");
    else if (board) {
      const source = audioSource(track.nodeId, board.nodes);
      if (source === "missing") add("연결한 노드가 보드에 없습니다. 음향을 다시 골라 주세요.");
      else if (source === "unusable") add("음향 노드가 아닙니다. 음향을 다시 골라 주세요.");
      else if (source === "audio" && overSource(track.nodeId, track)) add("선택한 구간이 원본보다 깁니다.", false);
    }
  });
  let previousEnd = 0;
  spec.words?.forEach((word, index) => {
    const add = (text: string) => issues.push({ kind: "words", index, text: `단어 ${index + 1}: ${text}`, blocking: true });
    if (!word.text.trim()) add("내용을 입력해 주세요.");
    else if (word.text.length > 150 || /[\x00-\x1f\x7f]/.test(word.text)) add("탭이나 줄바꿈 없이 150자 이하로 입력해 주세요.");
    else if (word.endFrame <= word.startFrame) add("끝 시각을 시작보다 뒤로 정해 주세요.");
    else if (word.startFrame < previousEnd) add("앞 단어와 시각이 겹칩니다.");
    else if (word.endFrame > frames) add("영상이 끝난 뒤까지 이어집니다.");
    previousEnd = word.endFrame;
  });
  if (!issues.some(({ blocking }) => blocking) && !validateTimeline(spec))
    issues.push({ kind: "timeline", index: 0, text: "컷·전환·음향·자막의 길이와 위치를 확인해 주세요.", blocking: true });
  return issues.sort((a, b) => Number(b.blocking) - Number(a.blocking));
}
