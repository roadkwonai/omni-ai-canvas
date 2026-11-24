import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { test } from "node:test";
import { neonConfig } from "@neondatabase/serverless";
import { executeImageApi, imageApiProviders } from "../lib/image-api";
import { execute } from "../lib/runner";
import { localAssetPath } from "../lib/media";
import type { Provider, RunInput } from "../lib/types";

const image = {
  url: "/sample/portrait.webp",
  type: "image" as const,
  name: "portrait.webp",
};
const video = {
  url: "/sample/preview.mp4",
  type: "video" as const,
  name: "preview.mp4",
};
const base: RunInput = {
  projectId: "p",
  requestId: "r",
  nodeId: "n",
  provider: "openai-image",
  operation: "image",
  prompt: "달빛 아래 극장",
  references: [],
};

test("선택한 이미지 API에서 모델과 참조를 명시하고 오류를 안전하게 처리한다", async () => {
  const output = (await readFile("public/sample/frame.webp")).toString(
    "base64",
  );
  const originalFetch = globalThis.fetch;
  const originalDatabaseFetch = neonConfig.fetchFunction;
  const originalEnv = { ...process.env };
  const saved: string[] = [];
  let calls = 0;
  try {
    process.env.OPENAI_API_KEY = "private-openai-test";
    process.env.GEMINI_API_KEY = "private-gemini-test";
    process.env.ARK_API_KEY = "private-ark-test";
    process.env.SEEDREAM_MODEL = "seedream-4-5-251128";
    process.env.DATABASE_URL = "postgresql://test:password@localhost/test";
    neonConfig.fetchFunction = async (_url: string | URL | Request, init?: RequestInit) => {
      assert.match(JSON.parse(String(init?.body)).query, /SELECT.*FROM drama_canvas\.workspace_settings/s);
      return Response.json({
        fields: [
          { name: "version", dataTypeID: 23 },
          { name: "defaults", dataTypeID: 3802 },
          { name: "workspace", dataTypeID: 3802 },
          { name: "paid_image_providers", dataTypeID: 3802 },
        ],
        rows: [[
          "1", "{}", JSON.stringify({ sidebarOpen: true, sidebarTab: "kit", startPanel: "workspace", panelWidth: "standard" }),
          JSON.stringify(["openai-image", "gemini-image", "seedream"]),
        ]],
      });
    };
    const providers = imageApiProviders();
    assert.equal(
      providers.find((p) => p.id === "openai-image")?.billing,
      "OpenAI API 따로 결제",
    );
    assert.equal(
      providers.find((p) => p.id === "seedream")?.models?.[0].id,
      "seedream-4-5-251128",
    );

    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(init?.redirect, "error");
      const address = String(url);
      if (address === "https://api.openai.com/v1/images/generations") {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.model, "gpt-image-1.5");
        assert.equal(body.n, 1);
      } else if (address === "https://api.openai.com/v1/images/edits") {
        assert.ok(init?.body instanceof FormData);
        assert.equal(init.body.getAll("image[]").length, 1);
        assert.match(String(init.body.get("prompt")), /인물.*identity/);
      } else if (address.includes("generativelanguage.googleapis.com")) {
        const body = JSON.parse(String(init?.body));
        assert.equal(
          body.contents[0].parts[2].inlineData.mimeType,
          "image/webp",
        );
        return Response.json({
          candidates: [
            {
              content: {
                parts: [
                  {
                    thought: true,
                    inlineData: {
                      mimeType: "image/png",
                      data: "bad intermediate image",
                    },
                  },
                  { inlineData: { mimeType: "image/png", data: output } },
                ],
              },
            },
          ],
        });
      } else if (
        address ===
        "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations"
      ) {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.model, "seedream-4-5-251128");
        assert.equal(body.response_format, "b64_json");
        assert.match(body.image, /^data:image\/webp;base64,/);
      } else assert.fail("선택하지 않은 제공자가 호출됐습니다.");
      return Response.json({ data: [{ b64_json: output }] });
    };
    async function run(
      provider: Provider,
      withReference: boolean,
      model?: string,
    ) {
      const result = await execute({
        ...base,
        provider,
        model,
        references: withReference
          ? [{ title: "인물", body: "모습", asset: image, role: "identity" }]
          : [],
      });
      assert.equal(result.asset?.type, "image");
      saved.push(localAssetPath(result.asset!));
    }
    await run("openai-image", false, "gpt-image-1.5");
    await run("openai-image", true);
    await run("gemini-image", true);
    await run("seedream", true);
    const before = calls;
    await assert.rejects(
      executeImageApi({ ...base, model: "unsupported" }),
      /모델/,
    );
    await assert.rejects(
      executeImageApi({
        ...base,
        references: [{ title: "영상", body: "", asset: video }],
      }),
      /영상/,
    );
    await assert.rejects(
      executeImageApi({
        ...base,
        references: [
          { title: "시작 프레임", body: "", asset: image, role: "start" },
        ],
      }),
      /시작/,
    );
    assert.equal(calls, before);
    globalThis.fetch = async () =>
      new Response("private-openai-test", { status: 401 });
    await assert.rejects(
      executeImageApi(base),
      (error) =>
        error instanceof Error &&
        !error.message.includes("private-openai-test"),
    );
    globalThis.fetch = async () =>
      Response.json({
        data: [{ b64_json: Buffer.from("bad").toString("base64") }],
      });
    await assert.rejects(executeImageApi(base), /이미지/);
  } finally {
    globalThis.fetch = originalFetch;
    neonConfig.fetchFunction = originalDatabaseFetch;
    process.env = originalEnv;
    await Promise.all(saved.map((file) => rm(file, { force: true })));
  }
});
