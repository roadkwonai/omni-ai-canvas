# 새 환경 설치와 배포 준비

Omni AI Canvas는 제작자 컴퓨터의 `127.0.0.1`에 바인딩하는 앱이다. 보드는 Neon에, 파일과 서비스 인증은 제작자 컴퓨터에 보관한다. 전체 소스를 받은 프로젝트 루트에서 `npm ci`, `npm run setup:check`, `npm run db:migrate`, `npm run dev` 순서로 준비한다. 데이터베이스에는 `.env.example`에서 안내한 값을 자신의 `.env`에 넣은 뒤 마이그레이션을 적용한다. 운영 모드는 같은 루트에서 `npm run build`와 `npm start`로 실행한다.

## 소스에 포함되는 것

| 항목 | 받는 위치와 사용 방법 |
| --- | --- |
| 프로젝트 작업 지침과 설계 | `AGENTS.md`, `DESIGN.md`, `docs/production-agent-guide.md`, `docs/skills.md` |
| 제작 스킬과 참조 | `.agents/skills/`에 버전별 원문과 필요한 스크립트가 있다. 프로젝트 루트에서 에이전트 세션을 열면 프로젝트 범위의 스킬을 사용할 수 있다. 원본 버전과 일부 연구 스킬의 별도 의존성은 [스킬 관리](skills.md)를 확인한다. |
| 제작 형식과 워크플로우 | `lib/production-template.ts`, `lib/higgsfield-guidance-kit.ts`, 앱의 제작 형식과 제작 도구에 포함된다. 장르별 보드, 작업 지침 요약, 샘플 미디어와 얼굴 리그는 소스에서 제공한다. |
| 프로젝트 MCP | `.codex/config.toml`, `.mcp.json`, `.agents/mcp_config.json`과 `scripts/canvas-mcp.ts`를 제공한다. 클라이언트의 프로젝트 신뢰와 등록 방법은 [MCP 사용법](mcp.md)을 확인한다. |
| 앱과 배치 실행기 | `package-lock.json`의 버전으로 설치한다. 서버·실행기·MCP가 사용하는 `tsx`도 운영 의존성에 포함된다. |

`npm run setup:check`는 필수 파일과 npm 모듈의 존재, `.env`의 설정 여부, 선택 도구의 실행 파일 또는 모델 경로를 확인한다. 설정값은 화면에 표시하지 않는다. DB 연결, 서비스 인증 또는 생성 작업은 호출하지 않는다.

## 선택한 기능에 필요한 도구

