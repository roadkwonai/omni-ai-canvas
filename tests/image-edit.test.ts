import assert from "node:assert/strict";
import { test } from "node:test";
import { createImageEditNode, imageEditSheetLayout, isImageEditSpec, presetImageEditSettings } from "../lib/image-edit";
import { bindImageEditSource, verifyImageEditSource } from "../lib/image-edit-server";
import { validateGraph } from "../lib/graph";
import { codexImageGenerationArguments } from "../lib/runner";
import { localAssetPath } from "../lib/media";
import { buildRunInput, snapshotReferences } from "../lib/run-input";
import type { CanvasNode, Project } from "../lib/types";

const source: CanvasNode = {
  id: "character",
  kind: "character",
  title: "인물",
  body: "",
  x: 0,
  y: 0,
  asset: { url: "/sample/portrait.webp", name: "portrait.webp", type: "image" },
};

test("원본에서 편집 노드를 만들고 실제 요청에 원본 이미지와 지시를 고정한다", async () => {
  const { node, edge } = createImageEditNode(source, "texture", "자연스러운 피부결", "edit");
  const project: Project = { id: "project", title: "test", version: 2, updatedAt: "", graph: { nodes: [source, node], edges: [edge] } };
  assert.equal(validateGraph(project.graph), true);
  const input = buildRunInput(project, { nodeId: node.id, operation: "image", provider: "openai-image", prompt: "빛을 유지", version: 2 }, "request");
  assert.equal(input.references[0].asset?.url, source.asset?.url);
  assert.deepEqual(input.imageEdit, node.imageEdit);
  assert.match(input.prompt, /자연스러운 피부결/);
  const bound = await bindImageEditSource(input);
  assert.match(bound.imageEditSource?.sha256 ?? "", /^[a-f0-9]{64}$/);
  await verifyImageEditSource(bound);
  const codexArgs = codexImageGenerationArguments(bound);
  assert.deepEqual(codexArgs, ["--mode", "edit", "--edit-target", localAssetPath(source.asset!)]);
  await assert.rejects(verifyImageEditSource({ ...bound, imageEditSource: { ...bound.imageEditSource!, sha256: "0".repeat(64) } }), /변경/);
});

test("조명 설정을 독립적으로 검증하고 생성 요청에 당시 값을 고정한다", () => {
  const { node, edge } = createImageEditNode(source, "light", "분위기를 유지", "light-edit");
  const settings = { kind: "light" as const, azimuth: 75, elevation: 30, brightness: 80, color: "#ffbb88", rim: true, guideView: "perspective" as const };
  const imageEdit = { ...node.imageEdit!, settings };
  assert.equal(isImageEditSpec(imageEdit), true);
  assert.equal(isImageEditSpec({ ...imageEdit, settings: { ...settings, azimuth: 181 } }), false);
  assert.equal(isImageEditSpec({ ...imageEdit, settings: { ...settings, kind: "angle" } }), false);
  const project: Project = { id: "project", title: "test", version: 1, updatedAt: "", graph: { nodes: [source, { ...node, imageEdit }], edges: [edge] } };
  const input = buildRunInput(project, { nodeId: node.id, operation: "image", provider: "openai-image", prompt: "원본 구도 유지", version: 1 }, "request");
  assert.match(input.prompt, /수평 방향 75도/);
  assert.match(input.prompt, /림 라이트 사용/);
  assert.deepEqual(input.imageEdit?.settings, settings);
  settings.azimuth = 10;
  assert.equal(input.imageEdit?.settings?.kind === "light" && input.imageEdit.settings.azimuth, 75);
});

test("기존 편집과 25컷 시트의 필수 배치 지시를 유지한다", () => {
  const { node, edge } = createImageEditNode(source, "story25", "영사기가 켜지는 이야기", "story");
  const legacy = { ...node.imageEdit! };
  delete legacy.settings;
  assert.equal(isImageEditSpec(legacy), true);
  const project: Project = { id: "project", title: "test", version: 1, updatedAt: "", graph: { nodes: [source, { ...node, imageEdit: legacy }], edges: [edge] } };
  const input = buildRunInput(project, { nodeId: node.id, operation: "image", provider: "openai-image", prompt: "마지막 컷은 빈 영사실", version: 1 }, "request");
  assert.match(input.prompt, /5열 × 5행의 25개 독립 컷/);
  assert.match(input.prompt, /왼쪽에서 오른쪽, 위에서 아래 순서/);
  assert.match(input.prompt, /영사기가 켜지는 이야기/);
});

