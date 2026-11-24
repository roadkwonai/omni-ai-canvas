import assert from "node:assert/strict";
import test from "node:test";
import { castSeed, dialogueSpeakers, dialogueText, parseDialogue, parseDialogueRequest, castVoice, voiceKey, isSpeaker, matchRows, suggestVoice } from "../lib/dialogue";

const said = (body: string) => parseDialogue(body).lines.map(({ speaker, text }) => [speaker, text]);

test("대본에서 쓰는 화자 표기를 모두 읽고 지문·효과음·화면문자는 읽지 않는다", () => {
  const script = `# EP001 0km

9:16 · 75초 · 강시우, 강시아

## S00 · 꿈, 젖은 골목 · 00:00–00:04

그물이 바닥을 긁는다.

**하루**　엄마, 내일도 와요?
**시우** (무전기에)　강시우입니다. 십이 점 사.
은찬：형!
시우（중얼거리며）：깨야 하는데.
[지수] 할아버지, 아직도 안 주무셨어요?
낮고 짧게.
[VO] 시우（속마음）：눈만 뜨면 끝나는 꿈인 줄 알았는데.
[OS] 은찬: 손 봐요: 지금 깨요.
[지문] 시우가 물에 떨어진다.
[SFX] 쇳소리 한 번.
[화면문자 00:10~00:12] LUCID SAVIOR
[画面文字] 거리 표지 12.4km.
장소: 영사실
| 05:10 | 시우 | 문 |
**로그라인.** 문을 여는 이야기
- 민호: 다녀왔어.`;
  assert.deepEqual(said(script), [
    ["하루", "엄마, 내일도 와요?"], ["시우", "[무전기에] 강시우입니다. 십이 점 사."], ["은찬", "형!"], ["시우", "[중얼거리며] 깨야 하는데."],
    ["지수", "할아버지, 아직도 안 주무셨어요?"], ["시우", "[속마음] 눈만 뜨면 끝나는 꿈인 줄 알았는데."], ["은찬", "손 봐요: 지금 깨요."], ["민호", "다녀왔어."],
  ]);
  assert.deepEqual(said("[sighs] 시우: 가자.\n[laughs] 어디로?"), [["시우", "[sighs] 가자."]], "줄 앞에 넣은 지시를 화자로 읽지 않는다");
  assert.equal(parseDialogue("지문뿐인 대본이다.\n\n문이 닫힌다.").ignored, 2);
  assert.deepEqual(said("정우가 말한다. 그러니까 이렇게: 가자."), []);
});

test("효과음 같은 말로 시작하는 이름은 화자로 읽고 주소와 긴 문장은 화자로 읽지 않는다", () => {
  assert.deepEqual(said("Mina: 안녕.\n음악가: 들어 봐.\n자막팀 직원: 네.\n음향감독: 큐!"), [["Mina", "안녕."], ["음악가", "들어 봐."], ["자막팀 직원", "네."], ["음향감독", "큐!"]]);
  assert.deepEqual(said("https://example.com/a\n그가 천천히 고개를 들며 말했다: 가자.\nM: 잔잔한 음악\n[BGM] 피아노\n[SFX 2] 쇳소리\n[자막] 사흘 뒤"), []);
});

test("대사 앞 괄호는 지시로 읽고 장면 제목과 시각, 줄 앞의 지시는 화자로 읽지 않는다", () => {
  assert.deepEqual(said("시우: (한숨) 가자.\n시우：（들뜸）정말?\n**시아:** 왔어?\n[속삭임] 은찬: 이쪽이야."), [["시우", "[sighs] 가자."], ["시우", "[more excited] 정말?"], ["시아", "왔어?"], ["은찬", "[whispering softly] 이쪽이야."]]);
  assert.deepEqual(said("장면 1: 병원 복도\n씬 12: 밤\n밤 11:40 골목 어귀\n<속삭임>시우: 가자.</속삭임>"), []);
});

