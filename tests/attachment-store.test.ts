import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  bindAttachments,
  createAttachment,
  getAttachment,
  safePublicUrl,
} from "../lib/attachment-store";
import type { RunInput } from "../lib/types";
import { makeStyleDraft } from "../lib/style-preset-core";

const project = randomUUID();
const other = randomUUID();
const directory = path.join(
  process.cwd(),
  ".scene-room",
  "attachments",
  project,
);
const base: RunInput = {
  projectId: project,
  requestId: randomUUID(),
  nodeId: null,
  operation: "plan",
  provider: "codex",
  prompt: "검토",
  review: true,
  references: [],
};
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

test("첨부 소유권·전달 범위·중복·본문 한도를 검사한다", async () => {
  try {
    const pic = await createAttachment(project, {
      kind: "image",
      name: "얼굴.webp",
      text: "",
      asset: image,
      detail: "이미지",
    });
    const vid = await createAttachment(project, {
      kind: "video",
      name: "동작.mp4",
      text: "대사",
      asset: video,
      frames: [image],
      detail: "대표 프레임",
    });
    const doc = await createAttachment(project, {
      kind: "document",
      name: "대본.txt",
      text: "등장인물 설명",
      detail: "본문",
    });
    assert.equal((await getAttachment(project, pic.id)).name, pic.name);
    assert.equal(
      (await stat(path.join(directory, `${pic.id}.json`))).mode & 0o777,
      0o600,
    );
    await assert.rejects(getAttachment(other, pic.id));
    await assert.rejects(getAttachment(project, "../../etc/passwd"));
    await assert.rejects(
      bindAttachments(other, { ...base, projectId: other }, [pic.id]),
    );
    await assert.rejects(bindAttachments(project, base, [pic.id, pic.id]));
    await assert.rejects(bindAttachments(project, base, Array(9).fill(pic.id)));
    const attached = await bindAttachments(project, base, [
      pic.id,
      vid.id,
      doc.id,
    ]);
    assert.deepEqual(
      attached.attachments?.map((item) => item.id),
      [pic.id, vid.id, doc.id],
    );
    assert.equal(attached.references.filter((item) => item.asset).length, 2);
    assert.ok(
      attached.references.some((item) => item.body === "등장인물 설명"),
    );
    assert.ok(attached.references.every((item) => item.nodeId === undefined));
    assert.deepEqual(
      attached,
      await bindAttachments(project, base, [pic.id, vid.id, doc.id]),
    );
    const motion = await bindAttachments(
      project,
      { ...base, provider: "higgsfield", operation: "video" },
      [vid.id],
    );
    assert.equal(motion.references.find((item) => item.asset)?.role, "motion");
    assert.equal(
      motion.references.find((item) => item.asset)?.asset?.type,
      "video",
    );
    await assert.rejects(
      bindAttachments(
        project,
        { ...base, provider: "agy", operation: "text" },
        [pic.id],
      ),
      /첨부 이미지를 읽지 못합니다/,
    );
    const missing = await createAttachment(project, {
      kind: "image",
      name: "없음",
      text: "",
      asset: {
        ...image,
        url: "/api/assets/00000000-0000-4000-8000-000000000000.png",
      },
      detail: "",
    });
    await assert.rejects(
      bindAttachments(project, base, [missing.id]),
      /찾을 수 없습니다/,
    );
    const large = await Promise.all(
      Array.from({ length: 3 }, () =>
        createAttachment(project, {
          kind: "document",
          name: "긴 문서",
          text: "가".repeat(50_000),
          detail: "",
        }),
      ),
    );
    await assert.rejects(
      bindAttachments(
        project,
        base,
        large.map((item) => item.id),
      ),
      /한도/,
    );
    assert.deepEqual(await bindAttachments(project, base, []), base);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("링크 자격증명과 텍스트 비밀을 보관하지 않는다", async () => {
  try {
    const url = safePublicUrl(
      "https://example.com/info?topic=drama&access_token=abcdefgh123456#section",
    );
    assert.equal(url, "https://example.com/info?topic=drama");
    const record = await createAttachment(project, {
      kind: "link",
      name: "페이지",
      text: "api_key=abcdefgh123456 안전한 내용",
      detail: "공개 본문",
      url,
    });
    assert.ok(!record.text.includes("abcdefgh123456"));
    assert.ok(!JSON.stringify(record).includes("access_token"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("레퍼런스 측정 시간의 저장과 범위를 검증하고 기존 첨부를 읽는다", async () => {
  try {
    const content = {
      kind: "video" as const,
      name: "영상.mp4",
      text: "",
      detail: "",
      asset: video,
      referenceTiming: { durationSeconds: 4, cutTimes: [1, 2.5], frameTimes: [0.5, 3], cutDetection: "measured" as const },
    };
    const record = await createAttachment(project, content);
    assert.deepEqual((await getAttachment(project, record.id)).referenceTiming, content.referenceTiming);
    const legacy = await createAttachment(project, { ...content, referenceTiming: undefined });
    assert.equal((await getAttachment(project, legacy.id)).referenceTiming, undefined);
    await assert.rejects(createAttachment(project, { ...content, referenceTiming: { ...content.referenceTiming, cutTimes: [5] } }), /시간 정보/);
    await writeFile(path.join(directory, `${record.id}.json`), JSON.stringify({ ...record, referenceTiming: { ...record.referenceTiming, frameTimes: [3, 1] } }));
    await assert.rejects(getAttachment(project, record.id), /찾을 수 없습니다/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("긴 레퍼런스 8편 각각의 이미지와 본문을 전달한다", async () => {
  try {
    const records = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      createAttachment(project, {
        kind: "video", name: `참조-${index}.mp4`, asset: video, detail: "대표 화면",
        text: `영상 ${index} 근거 ` + "장면 설명 ".repeat(8000),
        frames: [image, { ...image, url: "/sample/frame.webp", name: "frame.webp" }],
        referenceTiming: { durationSeconds: 660, cutTimes: [], frameTimes: [2, 340] },
      }),
    ));
    const input = await bindAttachments(project, {
      ...base, review: undefined, operation: "text", provider: "claude",
      presetDesign: { mode: "analyze", draft: makeStyleDraft("film") },
    }, records.map((record) => record.id));
    assert.equal(input.attachments?.length, 8);
    const visuals = input.references.filter((item) => item.asset);
    assert.equal(visuals.length, 8);
    for (let index = 0; index < 8; index++)
      assert.equal(visuals.filter((item) => item.title.includes(`참조-${index}.mp4`)).length, 1);
    assert.equal(input.references.filter((item) => item.body.includes("근거")).length, 8);
    assert.equal((await getAttachment(project, records[0].id)).referenceTiming?.durationSeconds, 660);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
