import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { inspectAttachmentFile } from "../lib/attachment-files";
import { localAssetPath } from "../lib/media";
import type { Asset } from "../lib/types";

const exec = promisify(execFile);
function pdf(content: string) {
  const stream = content ? `BT /F1 18 Tf 30 100 Td (${content}) Tj ET` : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const start = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(output);
}

test("텍스트와 PDF·DOCX·PPTX 문서 내용을 로컬에서 추출한다", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "attachment-test-"));
  const saved: Asset[] = [];
  try {
    const text = await inspectAttachmentFile(
      Buffer.from("가".repeat(12_020)),
      "대본.txt",
    );
    assert.equal(Array.from(text.text).length, 12_000);
    assert.match(text.detail, /12,000/);
    assert.match(
      (await inspectAttachmentFile(pdf("Hello scene"), "scene.pdf")).text,
      /Hello scene/,
    );
    const blank = await inspectAttachmentFile(pdf(""), "scan.pdf");
    saved.push(...(blank.frames ?? []));
    assert.match(blank.detail, /OCR/);
    assert.equal(blank.frames?.length, 1);
    const script = `import zipfile,sys\np=sys.argv[1]; kind=sys.argv[2]\nwith zipfile.ZipFile(p,'w',zipfile.ZIP_DEFLATED) as z:\n z.writestr('word/document.xml' if kind=='docx' else 'ppt/slides/slide1.xml','<root xmlns:w="urn:w"><w:p><w:r><w:t>장면 대사</w:t></w:r></w:p></root>')`;
    for (const kind of ["docx", "pptx"]) {
      const file = path.join(root, `input.${kind}`);
      await exec("python3", ["-c", script, file, kind]);
      assert.match(
        (await inspectAttachmentFile(await readFile(file), `input.${kind}`))
          .text,
        /장면 대사/,
      );
    }
    await assert.rejects(
      inspectAttachmentFile(Buffer.from(""), "empty.txt"),
      /64 MiB/,
    );
    await assert.rejects(
      inspectAttachmentFile(Buffer.from("bad"), "bad.pdf"),
      /PDF/,
    );
  } finally {
    await Promise.all(
      saved.map((asset) => unlink(localAssetPath(asset)).catch(() => {})),
    );
    await rm(root, { recursive: true, force: true });
  }
});

test("영상 프레임과 시각 정보를 추출하고 음성 전사 여부를 알린다", async () => {
  const saved: Asset[] = [];
  try {
    const result = await inspectAttachmentFile(
      await readFile("public/sample/preview.mp4"),
      "clip.mp4",
    );
    saved.push(result.asset!, ...(result.frames ?? []));
    assert.equal(result.kind, "video");
    assert.equal(result.asset?.type, "video");
    assert.equal(result.frames?.length, 3);
    assert.match(result.detail, /대표 프레임/);
    assert.match(result.detail, /오디오 없음/);
    for (const frame of result.frames ?? []) assert.equal(frame.type, "image");
    await assert.rejects(
      inspectAttachmentFile(Buffer.from("not video"), "bad.mp4"),
      /영상/,
    );
  } finally {
    await Promise.all(
      saved.map((asset) => unlink(localAssetPath(asset)).catch(() => {})),
    );
  }
});

test("내장 자막을 텍스트로 읽고 음성이 전사되지 않았음을 표시한다", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "attachment-av-"));
  const saved: Asset[] = [];
  try {
    const captions = path.join(root, "captions.srt");
    const video = path.join(root, "captioned.mp4");
    await writeFile(
      captions,
      "1\n00:00:00,000 --> 00:00:01,000\nA quiet scene\n",
    );
    await exec("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=black:s=160x90:r=10:d=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      "-i",
      captions,
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-c:s",
      "mov_text",
      "-t",
      "2",
      "-y",
      video,
    ]);
    const result = await inspectAttachmentFile(
      await readFile(video),
      "captioned.mp4",
    );
    saved.push(result.asset!, ...(result.frames ?? []));
    assert.match(result.text, /A quiet scene/);
    assert.match(result.detail, /음성 전사 미실행/);
    assert.match(result.detail, /내장 자막 추출/);
  } finally {
    await Promise.all(
      saved.map((asset) => unlink(localAssetPath(asset)).catch(() => {})),
    );
    await rm(root, { recursive: true, force: true });
  }
});
