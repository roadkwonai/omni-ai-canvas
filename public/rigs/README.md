# 연출 가이드 얼굴

`direction-face.glb`는 Blender Studio와 기여자가 제작한 Human Base Meshes v1.4.1의 실사형 애니메이션 머리와 눈을 사용한다. 원본 배포 라이선스는 CC0다.

- 원본 https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip
- 출처 https://developer.blender.org/docs/release_notes/3.6/asset_bundles/
- 제작 스크립트 `scripts/build-direction-face.py`
- 제작 도구 Blender 5.3.0, glTF 2.0 GLB

원본 ZIP을 풀어 `human_base_meshes_bundle.blend`를 준비한 뒤 재생성한다.

```sh
blender -b --factory-startup --disable-autoexec --python scripts/build-direction-face.py -- /path/to/human_base_meshes_bundle.blend /absolute/path/direction-face.glb
```

기본 머리에 눈썹, 눈꺼풀, 입, 미소, 찡그림, 놀람과 볼 움직임을 위한 14개 Shape Key를 추가했다. 별도의 시선 메시를 움직일 수 있다. 눈꺼풀과 홍채의 접점은 추가 조형이 필요한 부분이다. 원본의 실행 스크립트는 활성화하지 않았다.
