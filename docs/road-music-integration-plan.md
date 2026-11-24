# Road Music 오디오 연동 설계

조사일 2026-11-22. Road Music의 CLI 0.1.1과 소스, 문서 및 `music-road-music-skills`의 YuE 스킬을 확인했다. 아래는 연동 설계이며 Omni AI Canvas의 현재 구현 기능을 뜻하지 않는다.

## 지원 범위와 근거

| 용도 | Road Music의 현재 계약 | Omni AI Canvas 적용 |
| --- | --- | --- |
| 연주곡·BGM | `song:generate`의 `engine: "ace"`, `instrumental: true`, `style`, `targetSeconds` | 무보컬 의도와 원하는 장면 분위기를 명시하고 실제 결과를 청취한다. |
| YuE 곡·연주곡 | `yue-mlx`는 Apple Silicon, `yue`는 Windows NVIDIA. `instrumental: true`는 무보컬을 보장하지 않으며 길이도 목표값 그대로 보장하지 않는다. | 명시된 엔진을 유지하고 원문·정리본·실제 길이·절단 여부를 기록한다. |
| 효과음 | `engine: "ace"`, `soundEffect: true`, `style`, `targetSeconds: 1..30`의 실험 기능. 10초 미만은 최소 10초를 생성한 다음 자른다. | 음악 모델 기반 효과음으로 표시하고 결과를 직접 검수한다. 전용 효과음 모델은 확인하지 못했다. |
| 파일 기반 수동 효과음 | 사용자 제공 파일을 가져와 장면의 시점에 배치 | Omni AI Canvas 오디오 자산과 믹스 기능을 구현한 후 제공한다. |

ACE 워커는 효과음에 `sound effect, no music, no vocals`를 붙여 `text2music`을 실행하고 WAV 및 결과 메타데이터를 저장한다. 효과음에서 악보 계획·커버·녹음 조합은 지원하지 않는다. 현재 `song:prepare`는 입력 가사를 효과음의 `[instrumental]`로 교체하고 `changes`에 표시할 수 있으므로 Omni AI Canvas는 효과음 요청에 가사를 보내지 않고 사용자 원문을 보존한다. 근거는 Road Music의 `python/ace_worker.py`, `renderer/generation-options.js`, `docs/cli-reference.md`와 `docs/yue-cli-workflow.md`다.

## 스킬 선택과 준비 입력

