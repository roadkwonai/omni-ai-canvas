import assert from "node:assert/strict";
import test from "node:test";
import { listTtsVoices } from "../lib/tts-provider";
import { fishCatalogueOffset, matchingTags } from "../lib/fish-catalog-cache";

test("Fish DB 더보기는 기존 30개 페이지의 다음 위치와 새로운 100개 오프셋을 구분한다", () => {
  assert.equal(fishCatalogueOffset(""), 0);
  assert.equal(fishCatalogueOffset("3"), 60);
  assert.equal(fishCatalogueOffset("db:100"), 100);
  assert.equal(fishCatalogueOffset("db:-1"), undefined);
});

test("Fish 검색은 원문 태그와 한국어 태그 이름이 맞는 원본 태그를 찾는다", () => {
  const facets = { tags: ["Calm", "calm-voice", "news", "toString"], tagLabels: { news: "뉴스 진행" } };
  assert.deepEqual(matchingTags(facets, " calm "), ["Calm", "calm-voice"]);
  assert.deepEqual(matchingTags(facets, "뉴스"), ["news"]);
  assert.deepEqual(matchingTags(facets, " "), []);
});

test("Fish와 Typecast 목록의 ID, 이름, 미리듣기와 페이지를 보존한다", async (context) => {
  const originalFish = process.env.FISH_AUDIO_API_KEY;
  const originalTypecast = process.env.TYPECAST_API_KEY;
  process.env.FISH_AUDIO_API_KEY = "test-fish";
  process.env.TYPECAST_API_KEY = "test-typecast";
  context.mock.method(globalThis, "fetch", async (value: string | URL | Request) => {
    const url = new URL(String(value));
    if (url.hostname === "api.fish.audio") {
      assert.equal(url.searchParams.get("page_number"), "2");
      assert.equal(url.searchParams.get("title"), "서");
      assert.equal(url.searchParams.get("sort_by"), "task_count");
      assert.deepEqual(url.searchParams.getAll("tag"), ["female", "middle-aged", "narration"]);
      assert.equal(url.searchParams.get("language"), "ko");
      return Response.json({items:[{_id:"fish-id",title:"서",tags:["female","middle-aged","narration"],languages:["ko"],samples:[{audio:"https://assets.fish.audio/voice.mp3"}]}],has_more:true});
    }
    assert.equal(url.searchParams.get("model"),"ssfm-v30");
    return Response.json([{voice_id:"tc_123",voice_name:{kor:"서",eng:"Seo"},preview_url:"https://static2.typecast.ai/a.mp3"}]);
  });
  try {
    const fish = await listTtsVoices("fish-audio","서","2",{ sort: "popular", gender: "female", age: ["middle-aged"], language: ["ko"], tag: "narration" });
    assert.equal(fish.nextCursor,"3");
    assert.deepEqual(fish.voices[0],{id:"fish-id",name:"서",gender:"female",tags:["female","middle-aged","narration"],languages:["ko"],previewUrl:"https://assets.fish.audio/voice.mp3"});
    assert.deepEqual(fish.tags, ["female", "middle-aged", "narration"]);
    const cast = await listTtsVoices("typecast");
    assert.deepEqual(cast.voices[0],{id:"tc_123",name:"서",previewUrl:"https://static2.typecast.ai/a.mp3"});
  } finally {
    if (originalFish === undefined) delete process.env.FISH_AUDIO_API_KEY; else process.env.FISH_AUDIO_API_KEY = originalFish;
    if (originalTypecast === undefined) delete process.env.TYPECAST_API_KEY; else process.env.TYPECAST_API_KEY = originalTypecast;
  }
});

