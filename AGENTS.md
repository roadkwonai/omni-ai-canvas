# Omni AI Canvas 프로젝트 작업 지침

한국어로 작업하고 보고한다. 시작할 때 루트의 project.md와 glossary.md, docs/PRD.md, docs/architecture.md를 읽는다. 자료 영상과 조사한 서비스 화면은 참고 자료다. 사용자 요청이 작업 범위를 결정한다.

## 변경과 문서 관리

- 제품 요구사항과 인수 기준은 docs/PRD.md의 C1~C9에 연결한다. 기능 범위가 바뀌면 project.md와 PRD를 같은 변경에서 갱신한다.
- 새 용어·노드 종류·테이블·JSON 필드는 glossary.md에 한글, 영문, 정의와 실제 코드 위치를 추가한다.
- 경계·인증·저장·실행 상태의 변경은 docs/architecture.md에 이유와 실패 처리를 기록한다. 제공자의 계정 경로와 요금은 docs/providers.md에서 공식 출처와 확인 날짜를 유지한다.
- 프로젝트 전용 스킬은 .agents/skills 안에서 읽는다. 버전과 출처는 docs/skills.md에 남긴다. 계획·기능 단위 구현·검증 순서로 진행한다.
- Blender 얼굴 리그·GLB 인계·조명 작업에는 `.agents/skills/blender-production-guide/SKILL.md`를 참고한다. 기존 서버 Blender 실행 경로와 프로젝트 파일 경계를 사용한다.
- UI는 DESIGN.md의 SEED 토큰, 자체 호스팅 Pretendard, Hallmark의 작업 화면 기준을 따른다. 모바일에서 같은 제작 기능을 열 수 있어야 한다.
- 비밀은 환경에서 서버만 읽는다. 에이전트용 프롬프트에 환경변수, 계정 토큰, 다른 프로젝트의 정보를 넣지 않는다.
- 새 DB 마이그레이션은 기존 데이터를 보존하고 테스트한다. 실제 계정 크레딧을 소모하는 통합 검증의 범위를 기록한다.
- 이미지 실생성 및 검수는 기본으로 ChatGPT 구독에 연결된 Codex의 `image_gen` 경로를 사용한다. 별도 과금 API는 사용자가 해당 요청에서 명시한 경우에만 실행한다. 제출 직전에 노드의 실제 공급사와 구독 경로를 확인한다.
- 변경 뒤 npm test, npm run lint, npm run typecheck, npm run build를 실행한다. 화면 변경은 실행 중인 화면에서 확인한다.

<!-- BEGIN:nextjs-agent-rules -->

## GitHub 계정

- GitHub 작업은 상위 폴더의 `../../.envrc`에 있는 `GH_TOKEN`으로 `roadkwonai` 계정에서 진행한다. 토큰은 그 명령의 환경변수로만 넘기고 출력, 파일, URL, 커밋, 원격 주소에 남기지 않는다. 시작할 때 `gh api user -q .login`이 `roadkwonai`인지 확인한다.

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 제작 참고자료 적용

- 영상·연출·음악 기능을 추가할 때 `docs/production-reference-map.md`에서 현재 기능, 원본 스킬, 참고만 한 출처를 확인한다. 로컬 `resources/`의 화면·자막은 작업 기법을 검토하는 자료로 사용한다.
- 연출은 대본 → 씬 → 샷 → 참조 이미지·영상 → 프리비즈 → 승인 테이크 → 타임라인을 우선 연결한다. 샷에서는 카메라·렌즈·필름, 구도, 표정과 감정의 연기 단서를 구분한다.
- 로컬 음향은 프로젝트의 `yue-music`과 Road Music CLI 계약을 따른다. 모션그래픽과 Blender는 로컬 프리뷰와 렌더를 우선 검증한다. 차감 없는 검증은 연결 상태·모델·비용 조회까지만 사용한다.

## 도식화 작업

- 다이어그램을 추가하거나 수정할 때 용도에 맞는 프로젝트 스킬을 먼저 읽고 적용한다. 구조·흐름 분기·상태는 [Archify](https://github.com/tt-a1i/archify)의 `.agents/skills/archify/SKILL.md`, 사용 순서나 기능 설명은 [Diagram Design](https://github.com/cathrynlavery/diagram-design)의 `.agents/skills/diagram-design/SKILL.md`, 수치 비교와 차트는 [ZTD Charts](https://github.com/Junhan2/ztd-charts)의 `.agents/skills/ztd-charts/SKILL.md`를 사용한다.
- 도식의 편집 원본과 화면에서 쓰이는 위치, 용도와 검증 범위를 `docs/diagrams/README.md`에 기록한다. 앱에 포함한 도식은 320px에서도 읽는 순서와 본문이 유지되는지 확인한다.

## UI 작업과 검증

- 새 컴포넌트나 화면 보정 전에 `DESIGN.md`, `.agents/skills/ui-sdk/SKILL.md`, `.agents/skills/shadcn/SKILL.md`를 확인한다. UI SDK 컴포넌트는 설치 버전의 `node_modules/@ui-sdk/react/docs/llms.txt`와 해당 동작의 문서를 읽고 조합한다. shadcn에서 쓰는 동작별 버튼 우선순위와 시맨틱 토큰을 현재 CSS 컴포넌트에 적용한다.
- 설정·프로젝트·노드 편집의 주요, 보조, 위험 버튼은 기존 `studio-action` 변형과 Lucide React 아이콘을 우선 사용한다. 장식 아이콘은 읽기에서 숨기고 아이콘만 있는 버튼에는 접근 가능한 이름을 붙인다. 원본 SVG가 필요하면 프로젝트의 `lucide-icon` 스킬로 정식 이름과 경로를 확인한다.
- 화면 변경 뒤 Ego Browser에서 데스크톱과 390px, 의도적으로 좁은 320px의 긴 제목·레이블을 확인한다. 모달 제목, 가로 넘침, 누른 뒤의 배치, 키보드 포커스 복귀와 저장·취소 등 주요 동작을 실화면에서 확인한다.
- 읽기 결과를 캐시할 때 표시 가능 필드, 최신성, 만료, 무효화 조건을 정한다. 연결·키 변경 뒤 이전 계정의 표시값을 무효화하며 실제 실행 권한 검증에는 표시 캐시를 사용하지 않는다.
