import type { DirectorFormat } from "./types";

export const styleFields = {
  structure: "전개 방식",
  pacing: "편집 리듬",
  composition: "구도",
  camera: "카메라",
  performance: "감정 연기",
  film: "필름·조명",
  captions: "자막 스타일",
  layout: "화면 구성",
  sound: "음향",
} as const;

export type StylePresetDraft = {
  name: string;
  profileId: string;
  concept: string;
  techniques: string[];
  style: Record<keyof typeof styleFields, string>;
  evidence: string;
  beats?: {
    endPercent: number;
    label: string;
    framing: string;
    caption: string;
  }[];
};

export const productionProfiles: {
  id: string;
  label: string;
  format: DirectorFormat;
  sceneCount: number;
  description: string;
}[] = [
  {
    id: "influencer",
    label: "AI 인플루언서",
    format: "short",
    sceneCount: 3,
    description:
      "인물의 성격과 말투 고정, 회차별 상황과 세로 화면 구성",
  },
  {
    id: "contest",
    label: "공모전",
    format: "short",
    sceneCount: 3,
    description:
      "요강과 심사 기준에 맞춘 아이디어 후보와 제출 규격",
  },
  {
    id: "shortform",
    label: "숏폼",
    format: "short",
    sceneCount: 3,
    description: "작은 화면에 맞춘 첫 장면의 훅, 핵심 내용과 마무리",
  },
  {
    id: "short-drama",
    label: "숏드라마",
    format: "drama",
    sceneCount: 3,
    description:
      "짧은 갈등과 행동, 감정 변화와 다음 회가 궁금해지는 끝맺음",
  },
  {
    id: "drama",
    label: "드라마",
    format: "drama",
    sceneCount: 4,
    description: "인물 관계와 감정선, 반복해서 나오는 장소와 인물 상태",
  },
  {
    id: "film",
    label: "영화",
    format: "film",
    sceneCount: 3,
    description: "3막으로 나눈 사건과 인물의 선택, 화면과 음향의 연결",
  },
  {
    id: "ad",
    label: "광고",
    format: "ad",
    sceneCount: 3,
    description: "상품 근거와 사용 장면, 전할 메시지와 행동 유도",
  },
  {
    id: "music-video",
    label: "뮤직비디오",
    format: "musicVideo",
    sceneCount: 4,
    description: "곡의 구간과 박자에 맞춘 퍼포먼스와 시각 모티프",
  },
  {
    id: "motion-graphics",
    label: "모션그래픽",
    format: "short",
    sceneCount: 3,
    description: "글자와 도형, 화면 전환과 음향의 타이밍",
  },
  {
    id: "animated-short",
    label: "애니메이션 숏",
    format: "short",
    sceneCount: 3,
    description:
      "짧은 이야기와 캐릭터 동작, 스타일 시트와 애니매틱",
  },
];