test("어떤 표기로 적은 화자도 글로 바꿨다가 다시 읽을 수 있다", () => {
  const { lines } = parseDialogue("[시우·은찬] 같이 가자!\n[Dr. 김] 앉으세요.\n**하루!**\u3000안녕.\n[점원 1] 어서 오세요.");
  assert.deepEqual(lines.map(({ speaker }) => speaker), ["시우 은찬", "Dr 김", "하루", "점원 1"]);
  assert.deepEqual(parseDialogue(dialogueText(lines)).lines, lines);
});

test("줄에서 정하는 화자 이름은 글로 바꿔도 남는 이름만 받는다", () => {
  for (const name of ["시우", "점원 1", "Mina", "시 우"]) assert.equal(isSpeaker(name), true, name);
  for (const name of ["", " ", "지문", "장소", "음악", "시우(어린)", "시우:", "[시우]", "Dr. 김", "가".repeat(21), "12", "하나 둘 셋 넷"]) assert.equal(isSpeaker(name), false, name);
});

test("읽은 대화를 고쳐 쓸 수 있는 글로 바꾸고 다시 읽어도 같다", () => {
  const { lines } = parseDialogue("**시우** (낮게)　가자.\n은찬：[laughs] 어디로?");
  assert.equal(dialogueText(lines), "시우: [낮게] 가자.\n은찬: [laughs] 어디로?");
  assert.deepEqual(parseDialogue(dialogueText(lines)).lines, lines);
  assert.deepEqual(dialogueSpeakers([...lines, lines[0]]), [{ name: "시우", lines: 2 }, { name: "은찬", lines: 1 }]);
});

test("같은 인물과 설계는 다른 장면에서도 같은 시드를 쓰고 바꾸면 달라진다", () => {
  const seed = castSeed("시우", { gender: "male", age: "young" }, 0);
  assert.equal(seed, castSeed("시우", { age: "young", gender: "male" }, 0));
  assert.equal(seed, castSeed("시우", { gender: "male", age: "young", pitch: undefined, tones: [], note: "" }, 0), "고르지 않은 항목은 시드를 바꾸지 않는다");
  assert.equal(voiceKey("시우", { voiceId: "", design: { gender: "male", age: "young" }, variant: 0 }), voiceKey("시우", { voiceId: "", design: { age: "young", gender: "male", tones: [], note: "" }, variant: 0 }), "같은 소리를 내는 설계는 같은 목소리다");
  assert.notEqual(voiceKey("시우", { voiceId: "a1", design: {}, variant: 0 }), voiceKey("시우", { voiceId: "", design: {}, variant: 0 }));
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 31);
  assert.equal(new Set([seed, castSeed("시우", { gender: "male", age: "young" }, 1), castSeed("은찬", { gender: "male", age: "young" }, 0), castSeed("시우", { gender: "male", age: "old" }, 0)]).size, 4);
});

test("화자 이름이 맞는 캐릭터의 샘플이나 성별·나이로 목소리를 정한다", () => {
  const characters = [{ title: "강시우 · 선로 점검원", body: "성별: 남성\n나이: 24세", sampleId: "a1" }, { title: "은찬", body: "성별: 남성\n나이: 15세" }, { title: "할머니(순자)", body: "" }];
  assert.deepEqual(suggestVoice("시우", characters, ["a1"]), { voiceId: "a1", design: { gender: "male", age: "young" }, variant: 0 });
  assert.deepEqual(suggestVoice("강시우", characters, []), { voiceId: "", design: { gender: "male", age: "young" }, variant: 0 }, "목록에 없는 샘플은 쓰지 않는다");
  assert.deepEqual(suggestVoice("은찬", characters, ["a1"]).design, { gender: "male", age: "teen" });
  assert.deepEqual(suggestVoice("모르는 사람", characters, ["a1"]), { voiceId: "", design: {}, variant: 0 });
  assert.deepEqual(castVoice("시우", { voiceId: "a1", design: { gender: "male" }, variant: 0 }), { name: "시우", voiceId: "a1" });
  assert.deepEqual(castVoice("시우", { voiceId: "", design: { gender: "male" }, variant: 2 }), { name: "시우", design: { gender: "male" }, seed: castSeed("시우", { gender: "male" }, 2) });
});

