# 제작 제공자 조사

조사 기준일은 2026-11-22다. 아래의 로컬 상태 확인에는 생성 요청과 비밀값 출력이 포함되지 않았다.

| 제공자 | 확인한 실행 경로 | 사용량과 제약 | 현재 로컬 상태 |
| --- | --- | --- | --- |
| ChatGPT / Codex | `codex exec`의 비대화형 작업, MCP 연결 | ChatGPT 로그인은 해당 플랜 사용량을 쓴다. API 키 사용은 API 과금이다. 이미지 생성 도구의 제공 여부는 실행 환경에 따라 확인해야 한다. | CLI 설치, ChatGPT 로그인 확인 |
| Claude | `claude -p` 비대화형 작업, MCP 연결 | Claude Code의 계정 사용량과 Claude Platform API 사용량은 구분한다. 도구 사용 권한과 계정 한도를 확인해야 한다. | CLI 설치, claude.ai 인증 확인 |
| Antigravity | `agy --print`, MCP 연결 | Google 로그인과 모델별 계정 할당량을 사용한다. 별도 API 키나 Cloud 프로젝트를 설정할 수도 있다. | CLI 설치, 모델 목록 조회 성공 |
| Higgsfield | Omni AI Canvas에서 공식 CLI 모델 목록과 사양, 이미지·영상 생성에 연결 | 연결한 Higgsfield 계정의 크레딧을 쓴다. 웹 무제한 혜택의 적용 여부는 별도다. | CLI 로그인, 실시간 모델 및 무참조 견적 조회 확인 |
| Kling | Omni AI Canvas에서 공식 CLI 계정 카탈로그, 이미지·키프레임·복합 참조 영상 생성에 연결 | 개인 계정의 유료 크레딧을 사용한다. 보너스 크레딧, 팀 혜택, 오프피크 무료 생성은 제외된다. | CLI 설치 확인. 모델 목록을 보려면 개인 계정 OAuth 로그인 필요 |
| Topview | Omni AI Canvas에서 공식 OAuth MCP의 생성 설정과 이미지·영상 생성에 연결 | 웹의 무제한·무료 생성 혜택은 자동화에 적용되지 않는다. 계정의 MCP 이용 조건을 적용한다. | OAuth 로그인 시작 확인. [프로젝트 연결 방법](topview.md) |

## Omni AI Canvas에서 모델과 참조 사용

키프레임·레퍼런스 이미지 또는 영상 노드의 에이전트에서 **공급사 → 모델 → 작업 방식**을 선택한다. 화면비·해상도·길이·오디오 등은 선택한 모델과 모드에서 제공되는 값으로 바뀐다. 원본 이미지·영상을 첨부하거나 캔버스에 연결하고, 필요한 경우 **시작 프레임**, **끝 프레임**, **참조 영상** 같은 슬롯을 직접 지정한다. 연결 노드의 이미지를 제외하고 본문만 쓸 수도 있다. 입력 조건은 Omni AI Canvas에서 확인하며, 일부 모델의 옵션 조합은 공급사가 직접 검증한다.

새 실행은 결과 한 개를 노드에 적용하는 흐름을 사용한다. 앱이 지원하는 형식은 PNG·JPEG·WebP와 MP4·WebM이며, 참조 또는 결과의 크기 한도는 64 MiB다. Higgsfield의 작업 전 견적은 외부에 참조 파일을 업로드하지 않아도 되는 경우에 조회한다.

## 이미지 API 연결

아래 경로는 서버의 `.env`에 각 키를 설정한 뒤 앱과 작업자를 재시작해 사용한다. 선택한 계정 CLI의 구독 사용량과 별도로 해당 API 계정에 과금된다. 하나를 선택해 실행하며 실패해도 다른 제공자로 자동 전환하지 않는다. 키 값은 화면이나 문서에 쓰지 않는다.

