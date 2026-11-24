import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { chapters, figures, groups, screens, starts } from "../components/guide/contents";
import { dialogueLimits } from "../lib/dialogue";
import { nodeLimit } from "../lib/graph";
import { imageEditKinds } from "../lib/image-edit";
import { directorPresets } from "../lib/node-director-presets";
import { MAX_REFERENCE_VIDEOS } from "../lib/reference-limits";
import { TIMELINE_MAX_AUDIO, TIMELINE_MAX_CLIPS, TIMELINE_MAX_FRAMES, TIMELINE_MAX_WORDS } from "../lib/timeline-spec";
import { productionProfiles } from "../lib/style-preset-core";
import { localTtsModels, ttsProviderLabels } from "../lib/tts-types";
import { kindLabels, MAX_SCENE_COUNT, roleLabels } from "../lib/types";
import { VOICE_MAX_SECONDS } from "../lib/voice-recording";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const guide = readdirSync(new URL("components/guide", root)).filter((name) => name.endsWith(".tsx")).map((name) => read(`components/guide/${name}`)).join("\n");
const text = guide.replace(/\s+/g, " ");
const ids: string[] = chapters.map(([id]) => id);

test("장 주소는 겹치지 않고 밖에서 여는 주소가 남아 있다", () => {
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ["guide-formats", "guide-models", "guide-production-skills", "guide-projects", "guide-settings", "guide-image", "guide-timeline", "guide-contest", "guide-presets", "guide-blender"])
    assert.ok(ids.includes(id), id);
  for (const [id] of starts) assert.ok(ids.includes(id), id);
  for (const path of ["components/ProjectLibrary.tsx", "components/ServiceSettings.tsx", "components/HiggsfieldWorkflowStudio.tsx", "app/page.tsx"])
    for (const [, id] of read(path).matchAll(/guide#(guide-[a-z-]+)/g)) assert.ok(ids.includes(id), `${path} ${id}`);
});

test("목차의 장과 본문의 장이 같은 순서다", () => {
  const order = ["start", "plan", "board", "media", "finish", "help"].flatMap((name) => [...read(`components/guide/${name}.tsx`).matchAll(/<Section id="(guide-[a-z-]+)"/g)].map(([, id]) => id));
  assert.deepEqual(order, ids);
  assert.equal(groups.length, 6);
});

test("그림 파일이 있고 적은 크기와 같으며 좁은 화면판이 있다", () => {
  const size = (name: string) => {
    const match = read(`public/guide/${name}.svg`).match(/viewBox="[\d.]+ [\d.]+ ([\d.]+) ([\d.]+)"/);
    assert.ok(match, name);
    return [Number(match[1]), Number(match[2])];
  };
  for (const [name, { wide, narrow }] of Object.entries(figures)) {
    assert.deepEqual(size(name), [...wide], name);
    assert.deepEqual(size(`${name}-narrow`), [...narrow], name);
    assert.ok(narrow[0] <= 640, name);
    assert.match(text, new RegExp(`file="${name}"`), `${name} 그림을 쓰지 않는다`);
  }
  for (const name of Object.keys(screens)) {
    assert.ok(existsSync(new URL(`public/guide/${name}.webp`, root)), name);
    assert.match(text, new RegExp(`file(="|: ")${name}"`), `${name} 화면을 쓰지 않는다`);
  }
});

test("가이드의 숫자가 코드와 같다", () => {
  const count = Object.values(directorPresets).reduce((sum, items) => sum + Object.keys(items).length, 0);
  assert.equal(Object.keys(imageEditKinds).length, 10);
  for (const label of [...Object.values(imageEditKinds), ...Object.values(roleLabels), ...Object.values(ttsProviderLabels),
    ...Object.values(localTtsModels).map(({ label }) => label), ...productionProfiles.map(({ label }) => label)]) assert.ok(text.includes(label), label);
  for (const phrase of [
    `촬영 지시 ${count}가지`, `1~${MAX_SCENE_COUNT}개`, `최대 ${MAX_REFERENCE_VIDEOS}편`,
    `${TIMELINE_MAX_FRAMES / 30 / 60}분·${TIMELINE_MAX_CLIPS}컷·음향 ${TIMELINE_MAX_AUDIO}개`,
    `화자 ${dialogueLimits.speakers}명, 대사 ${dialogueLimits.lines}줄`, `노드 ${nodeLimit}개`, `최대 ${VOICE_MAX_SECONDS}초`, `노드 ${Object.keys(kindLabels).length}종`, `자막 ${TIMELINE_MAX_WORDS.toLocaleString("en-US")}개`,
  ]) assert.ok(text.includes(phrase), phrase);
});

test("실제와 다른 낡은 문장이 남아 있지 않다", () => {
  for (const phrase of ["미확인으로 표시", "Blender 인계 ZIP", "작업실 설정 →", "대기·진행·완료·실패", "서버의 TRIPO_API_KEY 설정이 필요", "API를 연결하거나 이 컴퓨터에 설치한 모델을 쓸 수 있습니다", "시간대가 있는 마감"])
    assert.ok(!text.includes(phrase), phrase);
});