test("여러 스토리보드 컷은 영상에 연결한 순서로 참조된다", () => {
  const cuts = ["cut-1", "cut-2", "cut-3"].map((id) => ({
    ...source,
    id,
    title: id,
    kind: "keyframe" as const,
  }));
  const video: CanvasNode = { id: "video", kind: "video", title: "영상", body: "", x: 0, y: 0 };
  const references = snapshotReferences({
    nodes: [...cuts, video],
    edges: [cuts[2], cuts[0], cuts[1]].map((cut) => ({ source: cut.id, target: video.id, role: "identity" as const })),
  }, video.id, "video");
  assert.deepEqual(references.filter((ref) => ref.asset).map((ref) => ref.nodeId), ["cut-3", "cut-1", "cut-2"]);
});

test("프리셋에 감정 수치는 보존하고 얼굴 영역과 작품별 컷 내용은 제외한다", () => {
  const emotion = { kind: "emotion" as const, warmth: 0.2, arousal: 0.4, intensity: 0.7, face: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } };
  assert.deepEqual(presetImageEditSettings(emotion), { kind: "emotion", warmth: 0.2, arousal: 0.4, intensity: 0.7 });
  assert.deepEqual(presetImageEditSettings({ kind: "story25", beats: ["작품 내용"] }), { kind: "story25" });
  assert.equal(isImageEditSpec({ kind: "emotion", sourceNodeId: "character", instruction: "표정", settings: { ...emotion, face: { x: 0.9, y: 0.1, width: 0.2, height: 0.2 } } }), false);
});

test("감정 세부 표정과 독립된 카메라 주시점이 저장되고 생성 입력에 반영된다", () => {
  const channels = { browLeft: 0.5, browRight: -0.5, eyelidLeft: -0.3, eyelidRight: 0.2, mouth: 0.6, gazeX: 0.4, gazeY: -0.2 };
  const { node: emotion, edge: emotionEdge } = createImageEditNode(source, "emotion", "긴장한 표정", "emotion");
  const emotionEdit = { ...emotion.imageEdit!, settings: { kind: "emotion" as const, warmth: -0.4, arousal: 0.6, intensity: 0.8, channels } };
  assert.equal(isImageEditSpec(emotionEdit), true);
  assert.equal(isImageEditSpec({ ...emotionEdit, settings: { ...emotionEdit.settings, channels: { ...channels, gazeX: 2 } } }), false);
  const project: Project = { id: "project", title: "test", version: 1, updatedAt: "", graph: { nodes: [source, { ...emotion, imageEdit: emotionEdit }], edges: [emotionEdge] } };
  const request = { nodeId: "emotion", operation: "image", provider: "openai-image", prompt: "표정", version: 1 };
  const input = buildRunInput(project, request, "emotion-request");
  assert.match(input.prompt, /왼쪽 눈썹 0.5/);
  assert.match(input.prompt, /시선 수직 -0.2/);
  assert.deepEqual(input.imageEdit?.settings?.kind === "emotion" && input.imageEdit.settings.channels, channels);
  assert.deepEqual(presetImageEditSettings(emotionEdit.settings).kind === "emotion" && presetImageEditSettings(emotionEdit.settings), emotionEdit.settings);

  const { node: angle, edge: angleEdge } = createImageEditNode(source, "angle", "대상을 바라보는 구도", "angle");
  const target = { x: 0.4, y: -0.2, z: 0.7 };
  const angleEdit = { ...angle.imageEdit!, settings: { kind: "angle" as const, azimuth: 30, elevation: 15, distance: 5, fov: 50, target, roll: 15, guideView: "shot" as const } };
  assert.equal(isImageEditSpec(angleEdit), true);
  assert.equal(isImageEditSpec({ ...angleEdit, settings: { ...angleEdit.settings, target: { ...target, x: 2.1 } } }), false);
  const angleProject = { ...project, graph: { nodes: [source, { ...angle, imageEdit: angleEdit }], edges: [angleEdge] } };
  const angleInput = buildRunInput(angleProject, { ...request, nodeId: "angle" }, "angle-request");
  assert.match(angleInput.prompt, /가로 0.4, 높이 -0.2, 깊이 0.7/);
  assert.match(angleInput.prompt, /카메라 롤은 15도/);
  assert.deepEqual(angleInput.imageEdit?.settings?.kind === "angle" && angleInput.imageEdit.settings.target, target);
});