| 제공자 | 환경변수 | 모델 설정 | 공식 문서 |
| --- | --- | --- | --- |
| OpenAI 이미지 API | `OPENAI_API_KEY` | 기본 `gpt-image-2.5-sunburst`, 선택 `gpt-image-2.5-flare`, `gpt-image-1.5` | [이미지 생성](https://platform.openai.com/docs/guides/image-generation) |
| Gemini 이미지 API | `GEMINI_API_KEY` | 기본 `gemini-nano-banana-2.1`, 선택 `gemini-3.1-flash-image`, `gemini-2.5-flash-image` | [이미지 생성](https://ai.google.dev/gemini-api/docs/image-generation) |
| BytePlus ModelArk Seedream | `ARK_API_KEY`, 선택 `SEEDREAM_MODEL` | 기본 `seedream-4-5-251128` | [이미지 생성 API](https://docs.byteplus.com/en/docs/modelark/image-generation-api) |

한 번에 이미지 1장을 요청한다. 참조는 PNG·JPEG·WebP 최대 4장, 각 10 MiB까지다. 키 설정으로 계정의 모델 권한까지 확인할 수는 없다. 이미지 API의 테스트와 실제 호출 확인 범위는 [실행 검증 기록](verification.md)을 따른다.

기획·텍스트·연출 검토의 모델 목록은 Codex `model/list`, Antigravity `agy models`, Claude CLI가 제공하는 모델 별칭에서 가져온다. 모델을 고르지 않으면 해당 CLI의 기본 설정을 사용한다. Codex 이미지 생성은 ChatGPT 계정 이미지 도구를 사용하므로 기획 에이전트의 모델 선택을 이미지 모델 선택으로 표시하지 않는다.

## 실행별 첨부 처리

Codex·Claude의 텍스트·기획·연출 검토는 이미지와 영상 대표 프레임을 분석한다. Claude는 이미지 최대 4개, 각각 5 MiB·합계 16 MiB다. Antigravity 직접 실행은 시각 입력을 분석하지 못해 텍스트만 전달한다. Higgsfield·Kling·Topview의 생성 작업에서는 선택한 입력 슬롯과 일치하는 이미지·영상 원본을 보낸다. 문서·링크는 추출 텍스트로 전달하며 영상 음성 전사는 하지 않는다. [첨부 형식과 한도](production-agent-guide.md#에이전트에-자료-첨부)

## 연결 설계에 반영할 사항

- 서버에 API 키를 전달하는 경로와 사용자의 로컬 CLI 세션은 명시적으로 구분한다. 브라우저에 비밀값을 전달하거나 저장하지 않는다.
- 로컬 CLI는 사용자가 실행한 로컬 환경에만 존재한다. 원격 서버에 배포할 때는 그 서버의 인증과 별도 실행 환경이 필요하다.
- 영상 생성은 비동기 작업으로 다루고 제공자의 작업 ID, 상태, 오류, 산출물 위치를 기록한다. 생성 결과를 확보하기 전까지 완료 상태를 표시하지 않는다.
- 제공자 연결이 확인되지 않은 경우 연결 가능 또는 생성 성공으로 표시하지 않는다. 계정과 모델, 실제 사용량은 해당 제공자의 최신 화면에서 확인한다.
- Higgsfield의 비용 조회는 생성 없이 실행한다. 참조 미디어는 CLI가 비용 조회 과정에서 업로드하므로 예상 크레딧을 표시하지 않는다. 실제 작업 비용은 제공자 청구 내역을 기준으로 한다.

## 출처

- [Codex의 ChatGPT 플랜 사용](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)
- [ChatGPT Work와 Codex의 로그인 및 API 과금](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex)
- [Claude Code 루틴과 Claude Platform의 인증 및 과금 차이](https://platform.claude.com/docs/en/api/claude-code/routines-fire)
- [Google Antigravity CLI 안내](https://codelabs.developers.google.com/agentic-ui-automation-with-antigravity)
- [Higgsfield MCP와 CLI 연결](https://higgsfield.ai/enterprise-help-center/platform/integrations)
- [Higgsfield MCP 사용량](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-higgsfield-mcp)
- [Higgsfield 공식 CLI](https://github.com/higgsfield-ai/cli)
- [Kling MCP와 CLI 공식 가이드](https://kling.ai/app/mcp/guide)
- [Kling 공식 CLI](https://www.npmjs.com/package/@klingai/cli-global)
- [TopView 공식 MCP 스킬](https://github.com/topviewai/skill)
- [TopView 요금과 자동화 제한](https://www.topview.ai/pricing)
- [TopView 작업 비용 추정](https://docs.topview.ai/reference/estimate-task-credits)
- [Kling API 플랫폼 사용 안내](https://docs.qingque.cn/d/home/eZQA6m4cRjTB1BBiE5eJ4lyvL?identityId=1oEER8VjdS8)
- [Kling API 사양](https://docs.qingque.cn/d/home/eZQDkhg4h2Qg8SEVSUTBdzYeY?identityId=1oEG9JKKMFv)

## Kling 계정 연결

프로젝트 폴더에서 `./node_modules/.bin/kling login`을 실행하고 브라우저에서 Kling 개인 계정을 인증한다. `./node_modules/.bin/kling account`는 계정과 사용 가능 크레딧을 조회한다. 생성 작업은 제출 후 취소할 수 없으며 결과 URL은 24시간 유효하다.

## Antigravity 연결

Antigravity CLI의 비대화형 실행과 세션별 도구 접근 거부를 확인했다. CLI에는 Google 계정 외에 Gemini API 키와 Google Cloud ADC 인증이 있으며 앱에서 현재 청구 계약을 확정하는 방법은 확인하지 못했다. 기본값은 MCP 경로다. 이미지 직접 생성은 구독 인증 구분과 파일 회수·도구 제한이 검증되지 않아 제공하지 않는다. 작업실 설정의 계정 연결에서 개인 CLI 경로를 켜고 공식 Antigravity 터미널을 연다. 개인 구독 인증과 사용량을 확인한 뒤 기획과 텍스트를 실행한다. 해제는 터미널에서 `/logout`으로 완료한다. 기존 환경변수 `SCENE_ROOM_AGY_PERSONAL=1`은 작업실 설정에 우선한다. CLI 실행에 Gemini API 키와 ADC 활성화 환경변수를 전달하지 않는다. 현재 인증 및 과금 계약은 사용자가 확인한다. [헤드리스 모드](https://antigravity.google/docs/cli/headless/), [인증 방식](https://antigravity.google/docs/install?tab=cli)

## Higgsfield 설치 복구

프로젝트 의존성 설치 후 CLI 바이너리가 누락되면 `node node_modules/@higgsfield/cli/install.js`로 해당 패키지 버전의 다운로드와 SHA-256 검증을 다시 실행하고 `node_modules/.bin/higgsfield version`으로 확인한다. 로그인한 계정의 사용량을 이용한다.

## v0.2 설계를 위한 기능 확인

2026-11-22 프로젝트 CLI 1.2.2의 모델 스키마에서 `gpt_image_2_5`의 이미지 참조, `seedance_2_5`의 다중 참조와 시작·끝 프레임, 영상 편집·연장 모드를 확인했다. 현행 앱에서 모든 슬롯을 선택할 수 있는 것은 아니다. 샷의 렌즈·표정·필름 룩은 우선 프롬프트로 표현하고 Cinema Studio 네이티브 설정은 워크플로별 지원을 검증한 뒤 연결한다. 로컬 참조가 필요한 견적은 자동 업로드를 피하고 미확인으로 표시한다. [Higgsfield CLI](https://github.com/higgsfield-ai/cli) · [샷 입력 계약](directing-workflow.md)

Road Music 0.1.1은 로컬 음악·효과음 제공자다. 서비스 CLI에서 ACE 무보컬 음악과 효과음 요청의 준비 검증을 확인했다. YuE 계열 음악의 가이드 검수와 결과 확인은 지정된 음악 스킬을 사용한다. 엔진 실행·음질은 별도 검증 대상이다. [Road Music 연동 조사](road-music-integration-plan.md)

현재 로컬 어댑터는 `ROAD_MUSIC_HOME`에 지정한 경로에서 실행한다. 생성 시 로컬 서비스를 시작할 수 있고 선택한 엔진 설치가 필요하다. ACE 음악은 1~600초, 효과음·환경음은 1~30초, YuE 연주곡은 20~360초를 요청한다. 원본은 선택된 Road Music 프로젝트에 보관되고 WAV·MP3 사본을 Omni AI Canvas에 저장한다. 제출 결과가 불확실하면 실행 이력의 작업 번호를 확인한다. YuE 결과의 길이와 보컬 유무는 청취로 확인한다. 모의 CLI 테스트를 통과했으며 실제 엔진 생성·음질은 검증하지 않았다.

## Tripo 3D 리깅 작업

Omni AI Canvas의 Tripo 작업 화면에서 작업 UUID 또는 프로젝트 GLB를 등록해 받은 파일 번호로 리깅 검사와 biped/mixamo 리깅을 요청할 수 있다. 동작 적용은 완료된 리깅 작업 번호와 v3 동작 프리셋을 사용한다. 서버 환경에는 `TRIPO_API_KEY`를 설정한다. 작업 번호는 프로젝트별 로컬 이력에 보관하며 성공 작업의 공식 GLB를 같은 프로젝트의 Blender 자산으로 가져올 수 있다. 리깅과 동작 적용의 과금은 Tripo API 계정 기준이다. 이 빌드의 리깅 설정은 사람형이다. 실제 계정은 API 키 미설정으로 모의 계약만 검증했다. [Tripo 리깅 공식 문서](https://developers.tripo3d.ai/en/docs/animations-rig) · [파일 등록](https://developers.tripo3d.ai/en/docs/files)

Higgsfield MCP는 별도의 OAuth 연결을 사용한다. 참조 노드에서 Image Reference Element를 조회하거나 Higgsfield에서 확인된 이미지 UUID와 주소를 제공해 생성한다. Omni AI Canvas는 MCP 도구 목록과 스키마를 검사한다. 완료된 Element는 공식 MCP 생성에 사용할 표식을 복사할 수 있다. Video Element와 Add voice는 공식 앱에서 설정한 뒤 ID 및 상태를 노드에 연결하는 경로다. OAuth 인증 주소 발급과 모의 도구 계약을 검증했다. [Higgsfield MCP 연결 안내](https://higgsfield.ai/creator-hub/help-center/integrations/how-do-i-connect-higgsfield-to-ai-agent)

Higgsfield 공식 MCP는 `https://mcp.higgsfield.ai/mcp`와 Higgsfield OAuth 계정을 사용한다. 참조 노드에서 계정을 연결하고 읽기 전용 도구 목록을 확인할 수 있다. 공식 앱 MCP에서는 이미 확인된 이미지의 `medias`로 참조 엘리먼트를 만들며 완료된 UUID를 지원 모델의 프롬프트에 `<<<UUID>>>`로 전달한다. Kling 3.0은 별도 시작 이미지가 필요하다. Omni AI Canvas는 현재 UUID를 기록하고 표식을 복사하는 인계 경로를 제공한다. 인증 전 OAuth 시작까지만 검증했고, 원격 이미지 업로드와 생성 요청은 실행하지 않았다. [공식 연결 안내](https://higgsfield.ai/creator-hub/help-center/integrations/how-do-i-connect-higgsfield-to-ai-agent)

## 작업실 설정에서 등록하는 키와 요금제

2026-11-22 기준으로 OpenAI, Gemini, Seedream의 ModelArk 및 Tripo의 API 키를 작업실 설정에서 등록하거나 제거할 수 있다. 등록한 값은 이 컴퓨터의 `.scene-room/service-settings`에 파일별로 저장하며 파일 권한은 소유자만 읽고 쓸 수 있도록 제한한다. 화면에는 등록 여부와 등록 경로만 표시한다. 로컬 등록값이 있으면 작업 요청 시 사용한다. 로컬 값을 삭제하면 환경변수에 값이 있는 경우 그 값을 사용한다.

계정 연결 탭에서 공식 CLI·MCP가 반환한 요금제, 잔여량과 모델을 표시한다. Codex는 app-server의 account/read, Claude는 auth status, Higgsfield와 Kling은 공식 CLI 응답을 사용한다. Topview MCP에서는 크레딧과 모델만 조회된다. Antigravity 플랜은 확인할 수 있는 읽기 경로가 없다.

연결 테스트는 저장한 키로 OpenAI·Gemini·ModelArk의 모델 목록 또는 Tripo 잔액을 조회한다. 응답은 연결·거부·미설정·확인 불가로 제한한다. 연결 성공은 해당 읽기 경로의 승인 여부이며 개별 모델의 생성 권한과 별개다. [OpenAI 모델 목록](https://platform.openai.com/docs/api-reference/models/list) · [Gemini 모델 목록](https://ai.google.dev/api/models) · [ModelArk 모델 목록](https://docs.byteplus.com/en/docs/modelark/models-api) · [Tripo 계정 조회](https://developers.tripo3d.ai/en/docs/account)

기획·텍스트의 추론 강도는 CLI가 지원하는 단계에서 선택한다. Codex와 Antigravity는 모델별로 조회하며 Claude는 CLI 도움말에 표기된 단계를 제공한다. [Codex App Server](https://developers.openai.com/codex/app-server/) · [Claude Code CLI](https://code.claude.com/docs/en/cli-reference) · [Antigravity Effort](https://antigravity.google/docs/cli/commands/effort)


## 구독 계정 변경과 연결 표시

Codex와 Claude의 연결·계정 변경은 macOS Terminal에서 각각 `codex login`, `claude auth login --claudeai`를 여는 단계로 시작한다. 연결 해제는 사용자가 확인한 뒤 각 CLI의 공식 로그아웃 명령으로 처리한다. Antigravity는 터미널에서 인증을 완료하므로 앱은 직접 실행 설정과 확인 필요 상태를 표시한다. [Codex 인증](https://developers.openai.com/codex/auth/) · [Claude Code CLI](https://code.claude.com/docs/en/cli-reference) · [Antigravity 시작](https://antigravity.google/docs/install)

계정·모델 조회는 마지막 표시 데이터를 즉시 반환하고 서버 시작 시와 백그라운드에서 약 60초마다 갱신한다. 첫 조회나 캐시가 만료된 동안은 진행 상태를 표시한다. 연결이나 키 변경 후 이전 캐시는 폐기된다. 최대 보관 기간은 30분이다. 생성 요청의 권한과 모델 선택 검증은 실제 제공자 경로를 사용한다.
## 캐릭터 외형과 목소리 등록

### 대사 음성 합성 연결

| TTS 공급사 | 서버 환경변수 | 요청 모델 |
| --- | --- | --- |
| Fish Audio | `FISH_AUDIO_API_KEY` | S2.1 Pro |
| 로컬 무료 | 없음. Fish 목록 참조 샘플 조회에는 `FISH_AUDIO_API_KEY` | Fish S2 Pro 8bit, Fish Drama 3 4bit (MLX) |
| ElevenLabs | `ELEVENLABS_API_KEY` | Eleven Multilingual v2 |
| Typecast | `TYPECAST_API_KEY` | SSFM v3.0 |
| Gemini TTS | `GEMINI_TTS_API_KEY` 또는 `GEMINI_API_KEY` | Gemini Flash TTS |

작업실의 API 키 설정에 입력한 값이 환경변수보다 우선한다. 공급사가 이미 공개한 샘플을 재생하는 경로는 대사를 합성하지 않는다. 직접 입력한 대사의 시험 합성과 최종 음성 생성은 각각 TTS 공급사의 API 사용량을 쓴다. 개인 목소리 등록에도 Higgsfield 계정 조건이 적용된다. 다른 서비스에 샘플을 전송하기 전에 음성 제공 조건과 목소리 사용 권한을 확인한다. 2026-11-23 확인. [Fish Audio API](https://docs.fish.audio/api-reference/introduction) · [TTS 설계와 공급사 문서](tts-studio-design.md)

로컬 모델은 API 사용량이 없고 가중치 라이선스가 적용된다. S2 Pro는 Fish Audio Research License로 연구·비상업 용도만 허용한다. Drama 3는 Fish Audio Community License로 최근 12개월 매출이 50만 달러 미만이면 상업 이용이 가능하고, 제3자에게 음성 생성 서비스를 제공할 수 없다. Drama 3 라이선스는 식별 가능한 실존 인물의 무단 모사와 결과물을 다른 음성 모델의 학습·개선에 쓰는 것을 금지한다. 로컬 결과를 Higgsfield 개인 목소리로 등록하기 전에 이 조건에 해당하는지 확인한다. `fishaudio/drama-3-int4`는 CUDA 전용 GPTQ 가중치라서 Apple Silicon에서는 커뮤니티 변환본 `mlx-community/fish-audio-drama-3-4bit`(개정 2b0c802)를 쓴다. Built with Fish Audio. 2026-11-24 확인. [S2 Pro](https://huggingface.co/fishaudio/s2-pro) · [Drama 3 int4](https://huggingface.co/fishaudio/drama-3-int4) · [Drama 3 MLX](https://huggingface.co/mlx-community/fish-audio-drama-3-4bit)

Fish Audio 목록의 한국어 번역은 Claude 구독에 연결된 `claude -p` 세션의 Haiku 5.5를 사용하며 Claude 구독 사용량이 적용된다.

2026-11-23에 설치된 Higgsfield CLI 1.2.2의 Soul 학습 명령, 목소리 목록·상세 조회, Soul 이미지 모델과 Seed Audio의 옵션을 확인했다. Soul 학습과 이미지·영상·VO 생성은 CLI에 연결한 계정의 이용 조건과 크레딧을 사용한다. 개인 목소리 복제는 작업실에서 OAuth로 연결한 MCP에 등록 도구가 제공될 때 실행한다. 계정의 크레딧과 복제 가능한 개수는 요금제와 작업공간에 따라 달라진다. 같은 목소리로 생성하려면 CLI에서도 해당 목소리를 사용할 수 있는 계정에 로그인한다. 연결된 MCP에서 등록 도구를 사용할 수 없으면 Higgsfield Audio에서 개인 목소리를 만든 뒤 작업실의 목소리 목록에서 선택한다. 이번 검증에서 공급사 학습·복제·생성 요청은 제출하지 않았다. [공식 CLI 안내](https://higgsfield.ai/blog/higgsfield-cli) · [공식 MCP 및 음성 복제 안내](https://higgsfield.ai/enterprise-help-center/platform/integrations) · [개인 목소리 사용법](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-lipsync-voiceover-and-aspect-ratios)
