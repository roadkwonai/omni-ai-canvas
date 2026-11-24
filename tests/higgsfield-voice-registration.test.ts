import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createProviderVoice, createVoiceOnce, parseVoiceRegistration, permittedUploadUrl, providerVoice, voiceToolsAvailable } from "../lib/higgsfield-voice-registration";

const id = "e2a2d2e6-9ed2-59cd-82af-feaa27f8a678";
const asset = { type: "audio" as const, url: "/api/assets/00000000-0000-4000-8000-000000000000.wav", name: "voice.wav" };
const registration = { nodeId: "character", name: "목소리", asset, retryConfirmed: false };
const tool = (name: string, fields: string[]) => ({ name, inputSchema: { type: "object" as const,
  properties: Object.fromEntries(fields.map((field) => [field, { type: "string" }])) } });
const tools = [tool("media_upload", ["filename", "content_type", "method"]), tool("media_confirm", ["media_id", "type"]),
  tool("create_voice_from_confirmed_audio", ["audio_media_id", "name"]), tool("list_voices", [])];

test("음성 등록은 동의와 로컬 음성 파일이 필요하고 안전한 업로드 주소만 허용한다", () => {
  assert.ok(parseVoiceRegistration({ ...registration, confirmed: true, consent: true }));
  assert.equal(parseVoiceRegistration({ ...registration, confirmed: true }), null);
  assert.equal(permittedUploadUrl("https://upload.higgsfield.ai/sample?signature=x"), true);
  assert.equal(permittedUploadUrl("https://upload.higgsfield.ai.evil.example/sample"), false);
  assert.equal(permittedUploadUrl("http://upload.higgsfield.ai/sample"), false);
  assert.equal(voiceToolsAvailable(tools), true);
  assert.equal(voiceToolsAvailable(tools.slice(0, 3)), false);
  assert.deepEqual(providerVoice({ voice_id: id, status: "completed", is_audio_eligible: true }), { id, type: "element", status: "ready" });
  assert.equal(providerVoice({ voice_id: id, status: "completed" })?.status, "training");
});

test("검증된 도구의 업로드, 확인, 복제 순서를 따른다", async () => {
  const file = path.join(process.cwd(), ".scene-room/media", path.basename(asset.url));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, "sample", { flag: "wx" });
  const calls: string[] = [];
  const client = { listTools: async () => ({ tools }), callTool: async ({ name }: { name: string }) => {
    calls.push(name);
    const responses: Record<string, unknown> = {
      media_upload: { uploads: [{ media_id: id, upload_url: "https://upload.higgsfield.ai/a", method: "PUT", content_type: "audio/wav" }] },
      media_confirm: { results: [{ media_id: id, status: "uploaded" }] },
      create_voice_from_confirmed_audio: { voice_id: id, status: "processing" },
    };
    return { content: [], structuredContent: responses[name] };
  } } as unknown as Client;
  try {
    const voice = await createProviderVoice(client, registration, async () => new Response(null, { status: 200 }));
    assert.equal(voice.status, "training");
    assert.deepEqual(calls, ["media_upload", "media_confirm", "create_voice_from_confirmed_audio"]);
  } finally { await unlink(file); }
});

test("목소리 복제 결과를 복구하고 불확실한 요청의 중복 제출을 막는다", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "voice-registration-"));
  const voice = { id, type: "element" as const, status: "training" as const };
  let count = 0;
  try {
    const submit = async () => { count++; return voice; };
    assert.deepEqual(await createVoiceOnce("project", registration, submit, dir), voice);
    assert.deepEqual(await createVoiceOnce("project", registration, submit, dir), voice);
    assert.equal(count, 1);
    const failure = { ...registration, nodeId: "other" };
    await assert.rejects(createVoiceOnce("project", failure, async () => { throw new Error("timeout"); }, dir));
    await assert.rejects(createVoiceOnce("project", failure, submit, dir), /이전 등록 결과/);
    assert.deepEqual(await createVoiceOnce("project", { ...failure, retryConfirmed: true }, submit, dir), voice);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
