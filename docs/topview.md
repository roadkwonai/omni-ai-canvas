# Topview MCP로 이미지와 영상 만들기

Omni AI Canvas는 공식 원격 Topview MCP에 OAuth로 연결한다. 이미지나 영상 노드에서 **Topview → 계정 연결**을 열고 공식 화면에서 권한을 승인한다. Omni AI Canvas로 돌아와 연결을 갱신하면 현재 모델을 읽을 수 있다. 공식 생성 스킬은 프로젝트의 `.agents/skills/topview-generate`에 설치돼 있다.

## Omni AI Canvas에서 생성

1. 모델과 작업 방식을 선택한다. 텍스트 이미지·영상, 참조 이미지 편집, 시작·끝 프레임 기반 영상, 복합 참조 중 현재 모델 설정에 노출된 모드를 사용한다.
2. 길이·화면비·해상도 등 표시된 옵션을 설정하고 필요하면 참조를 첨부하거나 그래프에서 연결한다.
3. 요청을 제출하면 Omni AI Canvas가 지원 슬롯의 파일을 MCP로 올리고, 제공자 작업 번호를 기록한 뒤 결과를 조회한다. 완료 결과는 실행 이력에서 선택해 노드에 적용한다.

공식 OAuth 토큰은 이 컴퓨터의 프로젝트 실행 데이터에 저장한다. 브라우저에서 인증을 취소했다면 에이전트 패널에서 다시 연결할 수 있다.

## 연결 전 확인

TopView 요금표는 플랜의 무제한·무료 생성 혜택을 MCP, CLI, API에서 사용할 수 없다고 명시한다. Ultra와 Team은 API에서 플랜 크레딧을 사용할 수 없다고 표시한다. MCP에서 현재 계정의 어떤 크레딧이 사용되는지는 TopView 계정과 플랜 조건을 확인한다. [TopView 요금표](https://www.topview.ai/pricing)

## 외부 에이전트에서 별도로 사용

아래 구성은 원격 서버 주소만 포함한다. OAuth 로그인과 토큰 저장은 사용하는 에이전트 호스트가 관리한다.

**Codex**에는 프로젝트의 `.codex/config.toml`에 `topview-mcp`가 등록돼 있고 기본적으로 비활성화돼 있다. 연결하려면 해당 항목의 `enabled = false`를 `enabled = true`로 변경한다. 프로젝트 디렉터리에서 `codex mcp login topview-mcp`를 실행하고 호스트가 표시한 OAuth 절차를 완료한다. `codex mcp get topview-mcp`로 구성을 확인한 뒤 새 Codex 세션에서 서버 도구를 확인한다.

**Claude Code**에는 프로젝트 루트의 `.mcp.json`에 `topview-mcp`가 등록돼 있다. 프로젝트 MCP 서버를 허용하고 클라이언트의 MCP 연결 화면에서 인증한다. 호스트가 인증 URL을 표시하면 해당 URL에서 로그인한다. 서버 주소는 [TopView 공식 설정 예시](https://github.com/topviewai/skill/blob/main/mcp.example.json)를 따른다.

## 한 장면 제작

1. 제작실에서 시나리오, 캐릭터, 키프레임을 검토하고 사용할 참조 이미지를 내려받는다. MCP를 연결한 에이전트에서 `scene-room`의 `get_project`로 현재 노드와 텍스트를 읽을 수 있다.
2. 에이전트에 `topview-generate` 스킬로 TopView의 계정 잔액과 선택 모델의 입력 조건을 확인하도록 요청한다. 공식 스킬은 `topview_get_credit`과 `topview_get_generation_config`를 안내한다. 정확한 예상 차감은 계정과 선택 옵션을 기준으로 확인한다.
3. 장면 프롬프트와 실제 참조 파일을 전달하고 영상 생성을 요청한다. 공식 스킬은 업로드 후 `topview_generate_video`를 호출하고 반환된 작업 ID를 `topview_query_task`로 조회하도록 안내한다. 대기 중 타임아웃이 나면 같은 작업 ID로 상태를 확인한다.
4. TopView 결과를 내려받아 제작실 영상 노드의 **영상 첨부**에서 선택한다. 캔버스 그래프 저장 후 다시 열어 재생한다. 제작실 미디어는 이 컴퓨터에 보관된다.

작업 내역이나 계정 크레딧을 확인하기 위한 연결과 실제 생성 요청은 별개다. 실행 비용을 확인할 수 없을 때는 확인되지 않은 상태로 표시한다. [TopView 공식 생성 스킬](https://github.com/topviewai/skill/tree/main/topview-generate)
