---
name: blender-production-guide
description: Blender 5.3 facial shape keys, glTF export and quality verification for Omni AI Canvas.
---

# Blender 제작 가이드

얼굴 리그, 캐릭터 GLB와 조명 작업에서 기존 프로젝트의 Blender 장면 명세와 실행 경로를 먼저 확인한다.

- 중립 Basis와 눈·입 주변 토폴로지를 확인한다. Shape Key 생성 이후 정점 개수와 순서를 유지한다.
- 좌우 표정 키의 이름과 방향을 확인하고 눈꺼풀·안구 관통과 복합 표정을 검수한다.
- GLB의 morph target 이름과 실제 변형을 검증한다. Blender 드라이버는 브라우저에서 사용할 가중치 또는 샘플링된 애니메이션으로 변환한다.
- Blender와 Three.js에서 중립·극점·복합 포즈, 광원과 좌표를 비교한다. Z-up과 Y-up 변환의 중복을 검사한다.
- 기존 서버의 고정 Blender 실행 경로와 프로젝트 파일 경계를 사용한다. 원본 자산의 출처와 라이선스, 수정 내역을 기록한다.

공식 원문은 MIT 라이선스의 [Blender Core](https://github.com/EL4CTEO/blender-skills/blob/1a1cc6c49312f9f370aae86f52b7b907f29c94f6/skills/blender-core/SKILL.md), [Facial Shape Keys](https://github.com/EL4CTEO/blender-skills/blob/1a1cc6c49312f9f370aae86f52b7b907f29c94f6/skills/blender-facial-shapekeys/SKILL.md), [Export Pipelines](https://github.com/EL4CTEO/blender-skills/blob/1a1cc6c49312f9f370aae86f52b7b907f29c94f6/skills/blender-export-pipelines/SKILL.md) 1.2.0이다.