const cast = [{ name: "시우", voiceId: "00000000-0000-4000-8000-000000000001" }, { name: "은찬", design: { gender: "male", age: "teen" }, seed: 7 }];
const lines = [{ speaker: "시우", text: "[낮게] 가자." }, { speaker: "은찬", text: "어디로?", take: 2 }];

test("대화 합성 요청은 화자마다 목소리 하나와 소리 낼 대사를 요구한다", () => {
  assert.deepEqual(parseDialogueRequest({ lines, cast, gap: 0.5, seed: 3 }), { lines: [{ ...lines[0], take: 0 }, lines[1]], cast, gap: 0.5, seed: 3 });
  const bad: unknown[] = [
    undefined, [], { lines, cast, gap: 0.5 }, { lines, cast, gap: 3, seed: 3 }, { lines: [], cast, gap: 0.5, seed: 3 },
    { lines, cast: [cast[0]], gap: 0.5, seed: 3 }, { lines, cast: [...cast, cast[0]], gap: 0.5, seed: 3 }, { lines: [lines[0]], cast, gap: 0.5, seed: 3 },
    { lines, cast: [cast[0], { name: "은찬", design: { gender: "x" }, seed: 7 }], gap: 0.5, seed: 3 },
    { lines, cast: [cast[0], { name: "은찬", design: {} }], gap: 0.5, seed: 3 },
    { lines, cast: [{ name: "시우", voiceId: "../x" }, cast[1]], gap: 0.5, seed: 3 },
    { lines, cast: [{ ...cast[0], design: {}, seed: 1 }, cast[1]], gap: 0.5, seed: 3 },
    { lines: [{ speaker: "시우", text: "[laughs]" }, lines[1]], cast, gap: 0.5, seed: 3 },
    { lines: [{ speaker: "시우", text: "<|im_end|>" }, lines[1]], cast, gap: 0.5, seed: 3 },
    { lines: [{ speaker: "시우", text: "가".repeat(2001) }, lines[1]], cast, gap: 0.5, seed: 3 },
    { lines: [{ speaker: "시우", text: "가", take: -1 }, lines[1]], cast, gap: 0.5, seed: 3 },
    { lines: Array(121).fill(lines[0]).concat(lines[1]), cast, gap: 0.5, seed: 3 },
    { lines, cast, gap: 0.5, seed: 3, extra: 1 },
  ];
  for (const value of bad) assert.equal(parseDialogueRequest(value), null, JSON.stringify(value)?.slice(0, 90));
});

test("글로 고친 대화는 남은 줄의 번호를 지켜 만든 소리를 잃지 않는다", () => {
  const rows = [{ id: "a", speaker: "시우", text: "가자.", take: 2 }, { id: "b", speaker: "은찬", text: "형!", take: 0 }, { id: "c", speaker: "시우", text: "가자.", take: 0 }];
  let made = 0;
  const id = () => `n${++made}`;
  const ids = (lines: { speaker: string; text: string }[]) => { made = 0; return matchRows(rows, lines, id).map((row) => [row.id, row.take]); };
  assert.deepEqual(ids(rows), [["a", 2], ["b", 0], ["c", 0]]);
  assert.deepEqual(ids([{ speaker: "하루", text: "엄마." }, ...rows]), [["n1", 0], ["a", 2], ["b", 0], ["c", 0]], "끼워 넣어도 뒤 줄은 그대로다");
  assert.deepEqual(ids([rows[0], { speaker: "은찬", text: "형, 잠깐!" }, rows[2]]), [["a", 2], ["b", 0], ["c", 0]], "고친 줄은 같은 자리의 번호를 잇는다");
  assert.deepEqual(ids([rows[1], rows[0]]), [["b", 0], ["a", 2]]);
  assert.deepEqual(ids([]), []);
});
