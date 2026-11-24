import { directorPresets, type DirectorPreset } from "./node-director-presets";

// 랜딩에는 실사 예제만 쓴다. 움직임은 로컬 보관함의 영상을 먼저 쓰고, 없으면 사진으로 만든 영상(ownMoves)을 쓴다.
const groups: { id: string; label: string; items: [id: string, use: string][] }[] = [
  { id: "movement", label: "카메라 이동", items: [
    ["dolly-in", "피사체에 다가가 감정이나 긴장감을 높여요."],
    ["dolly-out", "피사체에서 멀어지며 주변 공간을 드러내요."],
    ["dolly-zoom", "배경만 달라져 충격과 현기증을 줘요."],
    ["zoom", "카메라는 그대로 두고 렌즈로 당겨요."],
    ["pan", "제자리에서 옆으로 돌려 공간을 보여 줘요."],
    ["tilt", "제자리에서 위아래로 돌려 높이를 보여 줘요."],
    ["whip-pan", "빠르게 돌려 에너지를 주거나 장면을 바꿔요."],
    ["rack-focus", "초점을 옮겨 보는 대상을 바꿔요."],
    ["handheld", "손으로 든 듯한 움직임으로 현장감을 더해요."],
    ["arc", "인물 둘레를 곡선으로 돌며 중요한 순간임을 알려요."],
    ["crane", "높이와 각도를 함께 바꿔 규모를 보여 줘요."],
    ["drone", "공중에서 멀어지며 넓은 장소를 드러내요."],
  ] },
  { id: "framing", label: "구도와 앵글", items: [
    ["extreme-wide", "넓은 공간 속 인물의 위치나 고립감을 보여 줘요."],
    ["close-up", "얼굴과 표정의 감정 변화를 강조해요."],
    ["extreme-close-up", "눈이나 손끝처럼 작은 부분에 집중해요."],
    ["low-angle", "인물을 올려다보며 힘과 위압감을 강조해요."],
    ["high-angle", "인물을 내려다봐 약하거나 외로워 보여요."],
    ["top-view", "바로 위에서 동선과 배치를 한눈에 보여 줘요."],
    ["dutch-tilt", "화면을 기울여 불안과 혼란을 나타내요."],
    ["over-shoulder", "한 사람의 어깨 너머로 상대와의 관계를 보여 줘요."],
  ] },
  { id: "composition", label: "화면 배치", items: [
    ["negative-space", "넓은 빈 공간으로 고독이나 막막함을 전해요."],
    ["frame-in-frame", "문틀이나 창 안에 인물을 가둬 집중시켜요."],
    ["one-point", "모든 선이 모이는 자리로 시선을 끌어요."],
    ["foreground", "앞의 흐린 물체 너머로 엿보는 느낌을 줘요."],
    ["pattern-break", "반복되는 무리 속에서 하나만 눈에 띄게 해요."],
    ["spiral", "소용돌이 선을 따라 시선이 인물에 닿아요."],
    ["triangle", "세 인물의 높이와 거리로 위계를 보여 줘요."],
    ["horizontal-line", "수평선으로 고요함과 넓이를 느끼게 해요."],
  ] },
  { id: "camera", label: "카메라와 렌즈", items: [
    ["cam-film16", "거친 입자와 바랜 색으로 오래된 기억을 나타내요."],
    ["cam-cctv", "감시하거나 사건을 되짚는 장면에 어울려요."],
    ["cam-camcorder", "90년대 홈비디오와 회상 장면에 어울려요."],
    ["lens-anamorphic", "넓은 화면에 빛이 길게 번져요."],
    ["lens-fisheye", "공간을 과장하고 인물에게 바짝 다가가요."],
    ["lens-macro", "눈동자나 작은 단서의 질감을 크게 보여 줘요."],
    ["lens-tiltshift", "얼굴 한 줄만 또렷하게 두어 시선을 좁혀요."],
    ["f1-4", "눈만 또렷하고 배경은 커다란 빛망울로 녹아요."],
  ] },
  { id: "viewpoint", label: "창의 시점", items: [
    ["inside-cup", "투명한 컵 속에서 올려다봐요."],
    ["phone-screen", "손에 든 화면 속 인물을 보여 줘요."],
    ["prop-mount", "가방 같은 소품에 달린 낮은 시점이에요."],
    ["swing-mount", "그네에 고정해 인물과 함께 흔들려요."],
    ["steering-wheel", "운전대 사이로 운전자를 바라봐요."],
    ["sunglasses", "렌즈에 비친 인물을 보여 줘요."],
    ["behind-pages", "펼친 책의 가장자리 너머로 인물을 봐요."],
    ["keyhole", "문 안쪽에서 열쇠 구멍으로 엿봐요."],
  ] },
];

const all: DirectorPreset[] = Object.values(directorPresets).flatMap((items): readonly DirectorPreset[] => items);

/** public/director/moves에 있는 움직임. scripts/director-photo-moves.mjs로 만든다. */
export const ownMoves = ["dolly-in", "dolly-out", "dolly-zoom", "zoom", "pan", "tilt", "whip-pan", "rack-focus", "handheld"];
export const directorTechniqueCount = all.length;
export type ShowcaseItem = { id: string; name: string; use: string };
export const directorShowcase = groups.map(({ id, label, items }) => ({
  id, label,
  items: items.flatMap(([itemId, use]): ShowcaseItem[] => {
    const preset = all.find((item) => item.id === itemId);
    return preset ? [{ id: itemId, name: preset.name, use }] : [];
  }),
}));
