import assert from "node:assert/strict";
import { test } from "node:test";
import { validateGraph } from "../lib/graph";
import { audioGainAt, audioSource, clipRanges, clipSource, layersAt, moveAudio, moveClip, removeClip, rulerSeconds, timecode, timelineFrames, timelineIssues, trimAudio, trimClip } from "../lib/timeline-layout";
import { TIMELINE_MAX_FRAMES, validateTimeline, type TimelineAudio, type TimelineClip, type TimelineSpec } from "../lib/timeline-spec";
import type { CanvasNode } from "../lib/types";

const clip = (nodeId: string | null, durationFrames: number, dissolve = 0): TimelineClip => ({
  nodeId, durationFrames, inFrame: 10, transition: dissolve ? "dissolve" : "cut", transitionFrames: dissolve });
const track = (patch: Partial<TimelineAudio> = {}): TimelineAudio => ({
  nodeId: "sound", startFrame: 0, inFrame: 0, durationFrames: 30, gain: 1, fadeInFrames: 0, fadeOutFrames: 0, ...patch });
const spec = (patch: Partial<TimelineSpec> = {}): TimelineSpec => ({
  aspect: "16:9", clips: [clip("a", 60), clip("b", 90, 15), clip("c", 30)], audio: [], ...patch });

test("디졸브로 겹친 만큼 다음 컷이 앞당겨진다", () => {
  assert.deepEqual(clipRanges(spec().clips), [{ start: 0, end: 60 }, { start: 45, end: 135 }, { start: 135, end: 165 }]);
  assert.equal(timelineFrames(spec().clips), 165);
  assert.equal(timelineFrames([]), 0);
});

test("재생 위치의 화면과 원본 프레임, 디졸브 비율을 찾는다", () => {
  const { clips } = spec();
  assert.deepEqual(layersAt(clips, 0), [{ index: 0, sourceFrame: 10, opacity: 1, volume: 1 }]);
  assert.deepEqual(layersAt(clips, 54), [
    { index: 0, sourceFrame: 64, opacity: 1, volume: 0.4 },
    { index: 1, sourceFrame: 19, opacity: 0.6, volume: 0.6 },
  ]);
  assert.deepEqual(layersAt(clips, 135).map(({ index }) => index), [2]);
  assert.deepEqual(layersAt(clips, 165), []);
});

test("음향은 배치한 구간에서만 들리고 페이드를 따른다", () => {
  const faded = track({ startFrame: 30, durationFrames: 60, gain: 0.8, fadeInFrames: 10, fadeOutFrames: 20 });
  assert.equal(audioGainAt(faded, 29), 0);
  assert.equal(audioGainAt(faded, 35), 0.4);
  assert.equal(audioGainAt(faded, 50), 0.8);
  assert.equal(audioGainAt(faded, 80), 0.4);
  assert.equal(audioGainAt(faded, 90), 0);
});

test("컷을 옮기거나 지우면 첫 컷은 하드컷이 된다", () => {
  const { clips } = spec();
  const moved = moveClip(clips, 1, 0);
  assert.deepEqual(moved.map(({ nodeId }) => nodeId), ["b", "a", "c"]);
  assert.deepEqual([moved[0].transition, moved[0].transitionFrames], ["cut", 0]);
  assert.deepEqual(moveClip(clips, 0, 2).map(({ nodeId }) => nodeId), ["b", "c", "a"]);
  assert.equal(moveClip(clips, 0, -1), clips);
  assert.equal(moveClip(clips, 2, 3), clips);
  assert.equal(removeClip(clips, 0)[0].transition, "cut");
  assert.equal(clips[1].transition, "dissolve");
});

test("끌어서 바꾼 길이는 전환·원본·전체 한도를 지킨다", () => {
  const { clips } = spec();
  assert.equal(trimClip(clips, 0, 1)[0].durationFrames, 16);
  assert.equal(trimClip(clips, 1, 1)[1].durationFrames, 16);
  assert.equal(trimClip(clips, 2, -5)[2].durationFrames, 1);
  assert.equal(trimClip(clips, 0, 400, 4)[0].durationFrames, 110);
  const full = trimClip(clips, 2, 99_999);
  assert.equal(timelineFrames(full), TIMELINE_MAX_FRAMES);
});