export const techniqueChoices = [
  {
    id: "emotion",
    label: "감정 연기",
    instruction: "감정의 변화를 시선, 호흡, 행동과 반응으로 표현한다.",
  },
  {
    id: "previs",
    label: "프리비즈",
    instruction:
      "생성 전에 샷 순서, 길이, 임시 화면과 음향을 프리비즈로 검토한다.",
  },
  {
    id: "composition",
    label: "구도와 화면 축",
    instruction: "피사체 위치, 시선 방향, 화면 축과 앞뒤 샷의 연속성을 정한다.",
  },
  {
    id: "camera",
    label: "카메라 연출",
    instruction: "샷 크기, 앵글, 렌즈와 움직임의 의도를 장면별로 구체화한다.",
  },
  {
    id: "film",
    label: "필름 룩과 조명",
    instruction: "광원, 색온도, 대비, 그레인과 필름 질감의 방향을 지정한다.",
  },
  {
    id: "continuity",
    label: "연속성 관리",
    instruction:
      "인물·의상·소품·장소의 고정 상태와 장면별 변화를 참조로 관리한다.",
  },
  {
    id: "economy",
    label: "테이크 계획",
    instruction:
      "참조와 키프레임을 먼저 검토하고 짧은 동작 단위의 테이크를 비교해 필요한 컷을 채택한다.",
  },
  {
    id: "character-sheet",
    label: "캐릭터 시트",
    instruction:
      "얼굴 근접과 의상의 앞·뒤를 나누어 정체성과 상태별 참조를 준비한다.",
  },
  {
    id: "neutral-reference",
    label: "중립 형태 참조",
    instruction:
      "중립 조명과 배경에서 캐릭터의 형태와 재질을 고정하고 장면 조명은 별도로 정한다.",
  },
  {
    id: "frame-selection",
    label: "영상 프레임 채택",
    instruction:
      "기존 영상에서 빛과 표정이 적합한 프레임을 골라 원본과 시각을 기록한다.",
  },
  {
    id: "camera-path",
    label: "카메라 경로",
    instruction: "카메라의 이동 방향·속도·유지 구도·종료 위치를 명시한다.",
  },
  {
    id: "single-motion",
    label: "한 샷 한 동작",
    instruction:
      "한 샷의 주요 카메라 동작을 단순하게 정하고 복합 동작은 샷을 분할해 검토한다.",
  },
  {
    id: "story-camera",
    label: "서사에 맞춘 카메라",
    instruction:
      "달리 인, 아크, 팔로우 등 카메라 동작을 감정과 정보 공개 목적에 맞춰 선택한다.",
  },
  {
    id: "reframe",
    label: "크롭 재구성",
    instruction:
      "원본 컷의 크롭 후보와 출력 해상도, 얼굴과 자막의 안전 영역을 비교한다.",
  },
  {
    id: "blockout",
    label: "블록아웃 참조",
    instruction:
      "인물 위치와 카메라 경로를 블록아웃으로 계획하고 실제 모델의 영상 참조 지원을 확인한다.",
  },
  {
    id: "camera-texture",
    label: "촬영 질감",
    instruction:
      "핸드헬드, 가림, 초점 회복 같은 촬영 질감의 강도와 구간을 정하고 피사체 가독성을 확인한다.",
  },
  {
    id: "dialogue",
    label: "대사와 화자",
    instruction:
      "화자의 위치와 발화 내용·횟수, 내레이션 여부와 대사 길이를 구분한다.",
  },
  {
    id: "draft-review",
    label: "초안과 채택",
    instruction:
      "짧은 컷으로 초안을 검토하고 실패한 컷과 변경점을 기록한 뒤 채택한 결과를 마무리한다.",
  },
] as const;

const profileDirections: Record<string, string> = {
  influencer:
    "인플루언서의 외형, 말투, 반복할 상황과 시청자와의 관계를 설계한다.",
  contest:
    "제공된 요강의 조건과 근거를 확인하고 심사 기준에 맞는 아이디어 후보와 납품 계획을 구성한다.",
  shortform:
    "초반 훅, 핵심 장면, 마무리를 간결하게 연결하고 세로 화면의 가독성을 확인한다.",
  "short-drama":
    "인물의 목표와 갈등, 감정 변화, 짧은 전환과 다음 장면의 궁금증을 구성한다.",
  drama: "인물 관계와 욕망, 장면의 선택과 반응을 이어 감정선을 구성한다.",
  film: "사건의 인과와 인물의 선택, 세 막의 전환을 이미지와 소리로 전달한다.",
  ad: "확인된 상품 정보와 시연, 시청자에게 전달할 가치와 행동 유도를 설계한다.",
  "music-video": "음악의 구간과 박자, 퍼포먼스와 시각 모티프를 컷에 연결한다.",
  "motion-graphics":
    "장면별 메시지, 텍스트 계층, 도형의 움직임과 전환 타이밍을 설계한다.",
  "animated-short":
    "인물 스타일과 포즈를 고정하고 단순한 동작 단위와 애니매틱을 구성한다.",
};

const profileDefaults: Record<
  string,
  { style: StylePresetDraft["style"]; techniques: string[] }
