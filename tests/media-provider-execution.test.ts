import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Asset, RunInput } from "../lib/types";
import { encodeVoiceWav } from "../lib/voice-recording";

const voiceId = "c6b8b8dc-7b1d-4d22-8fab-39df927845ce";

const mockCli = `#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const cli = require("node:path").basename(process.argv[1]);
const args = process.argv.slice(2);
const send = (data) => console.log(JSON.stringify(data));
if (cli === "higgsfield") {
  const schema = {
    job_type: "test-higgs-video", display_name: "Mock Higgs Video", type: "video",
    params: [
      { name: "prompt", type: "string", required: true },
      { name: "mode", type: "string", enum: ["omni_reference"] },
      { name: "duration", type: "integer", enum: [5, 10] },
      { name: "start_image", type: "object" },
      { name: "video_references", type: "array" },
    ],
  };
  const [group, method] = args;
  if (group === "account" && method === "status") send({ email: "test@example.test" });
  else if (group === "model" && method === "list") send([schema]);
  else if (group === "model" && method === "get") send(schema);
  else if (group === "voices" && method === "get") {
    assert.equal(args[2], "${voiceId}");
    send({ id: args[2], name: "서", status: "completed", voice_type: "element" });
  } else if (group === "generate" && method === "create" && args[2] === "seed_audio") {
    assert.deepEqual(args.slice(3), ["--prompt=이제 갈 시간이야.", "--voice_id=${voiceId}", "--voice_type=element", "--format=wav", "--json"]);
    send(["higgs-voice"]);
  } else if (group === "generate" && method === "wait" && args[2] === "higgs-voice") {
    send({ status: "completed", result_url: "https://d8j0ntlcm91z4.cloudfront.net/mock.wav" });
  }
  else if (group === "generate" && method === "create") {
    assert.deepEqual(args.slice(2, 3), ["test-higgs-video"]);
    assert.ok(args.includes("--duration=10"));
    assert.ok(fs.existsSync(args[args.indexOf("--start-image") + 1]));
    assert.ok(fs.existsSync(args[args.indexOf("--video-references") + 1]));
    send(["higgs-job"]);
  } else if (group === "generate" && method === "wait") {
    assert.equal(args[2], "higgs-job");
    send({ status: "completed", result_url: "https://d8j0ntlcm91z4.cloudfront.net/mock.mp4" });
  } else assert.fail("unexpected Higgsfield command");
} else {
  const [command] = args;
  if (command === "who_am_i") send({ body: { availableModels: { omni_ref_video: [{
    model: "test-kling-video", alias: "Mock Kling Video",
    arguments: [{ name: "duration", allowedValues: ["5", "10"] }],
    inputs: [{name:"start_image", required:true}, {name:"reference_video", required:true}],
  }] } } });
  else if (command === "omni_ref_video") {
    assert.equal(args[args.indexOf("--model") + 1], "test-kling-video");
    assert.ok(args.includes("--duration=10"));
    for (const slot of ["start_image", "reference_video"]) {
      const arg = args.find((item) => item.startsWith(slot + "="));
      assert.ok(arg && fs.existsSync(arg.slice(slot.length + 1)));
    }
    send({ generation_id: "kling-job" });
  } else if (command === "query_tasks") {
    assert.equal(args[1], "kling-job");
    send({ works: [{ url: "https://cdn.kling.ai/mock.mp4" }] });
  } else assert.fail("unexpected Kling command");
}`;

test("모의 공식 CLI로 첨부 원본과 모델 옵션을 제출하고 두 공급사의 작업 번호와 결과 파일을 회수한다", async (context) => {
  const originalDirectory = process.cwd();
  const work = await mkdtemp(path.join(os.tmpdir(), "scene-room-media-providers-"));
  const binaries = path.join(work, "node_modules", ".bin");
  await mkdir(binaries, { recursive: true });
  await mkdir(path.join(work, "public", "sample"), { recursive: true });
  const sample = (name: string) => path.join("public", "sample", name);
  for (const name of ["preview.mp4", "frame.webp"])
    await copyFile(path.join(originalDirectory, sample(name)), path.join(work, sample(name)));
  for (const name of ["higgsfield", "kling"])
    await writeFile(path.join(binaries, name), mockCli, { mode: 0o700 });
  const still: Asset = { type: "image", url: "/sample/frame.webp", name: "frame.webp" };
  const clip: Asset = { type: "video", url: "/sample/preview.mp4", name: "preview.mp4" };
  const bytes = await readFile(path.join(work, sample("preview.mp4")));
  const speechBytes = encodeVoiceWav([new Float32Array(800)], 8000);
  const submitted: string[] = [];
  context.mock.method(globalThis, "fetch", async (url: string) => {
    if (url === "https://d8j0ntlcm91z4.cloudfront.net/mock.wav") {
      assert.equal(submitted.at(-1), "higgs-voice");
      return new Response(speechBytes as Uint8Array<ArrayBuffer>);
    }
    const provider = new URL(url).hostname === "cdn.kling.ai" ? "kling" : "higgs";
    assert.ok(["https://d8j0ntlcm91z4.cloudfront.net/mock.mp4", "https://cdn.kling.ai/mock.mp4"].includes(url));
    assert.equal(submitted.at(-1), provider + "-job");
    return new Response(new Uint8Array(bytes));
  });
  try {
    process.chdir(work);
    const { execute } = await import("../lib/runner");
    const { bindAttachments, createAttachment } = await import("../lib/attachment-store");
    const { localAssetPath } = await import("../lib/media");
    const projectId = randomUUID();
    const attachment = await createAttachment(projectId, {
      kind: "video",
      name: clip.name,
      asset: clip,
      frames: [still],
      text: "",
      detail: "모의 영상 첨부",
    });
    for (const provider of ["higgsfield", "kling"] as const) {
      const higgs = provider === "higgsfield";
      const input: RunInput = {
        provider,
        operation: "video",
        projectId,
        requestId: randomUUID(),
        nodeId: "video",
        model: higgs ? "test-higgs-video" : "test-kling-video",
        prompt: "극장 입구",
        references: [{ title: "첫 장면", body: "", role: "start", asset: still }],
        media: {
          mode: higgs ? "omni_reference" : "omni_ref_video",
          options: { duration: higgs ? 10 : "10" },
          assignments: { [`attachment:${attachment.id}`]: higgs ? "video_references" : "reference_video" },
        },
      };
      const prepared = await bindAttachments(projectId, input, [attachment.id]);
      assert.equal(prepared.references.at(-1)?.asset?.url, clip.url);
      const result = await execute(prepared, async (id) => { submitted.push(id); });
      assert.equal(result.asset?.type, "video");
      assert.deepEqual(await readFile(localAssetPath(result.asset!)), bytes);
    }
    const cue: RunInput = { provider: "higgsfield", operation: "audio", projectId, requestId: randomUUID(),
      nodeId: "voiceover", model: "seed_audio", characterVoice: { id: voiceId, type: "element" },
      prompt: "이제 갈 시간이야.", references: [] };
    const speech = await execute(cue, async (id) => { submitted.push(id); });
    assert.equal(speech.asset?.type, "audio");
    assert.deepEqual(await readFile(localAssetPath(speech.asset!)), Buffer.from(speechBytes));
    assert.deepEqual(submitted, ["higgs-job", "kling-job", "higgs-voice"]);
  } finally {
    process.chdir(originalDirectory);
    await rm(work, { recursive: true, force: true });
  }
});
