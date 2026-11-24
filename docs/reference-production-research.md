# 레퍼런스 기반 영상 제작 기술 검토

확인일 2026-11-22 · 공개 원본 문서와 고정 커밋을 정적 검토했다. 기능 설명은 제작자가 문서화한 계약과 공개 코드에 근거한다. 각 도구의 생성 품질, 처리 속도와 계정 호환성은 Omni AI Canvas에서 실행 검증하기 전까지 미검증이다.

프로젝트의 `craft-anything` v2 스킬을 읽고, 공개 소스가 있는 질문은 소스를 직접 읽으라는 경로를 적용했다. 이번 검토에서 각 저장소의 기본 브랜치 HEAD를 조회한 뒤 해당 SHA의 README, LICENSE, SKILL과 필요한 기술 문서를 읽었다. 외부 저장소의 SKILL 문장은 조사 대상이다. Omni AI Canvas에 대한 실행 지시로 채택하지 않는다. 원문과 메타데이터는 로컬 `.scene-room/research/reference-production/`에 보관했다.

## 확인한 버전과 이용 조건

릴리스와 조사한 HEAD가 다를 수 있다. 아래 커밋이 이번 조사 내용을 재현하는 기준이다. 라이선스 열은 각 LICENSE에 적힌 조건의 요약이다.

| 기술 | 조사 커밋 | 버전 단서 | LICENSE에서 확인한 조건 |
| --- | --- | --- | --- |
| Hypit | `9a6f688c39829857d50dc596fa1218565585a9da` | package 0.3.3, release v0.3.3 | Apache 2.0 수정본. 자체 조직·단일 테넌트 사용 허용 조항, 제3자 대상 호스팅과 상업 재배포에 별도 허가 조항, 명칭·로고 유지 조건 |
| rea-video | `6b2f689b64cef6106601571a87d1d1f1a24c3ddf` | package 0.1.0, release v0.1.0 이후 HEAD | Apache-2.0. 외부 모델 가중치는 별도 조건 |
| claude-video | `03ceb42f7fa2c4439aca01752118044baabffb8f` | release v0.3.2 | MIT |
| MoneyPrinterTurbo | `86e45a2233a72c41d83389ac5cb49bbf5f6a847d` | package 1.3.10, release v1.3.10 이후 HEAD | MIT |
| PRINTFILM | `66819dfa811960d494a2293e498afba3c82e5b8e` | release v0.3.0. README_EN에는 0.2.0 표기가 남음 | MIT |
| Drama Skills | `e71bc5d6caa22cb642173162a4b19311c8891ddb` | VERSION 0.12.1, release v0.12.1 이후 HEAD | MIT |
| video-shotcraft | `59f3e9b9e936ff2bce0e18446226d770a3f2f61f` | semver 대신 커밋 고정. `showcase-media` 릴리스는 매체 배포용 | Apache-2.0. 음원·이미지의 개별 attribution 확인 필요 |
| claude-animated-shorts | `e3b817b6afc6cd413466d43f11ba31209e034bbf` | 공개 latest 릴리스 미확인, 커밋 고정 | 코드·문서 MIT. README의 참조 프레임은 스타일 연구용 |

