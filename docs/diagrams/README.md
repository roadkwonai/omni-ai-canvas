# Omni AI Canvas 다이어그램

| 주제 | 적용한 스킬 | 편집 원본 | 서비스용 그림 | 대체 설명 |
| --- | --- | --- | --- | --- |
| 실행 구조 | Archify `architecture` | [architecture.json](architecture.json), [대화형 HTML](architecture.html) | [architecture.svg](../../public/guide/architecture.svg) | 제작자 브라우저는 공모전 HTTPS 요강을 조회하고 감독 구성을 검토한다. Next.js API와 Neon은 그래프·작업을 저장한다. 로컬 실행기는 구독 CLI 또는 별도 API를 선택해 실행하고, Road Music과 FFmpeg는 로컬 음향·프리비즈에 쓰인다. 결과는 로컬 미디어에 보관한다. |
| 제작 흐름 | Diagram Design `steps`, 문서용 가로형 | [workflow.html](workflow.html) | [workflow.svg](../../public/guide/workflow.svg) | 공모전 URL 또는 아이디어에서 샷을 기획하고 대본·참조를 정리해 영상과 음악을 만든 뒤 편집·납품한다. |
| 레퍼런스와 모션 제작 | Archify `workflow` | [편집 원본](reference-motion.json), [대화형 제작 흐름](reference-motion.html) | — | 컷별 근거와 구독 에이전트 분석을 개인 프리셋으로 저장하고 새 소재 보드·모션 명세·로컬 렌더·타임라인으로 잇는다. 프로젝트 GLB를 활용한 로컬 3D 제작도 요약한다. |
| 3D 장면과 제작 지침 | Archify `workflow` | [편집 원본](blender-guidance.json), [대화형 3D·지침 흐름](blender-guidance.html) | — | 공식·제작자 자료를 확인하고 중복 추천을 검토해 지침을 선택한다. AI 작업은 선택 지침을 실행 시점에 고정한다. 프로젝트 GLB에 포즈·동작·카메라·조명을 지정하고 Blender 프리비즈와 최종 MP4를 만들어 타임라인에 연결한다. Tripo3D 생성 연동은 후속 설계다. |
| 생성 경로와 과금 | ZTD Charts `tree` | [billing.json](billing.json) | [billing.svg](../../public/guide/billing.svg) | 구독 계정 CLI는 각 계정의 사용량과 크레딧을 따른다. 별도 API는 사용자가 선택하며 별도로 과금된다. 외부 앱에서 작업한 결과도 가져올 수 있다. Road Music과 FFmpeg의 로컬 실행에는 외부 생성 서비스 요금이 없다. |
| 프로젝트 상태 | Archify `lifecycle` | [원본](project-lifecycle.json), [상태도](project-lifecycle.html) | — | 작업 중·보관함·휴지통과 각 복구 경로를 표시한다. |
| 이미지 편집기 | 정적 UI 와이어프레임 | [편집 원본 SVG](image-node-editor-wireframes.svg) | — | 원본 선택, 연결된 감정 편집기, 수동·스마트 조명 배치. [동작 및 인수 기준](../image-node-editor-design.md) |
| 작업실 첫 제작 순서 | Diagram Design `steps` | [단계 데이터](../../components/workroom-guide-content.ts), [HTML 렌더러](../../components/WorkroomGuide.tsx), [반응형 스타일](../../components/workroom-guide.css) | 작업실 가이드의 처음 시작하기 | 아이디어 정리, 제작 요청, 기록에서 결과 검토, 캔버스에 적용을 한 줄로 연결한다. 좁은 화면에서는 같은 순서를 세로로 읽는다. |
| 여러 모델과 한 보드 | Diagram Design `dp-integration` | [HTML](brand/omni-board.html), [생성 스크립트](brand/build.py) | [넓은 화면](../../public/guide/omni-board.svg), [좁은 화면](../../public/guide/omni-board-narrow.svg). 사용 가이드 첫 절과 README | 여섯 작업의 도구가 하나의 보드로 모여 완성 영상과 다음 작품의 재료로 이어진다. |
| 대사 제작 순서 | Diagram Design `steps` | [HTML](brand/dialogue-steps.html), [생성 스크립트](brand/build.py) | [넓은 화면](../../public/guide/dialogue-steps.svg), [좁은 화면](../../public/guide/dialogue-steps-narrow.svg). 사용 가이드의 대사 절 | 대사 노드, 화자, 목소리, AI 연기 지시, 생성, 타임라인의 여섯 단계. |
| 작업별 실행 경로 | ZTD Charts `bar` | [스펙](brand/paths-by-task.json) | [넓은 화면](../../public/guide/paths-by-task.svg), [좁은 화면](../../public/guide/paths-by-task-narrow.svg). 모델과 요금 절, README | 작업마다 API 키 없이 쓰는 길과 별도 API 키로 쓰는 길의 수. |
| 로컬 음성 생성 시간 | ZTD Charts `bar` | [스펙](brand/voice-speed.json) | [넓은 화면](../../public/guide/voice-speed.svg), [좁은 화면](../../public/guide/voice-speed-narrow.svg). 대사 절, README | 음성 1초를 만드는 시간의 중앙값. S2 참조 있음 1.05초, 참조 없음 0.94초, Drama 3 0.65초. |

