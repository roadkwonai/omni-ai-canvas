import assert from "node:assert/strict";
import { test } from "node:test";
import { insertLensTransition, resolveManualLegacyLensTransition, isManualLensSources, isLensStartFrames, withLensStartFrames, legacyLensTransitionFrames, resolveLegacyLensTransition, lensTransitionRecipe, updateLensTransition, isLensCorrections, isLensMask, lensCutPairs, resolveLensTransition } from "../lib/lens-transition-spec";
import { validateGraph } from "../lib/graph";
import type { CanvasNode, Graph } from "../lib/types";
import type { TimelineSpec } from "../lib/timeline-spec";

const asset = { type: "video", url: "/sample/preview.mp4", name: "sample.mp4" } as const;
const video = (id: string): CanvasNode => ({ id, title: id, kind: "video", x: 0, y: 0, body: "", asset });
const audio: CanvasNode = { id: "audio", title: "음향", kind: "audioCue", x: 0, y: 0, body: "" };
const fixture = (): Graph => ({
  nodes: [video("a"), video("b"), video("c"), audio, {
    id: "edit", title: "타임라인", kind: "previs", x: 340, y: 300, body: "",
    timeline: { aspect: "16:9", clips: [
      { nodeId: "a", inFrame: 5, durationFrames: 90, transition: "cut", transitionFrames: 0 },
      { nodeId: "b", inFrame: 9, durationFrames: 90, transition: "cut", transitionFrames: 0 },
      { nodeId: "c", inFrame: 0, durationFrames: 18, transition: "dissolve", transitionFrames: 8 },
    ], audio: [{ nodeId: "audio", startFrame: 150, inFrame: 0, durationFrames: 20, gain: 1, fadeInFrames: 0, fadeOutFrames: 0 }],
    words: [{ text: "다음 컷", startFrame: 90, endFrame: 120 }] },
  }],
  edges: [{ source: "a", target: "edit" }, { source: "b", target: "edit" }],
});
const duration = (spec: TimelineSpec) => spec.clips.reduce((total, clip) => total + clip.durationFrames - clip.transitionFrames, 0);

test("렌즈 전환은 원본 테이크의 선택 범위를 사용해 길이와 음향·자막 위치를 보존한다", () => {
  const graph = fixture();
  const before = graph.nodes[4].timeline!;
  const resolved = resolveLensTransition(graph, before, 1, 31)!;
  assert.deepEqual([resolved.outgoingStart, resolved.incomingStart, resolved.outgoingFrames, resolved.incomingFrames], [79, 9, 16, 15]);
  const after = insertLensTransition(graph, "edit", { asset, cutIndex: 1, frames: 31, version: 1, tracking: { trackedFrames: 16, minimumConfidence: 0.96 } }, "transition");
  assert.ok(validateGraph(after));
  const timeline = after.nodes.find(({ id }) => id === "edit")!.timeline!;
  assert.deepEqual(timeline.clips.map(({ nodeId, inFrame, durationFrames }) => [nodeId, inFrame, durationFrames]), [
    ["a", 5, 74], ["transition", 0, 31], ["b", 24, 75], ["c", 0, 18],
  ]);
  assert.equal(duration(timeline), duration(before));
  assert.deepEqual(timeline.audio, before.audio);
  assert.deepEqual(timeline.words, before.words);
  assert.deepEqual(after.nodes.slice(0, 4), graph.nodes.slice(0, 4));
  assert.ok(after.edges.some((edge) => edge.source === "transition" && edge.target === "edit"));
});

test("컷 수, 기존 디졸브와 타원 경계를 확인한다", () => {
  const graph = fixture();
  const timeline = graph.nodes[4].timeline!;
  assert.deepEqual(lensCutPairs(graph, timeline).map((pair) => pair.cutIndex), [1]);
  timeline.clips[1].durationFrames = 16;
  timeline.audio = [];
  timeline.words = [];
  assert.equal(lensCutPairs(graph, timeline)[0]?.maxFrames, 15);
  assert.equal(resolveLensTransition(graph, timeline, 1, 16), null);
  assert.equal(resolveLensTransition(graph, timeline, 2, 12), null);
  assert.equal(isLensMask({ x: 0.4, y: 0.1, width: 0.6, height: 0.1 }), true);
  assert.equal(isLensMask({ x: 0.4, y: 0.1, width: 0.61, height: 0.1 }), false);
  assert.equal(isLensMask({ x: 0.4, y: 0.1, width: 0.3, height: 0.1, angle: -18 }), true);
  assert.equal(isLensMask({ x: 0.4, y: 0.1, width: 0.3, height: 0.1, angle: 91 }), false);
  assert.equal(isLensMask({ x: NaN, y: 0.1, width: 0.2, height: 0.1 }), false);
});