test("네 공급사의 합성 요청은 공식 음성 설정을 전달하고 결과 음원을 보관한다", async () => {
  const { synthesizeTts } = await import("../lib/tts-provider");
  const scenarios = [
    { provider: "fish-audio", env: "FISH_AUDIO_API_KEY", voiceId: "fish123", host: "api.fish.audio", header: "authorization", expected: "Bearer test-key" },
    { provider: "elevenlabs", env: "ELEVENLABS_API_KEY", voiceId: "eleven123", host: "api.elevenlabs.io", header: "xi-api-key", expected: "test-key" },
    { provider: "typecast", env: "TYPECAST_API_KEY", voiceId: "tc_123", host: "api.typecast.ai", header: "x-api-key", expected: "test-key" },
    { provider: "gemini-tts", env: "GEMINI_TTS_API_KEY", voiceId: "Kore", host: "generativelanguage.googleapis.com", header: "x-goog-api-key", expected: "test-key" },
  ] as const;
  const audio = Buffer.from("sample-tts-audio");
  for (const scenario of scenarios) {
    const previous = process.env[scenario.env];
    process.env[scenario.env] = "test-key";
    try {
      let saved = false;
      const fetcher: typeof fetch = async (url, init) => {
        assert.equal(new URL(String(url)).hostname, scenario.host);
        assert.equal(new Headers(init?.headers).get(scenario.header), scenario.expected);
        const body = JSON.parse(String(init?.body));
        if (scenario.provider === "fish-audio") {
          assert.equal(new Headers(init?.headers).get("model"), "s2.1-pro");
          assert.equal(body.reference_id, scenario.voiceId);
        } else if (scenario.provider === "elevenlabs") {
          assert.equal(body.model_id, "eleven_multilingual_v2");
        } else if (scenario.provider === "typecast") {
          assert.equal(body.voice_id, scenario.voiceId);
          assert.equal(body.model, "ssfm-v30");
          assert.equal(body.output.audio_format, "mp3");
        } else {
          assert.equal(body.response_format.mime_type, "audio/wav");
          assert.equal(body.generation_config.speech_config[0].voice, "Kore");
          return Response.json({ steps: [{ type: "model_output", content: [{ type: "audio", data: audio.toString("base64") }] }] });
        }
        assert.equal(body.text, "안녕하세요.");
        return new Response(audio);
      };
      const result = await synthesizeTts(
        { provider: scenario.provider, voiceId: scenario.voiceId, text: "안녕하세요." },
        { fetcher, save: async (bytes, name, type) => {
          assert.deepEqual(Buffer.from(bytes), audio);
          assert.equal(type, "audio");
          assert.equal(name, scenario.provider === "gemini-tts" ? "tts.wav" : "tts.mp3");
          saved = true;
          return { url: "/api/assets/00000000-0000-4000-8000-000000000000.wav", name, type };
        } },
      );
      assert.equal(result.type, "audio");
      assert.ok(saved);
    } finally {
      if (previous === undefined) delete process.env[scenario.env];
      else process.env[scenario.env] = previous;
    }
  }
});

test("공급사의 크기 한도를 넘는 음성은 저장하지 않는다", async () => {
  const { synthesizeTts } = await import("../lib/tts-provider");
  const previous = process.env.FISH_AUDIO_API_KEY;
  process.env.FISH_AUDIO_API_KEY = "test-key";
  try {
    await assert.rejects(synthesizeTts(
      { provider: "fish-audio", voiceId: "voice", text: "안녕하세요." },
      {
        fetcher: async () => new Response("a", { headers: { "content-length": String(33 * 1024 * 1024) } }),
        save: async () => { throw new Error("저장되면 안 됩니다."); },
      },
    ), /크기/);
  } finally {
    if (previous === undefined) delete process.env.FISH_AUDIO_API_KEY;
    else process.env.FISH_AUDIO_API_KEY = previous;
  }
});

test("Fish 언어 범위는 기존 진행 순서를 유지하며 실제 관찰된 유효 언어만 추가한다", async () => {
  const { extendFishCatalogScopes } = await import("../lib/fish-catalog-cache");
  const prior = ["", "ko", "en"];
  assert.deepEqual(extendFishCatalogScopes(prior, ["en", "EN", "ja", "fr", "ja", "en-GB", "not a language", null]),
    ["", "ko", "en", "en-gb", "fr", "ja"]);
  assert.deepEqual(prior, ["", "ko", "en"]);
});
