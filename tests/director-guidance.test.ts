import assert from "node:assert/strict";
import test from "node:test";
import { higgsfieldDirectingGuide } from "../lib/director-guidance";

test("연출 지침은 고정된 스킬 기준과 프로젝트 기준을 함께 제공한다", () => {
  const guide = higgsfieldDirectingGuide();
  assert.equal(guide, higgsfieldDirectingGuide());
  assert.ok(guide.length < 1500);
  assert.match(guide, /공식 생성 스킬/);
  assert.match(guide, /Omni AI Canvas의 드라마 연출 지침/);
  assert.match(guide, /시작 프레임/);
  assert.match(guide, /\*\*Camera\*\*: lens/);
  assert.match(guide, /생성에 전달할 참조와 공간 계획/);
  assert.doesNotMatch(
    guide,
    /higgsfield\s+(?:auth|generate|account)|curl|https?:\/\//i,
  );
});