test("렌즈 보정은 추적 구간 내 고유한 프레임과 같은 수의 윤곽점을 요구한다", () => {
  const outline = [{x:.2,y:.3},{x:.4,y:.25},{x:.55,y:.4},{x:.45,y:.55},{x:.25,y:.55}];
  const mask = { x:.2, y:.25, width:.35, height:.3, outline };
  assert.ok(isLensCorrections([{ frame: 23, outline }], 48, mask));
  assert.equal(isLensCorrections([{ frame: 0, outline }], 48, mask), false);
  assert.equal(isLensCorrections([{ frame: 24, outline }], 48, mask), false);
  assert.equal(isLensCorrections([{ frame: 12, outline }, { frame: 12, outline }], 48, mask), false);
  assert.equal(isLensCorrections([{ frame: 12, outline: [...outline.slice(0, 1), ...outline] }], 48, mask), false);
});

test("렌즈 편집 설정을 노드에 저장하고 같은 클립의 결과만 갱신한다", () => {
  const graph = fixture();
  const timeline = graph.nodes.find((n) => n.id === "edit")!.timeline!;
  const outline = [{x:.2,y:.3},{x:.4,y:.25},{x:.55,y:.4},{x:.45,y:.55},{x:.25,y:.55}];
  const mask = { x:.2, y:.25, width:.35, height:.3, outline };
  const corrections = [{ frame: 3, outline }];
  const recipe = lensTransitionRecipe(graph, timeline, 1, 12, mask, corrections)!;
  const result = { asset, cutIndex: 1, frames: 12, version: 1, tracking: {minimumConfidence:1,trackedFrames:6}, recipe };
  const inserted = insertLensTransition(graph, "edit", result, "transition");
  assert.deepEqual(inserted.nodes.find(n => n.id === "transition")?.lensTransition, recipe);
  const copy = structuredClone(recipe);
  copy.corrections[0].outline[0].x += .01;
  copy.outgoing = { asset: copy.outgoing.asset, startFrame: copy.outgoing.startFrame, nodeId: copy.outgoing.nodeId };
  const updated = updateLensTransition(inserted, "edit", { ...result, recipe: copy }, "transition");
  assert.deepEqual(updated.nodes.find(n => n.id === "transition")?.lensTransition, copy);
  assert.deepEqual(updated.nodes.find(n => n.id === "edit")?.timeline, inserted.nodes.find(n => n.id === "edit")?.timeline);
  assert.deepEqual(updated.edges, inserted.edges);
  assert.equal(updated.nodes.length, inserted.nodes.length);
  const altered = structuredClone(copy);
  altered.outgoing.startFrame++;
  assert.throws(() => updateLensTransition(inserted, "edit", { ...result, recipe: altered }, "transition"));
  const invalid = structuredClone(recipe);
  invalid.incoming.startFrame++;
  assert.throws(() => insertLensTransition(graph, "edit", { ...result, recipe: invalid }, "transition"));
});