test("음향은 영상 안에서만 옮기고 줄이며 페이드도 맞춘다", () => {
  const source = track({ startFrame: 10, durationFrames: 40, fadeInFrames: 30, fadeOutFrames: 30 });
  assert.equal(moveAudio(source, 165, -20).startFrame, 0);
  assert.equal(moveAudio(source, 165, 999).startFrame, 125);
  assert.deepEqual(trimAudio(source, 165, 20), { ...source, durationFrames: 20, fadeInFrames: 20, fadeOutFrames: 20 });
  assert.equal(trimAudio(source, 165, 999).durationFrames, 155);
  assert.equal(trimAudio(source, 165, 999, 2).durationFrames, 60);
  assert.equal(trimAudio(source, 165, 0).durationFrames, 1);
});

test("눈금 간격과 시각을 읽기 쉽게 만든다", () => {
  assert.equal(timecode(0), "0:00.0");
  assert.equal(timecode(69), "0:02.3");
  assert.equal(timecode(1799), "1:00.0");
  assert.equal(timecode(TIMELINE_MAX_FRAMES), "7:00.0");
  assert.equal(rulerSeconds(90, 10), 0.5);
  assert.equal(rulerSeconds(300, 10), 1);
  assert.equal(rulerSeconds(TIMELINE_MAX_FRAMES, 10), 60);
});

test("문제가 된 컷과 음향을 짚고 저장 검사와 판정이 같다", () => {
  const cases: [Partial<TimelineSpec>, string | null][] = [
    [{}, null],
    [{ clips: [clip("a", 10), clip("b", 90, 15)] }, "clip:1"],
    [{ clips: [clip("a", 60, 15)] }, "clip:0"],
    [{ clips: [clip("a", 0)] }, "clip:0"],
    [{ clips: [clip("a", TIMELINE_MAX_FRAMES), clip("b", 30)] }, "timeline:0"],
    [{ audio: [track({ startFrame: 150 })] }, "audio:0"],
    [{ audio: [track({ fadeInFrames: 31 })] }, "audio:0"],
    [{ audio: [track({ durationFrames: 0 })] }, "audio:0"],
    [{ audio: [track({ gain: 3 })] }, "audio:0"],
    [{ words: [{ text: "가", startFrame: 0, endFrame: 10 }, { text: "나", startFrame: 5, endFrame: 15 }] }, "words:1"],
    [{ words: [{ text: " ", startFrame: 0, endFrame: 10 }] }, "words:0"],
    [{ words: [{ text: "가", startFrame: 160, endFrame: 170 }] }, "words:0"],
    [{ words: [{ text: "가", startFrame: 0, endFrame: 10 }] }, null],
  ];
  for (const [patch, expected] of cases) {
    const value = spec(patch);
    const issues = timelineIssues(value);
    assert.equal(issues[0] ? `${issues[0].kind}:${issues[0].index}` : null, expected, JSON.stringify(patch));
    assert.equal(issues.length === 0, validateTimeline(value), JSON.stringify(patch));
  }
});

const board = new Map<string, Pick<CanvasNode, "kind" | "asset">>([
  ["a", { kind: "video", asset: { url: "/a", type: "video", name: "a" } }],
  ["b", { kind: "keyframe" }],
  ["c", { kind: "keyframe", asset: { url: "/c", type: "image", name: "c" } }],
  ["character", { kind: "character" }],
  ["sound", { kind: "audioCue", asset: { url: "/s", type: "audio", name: "s" } }],
  ["cue", { kind: "audioCue" }],
]);
const still = (nodeId: string) => ({ ...clip(nodeId, 30), inFrame: 0 });

test("원본보다 긴 구간은 길이를 알 때만 알려 준다", () => {
  const value = spec({ clips: [clip("a", 60), clip("b", 90, 15), still("c")], audio: [track({ durationFrames: 90 })] });
  const issues = (a?: number, s?: number) => timelineIssues(value, { nodes: board,
    seconds: new Map([...(a ? [["/a", a] as const] : []), ...(s ? [["/s", s] as const] : [])]) });
  assert.deepEqual(issues(), []);
  assert.deepEqual(issues(2, 2.5).map(({ kind, index }) => `${kind}:${index}`), ["clip:0", "audio:0"]);
  assert.deepEqual(issues(2.34, 3), []);
});

