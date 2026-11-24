import type { Kind } from "./types";

export const dramaWritingGuidance = "장면마다 인물의 당면 목표, 저항, 선택과 그 결과를 행동이나 소리로 드러낸다. 회차는 작은 결과를 먼저 주고 다음 회차로 이어질 구체적인 사건이나 질문을 남긴다. 내레이션과 속마음은 필요한 배경·시간 경과·숨긴 의도처럼 화면과 대사만으로 전달하기 어려운 정보에만 짧게 쓴다. 이미 보인 행동이나 감정을 반복해서 읽지 않는다. 사용자가 정한 무음·발화·정보 공개 시점을 우선한다.";

export const productionGuides = [
  {
    id: "story-hook", label: "숏드라마 구조", category: "이야기",
    sourceKind: "제작자 배포 대본 스킬에서 정리", source: "https://higgsfield.ai/ko/@adilinthewildtempo/blogs/how-to-make-ai-short-drama",
    localSource: "short-drama-screenwriter",
    summary: "강렬한 순간과 맥락, 감정 변화, 회차 끝 질문을 계획합니다. 원본에는 이야기 아이디어 100개가 수록돼 있습니다.",
    instructions: "숏드라마의 첫 씬에서 강렬한 순간으로 관심을 열고 그 순간에 이르는 맥락을 제시한다. 장면의 목표·장애·선택과 눈에 보이는 감정 변화를 기록하고 회차 끝에 다음 장면을 궁금하게 하는 질문이나 결정 직전을 둔다. 20~30초 감정 전환은 작품 길이에 맞춰 조정할 제안이다.",
    kinds: ["brief", "scenario", "script", "scene"] as Kind[],
    workflow: ["강렬한 순간과 맥락", "목표·장애·감정 비트", "회차 끝 질문 검토"],
  },
  {
    id: "cinematic-engine", label: "씬의 목표·장애·전환", category: "이야기",
    sourceKind: "제작자 배포 프롬프트 엔진에서 정리",
    source: "https://higgsfield.ai/ko/@adilinthewildtempo/blogs/make-a-cinematic-ai-short-film-with-higgsfield-the-workflow",
    localSource: "cinematic-prompt-engine",
    summary: "씬 목표, 장애, 행동 전략과 전환을 이야기 전체에 연결합니다.",
    instructions: "씬이 이야기의 전체 목표에 어떻게 연결되는지 정한다. 인물의 목표와 장애, 선택한 행동 전략, 씬 안에서 뒤집히는 사건과 전후 가치 변화를 구체적으로 검토한다.",
    kinds: ["brief", "scenario", "script", "scene", "shot"] as Kind[],
    workflow: ["씬 목표와 이야기 연결", "장애와 행동 전략", "전환과 가치 변화"],
  },
  {
    id: "casting-continuity", label: "캐스팅과 상태 시트", category: "참조",
    sourceKind: "제작자 사례에서 정리", source: "https://higgsfield.ai/ko/@adilinthewildtempo/blogs/make-a-cinematic-ai-short-film-with-higgsfield-the-workflow",
    summary: "인물별 모습과 의상·소품 상태를 분리해 씬마다 연결합니다.",
    instructions: "배역마다 이름, 얼굴, 의상, 필요한 상태와 유지할 특징을 기록하고 각 장면의 활성 이미지·영상 참조 역할을 명시한다. 엑스트라를 한 그룹으로 구성할지 장면별 식별성을 확인한다. Image Element와 Video Element는 제작자 사례의 자산 관리 방식으로 참고하고 모델의 실제 입력 지원을 확인한다.",
    kinds: ["brief", "character", "referenceImage", "referenceVideo", "scene", "shot", "keyframe", "video"] as Kind[],
    workflow: ["배역과 상태 구분", "인물·장소·소품의 참조 역할 지정", "생성 모델의 입력 슬롯 확인"],
  },
  {
    id: "voice-performance", label: "목소리와 대사 계획", category: "음향",
    sourceKind: "제작자 사례에서 정리", source: "https://higgsfield.ai/ko/@adilinthewildtempo/blogs/make-a-cinematic-ai-short-film-with-higgsfield-the-workflow",
    summary: "배역별 목소리, 대사 타이밍과 후반 음향을 계획합니다.",
    instructions: "각 배역의 목소리, 말투와 장면별 대사를 정리하고 녹음 여부와 참조 자산을 기록한다. 화자 위치, 대사 시작·종료와 상대의 반응을 샷에 맞춘다. 제공자의 목소리 지정 기능은 실제 모델과 계정의 지원 여부를 확인한다.",
    kinds: ["brief", "character", "script", "scene", "shot", "audioCue"] as Kind[],
    workflow: ["배역별 목소리 계획", "대사와 반응 시간", "음향 자산 확인"],
  },
  {
    id: "drama-writing", label: "Drama Skills · 대본 집필", category: "이야기",
    sourceKind: "Drama Skills 원본 요약", source: "https://github.com/zenstory-ai/drama-skills/blob/8cf7404981b7095b498e061832bb3c9ffd6a42be/skills/short-drama-write/references/script-craft.md",
    summary: "인물의 선택이 만드는 장면과 회차의 결과를 쓰고 필요한 음성만 남깁니다.",
    instructions: dramaWritingGuidance,
    kinds: ["brief", "scenario", "script", "scene"] as Kind[],
    workflow: ["장면의 목표와 저항 확인", "선택과 결과를 대본에 반영", "필요한 VO·OS와 다음 장면 인계 확인"],
  },
  {
    id: "blocking", label: "공간 블로킹과 카메라", category: "카메라",
    sourceKind: "제작자 사례에서 정리", source: "https://higgsfield.ai/ko/@adilinthewildtempo/blogs/make-a-cinematic-ai-short-film-with-higgsfield-the-workflow",
    summary: "공간의 시작 위치와 카메라 지시를 분리해 샷을 설계합니다.",
    instructions: "공간의 위에서 본 배치도로 인물의 시작 위치·이동 방향·시선과 축을 정한다. 배치도는 시작 위치를 설명하는 자료이고 카메라 각도와 이동은 샷 지시로 따로 쓴다. 생성에 전달할 참조와 제작 확인용 가이드를 명시하며 같은 동작의 다른 앵글은 인물의 위치와 행동 연속성을 확인한다.",
    kinds: ["scene", "shot", "referenceVideo", "video", "previs"] as Kind[],
    workflow: ["장소·시작 위치 도식", "블로킹과 샷 카메라 지시 분리", "같은 동작의 시점·연속성 검토"],
  },
  {
    id: "cinema-prompt", label: "공식 생성 프롬프트", category: "프롬프트",
    sourceKind: "공식 Higgsfield 스킬 요약", source: "https://github.com/higgsfield-ai/skills/blob/27000402070db19d958789d05b3b52b6f4718d7c/higgsfield-generate/references/prompt-engineering.md",
    summary: "피사체·공간·카메라·빛을 필요한 만큼 구체화합니다.",
    instructions: "피사체, 장소, 시각 스타일, 카메라 각도·움직임과 빛을 명확하게 적는다. 이미지 편집은 유지할 참조보다 바꿀 부분을 설명한다. 시작 프레임이 있는 영상은 정지된 화면을 반복하기보다 피사체와 카메라의 움직임을 설명한다.",
    kinds: ["shot", "keyframe", "referenceImage", "referenceVideo", "video"] as Kind[],
    workflow: ["참조 역할과 장면 의도", "움직임과 카메라 지시", "모델별 슬롯 확인"],
    installedSource: true,
  },
  {
    id: "shot-plan", label: "샷 설계와 앵글", category: "카메라",
    sourceKind: "Omni AI Canvas 연출 지침", source: "https://higgsfield.ai/ko/@adilinthewildtempo/blogs/make-a-cinematic-ai-short-film-with-higgsfield-the-workflow",
    summary: "시작·행동·끝과 프레이밍, 렌즈, 카메라 동작을 정의합니다.",
    instructions: "샷의 시작 상태, 핵심 행동과 종료 상태를 쓴다. 프레이밍, 시점, 렌즈와 카메라 이동의 속도·종료 위치를 명시하고 전후 컷의 위치·시선·행동을 이어 준다. 렌즈와 필름 선택은 시각적 목표이며 모델이 정확히 재현한다고 가정하지 않는다.",
    kinds: ["scene", "shot", "keyframe", "video", "previs"] as Kind[],
    workflow: ["시작·행동·끝", "렌즈와 카메라 경로", "전후 컷 연결"],
  },
  {
    id: "anamorphic", label: "아나모픽 렌즈 룩", category: "카메라",
    sourceKind: "제작자 배포 렌즈 스킬에서 정리",
    source: "https://higgsfield.ai/ko/@adilinthewildtempo/blogs/make-a-cinematic-ai-short-film-with-higgsfield-the-workflow",
    localSource: "cinematic-anamorphic",
    summary: "화각·심도·보케와 광원의 표현을 선택합니다.",
    instructions: "아나모픽 스타일을 원하면 가로 프레이밍, 심도와 배경, 하이라이트와 보케, 조명의 질감을 샷 의도에 맞게 정한다. 렌즈 수치와 광학 효과는 시각적 지시이며 모델이나 원본 영상의 실제 장비를 확정하지 않는다.",
    kinds: ["shot", "keyframe", "referenceImage", "video"] as Kind[],
    workflow: ["화면비와 프레이밍", "심도·하이라이트", "샷의 시각적 의도 검토"],
  },
  {
    id: "seedance-shot", label: "시간별 영상 프롬프트", category: "프롬프트",
    sourceKind: "제작자 배포 영상 프롬프트 스킬에서 정리",
    source: "https://higgsfield.ai/ko/@adilinthewildtempo/blogs/how-to-make-ai-short-drama",
    localSource: "short-drama-seedance-prompt",
    summary: "시간 구간별 카메라, 행동, 활성 참조를 계획합니다.",
    instructions: "장면의 시간 구간별 카메라·인물 행동·감정과 대사를 정리한다. 샷에 실제 필요한 인물·장소·소품 참조를 역할별로 지정하고 시작 프레임을 따른다. 모델이 수용하는 길이·참조 역할과 자막·음향 지원은 실행 전 확인한다.",
    kinds: ["scene", "script", "shot", "referenceVideo", "video"] as Kind[],
    workflow: ["화자·행동과 시간", "카메라·참조의 역할", "모델 입력과 연속성 확인"],
  },
  {
    id: "acting", label: "감정과 연기", category: "연기",
    sourceKind: "제작자 배포 연기 스킬에서 정리", source: "https://higgsfield.ai/ko/@adilinthewildtempo/blogs/make-a-cinematic-ai-short-film-with-higgsfield-the-workflow",
    localSource: "cinematic-acting",
    summary: "인물의 감정을 시선·호흡·반응으로 구체화합니다.",
    instructions: "전체 대화와 씬이 향하는 목표를 먼저 확인한다. 각 인물의 목적·장애·행동 전략, 감정의 시작·전환·끝을 시선, 호흡, 손동작과 상대의 반응으로 구체화한다. 움직이며 대화할 경우 동선과 화자의 대사 시점을 정한다. 격렬한 장면은 비접촉 연기, 안전한 거리와 카메라·편집으로 표현한다.",
    kinds: ["character", "script", "scene", "shot", "video"] as Kind[],
    workflow: ["목표와 감정 비트", "눈에 보이는 행동", "상대의 반응과 컷 연결"],
  },
  {
    id: "screen-action", label: "비접촉 동작·컷 연속성", category: "연기",
    sourceKind: "Omni AI Canvas 연출 지침",
    source: "https://higgsfield.ai/ko/@adilinthewildtempo/blogs/make-a-cinematic-ai-short-film-with-higgsfield-the-workflow",
    summary: "비접촉 동작의 시선, 반응과 편집 연결을 설계합니다.",
    instructions: "동작 장면은 비접촉 연기와 화면 밖 동작을 사용한다. 장면 전후의 인물 위치·시선과 동작 방향을 맞추고, 행동이 시작되는 컷과 상대 반응 컷을 연결한다. 같은 동작을 다른 앵글에서 보여줄 때 시작·종료 상태와 반응 시점을 검토한다.",
    kinds: ["scene", "shot", "video", "previs"] as Kind[],
    workflow: ["시작 위치·시선", "동작을 암시하는 컷", "상대 반응과 연결 검토"],
  },
  {
    id: "fashion-ad-reference", label: "패션 광고 참조와 배치", category: "참조",
    sourceKind: "제작자 배포 참조 프롬프트에서 정리",
    source: "https://higgsfield.ai/ko/@adilinthewildtempo/blogs/how-to-make-iman-gadzhi-s-fashion-ad",
    summary: "제품·캐스팅·공간 참조를 준비하고 씬별 입력과 위치를 정합니다.",
    instructions: "사용자가 제공하거나 사용을 승인한 실제 제품 사진에서 형태·색상·로고와 재질을 확인한다. 주인공과 주변 인물의 얼굴·의상 시트를 구분하고 장소와 소품 참조를 준비한다. 차량이나 인물의 임시 위치 표시는 배치 확인용으로 두고 실제 샷 참조와 구별한다. 씬마다 필요한 제품·인물·장소 이미지만 역할에 맞춰 연결한다.",
    kinds: ["brief", "character", "referenceImage", "scene", "shot", "keyframe", "video"] as Kind[],
    workflow: ["실제 제품과 인물 시트", "공간과 임시 배치", "씬별 참조 역할"],
  },
  {
    id: "fashion-ad-shot-prompt", label: "패션 광고 샷 프롬프트", category: "프롬프트",
    sourceKind: "제작자 배포 샷 프롬프트 스킬에서 정리",
    source: "https://higgsfield.ai/ko/@adilinthewildtempo/blogs/how-to-make-iman-gadzhi-s-fashion-ad",
    summary: "각 씬의 참조를 고정하고 행동과 카메라 움직임을 시간 순서로 씁니다.",
    instructions: "기본 FAST 작성과 필요시 PRO 작성에서 첫 프레임과 샷별 시간, 제품·인물·장소 참조의 역할을 확인한다. 사건과 인물의 목표·장애·행동 전략을 화면에 보이는 행동으로 쓰고 시선과 접촉·충돌을 명시한다. 카메라의 렌즈·거리·이동 경로와 종료 지점, 조명, 대사와 음향을 시간 순서로 정한다. 승인한 편집을 보존하고 앞뒤 샷의 제품·인물·의상 연속성과 선택 모델의 입력 슬롯을 검토한다.",
    kinds: ["brief", "scenario", "scene", "shot", "keyframe", "video"] as Kind[],
    workflow: ["씬별 참조와 시작 상태", "행동·카메라·종료 상태", "제품과 인물 연속성 검토"],
  },
  {
    id: "fashion-ad-lens-transition", label: "제품 렌즈 전환과 편집", category: "카메라",
    sourceKind: "제작자 배포 렌즈 전환 스킬에서 정리",
    source: "https://higgsfield.ai/ko/@adilinthewildtempo/blogs/how-to-make-iman-gadzhi-s-fashion-ad",
    summary: "제품 렌즈를 중심으로 인접한 샷을 이어 붙일 전환을 계획합니다.",
    instructions: "연결할 앞·뒤 샷의 정확한 정수 프레임 경계를 고르고 제품 렌즈를 추적한 알파 마스크와 짧은 전환 샷을 계획한다. 제작자 예시의 로컬 출력은 1920×1080, 초당 24프레임이며 작품 설정에 맞춰 조정한다. 렌즈 반사와 초점·흐림, 중복 경계 프레임을 확인하고 실제 제품 참조에 맞게 표식을 보정한다. 검수한 전환 자산과 승인 테이크를 타임라인에 순서대로 배치해 컷과 음향을 확인한다.",
    kinds: ["scene", "shot", "referenceImage", "referenceVideo", "keyframe", "video", "previs"] as Kind[],
    workflow: ["인접 샷의 렌즈 프레임 선택", "전환 동작과 빛 연결", "승인 테이크와 편집 경계 검수"],
  },
  {
    id: "commercial-check", label: "광고 스토리보드와 검수", category: "제작 검수",
    sourceKind: "제작자 사례에서 정리", source: "https://higgsfield.ai/ko/@adilinthewildtempo/blogs/make-a-realistic-ai-commercial-without-wasting-credits",
    summary: "상품 상태와 행동을 검토하고 필요한 테이크를 선택합니다.",
    instructions: "확인된 상품 특징과 실제 참조, 장소·소품 상태를 기록하고 스토리보드에서 시작·동작·종료와 샷 연결을 검토한다. 승인된 참조와 기존 테이크를 재사용하고, 생성 전 현재 모델의 조건과 예상 비용을 확인한다. 근거 없는 상품 효능이나 절대적인 비용 절감을 단정하지 않는다.",
    kinds: ["brief", "scenario", "shot", "referenceImage", "keyframe", "video", "previs"] as Kind[],
    workflow: ["실제 상품·상태 확인", "스토리보드와 행동 연결", "테이크 검토"],
  },
  {
    id: "commercial-prompt", label: "광고 영상 프롬프트", category: "프롬프트",
    sourceKind: "제작자 배포 광고 스킬에서 정리",
    source: "https://higgsfield.ai/ko/@adilinthewildtempo/blogs/make-a-realistic-ai-commercial-without-wasting-credits",
    localSource: "commercial-seedance-prompt",
    summary: "상품 상태와 동작을 시간·카메라·참조로 연결합니다.",
    instructions: "확인된 상품의 형태와 상태를 고정하고, 각 샷에서 제품이 등장하는 위치, 사용 행동, 카메라와 조명을 시간 순서로 정한다. 승인된 상품·인물·장소 참조의 역할과 지원되는 입력을 확인한다.",
    kinds: ["brief", "scene", "script", "shot", "video"] as Kind[],
    workflow: ["상품 상태와 참조", "행동과 카메라", "모델 입력 검수"],
  },
  {
    id: "commercial-acting", label: "광고 출연자 연기", category: "연기",
    sourceKind: "제작자 배포 광고 연기 스킬에서 정리",
    source: "https://higgsfield.ai/ko/@adilinthewildtempo/blogs/make-a-realistic-ai-commercial-without-wasting-credits",
    localSource: "commercial-acting-director",
    summary: "출연자의 상품 사용 목적과 자연스러운 반응을 설계합니다.",
    instructions: "광고 속 인물이 상품을 사용하는 목표와 상황을 정하고 손동작·시선·표정·반응을 화면에 보이는 행동으로 설명한다. 브랜드와 상품에 관한 확인된 정보만 사용한다.",
    kinds: ["brief", "character", "script", "scene", "shot", "video"] as Kind[],
    workflow: ["출연자 목표와 사용 상황", "보이는 손동작·반응", "상품 정보 검수"],
  },
  {
    id: "soul-id", label: "Soul 인물 정체성 준비", category: "참조",
    sourceKind: "공식 Soul ID 스킬 요약",
    source: "https://github.com/higgsfield-ai/skills/tree/27000402070db19d958789d05b3b52b6f4718d7c/higgsfield-soul-id",
    localSource: "soul-id",
    summary: "개인화 캐릭터용 얼굴 참조와 상태를 준비합니다.",
    instructions: "개인화 인물을 사용할 때 일관된 얼굴·헤어와 상태별 의상 참조를 정리한다. Soul Character 학습과 Video Element를 별개의 제공자 기능으로 다루고, 실제 계정의 지원과 비용을 확인한다.",
    kinds: ["character", "referenceImage", "keyframe"] as Kind[],
    workflow: ["얼굴·외형 참조 확인", "인물 상태별 시트", "제공자 기능과 비용 확인"],
  },
  {
    id: "product-photo", label: "제품 포토슈트 준비", category: "프롬프트",
    sourceKind: "공식 제품 포토슈트 스킬 요약",
    source: "https://github.com/higgsfield-ai/skills/tree/27000402070db19d958789d05b3b52b6f4718d7c/higgsfield-product-photoshoot",
    localSource: "product-photoshoot",
    summary: "상품 외형과 촬영 목적에 맞는 이미지 참조를 정리합니다.",
    instructions: "제품의 실제 사진과 로고·형태·색상·재질을 확인하고 스튜디오, 라이프스타일 또는 제품과 인물의 사용 장면 중 촬영 목적을 정한다. 제공자 전용 포토슈트 워크플로의 입력 지원과 비용은 별도로 확인한다.",
    kinds: ["brief", "referenceImage", "keyframe"] as Kind[],
    workflow: ["제품 참조와 고정 요소", "촬영 목적과 조명", "결과 외형 검수"],
  },
  {
    id: "faceless-plan", label: "내레이션 영상 계획", category: "음향",
    sourceKind: "공식 Faceless Video 스킬 요약",
    source: "https://github.com/higgsfield-ai/skills/tree/27000402070db19d958789d05b3b52b6f4718d7c/higgsfield-faceless-video",
    localSource: "faceless-video",
    summary: "내레이션과 컷의 길이, 자막과 조립 순서를 계획합니다.",
    instructions: "사용자가 요청한 전체 길이를 유지하면서 내레이션과 컷을 구간별로 나눈다. 각 구간의 화면, 대사와 자막 시점을 정리하고 로컬 조립과 결과 검수 순서를 명시한다. 실제 생성 모델과 음성 경로를 별도로 선택한다.",
    kinds: ["brief", "script", "scene", "audioCue", "previs"] as Kind[],
    workflow: ["요청 길이와 내레이션", "구간별 화면·음향", "조립과 검수"],
  },
  {
    id: "video-explainer", label: "영상 설명 호환 스킬", category: "음향",
    sourceKind: "공식 Video Explainer 호환 스킬",
    source: "https://github.com/higgsfield-ai/skills/tree/27000402070db19d958789d05b3b52b6f4718d7c/higgsfield-video-explainer",
    localSource: "video-explainer",
    summary: "내레이션 영상 계획의 기존 호환 진입 경로입니다.",
    instructions: "사용자가 요청한 길이를 유지하며 내레이션·컷·자막을 구간별로 구성하고 조립과 결과 검수를 계획한다. 실제 음성·영상 생성 경로는 제작자가 선택한다.",
    kinds: ["brief", "script", "scene", "audioCue", "previs"] as Kind[],
    workflow: ["요청 길이", "내레이션과 컷", "조립과 검수"],
  },
] as const;

