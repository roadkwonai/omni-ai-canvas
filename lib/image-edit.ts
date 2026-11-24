import { z } from "zod";
import { isAsset } from "./asset-shape";
import { directionEmotionIndex, directionEmotionNames } from "./direction-face-poses";
import type { Asset, CanvasNode, GraphEdge, Provider } from "./types";

export const imageEditKinds = {
  texture: "인물 질감 보정",
  emotion: "감정 조정",
  angle: "다각도 편집",
  light: "조명 효과",
  cinematic: "영화급 조명 보정",
  grid9: "멀티카메라 9분할",
  grid4: "스토리 전개 4분할",
  face3: "캐릭터 얼굴 3면도",
  story25: "25컷 연속 스토리보드",
  characterSheet: "캐릭터 설정도",
} as const;
export type ImageEditKind = keyof typeof imageEditKinds;

export function isImageEditProvider(provider: Provider): boolean {
  return ["openai-image", "gemini-image", "seedream", "codex"].includes(provider);
}

export function imageEditSheetLayout(kind: ImageEditKind): { columns: number; rows: number } | undefined {
  if (kind === "grid9") return { columns: 3, rows: 3 };
  if (kind === "grid4") return { columns: 2, rows: 2 };
  if (kind === "face3") return { columns: 3, rows: 1 };
  if (kind === "story25") return { columns: 5, rows: 5 };
}


const azimuth = z.number().finite().min(-180).max(180);
const elevation = z.number().finite().min(-90).max(90);
const percent = z.number().finite().min(0).max(100);
const facialChannel = z.number().finite().min(-1).max(1);
const cameraTarget = z.object({
  x: z.number().finite().min(-2).max(2),
  y: z.number().finite().min(-2).max(2),
  z: z.number().finite().min(-2).max(2),
}).strict();
const facialChannels = z.object({
  browLeft: facialChannel,
  browRight: facialChannel,
  eyelidLeft: facialChannel,
  eyelidRight: facialChannel,
  mouth: facialChannel,
  gazeX: facialChannel,
  gazeY: facialChannel,
}).strict();
const lampFields = {
  azimuth,
  elevation,
  brightness: percent,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  rim: z.boolean(),
};
const lightFields = {
  ...lampFields,
  guideView: z.enum(["front", "perspective", "top", "lit"]).optional(),
  smart: z.object({
    enabled: z.boolean(),
    instruction: z.string().max(1000),
    manual: z.object(lampFields).strict().optional(),
  }).strict().optional(),
};
const face = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  width: z.number().finite().positive().max(1),
  height: z.number().finite().positive().max(1),
}).strict().refine((area) => area.x + area.width <= 1 && area.y + area.height <= 1);

const imageEditSettingsSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("texture"), skin: percent, blend: percent, grain: percent, sharpness: percent }).strict(),
  z.object({
    kind: z.literal("emotion"),
    warmth: z.number().finite().min(-1).max(1),
    arousal: z.number().finite().min(-1).max(1),
    intensity: z.number().finite().min(0).max(1),
    face: face.optional(),
    channels: facialChannels.optional(),
  }).strict(),
  z.object({
    kind: z.literal("angle"), azimuth, elevation,
    distance: z.number().finite().min(1).max(10), fov: z.number().finite().min(15).max(100),
    target: cameraTarget.optional(), roll: azimuth.optional(), guideView: z.enum(["perspective", "shot"]).optional(),
  }).strict(),
  z.object({ kind: z.literal("light"), ...lightFields }).strict(),
  z.object({ kind: z.literal("cinematic"), ...lightFields, contrast: percent, temperature: z.number().finite().min(2000).max(10000), grain: percent }).strict(),
  z.object({ kind: z.literal("characterSheet"), views: z.boolean(), expressions: z.boolean(), details: z.boolean() }).strict(),
  z.object({ kind: z.literal("grid9") }).strict(),
  z.object({ kind: z.literal("grid4") }).strict(),
  z.object({ kind: z.literal("face3") }).strict(),
  z.object({ kind: z.literal("story25"), beats: z.array(z.string().max(500)).max(25).optional() }).strict(),
]);
export type ImageEditSettings = z.infer<typeof imageEditSettingsSchema>;