test("합성할 수 없는 원본을 슬레이트와 구분해 이름을 붙인다", () => {
  const value = spec({
    clips: [still("gone"), still("character"), clip("c", 30), still("b"), { ...still("a"), nodeId: null }, still("sound")],
    audio: [track({ nodeId: "gone" }), track({ nodeId: "a" }), track({ nodeId: "cue" })],
  });
  const issues = timelineIssues(value, { nodes: board, seconds: new Map() });
  assert.deepEqual(issues.map(({ kind, index, blocking }) => `${kind}:${index}:${blocking}`),
    ["clip:0:true", "clip:5:true", "audio:0:true", "audio:1:true", "clip:1:false", "clip:2:false"]);
  // 저장할 때 거절되는 연결만 저장을 막는다.
  const nodes = [...board].map(([id, node]) => ({ id, title: id, body: "", x: 0, y: 0, ...node,
    ...(node.asset ? { asset: { ...node.asset, url: `/api/assets/00000000-0000-4000-8000-000000000000.${{ video: "mp4", image: "png", audio: "wav" }[node.asset.type]}` } } : {}) }));
  const graphWith = (timeline: TimelineSpec) => ({ nodes: [...nodes, { id: "t", kind: "previs", title: "t", body: "", x: 0, y: 0, timeline }], edges: [] });
  assert.equal(validateGraph(graphWith(spec({ clips: [still("character"), clip("c", 30), still("b")], audio: [track({ nodeId: "cue" })] }))), true);
  for (const bad of [spec({ clips: [still("gone")] }), spec({ clips: [still("sound")] }),
    spec({ clips: [still("b")], audio: [track({ nodeId: "gone" })] }), spec({ clips: [still("b")], audio: [track({ nodeId: "a" })] })])
    assert.equal(validateGraph(graphWith(bad)), false);
  assert.deepEqual(value.clips.map(({ nodeId }) => clipSource(nodeId, board)), ["missing", "unusable", "image", "slate", "slate", "unusable"]);
  assert.deepEqual(value.audio.map(({ nodeId }) => audioSource(nodeId, board)), ["missing", "unusable", "silent"]);
});

test("저장을 막는 문제를 합성 알림보다 먼저 보여 준다", () => {
  const value = spec({ clips: [clip("a", 60)], words: [{ text: " ", startFrame: 0, endFrame: 10 }] });
  const issues = timelineIssues(value, { nodes: board, seconds: new Map([["/a", 1]]) });
  assert.deepEqual(issues.map(({ kind, blocking }) => [kind, blocking]), [["words", true], ["clip", false]]);
});

test("이전 저장값처럼 형식이 어긋나도 저장할 수 없음을 알린다", () => {
  const words = (text: string) => spec({ words: [{ text, startFrame: 0, endFrame: 10 }] });
  for (const value of [
    spec({ clips: [{ ...clip("a", 60), transition: "dissolve" }] }),
    spec({ clips: [clip("a", 60), { ...clip("b", 60), transitionFrames: 10 }] }),
    spec({ clips: [clip("a", 400), clip("b", 400, 151)] }),
    spec({ clips: [{ ...clip("a", 60), inFrame: TIMELINE_MAX_FRAMES + 1 }] }),
    spec({ audio: [track({ gain: NaN })] }),
    words("가\t나"), words("가".repeat(151)),
  ]) {
    assert.equal(validateTimeline(value), false);
    assert.equal(timelineIssues(value)[0]?.blocking, true);
  }
  assert.equal(timelineIssues(words("가\t나"))[0].kind, "words");
});

test("마이크로초로 잘린 원본 길이에서도 마지막 프레임까지 쓴다", () => {
  for (let frames = 1; frames <= 300; frames += 1) {
    const seconds = Math.floor(frames / 30 * 1e6) / 1e6;
    const value = { ...clip("a", 1), inFrame: 0 };
    assert.equal(trimClip([value], 0, TIMELINE_MAX_FRAMES, seconds)[0].durationFrames, frames);
    assert.equal(trimAudio(track({ durationFrames: 1 }), TIMELINE_MAX_FRAMES, TIMELINE_MAX_FRAMES, seconds).durationFrames, frames);
  }
});
