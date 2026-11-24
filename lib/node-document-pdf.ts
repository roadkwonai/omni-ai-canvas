import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
let activeExports = 0;

export async function nodeDocumentPdf(title: string, body: string): Promise<Uint8Array<ArrayBuffer>> {
  if (activeExports >= 2) throw new Error("PDF 생성이 진행 중입니다. 잠시 후 다시 시도해 주세요.");
  activeExports++;
  let directory: string | undefined;
  try {
    directory = await mkdtemp(path.join(os.tmpdir(), "scene-room-pdf-request-"));
    const input = path.join(directory, "document.json");
    const output = path.join(directory, "document.pdf");
    await writeFile(input, JSON.stringify({ title, body }), { mode: 0o600 });
    await exec(process.execPath, ["--import", "tsx", path.join(process.cwd(), "scripts/node-document-pdf.tsx"), input, output], {
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    });
    const pdf = await readFile(output);
    if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("PDF 파일을 만들지 못했습니다.");
    return new Uint8Array(pdf);
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
    if (stderr.includes("Chrome 또는 Chromium을 찾을 수 없습니다")) {
      throw new Error("PDF를 만들 Chrome 또는 Chromium을 찾을 수 없습니다.");
    }
    throw new Error("PDF를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
    activeExports--;
  }
}