| 기능 | 사용자가 준비할 항목 |
| --- | --- |
| 프로젝트 저장 | Neon 풀링 주소 `DATABASE_URL`과 마이그레이션용 직접 주소 `DATABASE_URL_UNPOOLED` |
| 영상 분석·편집·내보내기 | PATH에서 FFmpeg 5.1 이상의 `ffmpeg`, `ffprobe` 사용 가능([확인한 버전](local-motion-recipes.md#ffmpeg-버전)). 공개 YouTube 가져오기는 `yt-dlp` 추가 |
| 구독형 이미지·텍스트·영상 생성 | 사용할 계정에 직접 로그인. Codex와 Claude는 로컬 CLI를 설치한다. Higgsfield·Kling은 npm 의존성의 공식 CLI, Topview는 앱의 OAuth 연결을 사용한다. [서비스별 조건](providers.md) |
| 대사 음성 API | Fish Audio, ElevenLabs, Typecast, Gemini TTS의 키를 작업실 설정이나 `.env`에 넣는다. [음성 제작과 과금](tts-studio-design.md) |
| 이 컴퓨터에서 만드는 음성 | Apple Silicon Mac과 `uv`. `npm run setup:local-tts`가 S2 Pro 약 11GB와 Drama 3 약 24GB를 `.scene-room/local-tts`에 받는다. 결과를 쓸 수 있는 범위는 모델 라이선스를 따른다. |
| Road Music과 YuE 음향 | Road Music 앱과 선택한 엔진을 설치하고 `.env`와 에이전트 터미널에서 `ROAD_MUSIC_HOME`을 지정한다. CLI 경로는 해당 폴더의 `cli/road-music.js`다. [Road Music 공식 저장소](https://github.com/roadkwonai/music-road) |
| Blender 3D | Blender 설치 후 `BLENDER_BIN`을 지정하거나 PATH에 등록한다. macOS의 기본 앱 위치는 자동 검색한다. |
| 말소리 받아쓰기 | `whisper-cli`와 모델 파일을 준비하고 `WHISPER_MODEL_PATH`를 지정한다. |
| 화면 문자 인식·이미지 분리 | macOS의 Swift와 Vision을 사용한다. |
| 문서 처리 | PDF 텍스트 읽기는 `pdftotext`, DOCX·PPTX 읽기는 `python3`, 문서 PDF 내보내기는 Chrome 또는 Chromium 계열 브라우저를 사용한다. 설치 위치를 지정할 때 `NODE_DOCUMENT_CHROME_PATH`를 설정한다. |

### 제작자 첨부 원문

공식 Higgsfield 스킬 원문과 제작에 쓰는 요약 지침은 프로젝트에 포함된다. 블로그 제작자가 제공한 원문 첨부와 아이디어 100개 열람은 각자 출처에서 받은 파일을 `.scene-room/research/higgsfield-originals/`에 보관해야 사용할 수 있다. 파일명과 출처, 고정 체크섬은 [제작 지침 원본 목록](higgsfield-production-audit.md)과 [열람 경로](../app/api/guidance/route.ts)에 있다. 원문 없이도 내장 요약을 선택하고 감독 기획과 장르별 제작 보드를 사용할 수 있다.

## 저장소와 배포 파일

`.gitignore`는 환경 파일과 키, CLI 로그인·계정 캐시, 비공개 제작 프로젝트, 조사 중 수집한 파일, 실행·빌드 산출물을 제외한다. 설정 이름만 담은 `.env.example`은 포함한다. 미디어·프로젝트 백업은 Git과 별도의 저장 위치에 둔다. `public/`은 웹에서 읽을 수 있는 샘플 전용이다.

이미 Git에 추가한 파일과 이전 커밋은 `.gitignore` 적용 후에도 검토해야 한다. 공개 저장소로 넘길 때는 실제 Git에서 추적 파일과 이력을 확인하고, 프로젝트 및 동봉한 제3자 자료의 배포 조건을 확인한다. 공개 호스팅에는 사용자 인증, 프로젝트·미디어 격리, 원격 실행기 연결이 필요하다. [보관과 실행 경계](architecture.md)

## 릴리스 노트와 GitHub Release

### 지금 상태 (2026-11-24)

비공개 저장소 [roadkwonai/omni-ai-canvas](https://github.com/roadkwonai/omni-ai-canvas)에서 v0.1.0으로 시작한다. 노트는 [release](../release/README.md)에 있다. 자동 배포와 라이선스 파일은 없다. 앱은 로컬 전용이라 서버에 배포하지 않는다. 공개로 바꾸기 전에 아래 확인 목록을 끝낸다.

### 정한 규칙

| 항목 | 규칙 |
| --- | --- |
| 노트 파일 | `release/YYYY-MM-DD-title-name.md`. 날짜는 릴리스한 날(Asia/Seoul), 제목은 영문 소문자와 하이픈으로 쓴다. 예: `release/2026-11-24-first-public-release.md` |
| 첫 줄 | `# Omni AI Canvas v<버전> — <한 줄 제목>`. GitHub Release의 이름이 된다. 나머지는 본문이 된다. |
| 본문 순서 | 사용자가 얻는 것, 달라진 점, 해야 할 일, 확인한 내용, 알려진 제한, 자세한 링크 |
| 버전 | `package.json`의 `version`이 기준이다. SemVer를 쓰고 올릴 번호는 사용자가 고른다. |
| 태그 | 릴리스 커밋에 `v<버전>`. 공개한 태그는 옮기거나 지우거나 다시 쓰지 않는다. |
| GitHub Release | 노트 파일과 같은 제목과 본문으로 만든다. 노트를 고치면 Release도 함께 고친다. |
| 쓰지 않는 것 | 키와 계정, 로컬 절대 경로, 내부 작업 번호, 커밋 목록 |

### 릴리스 순서

1. `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`를 통과한다.
2. 추천 버전과 이유를 보고 사용자가 번호를 고른다. `package.json`의 버전을 바꾼다.
3. `release/`에 노트를 쓰고 사용자가 확인한다.
4. 커밋, 푸시, 태그, GitHub Release를 각각 사용자가 승인한 뒤 진행한다. 저장소를 공개로 바꾸는 일은 따로 승인받는다.
5. Release의 제목과 본문, 태그가 가리키는 커밋, README 링크와 새 위치에서의 설치를 확인한다.

### 공개로 바꾸기 전에 정하거나 고칠 것

| 항목 | 상태 |
| --- | --- |
| 이 저장소의 라이선스 | **정해야 함.** 없이 공개하면 다른 사람이 쓸 권리가 따로 생기지 않는다 |
| `gpt-image` 스킬 | **막힘.** 원본 [GENEXIS-AI/gpt-image-skill](https://github.com/GENEXIS-AI/gpt-image-skill)에 라이선스가 없어 공개 배포 권한을 확인하지 못했다. `lib/runner.ts`의 구독 이미지 생성이 이 파일을 쓴다 |
| `web-design-guidelines`, `composition-patterns`, `react-best-practices` | 원본 저장소에 라이선스 파일이 없다. 뒤의 둘은 `SKILL.md`에 MIT로 적혀 있다 |
| 라이선스 파일이 빠진 나머지 스킬 | 원본은 확인했다. Addy Osmani 7개와 공통 `references` 폴더·ZTD Charts·Diagram Design·Next.js는 MIT, Neon 2개와 Topview는 Apache-2.0이다. 공개하려면 원본 라이선스 파일을 함께 넣는다. |
| 참고 자료와 작업 기록 | `references/`, `tasks/`, `generated-images/`를 Git에서 제외했다. 제외한 파일로 가던 링크는 "(로컬 자료)" 글로 바꿨다 |
| 로컬 절대 경로 | 공개 대상에는 `tests/local-tts.test.ts`의 시험용 경로만 남았다 |
| 비밀값과 계정 | 알려진 키 형태와 Neon 주소, 계정 이메일을 찾아본 범위에서는 시험용 DB 주소만 나왔다. 보안 감사는 아니다 |
| CineGuide | 공개 대상에 없다. `.scene-room`은 Git에서 제외된다 |
