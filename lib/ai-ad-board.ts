import { productionGuides, type ProductionGuideId } from "./higgsfield-guidance-kit";
import { validateGraph } from "./graph";
import { isSceneCount, type CanvasNode, type Graph, type Kind, type SceneCount } from "./types";

export const aiAdSource = "https://higgsfield.ai/ko/@adilinthewildtempo/blogs/how-to-make-iman-gadzhi-s-fashion-ad";
export const aiAdGuideIds = ["fashion-ad-reference", "fashion-ad-shot-prompt", "fashion-ad-lens-transition"] as const satisfies readonly ProductionGuideId[];

type Options = {
  sceneCount: SceneCount;
  aspect: "16:9" | "9:16" | "1:1";
  idea?: string;
  cast?: string[];
  sceneCast?: Readonly<Record<number, readonly number[]>>;
  guides?: readonly ProductionGuideId[];
  blocking?: boolean;
  transitions?: boolean;
};

export function buildAiAdGraph(options: Options): Graph {
  if (!isSceneCount(options.sceneCount) || !["16:9", "9:16", "1:1"].includes(options.aspect))
    throw new Error("씬 수와 화면비를 확인해 주세요.");
  const cast = [...new Set((options.cast ?? []).map((name) => name.trim()).filter(Boolean))];
  if (cast.length > 4 || cast.some((name) => name.length > 32) || (options.idea?.length ?? 0) > 4000)
    throw new Error("광고 아이디어와 배역을 확인해 주세요.");
  const actorCount = cast.length || 1;
  const sceneLimit = options.sceneCount === "auto" ? 0 : options.sceneCount;
  for (const [scene, actors] of Object.entries(options.sceneCast ?? {})) {
    const sceneIndex = Number(scene);
    if (!Number.isInteger(sceneIndex) || String(sceneIndex) !== scene || sceneIndex < 0) throw new Error("씬별 배역을 다시 선택해 주세요.");
    if (sceneIndex >= sceneLimit) continue;
    if (!Array.isArray(actors) || new Set(actors).size !== actors.length ||
        actors.some((actor) => !Number.isInteger(actor) || actor < 0 || actor >= actorCount))
      throw new Error("씬별 배역을 다시 선택해 주세요.");
  }
  const graph: Graph = { nodes: [], edges: [] };
  const selected = options.guides ?? aiAdGuideIds;
  function add(id: string, kind: Kind, title: string, body: string, x: number, y: number): CanvasNode {
    const skills = productionGuides.filter((guide) => selected.includes(guide.id) && guide.kinds.includes(kind)).map((guide) => guide.id);
    const node: CanvasNode = { id: `ai-ad-${id}`, kind, title, body, x, y, ...(skills.length ? { guidance: { skillIds: skills } } : {}) };
    graph.nodes.push(node);
    return node;
  }
  function link(source: string, target: string, role: NonNullable<Graph["edges"][number]["role"]> = "context", usage: "input" | "guide" = "input") {
    graph.edges.push({ source: `ai-ad-${source}`, target: `ai-ad-${target}`, role, usage });
  }
  add("brief", "brief", "패션 광고 기획", options.idea?.trim() || "브랜드, 제품, 관객, 메시지와 최종 화면을 정의하세요.", 0, 0);
  add("outline", "scenario", "광고 구성과 장면 흐름", "시나리오에 따라 장면과 제품 등장, 전환 및 마무리를 계획하세요.", 340, 0);
  link("brief", "outline");
  add("product", "referenceImage", "실제 제품과 로고 참조", "제품의 형태, 색, 각인과 로고를 확인할 수 있는 이미지를 첨부하세요.", 0, 320);
  add("location", "referenceImage", "장소와 조명 참조", "장면 공간과 조명의 기준 이미지를 준비하세요.", 0, 640);
  (cast.length ? cast : ["주인공"]).forEach((name, index) => {
    add(`cast-${index}`, "character", name, "인물 정체성, 의상과 표정의 기준을 정하세요.", 0, 960 + index * 280);
    add(`cast-image-${index}`, "referenceImage", `${name} · 인물 시트`, "얼굴과 의상 기준 이미지를 첨부하세요. 필요한 배역별 참조를 구분합니다.", 340, 960 + index * 280);
    link(`cast-${index}`, `cast-image-${index}`, "identity");
  });
  if (options.blocking !== false) {
    add("blocking", "referenceImage", "제품과 피사체 배치", "카메라와 제품의 시작 위치를 표시한 배치 이미지를 준비하세요.", 340, 640);
  }
  add("source", "note", "광고 제작 사례", aiAdSource, -340, 0);
  link("source", "brief", "context", "guide");
  const clips = [];
  const count = options.sceneCount === "auto" ? 0 : options.sceneCount;
  for (let i = 0; i < count; i++) {
    const n = i + 1;
    const y = 2200 + i * 320;
    add(`scene-${n}`, "scene", `씬 ${n} · 장면`, "장면 목표, 제품과 인물의 위치, 장면 전후 변화를 정하세요.", 0, y);
    add(`script-${n}`, "script", `씬 ${n} · 행동과 메시지`, "제품 등장과 인물의 행동, 감정, 장면 전후 상태를 작성하세요.", 340, y);
    add(`shot-${n}`, "shot", `씬 ${n} · 샷 설계`, "시작 프레임, 피사체 행동의 시간 순서, 렌즈와 카메라 경로, 조명·색, 연기·소리와 끝 상태를 정하세요.", 680, y);
    add(`frame-${n}`, "keyframe", `씬 ${n} · 시작 프레임`, "등장 인물, 장소와 제품 참조를 확인하고 시작 화면을 채택하세요.", 1020, y);
    add(`video-${n}`, "video", `씬 ${n} · 영상 테이크`, "시작 화면과 샷 지시를 연결하고 연속성 및 제품 세부를 확인해 테이크를 채택하세요.", 1360, y);
    link("outline", `scene-${n}`);
    link(`scene-${n}`, `script-${n}`);
    link(`script-${n}`, `shot-${n}`);
    link(`shot-${n}`, `frame-${n}`);
    link("product", `frame-${n}`, "prop");
    link("location", `frame-${n}`, "location");
    const actors = options.sceneCast?.[i] ?? [0];
    for (const actor of actors) link(`cast-image-${actor}`, `frame-${n}`, "identity");
    if (options.blocking !== false) link("blocking", `shot-${n}`, "context", "guide");
    link(`frame-${n}`, `video-${n}`, "start");
    link(`shot-${n}`, `video-${n}`);
    clips.push({ nodeId: `ai-ad-video-${n}`, durationFrames: 120, inFrame: 0, transition: "cut" as const, transitionFrames: 0 });
  }
  if (count >= 2 && options.transitions !== false) {
    add("transition", "video", "렌즈 연결 전환", "채택한 앞뒤 클립을 참조해 렌즈 반사, 움직임과 초점, 경계와 블러를 맞춥니다. 두 테이크를 타임라인에 배치하고 렌즈 전환에서 렌즈 영역을 지정해 미리 본 뒤 적용하세요.", 1700, 2200);
    link("video-1", "transition", "context", "guide");
    link("video-2", "transition", "motion", "guide");
  }
  const timeline = add("timeline", "previs", "편집과 최종 검수", "채택 테이크와 승인한 전환 클립을 순서대로 배치하세요. 제품과 로고의 전후 클로즈업, 엔드카드와 음악·효과음을 검토하세요.", 1700, 1800);
  timeline.timeline = { aspect: options.aspect, clips, audio: [] };
  for (let n = 1; n <= count; n++) link(`video-${n}`, "timeline");
  if (!validateGraph(graph)) throw new Error("패션 광고 보드 구성을 확인해 주세요.");
  return graph;
}
