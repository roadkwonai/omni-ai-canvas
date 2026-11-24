# Higgsfield 제작 사례·스킬 재검토

확인일 2026-11-22. 세 크리에이터 블로그를 Aside 브라우저에서 직접 읽고, 각 페이지의 공개 다운로드 버튼으로 제공되는 스킬 파일을 확인했다. 인물·장소·소품·시퀀스의 실제 첨부와 기획 예시를 확인했으며 유료 생성은 실행하지 않았다. 블로그의 결과, 사용 모델과 비용·품질 설명은 해당 제작자의 사례다.

## 출처와 파일

| 자료 | 페이지에서 실제 확인한 역할 | 로컬 참조·SHA-256 |
| --- | --- | --- |
| 단편 `higgsfield-prompt-engine.skill` | 목표·장애·전술·반전·가치 변화를 다루는 극작 프레임워크 | `.scene-room/research/higgsfield-originals/cinematic-prompt-engine.md` · `da8bd98ef4c8208b46b827c45ef85317c34269c47dba6126320a28dd2551bf23` |
| 단편 `higgsfield-acting-skill.skill` | 씬 전체의 사건을 파악하고 각 인물의 목적·장애·전술·상대 반응을 지시 | `cinematic-acting.md` · `f1a61a1f9572380f79b38b17a4580690370c9e146db1bf3d325e64a57549baa8` |
| 단편 `Anamorphic skill.md` | 초점거리와 시점, 보케·플레어, 조명·필름의 시각적 특징 | `cinematic-anamorphic.md` · `ae747d6972c6974ffaaf582da94093932e947c92873e41d137a8edfbc8c9407b` |
| 단편 `higgsfield-fight-scene.skill` | 페이지에 첨부 파일이 표시된다 | 파일 다운로드와 상세 적용은 수행하지 않았다. Omni AI Canvas는 화면 축·배우 간 거리·시선·컷·리액션과 타이밍 같은 비접촉 촬영 계획을 사용한다 |
| 숏드라마 `Higgsfield - Short Drama Screenwriter.md` | 대본과 참조를 구성하는 지침. 원본에 아이디어 100개가 실제로 들어 있다 | `short-drama-screenwriter.md` · `1faecbba58fbc9e56646d1c109d3c625c7f65cc32fb3bb5d9068264b13f9ddd6` |
| 숏드라마 `Higgsfield - Seedance 2.5 Prompt Writer.md` | 보이는 동작, 참조 역할, 샷·카메라·시간별 프롬프트 | `short-drama-seedance-prompt.md` · `b3e4689edcbbe003ba61aa9dbb403f2baf445221cbb8d8a6c5806490d32d7f7f` |
| 광고 `Higgsfield-Seedance-Prompt-Writer.skill` | 참조와 씬별 카메라·행동·시간 배분, 30초 구간 설계 | `commercial-seedance-prompt.md` · `bced57a261d05e112927adc5f726558dd7ced8b85756ba3f313208eede046f1d` |
| 광고 `Higgsfield-Acting-Director.skill` | 작품의 공동 상황과 인물별 동기, 목표와 반응 | `commercial-acting-director.md` · `42acf13095125a24c09d1d5623778d24288d6ee0e06cd99dc871814ea6f7144d` |

위 표의 축약 파일명은 모두 `.scene-room/research/higgsfield-originals/` 아래다. `.skill`은 ZIP 안의 단일 `SKILL.md`를 읽어 저장했다. 직접 내려받은 일곱 첨부의 본문과 네 ZIP의 파일 목록에서 별도의 재배포 라이선스 표기는 확인하지 못했다. 파일은 이 컴퓨터의 개인 참고 자료로 보관하며 허용 목록과 해시를 확인한 로컬 화면에서 열 수 있다. 원문을 자동 실행하지 않고, AI 실행 프롬프트에는 Omni AI Canvas에서 작성한 독립적인 지침 요약을 선택해 사용한다. 이 첨부들은 공식 GitHub 스킬 저장소에 있는 같은 이름의 공식 스킬이라고 확인되지 않았다.