주제가·가창곡은 `yue-music` → `yue-style-engineer` 및 가사 검토 → `yue-pre-generation-check` → `yue-result-review` 순으로 진행한다. 마스터 음원이 필요할 때 `yue-mastering`을 적용하고 장면 안의 대사 밸런스는 Omni AI Canvas의 최종 믹스에서 맞춘다. 효과음은 서비스 저장소의 `road-music-ace` 경로를 쓴다. [YuE 스킬 진입점](../.agents/skills/yue-music/SKILL.md) · [서비스 CLI 계약](https://github.com/roadkwonai/music-road/blob/e076868/docs/cli-reference.md)

다음 두 입력을 서비스 저장소의 `node cli/road-music.js song:prepare --stdin`에 각각 전달해 `valid: true`를 확인했다. 첫 음원은 필요한 음악 구간을 나중에 잘라 쓰는 방식이고, 둘째 음원은 장면의 3.6초 지점에 맞출 짧은 효과음이다.

```json
{"title":"영사실의 숨","engine":"ace","style":"restrained low strings, sparse warm instrumental drone, quiet room","instrumental":true,"targetSeconds":30,"count":1}
```

```json
{"title":"영사기 스위치","engine":"ace","style":"single dry mechanical switch click in a quiet projection booth, short metallic decay","soundEffect":true,"targetSeconds":3,"count":1}
```

## 실제 호출과 상태

1. `node <Road Music 경로>/cli/road-music.js schema --json '{"command":"song:generate"}'`와 `yue:capabilities`는 로컬에서 읽는다. `song:prepare`는 같은 JSON을 생성 없이 검증하고 `valid`, `errors`, `notes`, `changes`, `effective`, `nativeRequest` 및 YuE `officialGuide`를 돌려준다. 실제 실행 환경의 스키마와 엔진 준비 상태를 사용한다.
2. 사용자 요청, 엔진, 스타일, 길이, 가사와 정리 결과를 검토한 뒤 `song:generate`를 한 번 제출한다. 기본 응답의 `result.jobId` 또는 `result.jobs[*].jobId`를 저장한다. `count`는 명시된 수만 제출한다.
3. `job:wait`는 작업 ID와 `timeoutMs`를 받는다. 타임아웃은 작업 실패를 뜻하지 않으므로 같은 ID로 조회를 이어간다. 연결 불명확 상태인 `uncertain:true`에서는 자동 재제출하지 않고 `service:status --no-start`, `queue:list --no-start`, 결과 목록을 확인한다. Road Music의 `requestId`는 제작 기록 식별자로 문서화되어 있으므로 생성 요청 자체의 멱등 보장으로 가정하지 않는다.
4. 성공한 `song.dir`과 `audio` 및 `song:detail` 결과를 확인한다. 도구가 돌려준 실제 경로를 사용하며 프로젝트 파일 경계를 검사한 후 Omni AI Canvas 자산으로 복사한다. 원본을 덮어쓰거나 이동하지 않는다.
5. `ffprobe`로 실제 길이·코덱·채널·샘플레이트를 확인하고 전체 디코딩을 검사한다. YuE는 `truncated.abc`와 `truncated.semantic`을 각각 기록한다. 청취 여부와 자동 검사를 별도로 표시한다. 무보컬과 효과음의 음악·음성 누출, 시작·끝 및 루프 경계는 청취로 판정한다.

CLI는 독립 엔진이 아니라 로컬 Road Music 서비스와 사용자 라이브러리를 사용한다. 서비스가 없으면 보통 첫 서비스 명령이 앱을 시작할 수 있으므로 상태 조회에는 `--no-start`를 사용하고, 실행 시에는 앱 시작을 사용자에게 표시한다. 실행 환경이 준비되지 않았으면 설치를 자동으로 시작하지 않는다.

## Omni AI Canvas에 필요한 데이터 계약

현재 Omni AI Canvas의 `Asset`과 `lib/media.ts`는 이미지·영상만 허용한다. 향후 오디오 추가 시 형식별 서명 검증, 허용 크기, 안전한 로컬 경로, HTTP Range 재생, 업로드·다운로드 및 그래프 검증을 함께 확장한다. `audioCue` 노드가 음악·효과음·환경음 자산을 보유하고 프리비즈에서 큐를 샷 기준 시간에 배치한다. 다음 정보를 별도 실행 기록에 남긴다.

```json
{
  "purpose": "bgm | sfx | ambience",
  "source": "road-music | imported",
  "engine": "ace | yue-mlx | yue",
  "request": {"style": "사용자 요청", "targetSeconds": 3, "instrumental": true, "soundEffect": true},
  "prepared": {"changes": {}, "effective": {}, "nativeRequest": {}},
  "externalId": "Road Music이 반환한 jobId",
  "state": "queued | running | succeeded | failed | uncertain",
  "audio": {"assetId": "Omni AI Canvas 자산 ID", "durationSeconds": 3, "codec": "실측값", "sampleRate": 48000, "channels": 2, "sha256": "파일 해시"},
  "review": {"decode": "pass | fail | pending", "listening": "pass | fail | pending", "vocalLeak": "pass | fail | unknown", "truncated": {"abc": false, "semantic": false}}
}
```

위 JSON은 **Omni AI Canvas에서 제안하는 매니페스트**다. 실제 Road Music 응답이라고 가정하지 않는다. 해당하지 않거나 측정 전인 값은 `null` 또는 생략하며 예시 값으로 검수 성공을 기록하지 않는다. 내부 절대 경로와 프롬프트 원문은 서버에 보관하고 클라이언트에는 필요한 정보만 전달한다. 제공자의 `jobId`, 파일 해시, 버전과 편집 이력은 변환본과 연결한다.

**중복 제출과 복구 기준.** 첫 구현은 큐 한 개에 `count: 1`로 요청한다. 제출 전에 Omni AI Canvas의 요청 ID, 입력 스냅샷, 선택 엔진과 제출 시각을 기록한다. 작업 번호가 반환되면 결과 대기 전에 `runs.external_id`에 저장하고 이후 조회는 그 번호만 사용한다. 제출 성공 여부와 번호를 모두 알 수 없으면 결과를 ‘미확정’으로 표시하고 큐·산출물·제작 기록에서 같은 작업을 찾는다. 유일하게 대조되는 경우에만 연결을 복구한다. 식별할 수 없을 때는 자동으로 새 작업을 만들지 않고 제작자가 확인 후 새 요청을 선택하게 한다. 복수 후보를 지원할 때에는 Road Music의 최대 8개를 단일 외부 ID에 덮어쓰지 않고 후보별 실행 행에 대응시킨다.

## 컷 믹스 연동 단계

현재 Omni AI Canvas의 컷 내보내기는 영상 노드 목록을 받는다. 후속 단계에서 오디오 타임라인 입력을 추가한다. 각 트랙은 자산 ID, 시작 시각, 원본 인·아웃, 게인과 페이드 값을 명시하고, 컷 길이 밖의 구간과 파일 형식·경로를 서버에서 검증한다. FFmpeg는 인수 배열로 실행하고 사용자 문자열을 셸 명령으로 조합하지 않는다. 클립 원본과 오디오 원본을 보존하고 새 결과 파일에 믹스한다.

최소 순서는 컷 순서와 길이 확정 → BGM 배치·트림·페이드 → 장면별 SFX 배치 → 대사와 음악의 밸런스 확인 → 새 영상 생성 → 실제 길이·오디오 스트림·피크·시작과 끝 확인이다. 무음·클리핑·누락 파일·출력 실패는 명시적으로 보고한다. 이 설계에는 Road Music 변경이 필수는 아니다. 별도 SFX 모델이나 결정적 로컬 합성 CLI가 필요해지면 Road Music의 별도 확장 또는 Omni AI Canvas의 FFmpeg 기반 합성 명령을 후속 범위로 검토한다.

## 무부작용 검증 기록

- `--help`, `schema`, `yue:capabilities`, `song:prepare`는 생성·설치 없이 실행했다. 이 컴퓨터의 `yue-mlx` 파일 존재는 감지됐지만 결과는 파일 존재만 검사하므로 엔진의 실행 준비 확인은 별도다.
- ACE SFX 3초 요청은 `valid:true`였고, YuE SFX 요청은 ACE 전용 오류로 거절됐다. ACE SFX에 가사를 함께 넣은 시험은 가사를 `[instrumental]`로 바꿨다.
- `service:status --no-start`는 연결할 소켓이 없어 실패했다. 서비스 시작, 생성, 렌더, 다운로드, 설치와 외부 저장소 변경은 수행하지 않았다.
- 연동 구현 시 준비·오류·타임아웃·불확실 상태의 단위 테스트와 오디오 업로드·Range·믹스의 로컬 픽스처 통합 테스트가 필요하다. 실제 생성 결과의 음질·정확한 길이와 음악/음성 누출은 미검증이다.