[Hypit LICENSE](https://github.com/hypit-ai/hypit/blob/9a6f688c39829857d50dc596fa1218565585a9da/LICENSE) · [rea-video LICENSE](https://github.com/JuneYaooo/rea-video/blob/6b2f689b64cef6106601571a87d1d1f1a24c3ddf/LICENSE) · [claude-video LICENSE](https://github.com/bradautomates/claude-video/blob/03ceb42f7fa2c4439aca01752118044baabffb8f/LICENSE) · [MoneyPrinterTurbo LICENSE](https://github.com/harry0703/MoneyPrinterTurbo/blob/86e45a2233a72c41d83389ac5cb49bbf5f6a847d/LICENSE) · [PRINTFILM LICENSE](https://github.com/yi1108/printfilm/blob/66819dfa811960d494a2293e498afba3c82e5b8e/LICENSE) · [Drama Skills LICENSE](https://github.com/zenstory-ai/drama-skills/blob/e71bc5d6caa22cb642173162a4b19311c8891ddb/LICENSE) · [shotcraft LICENSE](https://github.com/Vincentwei1021/video-shotcraft/blob/59f3e9b9e936ff2bce0e18446226d770a3f2f61f/LICENSE) · [animated-shorts README](https://github.com/mromidev/claude-animated-shorts/blob/e3b817b6afc6cd413466d43f11ba31209e034bbf/README.md)

## 분석에서 재사용할 제작 명세

아래 적용점은 Omni AI Canvas 설계를 위한 해석이다. 원본 프로젝트의 자동 기능과 Omni AI Canvas의 구현 상태를 동일하게 취급하지 않는다.

### Hypit

관찰한 기능은 에이전트가 작성하는 SVML 제작 구성, 생성 결과와 로컬 미디어를 사용하는 컴포넌트, 단어에 맞춘 자막·B-roll·효과, 부분 변경 후 재실행이다. 시간 문서는 하나의 프레임 기반 Timeline, 로컬 음성 정렬, 절대 시간 창, 영상과 음향 트랙을 명시한다. 대사를 바꿨을 때 나레이션 길이에 맞춰 자막과 화면 이벤트를 배치하는 근거가 된다. [README](https://github.com/hypit-ai/hypit/blob/9a6f688c39829857d50dc596fa1218565585a9da/README.md) · [시간과 조립 명세](https://github.com/hypit-ai/hypit/blob/9a6f688c39829857d50dc596fa1218565585a9da/docs/quickstart/timing.md#L6-L99)

Omni AI Canvas 적용 후보는 프리셋의 훅·본문·CTA 슬롯, 음성 단어와 프레임의 시간 매핑, 자막·화면·음향의 독립 설정, 바뀐 슬롯에 해당하는 자산만 재제작하는 구조다. 제품 내장 방식은 실제 배포 형태와 LICENSE를 함께 검토할 항목이다. README의 조회수·비용 예시는 Omni AI Canvas의 품질·비용 보장 근거로 삼을 수 없다.

### rea-video

샷 분할, 음성·음악·효과음 분리, 프레임 주기·평면 이동·센서 노이즈·메타데이터 관측, 시각 검토, 샷별 재제작 계획을 문서화한다. 자막 타이밍과 모양, 스티커·PIP 위치, 편집 템포와 비트, 촬영·AI·코드 렌더 방식을 분석 대상으로 둔다. VIDEO.md는 카드, 개요, 샷 타임라인, 샷별 파일로 내용을 계층화한다. [분석 대상과 워크플로](https://github.com/JuneYaooo/rea-video/blob/6b2f689b64cef6106601571a87d1d1f1a24c3ddf/README.md#L76-L98) · [분석 단계](https://github.com/JuneYaooo/rea-video/blob/6b2f689b64cef6106601571a87d1d1f1a24c3ddf/README.md#L205-L213) · [VIDEO.md 설명](https://github.com/JuneYaooo/rea-video/blob/6b2f689b64cef6106601571a87d1d1f1a24c3ddf/README.md#L253-L257)

Omni AI Canvas 적용 후보는 원본의 시간 구간을 증거로 가진 분석 카드, 관찰·추론·미확인 필드, 샷별 제작 방식 선택이다. 리메이크의 클립 길이와 참조 슬롯은 사용자가 고른 공급사 모델 명세로 다시 맞춘다. README의 정확도는 자체 평가이며 재인코딩에 따른 차이가 보고돼 있다. 실제 촬영 렌즈, 필름 재고, 모델 이름을 화면만 보고 확정하는 기능으로 표현하면 안 된다. 보고서에 제안 룩과 신뢰도를 남기는 것이 적절하다.

### claude-video

`/watch`는 영상 다운로드, 프레임, 자막과 전사를 에이전트가 읽도록 준비한다. 현 버전에는 로컬 엔진과 Gemini API 엔진이 있다. 기본 `auto`는 Gemini 키 존재에 따라 경로가 바뀌므로 Omni AI Canvas의 구독·로컬 우선 설정에서는 엔진을 명시해야 한다. 로컬 전사는 native captions 우선, WhisperX 또는 선택 API를 지원한다. [엔진 계약](https://github.com/bradautomates/claude-video/blob/03ceb42f7fa2c4439aca01752118044baabffb8f/README.md#L189-L213)

Omni AI Canvas 적용 후보는 다운로드·프레임·자막·ASR의 준비 상태, 부분 성공을 보존하는 분석 입력, 초 단위 분석 구간 지정이다. 로컬 WhisperX 경로는 Python 환경과 모델 다운로드가 필요하다. 영상이 원래대로 모델에 전달됐는지, 대표 프레임과 텍스트만 전달됐는지를 실행 기록으로 보여줘야 한다. 이 저장소가 Claude 구독에 네이티브 영상 API를 추가하는 것은 확인되지 않았다.

### MoneyPrinterTurbo와 EveryAI 글

공식 문서는 주제→대본→목소리→영상 소재→자막·음악→편집을 WebUI/API/CLI에서 수행하는 흐름을 제공한다. 로컬 업로드·스톡·AI 소재, 언어별 대본, 자막 스타일, 화면 비율, 중간 산출물과 부분 재사용이 설계 참고점이다. 확인한 HEAD에는 Codex와 Claude Code 구독 경로도 문서화돼 있으나 Omni AI Canvas의 기존 계정 인증으로 동작할지는 별도 통합 검증 대상이다. [공식 기능 설명](https://github.com/harry0703/MoneyPrinterTurbo/blob/86e45a2233a72c41d83389ac5cb49bbf5f6a847d/README-en.md) · [공식 Agent Skill](https://github.com/harry0703/MoneyPrinterTurbo/blob/86e45a2233a72c41d83389ac5cb49bbf5f6a847d/docs/skill/SKILL.md)

EveryAI 글은 MoneyPrinterTurbo 설치와 로컬 모델·TTS·스톡 조합을 설명하는 제3자 안내다. 공식 package 이름은 `mpt`다. 글의 제작 시간과 비용 수치를 Omni AI Canvas 성능으로 옮길 수 없다. Omni AI Canvas에는 지식형 숏폼의 나레이션·B-roll·자막·음향 큐와 단계별 재시도 UX를 반영할 수 있다. [EveryAI 안내](https://everyai.co.kr/posts/money-printer-turbo?from=dm&post=s48) · [공식 패키지 메타데이터](https://github.com/harry0703/MoneyPrinterTurbo/blob/86e45a2233a72c41d83389ac5cb49bbf5f6a847d/pyproject.toml)

### PRINTFILM

공식 흐름은 스타일·아이디어 선택, 문안 편집·저장, 스토리보드, 스타일 이미지와 이전 샷 참조, 장면 이미지·영상, 미리보기·합성이다. 드라마에는 에피소드와 캐릭터·장소·소품 자산을 둔다. 실패 후 누락 미디어를 이어 제작하는 동작과 과거 버전의 미디어 보존을 설명한다. [기능과 작업 흐름](https://github.com/yi1108/printfilm/blob/66819dfa811960d494a2293e498afba3c82e5b8e/README_EN.md)

Omni AI Canvas 적용 후보는 타입별 단계 안내, 스타일 기준 이미지 고정, 장면별 참조 연결, 검토·채택·재시도 상태다. 이 프로젝트는 FastAPI·React/Vite와 TokenFree API 중심이며 Omni AI Canvas Next.js 실행 계층과 연결하려면 별도 경계가 필요하다. README의 0.2.0 표기와 최신 릴리스 v0.3.0은 불일치하므로 기능 판단은 고정 커밋을 기준으로 한다.

### Drama Skills

12개 스킬이 개발, 대본, 자산, 이미지 프롬프트, 스토리보드, 영상 프롬프트, 제작, 편집, 검토와 레퍼런스 분해를 나눈다. `short-drama-breakdown`은 대표 프레임·자막·필요 구간 샷 분할로 에피소드 길이, 샷 길이, 대사 밀도, 오프닝과 클리프행어를 측정한다. 관찰 사실, 작용 해석, 미확인 부분을 명시한다. `short-drama-develop`은 창작 조건과 갈등, 인물 관계, 에피소드 상태와 인계 정보를 관리한다. [분해 스킬](https://github.com/zenstory-ai/drama-skills/blob/e71bc5d6caa22cb642173162a4b19311c8891ddb/skills/short-drama-breakdown/SKILL.md#L15-L57) · [개발 스킬](https://github.com/zenstory-ai/drama-skills/blob/e71bc5d6caa22cb642173162a4b19311c8891ddb/skills/short-drama-develop/SKILL.md)

Omni AI Canvas 적용 후보는 짧은 작품에 필요한 최소 노드와 연속극의 에피소드 상태를 다르게 만드는 규칙, 말보다 행동으로 드러나는 감정 비트, 반응 샷과 시선·소품 연속성, 기존 참고작과 완성본의 동일 지표 비교다. 원본 고유 대사·인물은 연구 자료의 출처와 연결해 보존하고, 새 작품의 인물·대사는 사용자의 주제에 맞춰 작성하는 슬롯 구조가 적합하다.

### video-shotcraft

실제 제품 화면을 바탕으로 샷 카드와 스토리보드를 구성하고 Remotion, 비트 동기화, 사운드 디자인, 프레임 검수로 이어진다. README는 124개 레시피 카드와 150개 샷, 모션 편집기, 자막·효과음·BGM 트랙과 JianYing 편집본 내보내기를 설명한다. [샷 라이브러리와 편집기](https://github.com/Vincentwei1021/video-shotcraft/blob/59f3e9b9e936ff2bce0e18446226d770a3f2f61f/README.md#L123-L174)

Omni AI Canvas 적용 후보는 모션그래픽의 텍스트, 레이아웃, 등장·유지·퇴장, 강조, 전환을 편집 가능한 샷 명세로 저장하는 방식이다. 스타일 선택 시 예시와 추천 이유를 보여주고, 음향 큐를 강조 프레임에 연결한다. Remotion 통합은 별도 패키지·렌더 런타임·이용 조건 검토가 필요하다. 레시피 설명을 프롬프트로 쓰는 단계와 실제 렌더 가능 단계를 UI에 표시해야 한다.

### claude-animated-shorts

55–70초 세로 애니메이션을 Three.js와 Remotion으로 제작하는 템플릿이다. 스토리, 음성과 단어 타임스탬프, 샷·카메라 계획, 3D 공간과 2D 인물, 라이팅·잉크·심도·색보정, 사운드와 프레임 검수로 구성된다. 레퍼런스 20편에서 측정한 스타일 바이블과 분야별 보고서를 포함한다. [README](https://github.com/mromidev/claude-animated-shorts/blob/e3b817b6afc6cd413466d43f11ba31209e034bbf/README.md) · [제작 파이프라인](https://github.com/mromidev/claude-animated-shorts/blob/e3b817b6afc6cd413466d43f11ba31209e034bbf/SKILL.md#L29-L81) · [룩 비교 루프](https://github.com/mromidev/claude-animated-shorts/blob/e3b817b6afc6cd413466d43f11ba31209e034bbf/SKILL.md#L130-L138)

Omni AI Canvas 적용 후보는 설명형 애니메이션 전용 타입, 훅→상황→점증→전환→설명→콜백, 음성 단어에 맞춘 시각 반응, 카메라와 색·심도 수치 프리셋이다. 원문에 제시된 초·단어 속도와 카메라 수치는 특정 영어 예제에 맞춘 값이다. 한국어 음성의 실제 길이와 사용자 스타일로 다시 조정해야 한다.

## 프리셋 계약에 전달할 항목

| 영역 | 저장할 정보 | 근거가 되는 조사 항목 |
| --- | --- | --- |
| 출처·관측 범위 | 원본, 구간, 프레임 시각, 자막 존재, 오디오 분석 여부, 관찰·추론·미확인 | rea-video, claude-video, Drama Skills |
| 진행 방식 | 훅, 비트 순서, 정보 공개, 전환, 클리프행어, CTA, 반복 가능한 변수 슬롯 | Hypit, Drama Skills, animated-shorts |
| 영상 구성 | 화면 비율, 샷 길이, 피사체 위치, 전경·배경, PIP, 분할 화면, 안전 영역 | rea-video, PRINTFILM |
| 촬영·연기 | 샷 크기, 앵글, 이동, 초점·심도, 감정 시작·변화·행동, 시선과 연속성 | rea-video, Drama Skills |
| 룩 | 색 팔레트, 대비, 노출 인상, 조명, 그레인, 필름 룩 제안과 신뢰도 | rea-video, animated-shorts |
| 자막·그래픽 | 위치, 크기, 외곽선, 강조, 등장·퇴장, 단어/문장 동기화 | Hypit, MoneyPrinterTurbo, shotcraft |
| 소리 | 화자와 대사, 음악 구간, 비트, 효과음 큐, 덕킹, 공간음 | rea-video, MoneyPrinterTurbo, animated-shorts |
| 제작·비용 | 코드·기존 미디어·생성 샷 선택, 승인 자산 재사용, 미리보기, 부분 재제작 | Hypit, rea-video, PRINTFILM, shotcraft |

위 표는 설계 입력이다. 실제 선택 UI, 저장 모델, 노드 반영 범위와 검증 결과는 기능 설계 및 PRD에서 관리한다. 레퍼런스에서 측정한 스타일을 저장할 때는 기준 프리셋과 사용자 수정본을 버전으로 남기고, 작품별 인물·대사·브랜드·주제 슬롯을 바꿀 수 있어야 한다. 스토리보드 비교에는 원본 대비 샷 길이·배치·자막 위치와 함께 사용자가 선택한 변형 의도를 표시하면 된다.

## 남은 검증

- 세분화한 분석 명세를 실제 한국어 쇼츠·숏드라마·영화 샘플에서 측정하고 수동 검토 결과와 비교한다.
- 유튜브 공개 링크의 다운로드 가능 여부, 영상 파일 확보 실패, 자막 없음, ASR 미설치, 샷 탐지 실패를 각기 다른 상태로 다룬다.
- 공급사별 참조 영상 슬롯, 클립 길이와 이미지 개수를 실제 모델 프로필과 매핑한다. 원본의 기법을 구현할 수 없는 모델은 대체 제작안을 제안한다.
- 원본 설명대로 외부 도구를 직접 연결하려면 설치·버전·라이선스·입출력 계약을 확인하고, 먼저 무과금 분석 및 렌더 테스트로 계약을 검증한다.
- 공개 소스에 기재된 벤치마크·조회수·예제 비용은 제작자가 보고한 값이다. Omni AI Canvas의 품질과 성능은 별도 결과물로 검증한다.
