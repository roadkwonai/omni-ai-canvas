# Omni AI Canvas 도메인 용어집

화면의 기본 언어는 한국어다. 영문은 코드, 기술 문서와 제공자 명칭을 연결하는 기준이다. 이 문서는 `lib/types.ts`와 `db/001_initial.sql`의 현재 이름을 따른다.

| 한글 | English | 정의 | 코드·저장 매핑 |
| --- | --- | --- | --- |
| 부제 | Tagline | 대본부터 완성 영상까지 여러 AI 모델을 한 보드에서 쓰는 제작실 | `app/layout.tsx`, `app/page.tsx`, `README.md`, `docs/brand.md` |
| 오미 | Omi mascot | 여러 도구를 다루는 문어 감독. 시작·안내·빈 화면에서만 쓰는 장식 | `components/Brand.tsx`의 `Mascot`, `public/brand/omi-*.webp` |
| 사진 카메라 이동 | Photo camera move | 실사 사진의 깊이를 계산해 만든 카메라 이동 예제 | `scripts/director-photo-moves.mjs`, `public/director/moves` |
| 연출 예제 | Director showcase | 랜딩에서 촬영 기법을 비교하는 실사 예제 묶음 | `lib/director-showcase.ts`, `app/director-showcase.tsx` |
| 브랜드 로고 | Brand mark | O 고리와 노드, 재생 표시로 된 로고 | `components/Brand.tsx`의 `BrandMark`, `app/icon.svg` |
| 서비스 이름 | Omni AI Canvas | 이 앱의 공개 이름. 패키지·저장 폴더는 `scene-room`, DB 스키마는 `drama_canvas`를 유지한다 | `app/layout.tsx`, `README.md` |
| 프로젝트 | Project | 드라마 제작 자료와 연결을 담는 작업 단위 | `Project`, `drama_canvas.projects` |
| 프로젝트 식별자 | Project ID | 프로젝트의 UUID | `projects.id`, `RunInput.projectId`, `runs.project_id` |
| 제목 | Title | 프로젝트 또는 노드의 표시 이름 | `projects.title`, `projects.graph.nodes[].title` |
| 버전 | Version | 저장 충돌을 감지하는 정수 | `projects.version`, `Project.version` |
| 수정 시각 | Updated at | 마지막 갱신 시각 | `projects.updated_at`, `Project.updatedAt`, `runs.updated_at` |
| 그래프 | Graph | 노드와 참조 연결의 묶음 | `Graph`, `projects.graph` JSONB |
| 노드 | Node | 하나의 제작 자료 또는 미디어를 담는 캔버스 항목 | `CanvasNode`, `projects.graph.nodes[]` |
| 노드 종류 | Node kind | 자료의 제작 단계 구분 | `projects.graph.nodes[].kind`, `brief`, `script`, `character`, `keyframe`, `video`, `scenario`, `scene`, `shot`, `referenceImage`, `referenceVideo`, `audioCue`, `previs`, `note`, `switch` |
| 캐릭터 연동 | Character identity | 캐릭터 시트의 외형과 목소리 설정 | `CanvasNode.characterIdentity`, `lib/character-identity.ts` |
| 소울 ID | Soul ID | Higgsfield에서 학습한 인물 외형의 식별자와 모델 유형 | `characterIdentity.soul.{id,variant,status}`, `RunInput.characterSoul` |
| 목소리 ID | Voice ID | Higgsfield 개인 목소리 또는 프리셋의 식별자와 유형 | `characterIdentity.voice.{id,type,status}`, `RunInput.characterVoice` |
| 음성 합성 | Text-to-speech | 선택한 목소리로 입력 대사를 읽어 음향 파일로 만드는 작업 | `TtsSynthesis`, `lib/tts-provider.ts` |
| 로컬 음성 모델 | Local TTS model | 이 컴퓨터의 MLX 워커가 실행하는 Fish S2 Pro·Drama 3 | `LocalTtsModel`, `lib/local-tts.ts`, `scripts/local_tts_worker.py` |
| 목소리 설계 | Voice design | 참조 음성 없이 성별·나이·음색·분위기·장면으로 Drama 3의 새 목소리를 정하는 옵션 | `VoiceDesign`, `LocalTtsOptions`, `lib/local-tts-options.ts`, `components/LocalTtsControls.tsx` |
| 목표 길이 | Target seconds | Drama 3가 대사를 늘여 말할 길이. 글자당 0.2초보다 짧게 정할 수 없다 | `LocalTtsOptions.seconds`, `secondsRange`, `lib/local-tts-options.ts` |
| 다시 연기 | Retake | 이 프로젝트에서 만든 음성을 기준으로 대사나 연기를 바꿔 Drama 3로 다시 만드는 작업 | `retakeOf`, `takeReference`, `lib/tts-reference.ts`, `components/TtsStudio.tsx` |
| 여러 화자 대화 | Dialogue | 대본의 화자별 목소리로 줄마다 합성해 이은 음성 | `DialogueRequest`, `lib/dialogue.ts`, `components/DialogueStudio.tsx` |
| 화자별 목소리 | Cast voice | 화자마다 정한 참조 음성이나 설계한 목소리. 설계는 이름에서 정한 시드로 언제나 같다 | `CastVoice`, `CastChoice`, `castSeed`, `lib/dialogue.ts` |
| 줄 시각 | Marks | 대화 음성에서 줄마다 시작과 끝(초) | `LocalTtsJob.marks`, `lib/local-tts.ts` |
| AI 연기 지시 | Speech direction | 대본에 맞춰 AI가 고른 소리·쉼, 감싸는 지시와 말투. 대사는 바꾸지 않는다 | `DirectedLine`, `lib/speech-direction.ts`, `components/SpeechDirector.tsx` |
| 대본형 줄 | Dialogue row | 화자, 지시, 대사, 상태를 한 줄에 두고 그 자리에서 고치는 대화 단위 | `DialogueRow`, `lib/dialogue.ts`, `components/DialogueLineRow.tsx` |
| 줄 상태 | Line status | 만든 소리와 비교한 새 줄·고침·완성·실패 | `lineStatus`, `lib/dialogue.ts` |
| 지시 태그 | Speech cue | 모델의 지시를 한국어 이름으로 보여주는 표시 | `toKorean`, `fromKorean`, `lib/speech-markup.ts` |
| 로컬 생성 진행 상태 | Local TTS progress | 단계, 진행률, 문장 묶음, 만든 길이, 남은 시간 | `LocalTtsProgress`, `lib/local-tts-progress.ts`, `components/LocalTtsProgress.tsx` |
| 참조 음성 | Voice reference | 로컬 모델이 목소리를 따라 만들 때 듣는 짧은 음원과 그 원문 | `lib/tts-reference.ts`, `.scene-room/tts-references` |
| 목소리 목록 태그 | Voice catalogue tags | Fish Audio가 목소리에 부여한 분류 값과 이에 근거한 성별 필터 | `TtsVoice.tags`, `TtsVoice.gender`, `TtsFilters` |
| Fish Audio 목록 캐시 | Fish Audio catalogue cache | 공개 목소리의 원문, 한국어 번역, 공급사 태그와 언어 코드, 미리듣기 URL을 보관하는 작업실 DB의 목록 | `drama_canvas.fish_voice_catalog`, `drama_canvas.fish_voice_sync`, `drama_canvas.fish_voice_tag_translations`, 정렬 인덱스 `db/015_fish_voice_sort_indexes.sql` |
| 목소리 등록 샘플 | Voice enrollment sample | 캐릭터 시트에 보관해 Higgsfield 개인 목소리 등록에 선택할 수 있는 로컬 음향 | `characterIdentity.voiceSample`, `components/CharacterIdentityPanel.tsx` |
| 기획 문서 | Brief | 드라마의 아이디어와 기획 자료 | `kind: "brief"` |
| 문서 보기 | Node document preview | 문서형 노드의 마크다운 읽기·편집·내려받기 화면 | `components/NodeDocumentDialog.tsx`, `components/NodeMarkdown.tsx` |
| 노드 미리보기 | Node preview | 노드 전체 본문과 첨부 이미지·영상·음향을 보는 화면 | `components/NodePreviewDialog.tsx`, `components/NodePreviewBody.tsx` |
| 한국어 프롬프트 | Korean prompt | 생성용 영문 프롬프트와 함께 생성·저장되는 한국어 버전 | `CanvasNode.promptKorean.text`, `RunResult.promptKorean.text` |
| 시나리오 | Script | 장면과 대사를 정리한 대본 | `kind: "script"` |
| 시나리오 개요 | Scenario | 작품의 줄거리와 인과관계를 정리한 자료 | `kind: "scenario"` |
| 씬 구성 | Scene | 한 장면의 목적, 장소와 전환을 정리한 자료 | `kind: "scene"` |
| 캐릭터 시트 | Character sheet | 등장인물의 외형과 성격 등 참조 자료 | `kind: "character"` |
| 키프레임 | Keyframe | 영상 장면을 대표하는 이미지 또는 설명 | `kind: "keyframe"` |
| 영상 | Video | 장면 영상과 그 제작 지시 | `kind: "video"` |
| 본문 | Body | 노드에 저장된 텍스트 | `projects.graph.nodes[].body` |
| 위치 | Position | 캔버스상의 노드 좌표 | `projects.graph.nodes[].x`, `y` |
| 배치 최적화 | Canvas layout optimization | 측정한 카드 크기에 맞춰 겹치거나 가까운 노드를 이동해 간격을 확보하는 기능 | `optimizeBoardLayout`, `lib/board-layout.ts` |
| 연결 | Edge | 한 노드를 다른 노드의 참조로 잇는 방향 관계 | `projects.graph.edges[].source`, `target`, `role`, `usage` |
| 연출 확인용 | Guide | 연출 확인에 사용하며 생성 입력에서 제외하는 연결 | `projects.graph.edges[].usage = "guide"` |
| 생성 입력 | Generation input | 생성 작업의 참조로 전달하는 연결 | `projects.graph.edges[].usage = "input"` 또는 생략 |
| 미디어 자산 | Asset | 이미지 또는 영상 파일의 참조 | `Asset`, `projects.graph.nodes[].asset` |
| 자산 주소 | Asset URL | 저장된 미디어를 읽는 경로 | `asset.url` |
| 자산 유형 | Asset type | 이미지 또는 영상 구분 | `asset.type`의 `image`, `video`, `audio` |
| 자산 이름 | Asset name | 사용자가 확인하는 파일 이름 | `asset.name` |
| 제공자 | Provider | 작업을 수행하거나 결과를 만드는 AI 서비스. 화면과 사용 가이드에서는 **서비스**라고 쓴다 | `Provider`, `runs.input.provider` |
| 기본 에이전트 설정 | Agent defaults | 따로 선택하지 않은 노드에 적용할 작업 종류별 제공자·모델 | 브라우저 설정, 실행 시 `runs.input.provider`, `runs.input.model` |
| 작업 공간 설정 | Workspace preferences | 도구함 시작 탭과 우측 시작 화면 및 너비 | `scene-room-workspace-v1`, `WorkspacePreferences` |
| 제작 지침 | Node guidance | 특정 노드의 작업에 적용하는 레시피와 사용자 지시 | `projects.graph.nodes[].guidance`, `runs.input.target.guidance` |
| 프로젝트 대화 | Project conversation | 선택한 노드와 제작 지침으로 질의하는 프로젝트별 스레드 | `runs.input.chat.threadId`, `nodeIds`, `recipeIds`, `history` |
| 제작 프리셋 | Production style preset | 타입별 콘셉트, 선택 기법, 아홉 가지 연출 항목과 구간별 비트를 다시 쓸 수 있게 저장한 값 | `drama_canvas.style_presets.draft`, `StylePresetDraft` |
| 컷 분석 시트 | Cut contact sheet | 번호와 원본 시각을 붙여 에이전트에 보내는 컷별 화면 묶음 | `AttachmentContent.analysisSheets`, `cutAnalysis.samples`, `referenceTiming.cutTimes` |
| 컷 해석 | Cut review | 관찰한 컷별 구도·자막·시간 변화 | `runs.result.cutReview[]`, `runs.input.presetDesign.analyzedCuts` |
| 수동 컷 경계 | Manual cut boundary | 제작자가 원본 시각에 추가하거나 제거해 새 분석에 사용한 편집점 | `cutAnalysis.boundarySource`, `referenceTiming.cutTimes` |
| 모션 감독안 | Motion design | 구독 에이전트가 제안한 렌더 가능한 장면 명세 | `runs.input.motionDesign`, `runs.result.motionSpec`, `projects.graph.nodes[].motionShort` |
| 비트 시트 | Beat sheet | 전체 길이에 대한 구간 종료 비율, 구간 역할, 구도와 자막 지시 | `StylePresetDraft.beats[]`, `endPercent`, `label`, `framing`, `caption` |
| 분석 근거 | Reference evidence | 로컬에서 측정한 영상 길이·컷 후보·대표 화면의 시각과 제작자가 남긴 관찰 | `AttachmentContent.referenceTiming`, `frames`, `StylePresetDraft.evidence` |
| 스타일 제안 | Preset proposal | 선택한 에이전트가 제시하고 사용자가 검토할 수 있는 프리셋 초안 | `runs.input.presetDesign`, `runs.result.stylePreset` |
| 활성 제작 스타일 | Active production style | 프로젝트별로 선택해 감독과 프로젝트 대화에 전달하는 스타일 사본 | `runs.input.director.stylePreset`, `runs.input.chat.stylePreset`, 브라우저 `scene-room-direction:<projectId>` |
| 모션 숏 | Kinetic typography short | 장면의 짧은 문구를 페이드·확대·상승 효과로 연결한 영상 | `MotionShortSpec`, `/api/projects/[id]/motion-short`, 영상 노드의 `asset` |
| 모델 사양 | Media model profile | 공급사에서 조회한 모델과 작업 방식별 옵션·참조 조건 | `MediaProfile`, `/api/providers/media-model` |
| 참조 입력 슬롯 | Media input slot | 시작 프레임, 끝 프레임, 참조 영상처럼 각 파일이 들어갈 모델 입력 | `MediaSlot`, `runs.input.media.assignments` |
| 생성 모드 | Generation mode | 한 모델이 제공하는 텍스트 생성, 참조 생성, 편집 등의 작업 방식 | `runs.input.media.mode` |
| 작업 유형 | Operation | 기획, 텍스트, 이미지, 영상 요청 구분 | `Operation`, `runs.input.operation`의 `plan`, `text`, `image`, `video`, `audio` |
| 실행 작업 | Run | 고정된 입력을 가진 생성 요청과 그 결과 | `Run`, `drama_canvas.runs` |
| 요청 식별자 | Request ID | 같은 요청의 재전송을 식별하는 UUID | `runs.request_id`, `runs.input.requestId`, 프로젝트와 조합해 유일 |
| 첨부 매니페스트 | Attachment manifest | 프로젝트별 실행 첨부의 추출 내용과 미디어 참조 | `.scene-room/attachments/<project-id>/`, `AttachmentRecord` |
| 입력 스냅샷 | Input snapshot | 실행 시 고정된 프롬프트와 참조 | `runs.input`, `RunInput.prompt`, `references` |
| 실행 상태 | Run status | 작업의 대기·실행·성공·실패 상태 | `runs.status`의 `queued`, `running`, `succeeded`, `failed` |
| 실행 결과 | Run result | 제공자가 돌려준 텍스트, 자산 또는 제안 그래프 | `runs.result`, `RunResult.text`, `asset`, `plan` |
| 실행 오류 | Run error | 실패하거나 결과를 확인할 수 없는 이유 | `runs.error` |
| 실행 시각 | Created at | 실행 작업이 생성된 시각 | `runs.created_at`, `Run.createdAt` |
| 컷 내보내기 | Cut export | 선택한 영상 노드를 지정 순서대로 하나의 MP4로 합성하는 작업 | `/api/projects/[id]/exports`, `nodeIds`, 반환된 `asset` |