test("기존 렌즈 전환은 연결된 앞뒤 구간을 복원해 같은 노드에 편집 설정을 저장한다", () => {
  const graph = fixture();
  const timeline = graph.nodes.find(n => n.id === "edit")!.timeline!;
  const outline = [{x:.2,y:.3},{x:.4,y:.25},{x:.55,y:.4},{x:.45,y:.55},{x:.25,y:.55}];
  const mask = { x:.2, y:.25, width:.35, height:.3, outline };
  const recipe = lensTransitionRecipe(graph, timeline, 1, 12, mask, [])!;
  const initial = { asset, cutIndex: 1, frames: 12, version: 1, tracking: { minimumConfidence:1, trackedFrames:6 } };
  const old = insertLensTransition(graph, "edit", initial, "transition");
  const oldTimeline = old.nodes.find(n => n.id === "edit")!.timeline!;
  const source = resolveLegacyLensTransition(old, oldTimeline, 1, "transition");
  assert.deepEqual(source, { version:1, aspect:recipe.aspect, frames:recipe.frames, outgoing:recipe.outgoing, incoming:recipe.incoming });
  const updated = updateLensTransition(old, "edit", { ...initial, recipe, transitionId:"transition" }, "transition");
  assert.deepEqual(updated.nodes.find(n=>n.id==="transition")?.lensTransition,recipe);
  assert.deepEqual(updated.nodes.find(n=>n.id==="edit")?.timeline,oldTimeline);
  assert.equal(updated.nodes.length,old.nodes.length);
  const noGuide = structuredClone(old);
  noGuide.edges = noGuide.edges.filter(e=>!(e.target==="transition" && e.source==="a"));
  assert.equal(resolveLegacyLensTransition(noGuide,oldTimeline,1,"transition"),null);
  const trimmed = structuredClone(oldTimeline);
  trimmed.clips[1].inFrame = 1;
  assert.equal(resolveLegacyLensTransition(old,trimmed,1,"transition"),null);
  const badIncoming = structuredClone(oldTimeline);
  badIncoming.clips[2].inFrame = 0;
  assert.equal(resolveLegacyLensTransition(old,badIncoming,1,"transition"),null);
});

test("이전 전환은 이동·트림 후에도 지정 원본을 같은 노드에 저장한다", () => {
  const graph = fixture();
  const prior = graph.nodes.find(n=>n.id==="edit")!.timeline!;
  const outline = [{x:.2,y:.3},{x:.4,y:.25},{x:.55,y:.4},{x:.45,y:.55},{x:.25,y:.55}];
  const mask = { x:.2,y:.25,width:.35,height:.3,outline };
  const recipe = lensTransitionRecipe(graph,prior,1,12,mask,[])!;
  const old = insertLensTransition(graph,"edit",{asset,cutIndex:1,frames:12,version:1,tracking:{minimumConfidence:1,trackedFrames:6}},"transition");
  const timeline = old.nodes.find(n=>n.id==="edit")!.timeline!;
  timeline.clips[1].inFrame=2;
  timeline.clips[1].durationFrames=8;
  old.edges=old.edges.filter(edge=>edge.target!=="transition" || edge.usage!=="guide");
  assert.equal(legacyLensTransitionFrames(old.nodes.find(n=>n.id==="transition")!),12);
  assert.equal(resolveLegacyLensTransition(old,timeline,1,"transition"),null);
  const selection={outgoingId:"a",incomingId:"b",outgoingStart:recipe.outgoing.startFrame,incomingStart:recipe.incoming.startFrame};
  assert.ok(isManualLensSources(selection));
  const source=resolveManualLegacyLensTransition(old,timeline,1,"transition",selection)!;
  assert.equal(source.outgoing.nodeId,"a");
  const next=updateLensTransition(old,"edit",{asset,cutIndex:1,frames:12,version:1,tracking:{minimumConfidence:1,trackedFrames:6},recipe:{...source,mask,corrections:[]} },"transition",selection);
  assert.deepEqual(next.nodes.find(n=>n.id==="edit")!.timeline,timeline);
  assert.deepEqual(next.edges,old.edges);
  assert.equal(next.nodes.find(n=>n.id==="transition")!.lensTransition!.outgoing.nodeId,"a");
  assert.equal(resolveManualLegacyLensTransition(old,timeline,0,"transition",selection),null);
  assert.equal(resolveManualLegacyLensTransition(old,timeline,1,"transition",{...selection,outgoingId:"transition"}),null);
  assert.equal(resolveManualLegacyLensTransition(old,timeline,1,"transition",{...selection,incomingStart:-1}),null);
  assert.equal(resolveManualLegacyLensTransition(old,timeline,1,"transition",{...selection,outgoingId:"missing"}),null);
  const invalid=structuredClone(old);
  invalid.nodes.find(n=>n.id==="edit")!.timeline!.clips[1].durationFrames=11;
  assert.equal(resolveManualLegacyLensTransition(invalid,invalid.nodes.find(n=>n.id==="edit")!.timeline!,1,"transition",selection),null);
});

