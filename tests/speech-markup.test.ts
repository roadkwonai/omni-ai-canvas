import assert from "node:assert/strict";
import test from "node:test";
import { fromKorean, markupPieces, toKorean } from "../lib/speech-markup";
import { speechStyles, speechTags } from "../lib/local-tts-options";
import { dialogueText, lineStatus, parseDialogue, similarSpeakers, speakerColors } from "../lib/dialogue";

test("화면의 한국어 지시와 모델의 지시는 어느 쪽으로 바꿔도 되돌아온다", () => {
  const { points, spans } = speechTags["drama-3"];
  for (const tag of Object.keys(points)) assert.equal(fromKorean(toKorean(`그래. [${tag}] 가자.`)), `그래. [${tag}] 가자.`);
  for (const tag of Object.keys(spans)) assert.equal(fromKorean(toKorean(`그래. <${tag}>가자.</${tag}>`)), `그래. <${tag}>가자.</${tag}>`);
  for (const { prompt, label } of Object.values(speechStyles)) {
    assert.equal(toKorean(`[${prompt}] 가자.`), `[${label}] 가자.`);
    assert.equal(fromKorean(`[${label}] 가자.`), `[${prompt}] 가자.`);
  }
  const korean = [...Object.values(points), ...Object.values(speechStyles).map(({ label }) => label)];
  assert.equal(new Set(korean).size, korean.length, "같은 이름이 두 지시를 가리키지 않는다");
  assert.equal(toKorean("[무전기에] <whisper>금 더 갔어요.</whisper> 3 < 5"), "[무전기에] <속삭임>금 더 갔어요.</속삭임> 3 < 5");
  assert.equal(fromKorean("[무전기에] <높은 음>안녕</높은 음> <모르는 말>"), "[무전기에] <high-pitched>안녕</high-pitched> <모르는 말>");
});

test("대사를 지시와 감싼 말로 나눠 보여준다", () => {
  assert.deepEqual(markupPieces("[slower, with more pauses] [속마음] 눈만 <whisper>뜨면 <emphasis>끝나는</emphasis></whisper> 꿈. [sighs]"), [
    { cue: "천천히" }, { cue: "속마음" }, { text: "눈만 ", spans: [] }, { text: "뜨면 ", spans: ["속삭임"] }, { text: "끝나는", spans: ["속삭임", "강조"] }, { text: " 꿈. ", spans: [] }, { cue: "한숨" },
  ]);
  assert.deepEqual(markupPieces("형!"), [{ text: "형!", spans: [] }]);
});

test("대본과 글 편집의 한국어 지시를 모델의 지시로 읽고 글과 줄을 오가도 같다", () => {
  const { lines } = parseDialogue("시우: [한숨] 그래. <속삭임>가자.</속삭임>\n하루（들뜸）：한 번만 더!\n[웃음] 은찬: 형!\n[방송] 시민 여러분.");
  assert.deepEqual(lines, [
    { speaker: "시우", text: "[sighs] 그래. <whisper>가자.</whisper>" }, { speaker: "하루", text: "[more excited] 한 번만 더!" },
    { speaker: "은찬", text: "[laughs] 형!" }, { speaker: "방송", text: "시민 여러분." },
  ]);
  assert.deepEqual(parseDialogue(toKorean(dialogueText(lines))).lines, lines);
});

test("화자 색은 등장 순서로 정하고 정한 뒤에는 장면이 바뀌어도 유지한다", () => {
  const first = speakerColors(["시우", "시아", "은찬"], {});
  assert.deepEqual(first, { 시우: 0, 시아: 1, 은찬: 2 });
  assert.deepEqual(speakerColors(["하루", "은찬"], first), { 시우: 0, 시아: 1, 은찬: 2, 하루: 3 });
  const many = speakerColors("가나다라마바사아자".split(""), {});
  assert.deepEqual(Object.values(many), [0, 1, 2, 3, 4, 5, 6, 7, 0], "여덟 명을 넘으면 다시 쓴다");
  assert.deepEqual(speakerColors(["새 사람"], { 옛사람: 0, 망가짐: 99 as number }), { 옛사람: 0, "새 사람": 1 });
  assert.deepEqual(speakerColors(["새 사람"], { 옛1: 0, 옛2: 1, 옛3: 2, 옛4: 3, 옛5: 4, 옛6: 5, 옛7: 6, 옛8: 7 })["새 사람"], 0, "이 대화에 없는 사람의 색은 다시 쓸 수 있다");
});

test("줄 순서를 바꿔도 이미 보여준 화자의 색은 바뀌지 않는다", () => {
  const shown = speakerColors(["시우", "시아"], {});
  assert.deepEqual(speakerColors(["시아", "시우"], shown), shown);
});

test("모델마다 화면의 지시를 그 모델의 지시로 바꾼다", () => {
  assert.equal(fromKorean("[한숨] <속삭임>그래</속삭임> 가자", "drama-3"), "[sighs] <whisper>그래</whisper> 가자");
  assert.equal(fromKorean("[한숨] [쉼] <속삭임>그래</속삭임>", "s2-pro"), "[sigh] [pause] <속삭임>그래</속삭임>");
});

test("성을 빼거나 띄어 쓴 이름만 같은 인물인지 묻는다", () => {
  assert.deepEqual(similarSpeakers(["시우", "강시우", "은찬", "은찬 엄마", "방 은찬"]), [["시우", "강시우"], ["은찬", "방 은찬"]]);
  assert.deepEqual(similarSpeakers(["시 우", "시우"]), [["시 우", "시우"]]);
  assert.deepEqual(similarSpeakers(["우", "시우", "엄마", "새엄마의 친구"]), []);
});

test("줄 상태는 만든 소리와 지금 대사·목소리를 비교한다", () => {
  const line = { speaker: "시우", text: "가자.", take: 0 };
  const made = { ...line, voice: "v1" };
  assert.equal(lineStatus(line, "v1", undefined), "new");
  assert.equal(lineStatus(line, "v1", made), "done");
  for (const [next, voice] of [[{ ...line, text: "가자!" }, "v1"], [{ ...line, speaker: "시아" }, "v1"], [{ ...line, take: 1 }, "v1"], [line, "v2"]] as const)
    assert.equal(lineStatus(next, voice, made), "changed");
});