제품 목표와 기능 범위는 [프로젝트 개관](project.md)과 [PRD](docs/PRD.md), 데이터 흐름은 [아키텍처](docs/architecture.md)를 참조한다.

실행 이력의 제공자 작업 번호는 `drama_canvas.runs.external_id`, 적용한 DB 마이그레이션은 `drama_canvas.schema_migrations.name`에 기록한다.

## 연출 확장 용어

샷·레퍼런스 노드와 참조 역할은 현재 그래프에 포함된다. 프리비즈·오디오 큐와 촬영 배치가 그래프에 포함되며 그래프 스키마 버전은 후속 설계다. 대본은 기존 `script`의 본문을 재사용한다.

| 한글 | English | 정의 | 코드·저장 위치 또는 계획 |
| --- | --- | --- | --- |
| 완료 결과 기록 | Run outbox | DB에 반영하기 전 로컬에 보관한 실행 결과 | `.scene-room/run-outbox/<projectId>/<runId>.json` |
| 실행 이력 커서 | Run history cursor | 같은 생성 시각의 실행도 고유 ID부터 구분하는 다음 페이지 위치 | `RunCursor`, `readRunPage` |
| 작업실 서버 키 | Workspace API credential | 로컬 워커에서 쓰는 API 키와 등록 경로 | `.scene-room/service-settings`, `readSecret` |
| 비트 | Story beat | 장면에서 인물의 목적·감정·행동이 변하는 순간 | 대본에서 샷 분할로 이어지는 단위 |
| 샷 | Shot | 촬영 의도, 카메라, 연기, 길이를 함께 정의한 한 컷 | `projects.graph.nodes[].kind = shot` |
| 레퍼런스 이미지 | Reference image | 인물·장소·소품 상태·화면 질감의 기준 이미지 | `kind = referenceImage`와 기존 `asset` |
| 레퍼런스 영상 | Reference video | 연기, 동선, 카메라 움직임의 기준 영상과 선택 구간 | `kind = referenceVideo`와 클립 입·출점 |
| 참조 역할 | Reference role | 한 자산이 특정 샷이나 생성 요청에서 맡는 용도 | `projects.graph.edges[].role` |
| 연속성 고정값 | Continuity lock | 후속 컷에서도 유지할 얼굴·의상·소품·빛·공간 상태 | 샷에서 참조하는 승인본과 버전 |
| 프리비즈 / 애니매틱 | Previsualization / Animatic | 본 촬영 전에 샷과 소리의 순서·길이를 시험하는 설계 / 그중 시간축을 가진 시안 영상 | `kind = previs`, 패널과 큐 배치 |
| 테이크 | Take | 같은 샷 명세에서 발생한 개별 생성 또는 촬영 결과 | 기존 `runs.result`, 채택한 구간 |
| 촬영 룩 | Film look | 색감·대비·그레인·광원에 대한 창작 의도 | 샷의 룩 설정 및 실행 스냅샷 |
| 3D 장면 명세 | Blender scene specification | 캐릭터와 환경, 본 회전·클립, 카메라·조명·출력 설정 | `CanvasNode.blenderScene`, `BlenderSceneSpec`, `projects.graph.nodes[]` |
| 3D 렌더 테이크 | Blender render take | 같은 샷의 프리비즈 또는 최종 MP4와 당시의 장면 명세 | 영상 노드의 `asset`·`blenderTake.quality`·`blenderTake.scene` |
| 엘리먼트 | Character / product element | 제작자 계정에서 관리하는 배역·소품 참조. Omni AI Canvas에서는 상태와 파일을 참조 노드로 연결 | `referenceImage`, `referenceVideo`, `audioCue`, 연결의 `role`과 `usage` |
| 선택 지침 | Selected production guide | 제작자가 선택한 저자 스킬·공식 스킬·Omni AI Canvas 연출 요약 | `CanvasNode.guidance.skillIds`, `DirectorOptions.skillIds`, `RunInput.target.guidance.guideSnapshot` |
| 추가 배역 | Additional 3D actor | 샷에 독립 위치·모델·포즈·동작을 갖고 등장하는 배역 | `BlenderSceneSpec.actors` |
| 편집 화면 | Timeline edit preview | 영상을 합성하지 않고 컷·음향·자막의 순서를 브라우저에서 재생하는 화면. 완성 영상인 프리비즈·납품본과 구분한다 | `components/TimelineMonitor.tsx`, `lib/timeline-layout.ts`의 `layersAt`, `audioGainAt` |
| 단어 구간 | Timed word | 타임라인의 30fps 기준 시작·끝 시각과 단어 | `TimelineSpec.words`, `TimelineWord` |
| 입 모양 큐 | Lip cue | 배역의 입 모양 shape key 강도를 시간에 따라 정하는 지시 | Blender 장면 명세의 `lipCues` |
| 음향 큐 | Audio cue | 음악·효과음·환경음·녹음할 목소리의 용도와 재생 위치 | `kind = audioCue`, `asset.type = audio`, `timeline.audio` |
| 보이스오버 | Voice-over (VO) | 화면의 발화와 분리된 내레이션 또는 인물의 속마음 | `lib/director.ts`의 `dialogue.delivery` 값 `narration`, `innerMonologue`, 대본 표기 `[VO]` |
| 현장 밖 대사 | Off-screen dialogue (OS) | 같은 씬에서 문 너머나 무전기처럼 화면 밖 출처에서 들리는 대사 | `lib/director.ts`의 `dialogue.delivery = os`, 대본 표기 `[OS]` |
| VO 편집 위치 | Voice-over placement | 시작 샷 번호와 샷 시작 기준 오프셋, 계획 발화 시간 | `lib/director.ts`의 `dialogue.placement`에 `shot`, `offsetSeconds`, `durationSeconds`, 결과는 `timeline.audio`의 30fps 시작 프레임과 길이 |
| 폴리 / 환경음 | Foley / Ambience | 화면 동작과 맞춘 소리 / 장면 공간의 지속음 | 효과음·환경음 큐 |
| 입력 모델 형식 버전 | Graph schema version | 그래프의 필드와 역할을 해석할 규칙의 버전 | `projects.graph.schemaVersion`, 편집 충돌용 `projects.version`과 별도 |

