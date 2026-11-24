import assert from "node:assert/strict";
import test from "node:test";
import { directionWarnings, directorFocalView, directorRequestText, emptyNodeDirection, nodeDirectionText, readDirectorFocalLength, readNodeDirection } from "../lib/node-director-direction";
import { directorPresets, type DirectorPreset } from "../lib/node-director-presets";

test("촬영과 스타일, 연기 설정은 요청에 전달할 텍스트로 변환하고 다시 복원한다", () => {
  const selected = {
    ...emptyNodeDirection,
    camera: "디지털 카메라", lens: "아나모픽", focal: "35mm", aperture: "f/4",
    angle: "로우 앵글", movement: "트래킹", light: "강한 역광", art: "푸른 의상",
    performance: "천천히 문을 열고\n뒤를 돌아본다", narrative: "작은 단서에서 긴장감을 쌓는 장면",
    genre: "미스터리", rhythm: "원테이크",
  };
  const text = nodeDirectionText(selected);
  assert.match(text, /카메라: 디지털 카메라/);
  assert.match(text, /행동과 감정: 천천히 문을 열고 뒤를 돌아본다/);
  assert.match(text, /장면 전개: 작은 단서에서 긴장감을 쌓는 장면/);
  assert.match(text, /초점 거리: 35mm/);
  assert.match(text, /장르: 미스터리\n편집 리듬: 원테이크/);
  assert.deepEqual(readNodeDirection(text), { ...selected, performance: "천천히 문을 열고 뒤를 돌아본다" });
});

test("빈 설정은 비우고 다른 프롬프트를 설정으로 읽지 않는다", () => {
  assert.equal(nodeDirectionText(emptyNodeDirection), "");
  assert.deepEqual(readNodeDirection("일반 프롬프트\n카메라: 내용"), emptyNodeDirection);
  assert.equal(readNodeDirection("촬영 및 시각 연출\n조명: 따뜻한 측면 조명").light, "따뜻한 측면 조명");
});

test("고정된 카메라 위치에서 긴 초점 거리일수록 화각과 표시 영역이 좁다", () => {
  assert.equal(readDirectorFocalLength(" 18 mm "), 18);
  assert.equal(readDirectorFocalLength("86mm"), 86);
  assert.equal(readDirectorFocalLength("135mm"), 135);
  for (const invalid of ["", "17mm", "136mm", "2.5m", "85.5mm", "NaNmm"]) {
    assert.equal(readDirectorFocalLength(invalid), null);
  }
  assert.deepEqual(directorFocalView(18), { cropRatio: 1, horizontalAngle: 90 });
  assert.deepEqual(directorFocalView(50), { cropRatio: 18 / 50, horizontalAngle: 40 });
  assert.deepEqual(directorFocalView(135), { cropRatio: 18 / 135, horizontalAngle: 15 });
});

test("저장한 기법 이름을 요청에 보낼 구체적인 지시로 펼친다", () => {
  const note = nodeDirectionText({
    ...emptyNodeDirection,
    framing: "클로즈업", composition: "리드룸", gaze: "올려다봄", movement: "돌리 인",
    tempo: "슬로우 모션", rhythm: "원테이크", palette: "차가운 청색", art: "비에 젖은 코트",
  });
  const video = directorRequestText(note, "video");
  assert.match(video, /^촬영 및 시각 연출\n/);
  assert.match(video, /카메라 이동: 돌리 인 \(Dolly In\) · .*직진.*피할 것: .*줌/);
  assert.match(video, /화면 배치: 리드룸 \(Lead Room\) · /);
  assert.match(video, /시간 표현: 슬로우 모션 \(Slow Motion\) · /);
  assert.match(video, /편집 리듬: 원테이크/);
  assert.match(video, /스타일링과 미술: 비에 젖은 코트$/m);
});

test("정지 이미지 요청에는 움직임과 시간 지시를 보내지 않는다", () => {
  const note = nodeDirectionText({ ...emptyNodeDirection, framing: "클로즈업", movement: "돌리 인", tempo: "타임랩스", rhythm: "원테이크" });
  const image = directorRequestText(note, "image");
  assert.match(image, /구도: 클로즈업/);
  assert.doesNotMatch(image, /카메라 이동|시간 표현|편집 리듬/);
  const motionOnly = nodeDirectionText({ ...emptyNodeDirection, movement: "팬" });
  assert.equal(directorRequestText(motionOnly, "image"), "");
  assert.equal(directorRequestText("조명: 자유롭게 쓴 글\n편집 리듬: 원테이크", "image"), "조명: 자유롭게 쓴 글\n편집 리듬: 원테이크");
});

