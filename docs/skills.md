# 프로젝트 스킬 관리

## 랜딩 페이지 디자인 · 2026-11-23

Elaya의 `landing-page-design`을 프로젝트의 `.agents/skills/landing-page-design`에 설치했다. 원본 리비전은 `456d9e0d3e2d84c748bb143c6ca3d90c45e16213`이다. 제작자와 주요 행동 정의, 페이지 순서, 문구와 모션에는 Elaya를 주 기준으로 사용했다. Hallmark의 이미지 중심 구성과 `DESIGN.md`의 역할 기반 SEED 토큰, UI SDK와 shadcn의 버튼 및 펼침 영역 기준을 함께 참고했다. 프로젝트의 Pretendard와 Lucide React를 적용했다. [Elaya 원본](https://github.com/elayadesign/ai-design-skills/tree/456d9e0d3e2d84c748bb143c6ca3d90c45e16213/skills/landing-page-design)

Craft Anything 공식 스킬 2를 릴리스 `v0.6.1`의 내장 템플릿에서 `.agents/skills/craft-anything`에 설치했다. 같은 버전의 서명된 CLI는 `.scene-room/tools/craft-anything`에 두고 공개 Newtake 진입을 클린룸으로 확인했다. [공식 릴리스](https://github.com/storytold/craft-anything/releases/tag/v0.6.1) · [검토 기록](newtake-review.md)

## Drama Skills 집필 지침

Drama Skills의 `short-drama-develop`, `short-drama-write`, `short-drama-review`는 고정 원본 리비전 `8cf7404981b7095b498e061832bb3c9ffd6a42be`를 읽어 적용한다. 캔버스의 **Drama Skills · 대본 집필** 지침에는 인물의 선택과 회차 결과, `[VO]`·`[OS]` 판단에 필요한 원본 원칙을 요약했다. 감독안과 검토는 캔버스의 응답 형식으로 실행한다. [개발 원본](https://github.com/zenstory-ai/drama-skills/blob/8cf7404981b7095b498e061832bb3c9ffd6a42be/skills/short-drama-develop/SKILL.md) · [집필 원본](https://github.com/zenstory-ai/drama-skills/blob/8cf7404981b7095b498e061832bb3c9ffd6a42be/skills/short-drama-write/SKILL.md) · [검토 원본](https://github.com/zenstory-ai/drama-skills/blob/8cf7404981b7095b498e061832bb3c9ffd6a42be/skills/short-drama-review/SKILL.md)

스킬은 이 프로젝트의 `.agents/skills/`에 설치한다. 전역 사용자 설정은 변경하지 않는다. 현재 대화에서 바로 사용하려면 각 `SKILL.md`를 직접 읽으며, 새 세션에서는 스킬 탐색 목록을 다시 불러온다.

| 출처 | 고정 커밋 | 설치한 스킬 |
| --- | --- | --- |
| [Higgsfield 공식 생성 스킬](https://github.com/higgsfield-ai/skills/tree/27000402070db19d958789d05b3b52b6f4718d7c/higgsfield-generate) | `27000402070db19d958789d05b3b52b6f4718d7c` | `higgsfield-generate` 0.14.0 |
| [TopView 공식 생성 스킬](https://github.com/topviewai/skill) | `5e0fa64642cd732ad18382e91195171f2957453d` | `topview-generate` |
| [Neon](https://github.com/neondatabase/agent-skills) | `d3601d9e1f9398b96a1ee25047bafba5f04199eb` | `neon`, `neon-postgres` |
| [Vercel Agent Skills](https://github.com/vercel-labs/agent-skills) | `5a37a6329fbad3666c3207392a6a7c0110e92efb` | `react-best-practices`, `composition-patterns`, `web-design-guidelines` |
| [Next.js canary](https://github.com/vercel/next.js/tree/canary/skills) | `794836c3cbb750d1e34f99e210b39b7bdfbc4c58` | `next-dev-loop` |
| [Vercel UI SDK](https://github.com/vercel-labs/ui/tree/06a7633f9543125163574d508a0bbdc3a173042d/packages/core/skills/ui-sdk) | `06a7633f9543125163574d508a0bbdc3a173042d` | `ui-sdk` |
| [shadcn/ui](https://github.com/shadcn-ui/ui/tree/bfa64ff4d1cb7317d2403ecb176df6826d4caffc/skills/shadcn) | `bfa64ff4d1cb7317d2403ecb176df6826d4caffc` | `shadcn` |
| [Hallmark](https://github.com/Nutlope/hallmark) | `04977e15f3dfd6ee4b74c887dac3eb52665d6c92` | `hallmark` |
| [Addy Osmani Agent Skills](https://github.com/addyosmani/agent-skills) | `8c99fa36d90068c82d547f7c12a9d67a3e95f4ee` | `spec-driven-development`, `planning-and-task-breakdown`, `incremental-implementation`, `documentation-and-adrs`, `source-driven-development`, `frontend-ui-engineering`, `accessibility-engineering` |
| [Archify](https://github.com/tt-a1i/archify) | `8509a3d63e763b4d454ea9aafa1f939545fcb1ea` | `archify` |
| [Diagram Design](https://github.com/cathrynlavery/diagram-design) | `d74d8c2d0c78a9e1efd43137f6a9a51182a8b5f0` | `diagram-design` |
| [ZTD Charts](https://github.com/Junhan2/ztd-charts) | `01dc108a8904d2852220e9a6a922c9e857176926` | `ztd-charts` |

Higgsfield를 제외한 위 스킬은 Codex `skill-installer`의 `install-skill-from-github.py`로 설치했다. 재설치할 때 위 저장소와 커밋을 `--repo`, `--ref`로 지정하고, 필요한 `skills/<이름>`을 `--path`에 지정하며 `--dest .agents/skills`를 사용한다. 설치 도구는 같은 이름의 폴더를 덮어쓰지 않는다. Addy Osmani 스킬의 공통 참조 두 파일은 같은 커밋에서 `.agents/skills/references/`에 저장하고, 해당 링크를 프로젝트 범위에 맞게 조정했다.

TopView 재설치는 저장소 루트의 `topview-generate` 경로를 사용한다.
Archify 재설치는 저장소 루트의 `archify` 경로를 사용한다. 세 다이어그램의 스킬별 적용과 원본은 [다이어그램 인덱스](diagrams/README.md)에 기록한다.

## 적용

2026-11-22 품질 감사에서 Addy Osmani의 기획·증분 구현과 접근성 지침을 적용했다. Vercel React 지침에 따라 실행 이력 요청을 한 번으로 묶었고, Next.js `next-dev-loop`로 Chromium 실제 화면과 프레임워크 진단을 확인했다. Neon Postgres의 egress 절차로 실행 입력·결과의 반복 전송을 점검했고 기존 드라이버와 스키마에서 조건부 조회를 검증했다. 품질 감사 증거 (로컬 자료)

- 명세, 범위, 검증 기준과 의존 순서를 먼저 기록하고 작은 기능 단위로 구현한다. 변경 사항은 명세와 작업 목록에도 반영한다.
- Neon은 제공된 연결 정보를 서버에서 사용하고 SQL 입력을 매개변수화한다. 연결 정보와 생성 서비스의 비밀키는 브라우저에 전달하지 않는다.
- React 지침에 따라 필요한 클라이언트 경계를 좁히고 독립적인 데이터 요청은 병렬화한다.
- Hallmark 앱 화면 지침과 기존 `DESIGN.md`를 함께 적용하며 입력 상태, 오류, 키보드 접근성을 확인한다.
- Next.js 실행 검증은 실제 앱 화면과 프레임워크 진단을 함께 확인한다. `next-dev-loop`는 Next.js 16.3 이상과 agent-browser 0.31.1 이상을 요구한다.

사용자의 명시적 작업 지시가 스킬의 일반적인 승인 절차보다 우선한다. 실행 환경에서 지원하지 않는 검사는 결과와 한계를 작업 기록에 남긴다.

프로젝트의 `.agents/skills/gpt-image`는 ChatGPT 로그인으로 실행하는 이미지 브리지다. 이미지 요청당 별도 API 키를 전달하지 않고 로컬 실행기가 이 폴더의 스크립트를 직접 호출한다.

## 연출 확장 설계에 참고한 로컬 스킬

Higgsfield 공식 저장소를 위 커밋으로 체크아웃하여 `higgsfield-generate` 디렉터리와 MIT 라이선스를 프로젝트에 복사했다. 원본 파일 SHA-256은 아래와 같다.

- `SKILL.md` — `bd1c83b58d9d071befe06b02d888cfff092c5021bb37a50b381e9f763d4a3571`
- `references/prompt-engineering.md` — `26e4d828d985ae21a450c5eb5f824ec2db70a2a2aa4feef8fc135f784cc41c44`
- `LICENSE` — `9da656d6226936542be59478dbf775057dfdeade2629d35e0832108c2b7aecc0`

`lib/director-guidance.ts`는 이 고정 버전의 프롬프트 작성 지침 요약을 사용하고, 체크섬이 확인된 프로젝트 원본에서 카메라·조명·질감 예시를 읽는다., Zephyr·Hell Grind 사례에서 도출한 Omni AI Canvas 연출 기준을 별도 구획으로 제공한다. 서비스 CLI의 실제 스키마를 모델 인수의 기준으로 삼는다. [공식 프롬프트 지침](https://github.com/higgsfield-ai/skills/blob/27000402070db19d958789d05b3b52b6f4718d7c/higgsfield-generate/references/prompt-engineering.md) · [공식 MIT 라이선스](https://github.com/higgsfield-ai/skills/blob/27000402070db19d958789d05b3b52b6f4718d7c/LICENSE) · [연출 사례 검토](directing-sources.md)

Road Music 음악 스킬은 요청된 로컬 저장소 `music-road-music-skills` 0.1.0(`dde26d6`), 서비스 CLI는 `music-road` 0.1.1(`e076868`) 기준으로 검토했다. YuE의 제작·준비·결과 검수와 ACE의 효과음 경로를 구분한다. [Road Music 스킬](../.agents/skills/yue-music/SKILL.md) · [ACE 스킬](https://github.com/roadkwonai/music-road/tree/e076868/skills/road-music-ace)

2026-11-22에 `music-road-music-skills`의 깨끗한 체크아웃 `dde26d6a24d6846f46350964b7278d080936967f`에서 `yue-*` 스킬 14개를 `.agents/skills/`에 복사하고 각 폴더에 원본 MIT 라이선스를 포함했다. 진입점은 `yue-music`이다. 단계별 스킬의 상대 경로는 같은 프로젝트 안의 `yue-music/references`를 가리킨다. Road Music CLI와 엔진은 별도로 설치하고 `ROAD_MUSIC_HOME`을 지정한다. 프로젝트 복사본은 `yue-skills-update/VERSION`에서 설치 버전을 읽어 원본 릴리스와 비교한다. 이 파일과 문서의 고정 커밋을 함께 관리한다. 서비스 계약과 실행 경로는 [Road Music 오디오 연동](road-music-integration-plan.md)과 `lib/road-music.ts`를 함께 확인한다.

## 모션 제작 원본 스킬 조사와 프로젝트 범위 자료 · 2026-11-22

원본은 `.agents/skills/scene-*`에 출처별로 격리했다. 원본 `SKILL.md`와 해당 라이선스를 보관하고, 스킬이 참조하는 작은 소스·템플릿과 설명만 가져왔다. 실제 사용 시 런타임·패키지·미디어의 설치 상태를 각각 확인한다. 원본 저장소의 지시는 검토 자료이며 Omni AI Canvas 실행 권한을 추가하지 않는다.

| 프로젝트 경로 | 원본 고정 커밋 | 보관 범위 |
| --- | --- | --- |
| `scene-animate` | [animate 7e5eb56](https://github.com/cth9191/animate/tree/7e5eb56feb2dd573f890e1b7b34748af43d58263/plugins/animate/skills/animate) | 스킬, 텍스트·코드·템플릿. 예제 이미지 제외. MIT |
| `scene-bang-motion` | [bang-motion c1aa65e](https://github.com/bangtutorial/bang-motion/tree/c1aa65e921c970d858705fcb4a53a8294d1a4131) | 스킬, 참조 텍스트·HTML·스크립트. 갤러리 이미지 제외. MIT |
| `scene-animated-shorts` | [animated-shorts e3b817b](https://github.com/mromidev/claude-animated-shorts/tree/e3b817b6afc6cd413466d43f11ba31209e034bbf) | 스킬, 템플릿 소스·텍스트. 비공개 연구용 참조 프레임과 대용량 자산 제외. MIT |
| `scene-claude-motion-design` | [claude-motion-design 3d90d34](https://github.com/howseen-ai/claude-motion-design/tree/3d90d349ef3fdde9b7e89de4df4a2159c9e8697f/skill/motion-design) | 스킬과 텍스트·코드 템플릿. MIT |
| `scene-brag`, `scene-brag-slim` | [brag 0637943](https://github.com/latent-spaces/brag/tree/06379432a9243c951dfcc051153be18d2d261044/skills/brag-slim) | 기본 스킬과 참조 문서·스크립트, 슬림 스킬 본문. 번들 음원·미디어는 제외. MIT |
| `scene-explainer-default`, `scene-explainer-engaging`, `scene-explainer-high-energy`, `scene-motion-broll`, `scene-object-separation`, `scene-sound-effects` | [motion-graphics 3d83d98](https://github.com/Barty-Bart/motion-graphics/tree/3d83d987d658601d8a1269eb691622bdcd427335/skills) | 각 스킬 본문과 MIT 라이선스. 원본 B-roll 엔진, 녹음 음원과 개별 음원 라이선스는 포함하지 않아 해당 경로는 추가 설치·권리 확인 필요 |
| `scene-aimotion` | [cokacmotion c417b16](https://github.com/kstost/cokacmotion/tree/c417b16c6020c25949845051f00f1c964d7e6d54/skills/aimotion) | 인덱스와 앞의 여덟 데모 텍스트·소스만 보관. 원본의 나머지 데모와 미리보기 이미지는 제외. MIT |
| `scene-lemo-opuscar` | [lemo-opuscar f9e2042](https://github.com/lemomo-ai/lemo-opuscar/tree/f9e204293930952b61ba921cd8944d05f121beee/plugin/skills/lemo-opuscar) | 스킬 엔트리와 설치 스크립트만 보관. 라이브러리와 외부 실행 의존성은 설치하지 않았다. 원문 문서 CC BY-NC 4.0이며 원저작자의 영화 제작 목적 추가 허락과 상업 서비스 탑재 조건을 원본 LICENSE에서 확인해야 한다. 원본 설정 스크립트의 기본 경로는 홈 디렉터리이므로 사용자의 프로젝트 범위 요구에 맞춘 별도 경로 지정이 필요하다. |

`mg-styles-15`와 `ClaudeAnimationBase`는 `SKILL.md`가 없는 예제·스타터 프로젝트다. 연구 출처로 기록하며 프로젝트 스킬로 표기하지 않는다. 비교와 적용 시점은 [모션 연구 문서](motion-skills-research.md)에 기록한다.

## Higgsfield 공식 제작 스킬과 공개 블로그 첨부 · 2026-11-22

공식 [higgsfield-ai/skills](https://github.com/higgsfield-ai/skills/tree/27000402070db19d958789d05b3b52b6f4718d7c) MIT 저장소의 고정 커밋 `27000402070db19d958789d05b3b52b6f4718d7c`에서 프로젝트 `.agents/skills/`에 다음 0.14.0 스킬을 추가했다. 각 스킬에 저장소 `LICENSE`를 포함한다.

| 디렉터리 | 적용되는 제작 단계 | 확인할 경계 |
| --- | --- | --- |
| `higgsfield-soul-id` | 실존 인물의 Soul ID 학습과 해당 ID를 지원하는 생성 | 사용자의 명시적 요청과 이미지, 계정·모델·크레딧 상태 확인 |
| `higgsfield-product-photoshoot` | 제품 사진과 광고용 상품 시각화 | 공식 모드와 실제 제품 이미지·계정의 현재 이용 조건 확인 |
| `higgsfield-faceless-video` | 나레이션 기반 설명·스토리 영상의 씬 계획과 로컬 조립 | 생성 및 음향 제공자의 실제 입력·비용 확인 |
| `higgsfield-video-explainer` | 기존 설명 영상 스킬 호환 진입 | 현재 `higgsfield-faceless-video`를 호출하도록 안내하므로 중복 적용하지 않음 |

세 공개 블로그는 위 공식 GitHub 패키지와 별도의 제작자 첨부를 제공한다. 단편의 극작 엔진·연기·아나모픽, 광고의 프롬프트·연기, 숏드라마의 대본·프롬프트 등 확인한 일곱 원문은 `.scene-room/research/higgsfield-originals/`에 개인 참고용으로 보관했다. 첨부에는 독립된 재배포 라이선스가 보이지 않았다. 저작자, 원문 링크, SHA-256, 겹치는 역할과 선택 기준은 [제작 사례·스킬 재검토](higgsfield-production-audit.md)에 기록했다. 단편의 액션 첨부는 목록과 제목을 확인했으며 비접촉 촬영·편집의 관찰 기준만 제품 설계에 반영한다.


## UI 스킬과 현재 프로젝트 구성 · 2026-11-22

UI SDK 스킬은 `.agents/skills/ui-sdk`에 원본 참조와 Apache-2.0 라이선스를 포함해 설치했다. 컴포넌트의 키보드 조작, 포커스 복귀, 접근 가능한 이름, 실제 브라우저의 색 대비를 확인한다. 패키지를 사용하는 구현에서는 설치된 `@ui-sdk/react/docs/llms.txt`의 버전별 문서를 먼저 읽는다.

shadcn 스킬은 `.agents/skills/shadcn`에 원본 참조와 MIT 라이선스를 포함해 설치했다. `npx shadcn@latest info --json`에서 이 프로젝트는 Next.js App Router이며 Tailwind와 `components.json`, 설치된 shadcn 컴포넌트는 없는 것으로 확인했다. 기존 SEED 디자인 토큰과 Pretendard를 유지한다. shadcn 구성요소를 실제 도입하는 작업에서는 관련 컴포넌트 문서와 설치 결과를 확인한 뒤 프로젝트 구성을 적용한다.

Lucide 아이콘은 프로젝트에 고정된 `lucide-react` 1.77.0을 사용한다. 제공자의 정식 SVG 경로가 필요한 경우 [ANGSKILLS의 Lucide Icon](https://angskills.com/k/lucide-icon-ysamlan)이 가리키는 [공식 작성자 저장소](https://github.com/ysamlan/agent-log-gif/tree/37eadc62a52c5d963ec91deef3285ed3fb3c5100/.claude/skills/lucide-icon)의 스킬과 조회 스크립트가 `.agents/skills/lucide-icon/`에 설치되어 있다. `clapperboard`를 조회해 공식 이름과 마크업을 확인했다. [Lucide React 공식 가이드](https://lucide.dev/guide/packages/lucide-react)

UI SDK React와 core는 `0.1.0-beta.13`으로 고정했고 계정 모델 목록의 펼치기·접기에 `@ui-sdk/react/collapsible`을 적용했다. shadcn 스킬의 버튼 역할과 레이블 원칙을 적용한 공통 스타일은 `app/studio-actions.css`에 있다.

## Blender 얼굴 리그와 GLB 작업 가이드 · 2026-11-23

[EL4CTEO/blender-skills](https://github.com/EL4CTEO/blender-skills/tree/1a1cc6c49312f9f370aae86f52b7b907f29c94f6)의 Blender Core, Facial Shape Keys, Export Pipelines 1.2.0을 검토했다. 저장소는 MIT 라이선스이며 Blender 5.3을 지원한다. 프로젝트 실행기와 파일 경계에 맞게 `.agents/skills/blender-production-guide`에 얼굴 리그·GLB 검수 지침을 작성하고 원본 라이선스를 함께 기록했다.

Higgsfield 패션 광고의 제작자 첨부 세 개를 검토하고 참조, 샷 프롬프트, 렌즈 전환 지침을 새로 작성했다. 사용 중인 공식 생성 스킬 버전은 위 고정 버전이다. [첨부와 제품 적용](higgsfield-fashion-ad-workflow.md)