## 프로젝트 관리와 계정

작업실(Workroom)은 캔버스 오른쪽에서 대화, 제작, 노드, 지침, 기록을 여는 패널이다. `components/Studio.tsx`에서 열고 탭별 용도는 `components/workroom-guide-content.ts`에 정의한다.

작업실 공용 설정(Workspace settings)은 브라우저 간 공유하는 기본 에이전트, 작업 공간 배치, 별도 과금 이미지 API 허용 목록이다. `drama_canvas.workspace_settings`와 `lib/workspace-settings.ts`에 정의한다.

| 한글 | English | 정의 | 코드·테이블 |
| --- | --- | --- | --- |
| 프로젝트 카테고리 | Project category | 프로젝트의 대표 분류 한 개 | `drama_canvas.projects.category` |
| 프로젝트 태그 | Project tag | 검색과 추가 분류에 쓰는 라벨 | `drama_canvas.projects.tags` |
| 공유 분류 | Shared classification | 여러 프로젝트에서 선택해 쓰는 카테고리 또는 태그. 사용처가 없어도 등록 상태를 유지한다. | `drama_canvas.project_classifications` |
| 최근 활동 | Recent activity | 프로젝트를 마지막으로 열거나 변경한 시각 중 늦은 값 | `drama_canvas.projects.last_opened_at`, `updated_at` |
| 보관함 | Archive | 기본 목록에서 치우고 복원할 수 있도록 보관한 상태 | `drama_canvas.projects.archived_at` |
| 휴지통 | Trash | 삭제 요청 후 복구할 수 있는 상태 | `drama_canvas.projects.deleted_at` |
| 계정 조회 | Account status | 공급사 공식 경로에서 확인한 요금제·잔여량·모델 | `ProviderInfo.account`, `ProviderInfo.models` |
| 추론 강도 | Reasoning effort | 에이전트가 응답 전 추론에 할당하는 단계 | `ProviderModel.efforts`, `runs.input.effort` |