작업실 첫 제작 순서는 Ego Browser에서 데스크톱의 가로 배열과 390px·320px의 세로 배열을 확인했다. 단계의 읽는 순서는 같고 좁은 화면에서 가로 스크롤 없이 읽을 수 있다.

실행 구조는 현재 체크아웃의 [아키텍처](../architecture.md), `components/Studio.tsx`, `app/api/projects/[id]/runs/route.ts`, `lib/db.ts`, `scripts/worker.ts`, `lib/runner.ts`, `lib/media.ts`를 근거로 했다. 이 작업 폴더에는 Git 저장소가 없어 Archify의 커밋 고정 소스 검증은 적용하지 못했다. 제공자·과금 조건은 [제공자 조사](../providers.md)와 실제 연결 화면을 따른다.

2026-11-22 갱신본은 Archify의 validate, deliver, check, browser-check를 통과했다. 연결선 한 곳은 네 번 꺾이며 교차는 없다. Diagram Design은 오프라인 self-check와 연결선 geometry 검사를 통과했다. 패키지에 단계 전용 검사기가 없어 해당 검사는 실행하지 못했다. ZTD Charts 스펙 검증을 통과했다. 아키텍처와 제작 흐름은 브라우저 캡처로 확인했고 과금 트리는 렌더 이미지를 확인했다. 세 SVG의 XML을 검사했다. 가독성을 위해 아키텍처 그림과 과금 트리의 글자 크기를 조정했고 과금 트리에는 좌우 여백을 추가했다. 제작 흐름 SVG에는 원본 크기 속성을 명시했다. 320~740px 영역에서는 상세 문구가 작아지므로 확대 보기에서 원본 폭을 유지하고 가로 스크롤을 제공한다.

2026-11-22 레퍼런스와 모션 제작 흐름은 Archify workflow의 validate·deliver·check·browser-check 자동 검증을 통과했다. 1440×900 밝은 화면과 어두운 화면 캡처를 열어 노드 이름, 화살표와 레시피 수가 잘리지 않는지 확인했다. 하단 설명 카드는 스크롤하여 읽는다. 이 작업 폴더에는 Git 저장소가 없어 커밋 고정 출처 검증을 적용할 수 없었으며 도식의 소스 근거와 현재 구현 범위는 각 문서와 코드 위치에서 확인한다.

2026-11-22 3D·지침 흐름과 레퍼런스 도식 갱신본은 Archify workflow의 validate·deliver·check·browser-check·visual-check를 통과했다. 3D·지침 흐름은 1440×900 밝은 화면과 어두운 화면을 열어 노드와 연결선의 가독성을 확인했다. 도식은 `lib/blender-assets.ts`, `lib/blender-scene-spec.ts`, `lib/blender-board.ts`, `lib/blender-render.ts`, `lib/run-input.ts`, `lib/node-guidance.ts`의 현재 체크아웃을 따른다.

2026-11-24 브랜드 인포그래픽 두 장은 Diagram Design 오프라인 self-check를, 도표 두 개는 ZTD Charts 스펙 검증을 통과했다. 색은 [브랜드 규칙](../brand.md)의 토큰을 쓰고 강조는 그림마다 한 곳이다. 앱에서는 640px 이하에서 좁은 그림으로 바뀐다. 경로 수는 `lib/types.ts`의 `Provider`, `lib/workspace-settings.ts`의 `paidImageProviders`, `lib/media-model-types.ts`의 `mediaProviders`, `lib/tts-types.ts`의 `ttsProviderIds`, `lib/tripo-tasks.ts`, `lib/road-music.ts`에서 셌다. 앱에서 이어 작업하는 Antigravity 이미지는 세지 않았다. 음성 시간의 측정 조건은 [음성 설계](../tts-studio-design.md)에 있다. 제공자나 측정값이 바뀌면 스펙과 `brand/build.py`를 함께 고친다.