export function presetImageEditSettings(settings: ImageEditSettings): ImageEditSettings {
  if (settings.kind === "emotion") {
    return { kind: settings.kind, warmth: settings.warmth, arousal: settings.arousal, intensity: settings.intensity, ...(settings.channels ? { channels: { ...settings.channels } } : {}) };
  }
  if (settings.kind === "story25") return { kind: "story25" };
  return { ...settings };
}

export function defaultImageEditSettings(kind: ImageEditKind): ImageEditSettings {
  switch (kind) {
    case "characterSheet":
      return { kind, views: true, expressions: true, details: true };
    case "texture":
      return { kind, skin: 50, blend: 50, grain: 50, sharpness: 50 };
    case "emotion":
      return { kind, warmth: 0, arousal: 0, intensity: 0.5 };
    case "angle":
      return { kind, azimuth: 0, elevation: 0, distance: 5, fov: 50 };
    case "light":
      return { kind, azimuth: 0, elevation: 0, brightness: 50, color: "#ffffff", rim: false };
    case "cinematic":
      return { kind, azimuth: 0, elevation: 0, brightness: 50, color: "#ffffff", rim: false, contrast: 50, temperature: 5600, grain: 0 };
    default:
      return { kind };
  }
}

const imageEditSchema = z.object({
  version: z.literal(1).optional(),
  kind: z.enum(["texture", "emotion", "angle", "light", "cinematic", "grid9", "grid4", "face3", "story25", "characterSheet"]),
  sourceNodeId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  sourceAsset: z.custom<Asset>((value) => isAsset(value) && (value as Asset).type === "image").optional(),
  instruction: z.string().trim().min(1).max(5000),
  settings: imageEditSettingsSchema.optional(),
}).strict().refine((edit) => !edit.settings || edit.kind === edit.settings.kind);
export type ImageEditSpec = z.infer<typeof imageEditSchema>;

export function isImageEditSpec(value: unknown): value is ImageEditSpec {
  return imageEditSchema.safeParse(value).success;
}

export function createImageEditNode(source: CanvasNode, kind: ImageEditKind, instruction: string, id: string): { node: CanvasNode; edge: GraphEdge } {
  if (!source.asset || source.asset.type !== "image") throw new Error("편집할 원본 이미지를 먼저 선택해 주세요.");
  const imageEdit = imageEditSchema.parse({ version: 1, kind, sourceNodeId: source.id, sourceAsset: source.asset, instruction, settings: defaultImageEditSettings(kind) });
  return {
    node: {
      id,
      kind: "keyframe",
      title: `${source.title.slice(0, 110)} · ${imageEditKinds[kind]}`,
      body: instruction,
      x: source.x + 360,
      y: source.y,
      imageEdit,
    },
    edge: { source: source.id, target: id, role: "identity" },
  };
}