test("원본 교체, 연결 제거, 미지원 모델 경로는 실행 전에 거부한다", () => {
  const { node, edge } = createImageEditNode(source, "emotion", "눈을 웃게", "edit");
  const project: Project = { id: "project", title: "test", version: 1, updatedAt: "", graph: { nodes: [source, node], edges: [edge] } };
  const request = { nodeId: node.id, operation: "image", provider: "openai-image", prompt: "작업", version: 1 };
  const changed = { ...project, graph: { ...project.graph, nodes: [{ ...source, asset: { url: "/sample/frame.webp", name: "frame.webp", type: "image" as const } }, node] } };
  assert.throws(() => buildRunInput(changed, request, "request"), /변경/);
  assert.throws(() => buildRunInput({ ...project, graph: { ...project.graph, edges: [] } }, request, "request"), /변경/);
  assert.throws(() => buildRunInput(project, { ...request, provider: "higgsfield" }, "request"), /편집/);
  const unbound = { ...node, imageEdit: { ...node.imageEdit!, sourceAsset: undefined } };
  assert.throws(() => buildRunInput({ ...project, graph: { ...project.graph, nodes: [source, unbound] } }, request, "request"), /원본으로 지정/);
});

test("시트 분할 규격과 유효하지 않은 편집 설정을 구분한다", () => {
  assert.deepEqual(imageEditSheetLayout("grid9"), { columns: 3, rows: 3 });
  assert.deepEqual(imageEditSheetLayout("story25"), { columns: 5, rows: 5 });
  assert.deepEqual(imageEditSheetLayout("grid4"), { columns: 2, rows: 2 });
  assert.deepEqual(imageEditSheetLayout("face3"), { columns: 3, rows: 1 });
  assert.equal(createImageEditNode(source, "grid4", "기승전결", "four").node.imageEdit?.kind, "grid4");
  assert.equal(createImageEditNode(source, "face3", "정면과 측면", "face").node.imageEdit?.kind, "face3");
  assert.equal(isImageEditSpec({ kind: "texture", sourceNodeId: "character", sourceAsset: source.asset, instruction: "" }), false);
  assert.throws(() => createImageEditNode({ ...source, asset: undefined }, "angle", "측면", "edit"), /원본/);
});

test("캐릭터 설정도는 원본 연결을 보존하고 선택한 구성만 생성 요청에 전달한다", () => {
  const { node, edge } = createImageEditNode(source, "characterSheet", "설정도", "character-sheet");
  assert.equal(edge.source, source.id);
  assert.equal(validateGraph({ nodes: [source, node], edges: [edge] }), true);
  const settings = { kind: "characterSheet" as const, views: true, expressions: false, details: true };
  const project: Project = { id: "project", title: "test", version: 1, updatedAt: "", graph: { nodes: [source, { ...node, imageEdit: { ...node.imageEdit!, settings } }], edges: [edge] } };
  const input = buildRunInput(project, { nodeId: node.id, operation: "image", provider: "codex", prompt: "설정도", version: 1 }, "request");
  assert.match(input.prompt, /전신 정면, 측면, 후면/);
  assert.match(input.prompt, /의상, 소재와 소품/);
  assert.doesNotMatch(input.prompt, /다양한 표정/);
  assert.deepEqual(input.imageEdit?.settings, settings);
});