export type ProductionGuideId = (typeof productionGuides)[number]["id"];

export function validProductionGuideIds(value: unknown): value is ProductionGuideId[] {
  return Array.isArray(value) && value.length <= productionGuides.length &&
    value.every((id) => typeof id === "string" && productionGuides.some((guide) => guide.id === id)) &&
    new Set(value).size === value.length;
}

export function recommendedProductionGuides(kind: Kind): ProductionGuideId[] {
  const ids: Partial<Record<Kind, ProductionGuideId[]>> = {
    brief: ["story-hook", "casting-continuity"], scenario: ["story-hook", "drama-writing"],
    script: ["story-hook", "drama-writing", "acting", "voice-performance"], character: ["casting-continuity", "acting"],
    scene: ["story-hook", "acting", "blocking"], shot: ["shot-plan", "acting", "casting-continuity"],
    keyframe: ["cinema-prompt", "casting-continuity"], referenceImage: ["cinema-prompt", "casting-continuity"],
    referenceVideo: ["blocking"], video: ["cinema-prompt", "shot-plan", "casting-continuity"],
    audioCue: ["voice-performance"], previs: ["blocking"], note: [], switch: [],
  };
  return ids[kind] ?? [];
}

export function productionGuideText(ids: readonly string[]) {
  return productionGuides.filter((guide) => ids.includes(guide.id))
    .map((guide) => `${guide.label} · ${guide.sourceKind}\n${guide.instructions}`).join("\n\n");
}
