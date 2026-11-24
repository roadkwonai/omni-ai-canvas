# 예제 자산 «마지막 상영»

오래된 독립 극장이 폐관하기 전날, 마지막 영사기사가 영사실에서 한 편을 준비하는 가상의 장면이다. 2026-11-22에 내장 이미지 생성 도구로 제작한 프로젝트 예제다. 실존 인물을 참고하지 않았다.

| 파일 | 용도 | 제작 방식 |
| --- | --- | --- |
| `public/sample/portrait.webp` | 영사기사 캐릭터 참조 | 내장 이미지 생성 도구로 생성한 인물 이미지를 WebP로 변환 |
| `public/sample/frame.webp` | 장면 키프레임 | 인물 이미지를 참조로 같은 인물과 의상, 극장 분위기를 유지해 생성한 이미지를 WebP로 변환 |
| `public/sample/preview.mp4` | 5초 샘플 모션 테스트 | 키프레임에 FFmpeg의 느린 확대를 적용한 1280×720 H.264, 25fps, 무음 영상 |

생성 프롬프트의 핵심은 60대 후반 한국인 영사기사, 은발, 남색 작업복, 오래된 필름 영사기, 따뜻한 텅스텐 조명과 서늘한 해질녘 그림자, 35mm 필름 질감이다. 키프레임에는 폐관 전날 영사실에서 영사기에 손을 얹고 빈 객석을 비추는 장면을 요청했다. 이미지에는 글자와 로고를 넣지 않도록 했다.

미리보기는 정지 이미지에 카메라 확대를 적용한 샘플 모션 테스트다. 영상 생성 모델의 결과물이나 인물의 실제 움직임을 표현한 영상은 아니다.

## 랜딩 카메라 이동 예제 (2026-11-24)

`public/director/moves`의 영상 9개와 사진은 ChatGPT 구독의 Codex `image_gen`으로 만든 사진 6장에서 나왔다. 프롬프트는 `generated-images/moves/photos.json`과 `edits.json`에 있고, 참조는 프로젝트가 만든 `public/director/focal-platform.webp`와 `public/director/examples/optics-base.webp`다. 다시 만들려면 `node scripts/director-photo-moves.mjs`를 실행한다. CineGuide 자료는 참조하거나 포함하지 않았다.