test("저장된 렌즈 전환은 원본 스냅샷과 클립 범위를 유지하면서 시작 프레임을 갱신한다", () => {
  const graph = fixture();
  const timeline = graph.nodes.find((node) => node.id === "edit")!.timeline!;
  const outline = [{x:.2,y:.3},{x:.4,y:.25},{x:.55,y:.4},{x:.45,y:.55},{x:.25,y:.55}];
  const mask = { x:.2, y:.25, width:.35, height:.3, outline };
  const original = lensTransitionRecipe(graph, timeline, 1, 12, mask, [{ frame: 3, outline }])!;
  const result = { asset, cutIndex: 1, frames: 12, version: 1, tracking: { minimumConfidence: 1, trackedFrames: 6 }, recipe: original };
  const stored = insertLensTransition(graph, "edit", result, "transition");
  const storedTimeline = stored.nodes.find((node) => node.id === "edit")!.timeline!;
  storedTimeline.clips[1].inFrame = 2;
  storedTimeline.clips[1].durationFrames = 8;
  const other = structuredClone(stored.nodes.find((node) => node.id === "edit")!);
  other.id = "other-edit";
  other.asset = asset;
  stored.nodes.push(other);
  stored.nodes.find((node) => node.id === "a")!.asset = undefined;
  stored.nodes.find((node) => node.id === "b")!.asset = { ...asset, name: "새 원본" };

  const starts = { outgoingStart: 41, incomingStart: 22 };
  assert.ok(isLensStartFrames(starts));
  assert.equal(isLensStartFrames({ ...starts, outgoingStart: -1 }), false);
  assert.equal(isLensStartFrames({ ...starts, incomingStart: 1.5 }), false);
  assert.equal(isLensStartFrames({ ...starts, incomingStart: 12601 }), false);
  const source = withLensStartFrames(original, starts);
  assert.deepEqual(Object.keys(source).sort(), ["aspect", "frames", "incoming", "outgoing", "version"]);
  assert.deepEqual(source.outgoing.asset, original.outgoing.asset);
  assert.notEqual(source.outgoing.asset, original.outgoing.asset);
  const nextRecipe = { ...source, mask, corrections: [] };
  const changed = { ...result, recipe: nextRecipe, transitionId: "transition" };
  const updated = updateLensTransition(stored, "edit", changed, "transition", undefined, starts);
  assert.deepEqual(updated.nodes.find((node) => node.id === "transition")!.lensTransition, nextRecipe);
  assert.deepEqual(updated.nodes.find((node) => node.id === "edit")!.timeline, storedTimeline);
  assert.equal(updated.nodes.find((node) => node.id === "other-edit")!.asset, undefined);
  assert.deepEqual(updated.edges, stored.edges);

  assert.throws(() => updateLensTransition(stored, "edit", { ...changed, cutIndex: 0 }, "transition", undefined, starts));
  assert.throws(() => updateLensTransition(stored, "edit", { ...changed, recipe: original }, "transition", undefined, starts));
  const altered = structuredClone(nextRecipe);
  altered.outgoing.asset.name = "다른 스냅샷";
  assert.throws(() => updateLensTransition(stored, "edit", { ...changed, recipe: altered }, "transition", undefined, starts));
  assert.throws(() => updateLensTransition(stored, "edit", changed, "transition", { outgoingId: "a", incomingId: "b", ...starts }, starts));
  assert.throws(() => updateLensTransition(stored, "edit", changed, "transition", undefined, { ...starts, outgoingStart: -1 }));
  const withoutSourceNode = structuredClone(stored);
  withoutSourceNode.nodes = withoutSourceNode.nodes.filter((node) => node.id !== "a");
  withoutSourceNode.edges = withoutSourceNode.edges.filter((edge) => edge.source !== "a" && edge.target !== "a");
  for (const node of withoutSourceNode.nodes) {
    for (const clip of node.timeline?.clips ?? []) {
      if (clip.nodeId === "a") clip.nodeId = null;
    }
  }
  const withoutSourceUpdated = updateLensTransition(withoutSourceNode, "edit", changed, "transition", undefined, starts);
  assert.deepEqual(withoutSourceUpdated.nodes.find((node) => node.id === "transition")!.lensTransition, nextRecipe);

  const legacy = structuredClone(stored);
  delete legacy.nodes.find((node) => node.id === "transition")!.lensTransition;
  assert.throws(() => updateLensTransition(legacy, "edit", changed, "transition", undefined, starts));
});
