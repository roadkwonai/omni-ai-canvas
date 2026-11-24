# 캔버스 기능 대응과 확인 상태

기준일 2026-11-22. Newtake와 Dreamina의 지정된 기존 빈 캔버스에서 메뉴를 열고 닫아 확인했다. 생성·업로드·노드 변경은 실행하지 않았다. **화면 관찰**은 표시된 메뉴의 존재를 뜻한다. **공식 설명**은 제공자의 문서 주장이다. **제안**은 Omni AI Canvas에서 추가할 수 있는 설계다. Omni AI Canvas 기능은 코드와 별도의 검증 결과를 기준으로 표시한다.

| 기능 | 레퍼런스 근거 | Omni AI Canvas 경로 | 상태와 범위 |
| --- | --- | --- | --- |
| 캔버스와 연결 | 양쪽 화면의 노드 도구, 연결 표시 및 미니맵 관찰. [Newtake 실측](newtake-review.md), [Dreamina 실측](dreamina-review.md) | 캔버스 보드, `components/CanvasBoard.tsx` | 기본 노드·연결·확대·미니맵과 순환 검증 구현. 실제 브라우저 검증은 [검증 기록](verification.md) 참조 |
| 검색·복제·그룹·실행 취소 | Newtake 단축키 안내와 Dreamina 검색의 유형·그룹 필터 화면 관찰. Dreamina는 노드 그룹·검색을 공식 설명. [Dreamina 자산](https://dreamina.capcut.com/ai-video/video-assets) | 캔버스 검색·선택 도구, `lib/board-edit.ts` | 노드 검색·복제·그룹·실행 취소/다시 실행을 코드에 반영했다. 보드 단위 테스트와 Shift 다중 선택·내부 연결을 포함한 복제·그룹 동시 이동의 브라우저 확인 통과 |
| 자산·생성 기록 | Newtake는 생성 기록·저장 에셋·업로드와 프로젝트·매체 필터, Dreamina는 자산 관리 및 유형별 기록을 화면에서 확인 | 자산 라이브러리와 실행 이력, `components/AssetLibrary.tsx` | 현재 프로젝트의 노드와 실행 결과를 검색·유형 필터로 탐색하고 파일을 가져오는 코드가 연결됐다. 프로젝트 간 재사용은 제공하지 않으며 브라우저 통합 확인 필요 |
| 기획 에이전트·참조 | Newtake Agent의 `@` 참조·모델·Skill, Dreamina의 채팅과 요소 멘션 화면 관찰 | 에이전트 패널, `lib/director.ts`, `lib/run-input.ts` | 감독안·검토와 역할별 참조 구현. 전송 입력과 연출 확인용 참조를 구분 |
| 요청별 자료 첨부 | Dreamina 채팅의 업로드·애셋 선택과 Newtake의 첨부 메뉴 관찰 | 에이전트 요청의 파일 첨부·공개 HTTPS 링크 | 프로젝트별 문서 텍스트·이미지·영상 프레임과 링크 본문을 작업별 지원 범위에 따라 전달한다. 영상 음성 전사는 미지원. [지원 형식](production-agent-guide.md#에이전트에-자료-첨부) |
| 이미지·영상 생성 | 양쪽의 이미지·영상 진입점 관찰. Dreamina는 참조와 영상 노드 연결을 공식 설명. [Dreamina 제작](https://dreamina.capcut.com/ai-video/best-ai-canvas) | 노드 선택 → 에이전트 → 공급사 → 모델 → 작업 방식 | Higgsfield·Kling 공식 CLI와 Topview 공식 MCP에서 모델 사양을 읽고 옵션·참조 슬롯을 직접 적용한다. [제공자 안내](providers.md) |
| 타임라인·프리비즈·오디오 | Dreamina 타임라인·오디오 버튼 화면 관찰. 공식 안내는 미디어 배열·트림·음향과 미리보기를 설명. [Dreamina 영상 자산](https://dreamina.capcut.com/ai-video/video-assets) | 스토리보드·타임라인, `components/TimelineStudio.tsx`, `lib/timeline.ts` | 이미지·영상·빈 카드와 음향 레이어, 하드컷·0.5초 디졸브를 로컬 MP4로 합성한다. 타임라인은 최대 7분·60컷·40개 음향 큐이며 64 MiB 출력 제한이 있다. 7분·60컷·40개 음향 경계 검증과 영상 원음·이미지·효과음·디졸브, 세로 빈 카드의 소형 FFmpeg 렌더 테스트 통과. 7분 실렌더와 브라우저 전체 흐름은 미검증. 외부 편집기 프로젝트 형식 내보내기는 미지원 |
| Director·Cinema·조명 | Newtake 모든 기능에서 Director Studio·3D Director·이미지 조명, Dreamina 도구막대에서 Cinema Kit·3D 디렉터 콘솔 확인. [Newtake Director Studio](https://www.newtake.ai/director-studio) | 로컬 디렉터 도구, `components/DirectorStudio.tsx` | 로컬 카메라·배우·소품 배치와 이미지의 자르기·회전·밝기·대비·채도 조절 코드가 연결됐다. 원근 좌표·원본 보존 단위 테스트를 통과했고 실제 브라우저에서 샷의 연출 확인용 배치도를 저장한 뒤 재조회했다. 제공자의 생성형 시네마·조명 편집은 미지원 |
| Switch·스마트 편집 | Newtake 기능 메뉴에서 Switch, 이미지 요소/레이어 편집과 영상 리메이크·제거 도구 관찰. 공식 안내는 참조 동작 전이와 대상 교체를 설명. [Newtake Switch](https://www.newtake.ai/landing/switch) | 테이크 스위치 노드와 영상 노드의 Higgsfield Seedance 리메이크·이어쓰기 | 영상 원본 하나를 참조해 `video_edit` 또는 `video_extension`을 요청한다. 시작·끝 프레임은 해당 모드에서 사용할 수 없다. CLI 모델 스키마와 모의 테스트로 확인했으며 유료 생성은 미검증이다. 동작 전이·피사체 교체·누끼·생성형 영역/레이어 편집은 별도 제공자 기능이다. [리메이크](https://open.higgsfield.ai/models/bytedance/seedance-2.5/video-edit/api-reference), [이어쓰기](https://open.higgsfield.ai/models/bytedance/seedance-2.5/video-extend/api-reference) |
| 음향 생성 | Dreamina 오디오 진입점과 Newtake 오디오 편집 메뉴 관찰 | 음향 큐와 Road Music 로컬 실행 경로, `lib/road-music.ts` | Road Music 로컬 CLI에 준비·실행·작업 번호·결과를 연결했다. 모의 CLI와 결과 검증 테스트 통과. 실제 엔진 생성·청취는 미검증 |
| 로컬 미디어 도구 | Newtake의 프레임 캡처·구간 잘라내기·음성 분리와 오디오 속도 메뉴 관찰 | 영상 또는 음향 노드 선택 → 미디어 도구, `lib/clip-tools.ts` | 프레임·3×3 콘택트 시트·음향 추출과 구간·속도·화면비 편집을 새 파일로 만든다. 실제 FFmpeg 테스트 통과. 구간 및 결과 각 2분, 64 MiB 이하 |
| 파일 업로드와 내보내기 | 양쪽 화면의 장치 업로드/자산 선택 관찰. Dreamina는 여러 후반 편집 포맷을 공식 설명 | 노드 첨부, MP4 및 프로젝트 JSON 내보내기 | 이미지·영상 업로드와 기본 하드컷 합성 검증 기록 있음. 외부 편집기 프로젝트 형식은 미지원 |

두 서비스의 메뉴 표시가 이 계정에서의 생성 성공, 크레딧 요금이나 출력 품질을 보장하지 않는다. 세부 관찰과 미확인 범위는 각 실측 문서를 따른다. 코드 테스트 결과와 실제 계정·브라우저 검증 범위는 구분한다.
