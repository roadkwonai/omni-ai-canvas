import type { CanvasNode, Kind } from "./types";
import { validProductionGuideIds } from "./higgsfield-guidance-kit";

const source = {
  name: "Higgsfield Generate 0.14.0",
  url: "https://github.com/higgsfield-ai/skills/tree/27000402070db19d958789d05b3b52b6f4718d7c/higgsfield-generate",
};

export const guidanceRecipes = [
  {
    id: "story",
    label: "이야기와 기획",
    summary: "아이디어를 인물의 목표와 변화가 있는 이야기로 발전시킵니다.",
    instructions: "장르와 관객, 인물의 목표와 장애를 먼저 정리하고 사건의 인과관계와 감정 변화를 구성한다. 사용자가 요청한 형식과 길이를 따른다.",
    workflow: ["아이디어와 대상 관객 확인", "갈등과 전환 구성", "시나리오와 장면 검토"],
  },
  {
    id: "character",
    label: "캐릭터 연속성",
    summary: "인물의 외형, 행동과 감정 단서를 일관되게 정리합니다.",
    instructions: "인물의 정체성과 의상, 표정, 감정과 행동 목표를 구체화한다. 참조 사진과 각 장면에서 달라지는 상태를 구분한다.",
    workflow: ["캐릭터 목표 정의", "얼굴과 의상 참조 확인", "장면별 상태 검토"],
    skill: source,
  },
  {
    id: "shot",
    label: "장면과 샷 연출",
    summary: "공간, 연기, 카메라와 동작을 한 샷에 맞게 설계합니다.",
    instructions: "샷의 시작 상태, 핵심 동작과 종료 상태를 정리한다. 인물의 위치와 시선, 카메라 앵글·렌즈·움직임, 조명과 감정 표현을 구체화하고 앞뒤 샷의 연속성을 확인한다.",
    workflow: ["장면 목표와 비트 확인", "동선과 카메라 계획", "연속성과 테이크 검토"],
    skill: source,
  },
  {
    id: "image",
    label: "시네마 이미지",
    summary: "캐릭터와 공간을 유지하며 생성할 한 프레임을 구체화합니다.",
    instructions: "한 시점의 피사체와 장소, 구도, 카메라 시점, 빛과 질감을 구체적으로 적는다. 편집할 때는 참조 이미지의 유지할 요소와 변경할 부분을 구분한다.",
    workflow: ["참조 역할과 인물 상태 확인", "프레임·조명 작성", "결과와 연속성 검토"],
    skill: source,
  },
  {
    id: "video",
    label: "시네마 영상",
    summary: "이미지와 참조 영상을 샷의 행동과 카메라 움직임으로 연결합니다.",
    instructions: "시작 프레임에서 이어질 피사체의 행동과 카메라 움직임, 속도, 빛을 구체적으로 적는다. 시작·끝 프레임과 동작 참조를 구분하고 의상·소품·방향의 연속성을 확인한다.",
    workflow: ["샷 목표와 입력 참조 확인", "동작과 카메라 프롬프트", "테이크 및 연속성 검토"],
    skill: source,
  },
  {
    id: "audio",
    label: "음향과 편집",
    summary: "장면의 리듬과 감정에 맞는 음악·효과음과 편집을 계획합니다.",
    instructions: "장면의 감정, 길이와 필요한 음악·환경음·효과음을 구분한다. 대사 여백과 전환 시점, 앞뒤 컷의 소리 연결을 확인한다.",
    workflow: ["장면 길이와 감정 확인", "음향 큐와 편집점 구성", "재생과 믹스 검토"],
  },
] as const;

const defaults: Record<Kind, string> = {
  brief: "story", scenario: "story", scene: "shot", script: "story",
  shot: "shot", character: "character", keyframe: "image",
  referenceImage: "image", referenceVideo: "video", video: "video",
  audioCue: "audio", previs: "audio", note: "story", switch: "video",
};

export function effectiveGuidance(node: Pick<CanvasNode, "kind" | "guidance">) {
  const id = node.guidance?.recipeId || defaults[node.kind];
  const recipe = guidanceRecipes.find((item) => item.id === id) ?? guidanceRecipes[0];
  return { recipe, text: node.guidance?.text ?? recipe.instructions };
}

export function isGuidance(value: unknown): value is NonNullable<CanvasNode["guidance"]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).every((key) => key === "recipeId" || key === "text" || key === "skillIds") &&
    (item.recipeId === undefined || guidanceRecipes.some((recipe) => recipe.id === item.recipeId)) &&
    (item.text === undefined || (typeof item.text === "string" && item.text.length <= 4000)) &&
    (item.skillIds === undefined || validProductionGuideIds(item.skillIds));
}