- [단편 블로그와 첨부](https://higgsfield.ai/ko/@adilinthewildtempo/blogs/make-a-cinematic-ai-short-film-with-higgsfield-the-workflow)
- [광고 블로그와 첨부](https://higgsfield.ai/ko/@adilinthewildtempo/blogs/make-a-realistic-ai-commercial-without-wasting-credits)
- [숏드라마 블로그와 첨부](https://higgsfield.ai/ko/@adilinthewildtempo/blogs/how-to-make-ai-short-drama)

## 스킬 선택과 겹침

| 역할 | 기본 추천 | 겹침을 다루는 방법 |
| --- | --- | --- |
| 이야기와 씬 극작 | 영화는 단편 극작 엔진, 숏드라마는 Screenwriter | 두 자료 모두 씬의 목표·장애·전환을 다룬다. 하나를 주 지침으로 두고 다른 자료의 필요한 기준만 추가한다. 100가지 소재는 선택지이며 정답이나 반복 사용 의무가 아니다 |
| 연기 | 선택한 작품 목적에 따라 단편 Acting 또는 광고 Acting Director | 두 파일은 씬 목표와 인물 동기·전술 등 공통 구조를 가진다. 서로 다른 역할의 감정과 보이는 행동을 남기고 중복 문장을 합친다 |
| 영상 프롬프트 | 숏드라마 또는 광고용 Seedance 프롬프트 중 하나 | 두 원문은 문자 비교에서 약 90.8% 유사하다. 이미지·영상 모델의 실제 입력 계약을 먼저 확인하고 시간, 시점, 행동과 참조 역할을 구성한다 |
| 렌즈와 룩 | Anamorphic 또는 사용자가 고른 다른 렌즈 방향 | 공통 카메라·조명 지침과 겹칠 수 있으므로 선택된 방향과 의도를 우선한다. 특정 필름·초점거리는 근거 또는 사용자의 선택으로 기록한다 |
| Higgsfield 실제 생성 | 공식 `higgsfield-generate` | 모델·계정 연결, 실제 모드와 지원 참조는 공식 CLI 목록·스키마를 확인한다. 다른 스킬의 촬영 아이디어가 특정 모델의 기능 지원을 보장하지 않는다 |
| 실존 인물 Soul 학습 | 공식 `higgsfield-soul-id` | 이미지 참조, 비디오 엘리먼트, Soul ID는 서로 다른 자산과 기능이다. 선택한 모델의 지원과 계정 상태를 확인한다 |
| 광고 상품 이미지 | 공식 `higgsfield-product-photoshoot` | 실제 제품 모습과 검증된 정보를 참조하고 이미지·영상 생성 비용을 각각 확인한다 |
| 해설 영상 | 공식 `higgsfield-faceless-video` | 구 `higgsfield-video-explainer`는 현재 호환 진입점이다. 두 스킬을 두 번 적용하지 않는다 |

스킬의 원문은 사용자 요청을 해석하기 위한 자료다. UI에서 제안할 기본 조합과 사용자가 직접 택한 조합을 구분하고, 지침 변경을 각 노드에 저장해 실행 시점의 입력을 보존한다.

## 제작 단계와 보완 방향

1. **아이디어와 대본.** 숏드라마 사례는 강한 순간을 먼저 보여 주는 훅, 그 상황의 맥락, 사건이 변하는 고조, 다음 회를 궁금하게 하는 클리프행어를 사용한다. 제작자의 제안인 감정 변화 간격은 편집 시작값으로 다루고, 작품 길이와 장면 의도에 따라 수정한다. [숏드라마](https://higgsfield.ai/ko/@adilinthewildtempo/blogs/how-to-make-ai-short-drama)
2. **인물과 상태.** 각 인물의 얼굴·머리·의상을 승인하고 필요한 안경·상처·변신 등은 별도 상태 참조로 관리한다. 단편 원문은 세 주요 인물을 비디오 엘리먼트로 만들고 이름을 일관되게 사용한다. 숏드라마의 군중은 한 장의 그룹 참조로 관리한 사례다. 이는 영상 전체의 재현율이나 모든 모델의 참조 지원을 뜻하지 않는다. [단편](https://higgsfield.ai/ko/@adilinthewildtempo/blogs/make-a-cinematic-ai-short-film-with-higgsfield-the-workflow) · [숏드라마](https://higgsfield.ai/ko/@adilinthewildtempo/blogs/how-to-make-ai-short-drama)
3. **음성과 연기.** 단편에서는 승인 인물에 목소리 참조를 더해 움직이는 인물 참조를 만든다. 숏드라마의 대사는 인물별 목소리 설명을 일관되게 사용한다. Omni AI Canvas에서는 음성 원본, 인물 이름, 사용 동의, 생성 모델에 실제 전달한 슬롯을 별도로 기록할 필요가 있다. 음성 등록이나 립싱크를 연결된 모든 모델이 지원한다고 가정하지 않는다. [단편](https://higgsfield.ai/ko/@adilinthewildtempo/blogs/make-a-cinematic-ai-short-film-with-higgsfield-the-workflow) · [숏드라마](https://higgsfield.ai/ko/@adilinthewildtempo/blogs/how-to-make-ai-short-drama)
4. **공간과 블로킹.** 빈 장소 이미지를 기준으로 가구·출입구·광원과 카메라 축을 정하고 인물의 시작 위치·시선·동선을 기록한다. 상단 시점 지도는 제작 판단용으로 보관하고 실제 생성에 전송할지 명시한다. 짧은 룸투어에서 얻은 위치 기준과 프레임의 출처·시간을 함께 기록한다. 참조가 나타내는 공간 구조와 샷의 카메라 각도를 별도로 지시한다. [단편](https://higgsfield.ai/ko/@adilinthewildtempo/blogs/make-a-cinematic-ai-short-film-with-higgsfield-the-workflow)
5. **샷과 프리비즈.** 시작 상태, 필수 행동, 종료 상태, 카메라·상대 시선·대사·사운드를 함께 계획한다. 광고 사례는 첫 샷의 종료 동작과 다음 샷의 시작 동작을 이어 다른 시점에서 사용한다. 방향과 속도는 편집 전 프리비즈로 확인하고 효과가 달라질 수 있는 테이크는 별도로 비교한다. [광고](https://higgsfield.ai/ko/@adilinthewildtempo/blogs/make-a-realistic-ai-commercial-without-wasting-credits)
6. **테이크와 예산.** 승인된 참조를 우선 재사용하고 프리비즈와 스틸 검토 뒤 필요한 샷을 생성한다. 제작자가 저해상도 후보와 선택된 결과를 비교한 사례이므로 실제 선택지는 연결된 모델·계정의 현재 지원과 견적을 따른다. 여러 앵글의 재현 결과는 채택 전에 동작과 연속성을 다시 확인한다. [광고](https://higgsfield.ai/ko/@adilinthewildtempo/blogs/make-a-realistic-ai-commercial-without-wasting-credits)

## 가격과 확인 범위

Soul Cinema는 공식 페이지에서 시네마틱 이미지 모델로 설명하며 Soul ID 및 색상 기능과의 사용을 안내한다. 가장 저렴하다는 순위는 모델·요금제·입력별 현재 가격 비교 없이 고정하지 않는다. CLI·MCP의 생성은 웹 전용 무료·무제한 혜택과 이용 경로가 다르므로 요청 시 계정의 실제 견적을 확인한다. [Soul Cinema](https://higgsfield.ai/soul-cinema) · [크레딧 안내](https://higgsfield.ai/creator-hub/help-center/credits/how-credits-work)

공식 스킬 저장소 HEAD는 `27000402070db19d958789d05b3b52b6f4718d7c`, 저장소 라이선스는 MIT다. `higgsfield-generate` 0.14.0은 기존 프로젝트 설치본과 일치한다. 이번에 공식 Soul ID, 상품 사진, 얼굴 없는 영상과 예전 영상 설명자 호환 스킬을 같은 커밋으로 프로젝트 범위에 설치했다. 스킬 설치 자체와 이번 조사에서는 이미지·영상·음성·3D 생성이나 원격 업로드를 수행하지 않았다. [공식 스킬 목록](https://github.com/higgsfield-ai/skills/tree/27000402070db19d958789d05b3b52b6f4718d7c)
