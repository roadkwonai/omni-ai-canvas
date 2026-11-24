# Omni AI Canvas 브랜드 규칙

Omni AI Trading, Omni AI TTS와 같은 계열로 보이면서 어떤 제품인지 바로 구분되게 하는 규칙이다.

| 항목 | 규칙 |
| --- | --- |
| 이름 | 화면에는 **Omni AI Canvas**. 코드와 저장 위치의 `scene-room`, `drama_canvas`, `SCENE_ROOM_*`, `ai-drama-canvas`는 바꾸지 않는다. |
| 부제 | **대본부터 완성 영상까지 여러 AI 모델을 한 보드에서 쓰는 제작실** |
| 로고 | O 고리를 세 호로 나누고 이음매에 노드 세 개, 가운데에 재생 표시. 고리는 계열 공통, 노드와 재생은 캔버스의 뜻이다. |
| 색 | 주황 `#ff6600`, 글자용 주황 `#b93901`, 잉크 `#1a1c20`, 크림 `#fff2ec`, 어두운 바탕 `#181818` |
| 마스코트 | 문어 감독 **오미(Omi)**. 여러 팔은 여러 도구와 모델을 뜻한다. Trading의 부엉이, TTS의 마이크와 겹치지 않는다. |
| 문구 | 랜딩과 그림은 해요체, 문서는 합니다체. 제목에는 마침표를 쓰지 않는다. 조사나 "~에서"로 끝내지 않고 서술어나 명사로 맺는다. "하나의 ~", "~를 위한", "~하는 순간" 같은 번역투는 쓰지 않는다. 랜딩에서는 채택한 → 고른, 테이크 → 영상, 공급사 → 서비스, 실행 이력 → 작업 기록으로 쓴다. 제작실과 사용 가이드는 합니다체이며 공급사·제공자는 서비스, 전사는 받아쓰기, 다운로드는 내려받기, 좌측·우측은 왼쪽·오른쪽으로 쓴다. |
| 글자 | 로고 옆 이름은 Pretendard 텍스트로 쓴다. 그림 안에는 글자를 그려 넣지 않는다. |

## 파일

| 쓰임 | 파일 | 쓰는 곳 |
| --- | --- | --- |
| 타일 로고 | `public/brand/mark-tile.svg` | `components/Brand.tsx`의 `BrandMark`. 랜딩 머리글·바닥글, 제작실 상단 |
| 밝은·어두운 바탕 로고 | `public/brand/mark.svg`, `mark-dark.svg` | 문서와 공유 이미지 |
| 탭 아이콘 | `app/icon.svg`, `app/apple-icon.png` | 브라우저 탭과 홈 화면 |
| 공유 이미지 | `public/brand/og.png` (1200×630) | 랜딩 메타데이터 |
| README 배너 | `public/brand/banner.png` (1600×640) | `README.md` |
| 소개 영상 썸네일 | `public/landing/intro-video.webp` (1280×720) | 랜딩 소개 영상, `README.md`. 편집 원본 `docs/diagrams/brand/intro-video.html` |
| 오미 포즈 | `public/brand/omi-{wave,guide,lost,empty,plan,direct}.webp` | `components/Brand.tsx`의 `Mascot` |

| 포즈 | 쓰는 화면 |
| --- | --- |
| wave | 랜딩 마지막 안내 |
| guide | 사용 가이드 머리글 |
| lost | 주소를 찾을 수 없을 때 |
| empty | 선택한 노드가 없을 때 |
| plan | 실행 기록이 비었을 때 |
| direct | 작업실 가이드의 처음 시작하기 |

오미는 시작하거나 길을 찾는 화면에만 나온다. 편집 중인 캔버스, 오류 알림, 비용 확인처럼 판단이 필요한 곳에는 넣지 않는다. 장식이므로 `alt`를 비운다.

## 다시 만들기

- 포즈 원본은 `generated-images/brand`에 있고 프롬프트는 같은 폴더의 `concepts.json`, `poses.json`에 있다. ChatGPT 구독의 Codex `image_gen`으로 만들었다. 기준 그림은 `mascot-octopus.png`다.
- 앱용 변환은 `node docs/diagrams/brand/mascots.mjs`다. 공유 이미지와 배너의 편집 원본은 `docs/diagrams/brand/share.html`이다.
- 인포그래픽과 도표는 `python3 docs/diagrams/brand/build.py`로 다시 만든다. 기록은 [도식 문서](diagrams/README.md)에 있다.

## 아직 정하지 않은 것

Gemini Omni와 혼동될 수 있고 "Omni AI"는 흔한 이름이다. KIPRIS와 USPTO 공식 조회는 하지 않았으므로 상업 배포 전에 확인한다.