export function imageEditInstruction(edit: ImageEditSpec): string {
  const settings = edit.settings;
  let direction = "";
  if (settings?.kind === "characterSheet") {
    direction = ["동일한 인물의 정체성과 의상을 유지하는 16:9 가로 캐릭터 설정도를 만드세요.", settings.views ? "전신 정면, 측면, 후면을 포함하세요." : "", settings.expressions ? "얼굴과 다양한 표정을 포함하세요." : "", settings.details ? "의상, 소재와 소품의 세부 묘사를 포함하세요." : ""].filter(Boolean).join(" ");
  } else if (settings?.kind === "texture") {
    direction = `피부결 강도 ${settings.skin}%, 인물·배경 경계 융합 ${settings.blend}%, 입자 질감 ${settings.grain}%, 선명도 ${settings.sharpness}%를 적용하세요.`;
  } else if (settings?.kind === "emotion") {
    const expression = directionEmotionNames[directionEmotionIndex(settings.warmth, settings.arousal)];
    direction = `감정판의 ‘${expression}’을 기준으로 친밀도 ${settings.warmth}, 흥분도 ${settings.arousal}, 강도 ${settings.intensity}를 적용하고 얼굴의 눈썹, 눈과 입으로 표현하세요.`;
    if (settings.face) direction += ` 대상은 원본 이미지에서 왼쪽 ${settings.face.x}, 위쪽 ${settings.face.y}, 너비 ${settings.face.width}, 높이 ${settings.face.height}의 비율 영역입니다.`;
    if (settings.channels) {
      const c = settings.channels;
      direction += ` 세부 표정은 왼쪽 눈썹 ${c.browLeft}, 오른쪽 눈썹 ${c.browRight}, 왼쪽 눈꺼풀 열림 ${c.eyelidLeft}, 오른쪽 눈꺼풀 열림 ${c.eyelidRight}, 입 벌림 ${c.mouth}, 시선 수평 ${c.gazeX}, 시선 수직 ${c.gazeY}입니다. 각 값은 -1부터 1까지이며 전체 감정 강도를 함께 적용합니다.`;
    }
  } else if (settings?.kind === "angle") {
    direction = `피사체 정면 기준 수평 ${settings.azimuth}도, 수직 ${settings.elevation}도, 거리 ${settings.distance}, 시야각 ${settings.fov}도의 카메라 시점으로 변경하세요.`;
    if (settings.roll) direction += ` 카메라 롤은 ${settings.roll}도입니다.`;
    if (settings.target) direction += ` 카메라가 바라볼 지점은 인물 중심 기준 가로 ${settings.target.x}, 높이 ${settings.target.y}, 깊이 ${settings.target.z}입니다.`;
  } else if (settings?.kind === "light" || settings?.kind === "cinematic") {
    direction = `피사체 정면 기준 주광의 수평 방향 ${settings.azimuth}도, 수직 방향 ${settings.elevation}도, 밝기 ${settings.brightness}%, 색상 ${settings.color}, 림 라이트 ${settings.rim ? "사용" : "사용 안 함"}을 적용하세요. 광원에 맞는 그림자와 하이라이트를 표현하세요.`;
    if (settings.smart?.enabled && settings.smart.instruction.trim()) direction += ` 조명 스타일: ${settings.smart.instruction.trim()}`;
    if (settings.kind === "cinematic") direction += ` 영화적 대비 ${settings.contrast}%, 색온도 ${settings.temperature}K, 필름 입자 ${settings.grain}%를 적용하세요.`;
  }
  const layout = imageEditSheetLayout(edit.kind);
  const sheet = layout
    ? `이미지 한 장을 ${layout.columns}열 × ${layout.rows}행의 ${layout.columns * layout.rows}개 독립 컷으로 구성하세요. ${edit.kind === "grid9" || edit.kind === "face3" ? "같은 순간의 서로 다른 시점을 보여 주세요." : "왼쪽에서 오른쪽, 위에서 아래 순서로 사건이 이어지게 하세요."} 각 컷을 일정한 크기로 분리하고 경계를 명확히 하세요.`
    : "";
  const beats = settings?.kind === "story25" && settings.beats?.length
    ? settings.beats.map((beat, index) => beat.trim() ? `컷 ${index + 1}: ${beat.trim()}` : "").filter(Boolean).join("\n")
    : "";
  return [
    `첫 번째 참조 이미지를 원본으로 사용해 ${imageEditKinds[edit.kind]} 작업을 수행하세요.`,
    "다른 지시가 없는 한 인물의 정체성, 의상, 소품과 장면의 연속성을 유지하세요.",
    direction,
    sheet,
    beats,
    "사용자 추가 지시:",
    edit.instruction,
  ].filter(Boolean).join("\n");
}

export function imageEditTemplateInstruction(kind: ImageEditKind): string {
  if (kind === "characterSheet") return "참조 인물의 외모와 의상을 일관되게 유지한 캐릭터 설정도를 만들어 주세요.";
  const layout = imageEditSheetLayout(kind);
  if (!layout) return `${imageEditKinds[kind]}의 변경할 부분과 유지할 특징을 정해 주세요.`;
  const order = kind === "grid9" || kind === "face3" ? "같은 순간을 여러 시점으로" : "시간 순서로 전개되는 장면을";
  return `${order} ${layout.columns}×${layout.rows} 시트에 배치해 주세요.`;
}