> = {
  influencer: {
    style: {
      structure: "상황 제시 → 인물 반응 → 시청자 질문",
      pacing: "짧은 호흡과 반응에 맞춘 컷",
      composition: "얼굴과 손짓이 보이는 세로 미디엄 클로즈업",
      camera: "시선 높이의 안정된 카메라",
      performance: "고정된 말투와 자연스러운 시선 변화",
      film: "부드러운 정면광과 따뜻한 피부 톤",
      captions: "하단 안전 영역에 핵심어 강조",
      layout: "상단 제목, 중앙 인물, 하단 자막",
      sound: "명료한 목소리와 낮은 배경음",
    },
    techniques: [
      "emotion",
      "continuity",
      "character-sheet",
      "dialogue",
      "draft-review",
    ],
  },
  contest: {
    style: {
      structure: "요강 확인 → 후보 비교 → 선정안과 제출 점검",
      pacing: "공모 규격과 이야기 변화에 맞춘 호흡",
      composition: "주제와 심사 기준을 보여 주는 핵심 장면",
      camera: "장면 목적에 맞춰 샷과 움직임 선택",
      performance: "주제와 선택이 드러나는 행동",
      film: "요강과 콘셉트에 맞춰 일관되게 지정",
      captions: "언어와 규격을 요강에서 확인",
      layout: "제출 화면비와 안전 영역을 확인",
      sound: "제출 조건과 대사 전달을 확인",
    },
    techniques: ["previs", "continuity", "camera-path", "draft-review"],
  },
  shortform: {
    style: {
      structure: "첫 장면 훅 → 핵심 내용 → 마무리",
      pacing: "정보 단위마다 짧게 전환",
      composition: "세로 화면 중앙의 명확한 피사체",
      camera: "간결한 구도와 동작 중심 컷",
      performance: "한 컷마다 한 가지 행동",
      film: "선명한 대비와 일관된 색온도",
      captions: "짧은 문장과 핵심어 강조",
      layout: "플랫폼 UI를 피한 세로 안전 영역",
      sound: "훅 효과음과 대사를 가리지 않는 음악",
    },
    techniques: [
      "composition",
      "previs",
      "single-motion",
      "dialogue",
      "draft-review",
    ],
  },
  "short-drama": {
    style: {
      structure: "즉시 갈등 → 선택 → 감정 전환과 후속 훅",
      pacing: "대사와 리액션에 맞춘 짧은 컷",
      composition: "세로 클로즈업과 상대 시선 연결",
      camera: "시선 축을 지키는 절제된 달리 인",
      performance: "감정의 시작과 변화, 숨과 눈빛",
      film: "일관된 피부 톤과 대비 있는 실내광",
      captions: "대사를 짧게 나누고 인물을 가리지 않기",
      layout: "세로 화면에서 얼굴과 대사 안전 영역 확보",
      sound: "대사 우선, 반응과 전환을 돕는 환경음",
    },
    techniques: [
      "emotion",
      "previs",
      "continuity",
      "character-sheet",
      "dialogue",
      "story-camera",
      "draft-review",
    ],
  },
  drama: {
    style: {
      structure: "인물 목표 → 갈등 → 선택과 관계 변화",
      pacing: "대사와 침묵, 반응의 길이를 조절",
      composition: "인물의 관계와 시선 축이 드러나는 투샷",
      camera: "장면 목적에 맞는 고정과 느린 이동",
      performance: "대사 속 의도와 눈에 보이는 반응",
      film: "장소와 감정에 맞는 부드러운 명암",
      captions: "대사에 맞춘 읽기 쉬운 자막",
      layout: "인물 관계와 시선 공간을 우선",
      sound: "대사 여백, 환경음과 감정 전환의 음악",
    },
    techniques: [
      "emotion",
      "previs",
      "continuity",
      "character-sheet",
      "camera-path",
      "dialogue",
      "economy",
    ],
  },
  film: {
    style: {
      structure: "설정 → 대립 → 선택과 결과",
      pacing: "장면 목적과 감정 변화에 따른 호흡",
      composition: "공간 깊이와 인물 간 시선 축",
      camera: "서사 목적에 맞는 렌즈와 단일 움직임",
      performance: "행동과 표정으로 드러나는 내적 갈등",
      film: "필름 질감, 조명 방향과 하이라이트를 일관되게",
      captions: "필요한 대사와 화면 안전 영역 확인",
      layout: "와이드 프레임의 전경과 배경 깊이",
      sound: "공간 환경음과 동작에 맞는 전환",
    },
    techniques: [
      "emotion",
      "previs",
      "continuity",
      "camera-path",
      "single-motion",
      "story-camera",
      "blockout",
      "economy",
    ],
  },
  ad: {
    style: {
      structure: "고객 상황 → 상품 시연 → 근거와 행동 유도",
      pacing: "상품 행동과 핵심 메시지 중심",
      composition: "상품 형태와 사용 행동이 보이는 근접 구도",
      camera: "상품을 따라가는 짧고 명확한 움직임",
      performance: "사용 상황에 맞는 구체적 행동",
      film: "실제 상품 색과 패키지가 유지되는 조명",
      captions: "확인된 특징과 간결한 CTA",
      layout: "상품과 문구가 겹치지 않는 안전 영역",
      sound: "시연 소리와 명료한 보이스오버",
    },
    techniques: [
      "previs",
      "composition",
      "continuity",
      "single-motion",
      "draft-review",
    ],
  },
  "music-video": {
    style: {
      structure: "인트로 → 벌스 → 후렴 → 브리지 → 아웃트로",
      pacing: "곡의 박자와 구간 변화에 맞춘 컷",
      composition: "퍼포먼스와 반복 모티프가 읽히는 구도",
      camera: "박자와 동작에 맞는 팔로우 또는 고정",
      performance: "구간별 안무와 감정 에너지",
      film: "곡 분위기에 맞는 반복 색상과 조명",
      captions: "필요한 가사와 크레딧만 안전 영역에 배치",
      layout: "출연자와 무대, 그래픽의 계층 구분",
      sound: "원곡 구간과 박자를 기준으로 편집",
    },
    techniques: [
      "previs",
      "continuity",
      "camera-path",
      "single-motion",
      "frame-selection",
      "draft-review",
    ],
  },
  "motion-graphics": {
    style: {
      structure: "메시지 훅 → 핵심 포인트 → 정리",
      pacing: "문장과 그래픽의 등장·퇴장 타이밍",
      composition: "텍스트와 그래픽의 명확한 계층",
      camera: "과도한 이동 없이 화면 전환 중심",
      performance: "오브젝트의 크기와 움직임으로 감정 표현",
      film: "정해진 팔레트와 배경 대비",
      captions: "키워드 강조, 충분한 노출 시간",
      layout: "제목·본문·이미지를 분리한 레이어",
      sound: "움직임과 맞춘 효과음과 음악",
    },
    techniques: ["previs", "composition", "single-motion", "draft-review"],
  },
  "animated-short": {
    style: {
      structure: "상황 소개 → 문제 → 행동과 결말",
      pacing: "포즈와 리액션이 읽히는 간결한 타이밍",
      composition: "실루엣과 표정이 읽히는 화면",
      camera: "주요 동작을 가리지 않는 단순한 앵글",
      performance: "포즈 변화와 표정으로 감정 전달",
      film: "캐릭터 시트에 맞는 색과 질감",
      captions: "짧은 대사와 내레이션의 가독성 확보",
      layout: "캐릭터와 배경을 구분하는 레이어",
      sound: "동작별 폴리와 장면 리듬에 맞춘 음악",
    },
    techniques: [
      "emotion",
      "previs",
      "character-sheet",
      "neutral-reference",
      "single-motion",
      "draft-review",
    ],
  },
};