## 제작 형식과 이미지 편집

노드 디렉터 스튜디오(Node Director Studio)는 이미지·영상에 전달할 촬영, 색감, 조명, 미술, 내러티브를 한 노드에 설정하는 창이다. 값은 `CanvasNode.directorNote`에 저장되고 `lib/run-input.ts`에서 생성 지시로 구성된다. `RunInput.imageOutput`은 ChatGPT 이미지 생성 경로에 보내는 화면비·목표 해상도·품질 요청이다. 입력 검증은 `lib/image-output.ts`에 있다.

화면 배치(Composition)는 인물의 위치와 비울 공간, 선과 틀로 시선을 이끄는 방법이다. 시선(Gaze)은 인물이 바라보는 방향, 시간 표현(Tempo)은 동작을 늦추거나 압축·정지하는 방법, 창의 시점(Viewpoint)은 소품·반사·틈을 이용한 카메라 위치다. `NodeDirection`의 `composition`, `gaze`, `tempo`, `viewpoint` 값이며 `lib/node-director-presets.ts`에서 정의한다.

초점 거리 세부 이미지(Focal detail layer)는 예제를 확대할 때 해당 화각 위치에 겹치는 고해상도 이미지다. `lib/node-director-direction.ts`의 `directorFocalLayers`에서 정의한다. 광학 효과 예제(Optics example)는 같은 장면에서 카메라·렌즈·조리개만 바꾼 결과 사진이며 `optics-base.webp`가 비교 기준이다.