test("서로 맞지 않는 선택을 알린다", () => {
  assert.deepEqual(directionWarnings({ ...emptyNodeDirection, framing: "클로즈업", movement: "돌리 인" }), []);
  assert.equal(directionWarnings({ ...emptyNodeDirection, viewpoint: "열쇠구멍", movement: "드론" }).length, 1);
  assert.equal(directionWarnings({ ...emptyNodeDirection, viewpoint: "열쇠구멍", movement: "고정" }).length, 0);
  assert.equal(directionWarnings({ ...emptyNodeDirection, focal: "35mm", movement: "돌리 줌" }).length, 1);
  assert.equal(directionWarnings({ ...emptyNodeDirection, movement: "POV 워크", angle: "탑샷" }).length, 1);
  assert.equal(directionWarnings({ ...emptyNodeDirection, lens: "망원 줌 렌즈", focal: "24mm" }).length, 1);
  assert.equal(directionWarnings({ ...emptyNodeDirection, lens: "망원 줌 렌즈", focal: "135mm" }).length, 0);
  assert.equal(directionWarnings({ ...emptyNodeDirection, lens: "초광각·어안 렌즈", focal: "85mm" }).length, 1);
  assert.equal(directionWarnings({ ...emptyNodeDirection, camera: "어깨 장착 다큐멘터리", movement: "고정" }).length, 1);
  assert.equal(directionWarnings({ ...emptyNodeDirection, camera: "CCTV", movement: "돌리 인" }).length, 1);
  assert.equal(directionWarnings({ ...emptyNodeDirection, camera: "대형 센서 시네마", aperture: "f/11" }).length, 1);
});

test("프리셋은 이름과 예제 id가 겹치지 않고 기존에 저장한 이름을 유지한다", () => {
  const names = (key: keyof typeof directorPresets) => directorPresets[key].map(({ name }) => name as string);
  assert.deepEqual(names("framing").slice(0, 7), ["익스트림 와이드", "와이드", "미디엄", "클로즈업", "익스트림 클로즈업", "오버숄더", "인서트"]);
  assert.deepEqual(names("camera").slice(0, 4), ["디지털 시네마", "대형 센서 시네마", "어깨 장착 다큐멘터리", "아날로그 필름"]);
  assert.deepEqual(names("lens").slice(0, 4), ["구면 단렌즈", "아나모픽 렌즈", "빈티지 렌즈", "망원 줌 렌즈"]);
  assert.deepEqual(names("aperture"), ["f/1.4", "f/2", "f/2.8", "f/4", "f/5.6", "f/8", "f/11"]);
  assert.deepEqual(names("angle").slice(0, 4), ["눈높이", "하이 앵글", "로우 앵글", "탑샷"]);
  for (const name of ["고정", "돌리 인", "돌리 아웃", "트래킹", "핸드헬드", "팬", "틸트"]) assert.ok(names("movement").includes(name), name);
  const counts = { camera: 8, lens: 8, aperture: 7, framing: 10, angle: 10, composition: 17, gaze: 4, movement: 24, tempo: 4, viewpoint: 8 } as const;
  const ids = new Set<string>();
  for (const [key, count] of Object.entries(counts) as [keyof typeof counts, number][]) {
    const list: readonly DirectorPreset[] = directorPresets[key];
    assert.equal(list.length, count, key);
    assert.equal(new Set(list.map(({ name }) => name)).size, count);
    for (const { id, en, spec } of list) {
      assert.match(id ?? "", /^[a-z0-9-]+$/);
      assert.ok(!ids.has(id!), id);
      ids.add(id!);
      assert.ok(en && spec && spec.length <= 160, `${key} ${id}`);
    }
  }
  for (const { group } of directorPresets.movement) assert.ok(["이동", "회전", "렌즈", "시점"].includes(group));
});

test("카메라·렌즈·조리개도 화면에 나타날 효과를 요청에 보낸다", () => {
  const note = nodeDirectionText({ ...emptyNodeDirection, camera: "아날로그 필름", lens: "아나모픽 렌즈", aperture: "f/1.4" });
  for (const operation of ["image", "video"] as const) {
    const text = directorRequestText(note, operation);
    assert.match(text, /카메라: 아날로그 필름 \(35mm Film\) · .*입자/);
    assert.match(text, /렌즈: 아나모픽 렌즈 \(Anamorphic Lens\) · .*가로.*피할 것/);
    assert.match(text, /조리개: f\/1\.4 \(.*\) · .*초점/);
  }
  assert.match(directorRequestText("촬영 및 시각 연출\n렌즈: 아나모픽", "image"), /렌즈: 아나모픽$/);
});
