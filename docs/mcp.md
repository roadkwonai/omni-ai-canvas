# 로컬 캔버스 MCP

이 프로젝트의 stdio MCP 서버는 실행 중인 제작실의 프로젝트를 조회하고 새 노드와 연결을 추가한다. 프로젝트 API를 통해서만 접근한다. Neon 연결 정보는 MCP 서버에 넣지 않는다.

## 준비

프로젝트에서 `npm ci`를 실행하고 별도 터미널에서 `npm run dev`를 실행한다. 제작실의 DB 설정과 마이그레이션이 완료되어야 프로젝트 조회와 저장이 된다. 기본 주소는 `http://127.0.0.1:5050`이며 다른 포트를 사용하면 MCP 서버 프로세스의 `SCENE_ROOM_PORT`에 1~65535의 숫자를 지정한다. 호스트는 고정되어 있다.

프로젝트에는 세 클라이언트용 설정이 등록되어 있다. 이 설정은 프로젝트 루트에서 클라이언트를 열 때 상대 경로로 실행되므로 폴더를 옮긴 뒤에도 유지된다. Node.js 22.13 이상과 프로젝트의 `node_modules`가 필요하다. 서버는 표준 입력과 출력으로 MCP 메시지를 교환하므로 일반 터미널에서 실행하면 클라이언트 연결을 기다린다.

## Codex

프로젝트의 `.codex/config.toml`에서 `scene_room`을 등록한다. `cwd = "."`과 상대 스크립트 경로를 쓰므로 프로젝트 루트에서 Codex를 시작한다. `SCENE_ROOM_PORT`는 `env_vars`로 전달한다. 클라이언트를 다시 열고 `codex mcp get scene_room`으로 설정을 확인한다. Codex는 신뢰한 프로젝트의 설정을 읽는다. [Codex MCP 설정](https://developers.openai.com/codex/mcp)

## Claude Code

프로젝트 루트 `.mcp.json`에 `scene-room`을 등록한다. 프로젝트 루트에서 Claude Code를 시작해 `/mcp`에서 상태를 확인한다. Claude Code는 프로젝트 MCP 서버를 대화형 세션에서 처음 사용할 때 승인을 요청할 수 있다. `SCENE_ROOM_PORT=5051 claude`처럼 클라이언트 시작 환경에서 포트를 전달할 수 있다. [Claude Code MCP 프로젝트 설정](https://code.claude.com/docs/en/mcp)

## Antigravity

프로젝트 루트 `.agents/mcp_config.json`에 `scene-room`을 등록한다. `cwd = "."`과 상대 스크립트 경로를 사용하므로 프로젝트 루트에서 실행한다. `SCENE_ROOM_PORT=5051 agy`처럼 시작 환경에서 포트를 지정할 수 있다. CLI `/mcp`에서 연결 상태를 확인한다. [Antigravity MCP 설정](https://antigravity.google/docs/mcp?app=antigravity)

설치된 Antigravity CLI 1.5.14의 `agy mcp list`는 사용자 전역 서버만 표시했다. 이 환경의 대화형 CLI는 로그인 및 프로젝트 신뢰 확인을 요구해 프로젝트 설정의 실제 로딩을 확인하지 못했다. 전역 설정은 변경하지 않았다.

직접 CLI 실행은 기본적으로 꺼져 있다. 개인 구독 계정이 선택된 것을 확인한 후 프로젝트 .env에 `SCENE_ROOM_AGY_PERSONAL=1`을 설정하고 서버와 실행기를 재시작하면 앱에서 Antigravity 기획·텍스트 작업을 선택할 수 있다. 구독 및 청구 방식은 계정에서 확인한다.

## 이 환경에서 확인한 상태

- Codex `codex mcp get scene_room`은 프로젝트 설정과 실행 명령을 표시했다.
- Claude Code `claude mcp get scene-room`은 프로젝트 범위 설정을 표시했고, 클라이언트의 승인 대기 상태였다.
- MCP SDK 클라이언트로 동일한 서버를 실행해 도구 목록과 호출을 검증했다. 각 클라이언트에서의 실제 도구 호출은 별도 확인이 필요하다.
- 개발 서버를 `PORT=5051 npm run dev`로 실행할 때는 MCP 클라이언트에도 `SCENE_ROOM_PORT=5051`을 전달한다.

## 도구 사용

1. `list_projects`로 프로젝트를 찾는다.
2. `get_project`로 노드 ID, 연결과 최신 `version`을 읽는다.
3. `apply_graph`에 `projectId`, 읽은 `version`, 추가할 `graph.nodes`와 `graph.edges`를 전달한다. 선택적으로 프로젝트 `title`을 바꿀 수 있다. 연결은 기존 노드와 새 노드 모두 참조할 수 있다. 자산 참조는 제작실에 등록된 로컬 자산과 예제 자산만 허용한다.
4. 버전 충돌이 발생하면 최신 프로젝트를 다시 읽고 변경을 검토해 다시 요청한다. 자동 덮어쓰기는 하지 않는다.

예시 요청은 “마지막 상영 프로젝트에 영사기사 캐릭터 시트와 폐관 전날 장면 노드를 만들고 기획 노드에서 연결해 줘”처럼 작성한다. 사용 가능한 노드 종류는 `brief`, `script`, `character`, `keyframe`, `video`다. 노드에는 고유 `id`, `title`, `body`, `x`, `y`가 필요하다. 같은 ID, 중복 연결, 순환 연결과 잘못된 자산 유형은 거부된다.

MCP는 노드 작성과 연결만 수행한다. 이미지·영상 생성은 캔버스에서 제공자와 비용을 확인한 후 개별 작업으로 실행한다.