촬영 지시 펼치기(Direction expansion)는 저장한 기법 이름에 영문 이름과 구체적인 지시(`spec`)를 붙여 요청을 만드는 과정이다. `lib/node-director-direction.ts`의 `directorRequestText`가 처리하고 정지 이미지 요청에서는 카메라 이동·시간 표현·편집 리듬을 뺀다.

로컬 참고 예제(Director reference)는 제작자 컴퓨터의 `.scene-room/research/cineguide`에만 보관하는 제3자 예제 영상과 이미지다. 목록은 `manifest.json`, 조회는 `lib/director-references.ts`와 `/api/director-references`에서 한다.

초점 거리(Focal length)는 가로 화각에 영향을 주는 렌즈의 광학적 거리로 mm를 사용한다. 디렉터 스튜디오에서는 풀프레임 36mm 폭을 기준으로 예제 화각을 비교한다. 장면 전개(Scene progression)는 보여주는 사건 순서, 장르(Genre)는 장면의 이야기 유형, 편집 리듬(Editing rhythm)은 컷의 길이와 전환 속도다. `lib/node-director-direction.ts`와 `lib/node-director-presets.ts`에서 정의한다.

감정판(Emotion grid)은 친밀도와 흥분도의 5×5 기준점과 연속 좌표에서 이미지 생성의 목표 표정을 고른다. 기준점을 누르거나 드래그하면 가까운 기준 표정 사진과 이름을 표시한다. 화면은 `components/ImageEditStudio.tsx`, 기준 포즈 및 이름은 `lib/direction-face-poses.ts`, 저장값은 `ImageEditSpec.settings.warmth`와 `arousal`이다.