export function makeStyleDraft(profileId: string): StylePresetDraft {
  const profile = productionProfiles.find((item) => item.id === profileId);
  if (!profile) throw new Error("제작 유형을 확인해 주세요.");
  return {
    name: `${profile.label} 스타일`,
    profileId: profile.id,
    concept: profileDirections[profile.id],
    techniques: [...profileDefaults[profile.id].techniques],
    style: { ...profileDefaults[profile.id].style },
    evidence: "",
  };
}

export function parseStyleDraft(value: unknown): StylePresetDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (
    Object.keys(item).some(
      (key) =>
        ![
          "name",
          "profileId",
          "concept",
          "techniques",
          "style",
          "evidence",
          "beats",
        ].includes(key),
    )
  )
    return null;
  if (
    typeof item.name !== "string" ||
    !item.name.trim() ||
    item.name.length > 100 ||
    typeof item.profileId !== "string" ||
    !productionProfiles.some((profile) => profile.id === item.profileId) ||
    typeof item.concept !== "string" ||
    item.concept.length > 500 ||
    typeof item.evidence !== "string" ||
    item.evidence.length > 1000 ||
    !Array.isArray(item.techniques) ||
    item.techniques.length > techniqueChoices.length ||
    item.techniques.some(
      (id) =>
        typeof id !== "string" ||
        !techniqueChoices.some((technique) => technique.id === id),
    ) ||
    new Set(item.techniques).size !== item.techniques.length ||
    !item.style ||
    typeof item.style !== "object" ||
    Array.isArray(item.style)
  )
    return null;
  const style = item.style as Record<string, unknown>;
  const keys = Object.keys(styleFields);
  if (
    Object.keys(style).length !== keys.length ||
    keys.some(
      (key) =>
        typeof style[key] !== "string" || (style[key] as string).length > 250,
    )
  )
    return null;
  let beats: StylePresetDraft["beats"];
  if (item.beats !== undefined) {
    if (!Array.isArray(item.beats) || item.beats.length > 24) return null;
    beats = [];
    let previous = 0;
    for (const value of item.beats) {
      if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
      const beat = value as Record<string, unknown>;
      if (
        Object.keys(beat).some(
          (key) => !["endPercent", "label", "framing", "caption"].includes(key),
        ) ||
        typeof beat.endPercent !== "number" ||
        !Number.isFinite(beat.endPercent) ||
        beat.endPercent <= previous ||
        beat.endPercent > 100 ||
        typeof beat.label !== "string" ||
        !beat.label.trim() ||
        beat.label.length > 80 ||
        typeof beat.framing !== "string" ||
        beat.framing.length > 160 ||
        typeof beat.caption !== "string" ||
        beat.caption.length > 160
      )
        return null;
      previous = beat.endPercent;
      beats.push({
        endPercent: beat.endPercent,
        label: beat.label,
        framing: beat.framing,
        caption: beat.caption,
      });
    }
    if (beats.length && previous !== 100) return null;
  }
  return {
    name: item.name.trim(),
    profileId: item.profileId,
    concept: item.concept,
    techniques: [...item.techniques],
    style: { ...style } as StylePresetDraft["style"],
    evidence: item.evidence,
    ...(beats ? { beats } : {}),
  };
}