| 한글 | English | 정의 | 코드·테이블 |
| --- | --- | --- | --- |
| 제작 형식 | Production profile | 프로젝트 시작 보드와 추천 도구·지침을 선택하는 분류. 무형식에서는 비어 있다. | `Project.productionProfileId`, `Project.productionSettings`, `lib/production-start.ts` |
| 씬 수 | Scene count | 감독 기획에 적용할 고정 씬 수 1~12 또는 시나리오를 바탕으로 정하는 자동 모드 | `SceneCount`, `Project.productionSettings.sceneCount`, `DirectorOptions.sceneCount` |
| 기본 노드 역할 | Starter node role | 형식의 기본 구성을 다시 적용할 때 기존 노드와 대응시키는 식별자 | `CanvasNode.productionRole` |
| 보드 프리셋 | Board preset | 비어 있는 입력 자리, 노드 구조, 연결과 지침 선택을 재사용하는 보드 사본 | `drama_canvas.board_presets`, `lib/board-preset-store.ts` |
| 원본 이미지 편집 | Source image edit | 원본을 참조로 고정한 별도 키프레임 작업 | `CanvasNode.imageEdit`, `RunInput.imageEditSource`, `lib/image-edit.ts` |
| 시트 셀 채택 | Grid cell adoption | 배열의 지정 칸을 잘라 원본 시트와 연결된 키프레임으로 저장 | `POST /api/projects/[id]/portrait-grid`, `adopt` |
| 연출 설정 | Image direction settings | 기능별 조명·표정·카메라·질감과 컷 메모. 실행할 때 같은 값을 스냅샷으로 보관 | `ImageEditSpec.settings`, `RunInput.imageEdit`, `lib/image-edit.ts` |
| 시트 경계 | Sheet crop configuration | 시트 원본과 여백, 칸 간격, 개별 칸의 보정 좌표 | `CanvasNode.portraitGrid`, `lib/portrait-grid.ts` |
| 추출 컷 출처 | Extracted cut provenance | 원본 시트 노드와 이미지, 행·열 및 맞춘 경계를 기록한 컷 정보 | `CanvasNode.gridCell`, `lib/portrait-grid.ts` |
| 노드 평가 | Node rating | 노드에 붙이는 선택 사항인 1~5점 평가 | `CanvasNode.rating` |
| 내 자산 | Saved asset | 노드의 미디어 참조와 본문을 다음 프로젝트에서도 꺼내 쓰기 위해 저장한 항목 | `/api/saved-assets`, `.scene-room/saved-assets/` |
| 로컬 이미지 작업 | Local image operation | 원본 이미지와 배율 또는 회전 설정을 보관하며 결과를 별도 이미지로 연결하는 작업 | `CanvasNode.imageOperation`, `lib/image-operation.ts` |
| Higgsfield 패션 광고 | Higgsfield fashion ad workflow | 기존 광고 안에서 제품 참조, 씬별 영상, 렌즈 전환 계획과 편집을 준비하는 워크플로우 | `Project.productionSettings.workflow`, `lib/ai-ad-board.ts` |
| 렌즈 전환 | Tracked lens transition | 앞 컷 렌즈 안쪽 윤곽의 위치와 원근 변화를 추적해 뒤 컷을 그 안에 합성하고 기존 컷 경계에 맞춰 적용하는 편집 효과 | `lib/lens-transition-spec.ts`, `lib/lens-transition-render.ts` |
| 자동 렌즈 윤곽 | Seeded lens outline | 렌즈 내부 클릭을 기준으로 안경테 대비와 닫힌 윤곽을 찾아 만드는 편집 가능한 다각형 | `lib/lens-outline-detection.ts`, `components/LensTransitionPanel.tsx` |
| 렌즈 기준 윤곽 이동 | Lens anchor transfer | 저장한 윤곽을 바뀐 앞 시작 프레임까지 추적하고 같은 원본 프레임의 보정을 옮기는 작업 | `LensAnchorTransfer`, `transferLensAnchor` |
| 렌즈 추적 중단 보정 | Lens anchor checkpoint | 기준 윤곽을 옮기다 추적이 끊긴 원본 프레임에 기록해 재개에 쓰는 수정 윤곽 | `LensAnchorCheckpoint`, `LensTransitionRecipe.anchorCheckpoints` |
| 렌즈 보정 프레임 | Lens correction frame | 앞 테이크 추적 구간에서 정확한 윤곽을 다시 고정하고 앞 구간의 어긋남과 이후 추적에 반영하는 프레임 | `LensCorrection`, `lib/lens-corrected-track.ts` |
| 렌즈 전환 편집 설정 | Lens transition recipe | 적용한 영상 노드에 보관하는 원본 테이크 자산 및 시작 프레임, 기준 윤곽, 프레임별 보정 | `CanvasNode.lensTransition`, `LensTransitionRecipe` |
| 이전 렌즈 전환 복원 | Legacy lens transition recovery | 편집 설정이 없는 전환의 생성 기록과 앞뒤 컷·가이드 연결을 대조해 현재 경계의 원본 범위를 재구성 | `resolveLegacyLensTransition`, `lib/lens-transition-spec.ts` |
| 수동 렌즈 원본 범위 | Manual lens source ranges | 자동 복원이 어려운 이전 전환에서 연결할 앞뒤 영상 노드와 30fps 기준 0부터의 시작 프레임을 지정하는 입력 | `ManualLensSources`, `resolveManualLegacyLensTransition` |
| 렌즈 원본 프레임 미리보기 | Lens source frame preview | 앞뒤 영상의 30fps 프레임을 한 장씩 확인해 수동 원본 범위 또는 저장된 전환의 시작점을 고르는 화면 | `LensSourceFramePicker`, `previewLensSourceFrame` |