export function styleBrief(draft: StylePresetDraft): string {
  const profile = productionProfiles.find(
    (item) => item.id === draft.profileId,
  );
  if (!profile || !parseStyleDraft(draft))
    throw new Error("스타일 프리셋을 확인해 주세요.");
  const fields = Object.entries(styleFields).flatMap(([key, label]) => {
    const value = draft.style[key as keyof typeof styleFields].trim();
    return value ? [`${label}: ${value}`] : [];
  });
  const techniques = techniqueChoices
    .filter((item) => draft.techniques.includes(item.id))
    .map((item) => item.instruction);
  let previous = 0;
  const beats = (draft.beats ?? []).map((beat) => {
    const range = `${previous}~${beat.endPercent}%`;
    previous = beat.endPercent;
    return `${range} ${beat.label} | 구도: ${beat.framing} | 자막: ${beat.caption}`;
  });
  return [
    `제작 유형: ${profile.label}`,
    `콘셉트: ${draft.concept}`,
    ...fields,
    ...techniques.map((item) => `기법: ${item}`),
    ...(beats.length ? ["구간별 연출 슬롯:", ...beats] : []),
    ...(draft.evidence.trim()
      ? [`레퍼런스 관찰과 근거: ${draft.evidence}`]
      : []),
  ].join("\n");
}
