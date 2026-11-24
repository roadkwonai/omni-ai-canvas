import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import NodeMarkdown from "../components/NodeMarkdown";

const exec = promisify(execFile);

async function chromePath(): Promise<string> {
  const candidates = [
    process.env.NODE_DOCUMENT_CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Google/Chrome/Application/chrome.exe"),
    process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "Google/Chrome/Application/chrome.exe"),
  ];
  for (const candidate of candidates) {
    if (candidate && await access(candidate).then(() => true, () => false)) return candidate;
  }
  throw new Error("PDF를 만들 Chrome 또는 Chromium을 찾을 수 없습니다.");
}

async function writeNodeDocumentPdf(title: string, body: string, output: string) {
  const directory = path.dirname(output);
  const browser = await chromePath();
  const font = await readFile(path.join(process.cwd(), "public/fonts/PretendardVariable.woff2"));
  const documentTitle = title.trim() || "제목 없는 문서";
  const pageTitle = renderToStaticMarkup(createElement("title", null, documentTitle));
  const heading = renderToStaticMarkup(createElement("h1", null, documentTitle));
  const markdown = renderToStaticMarkup(createElement(NodeMarkdown, { text: body }));
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">${pageTitle}
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; base-uri 'none'">
    <style>
    @font-face { font-family: Pretendard; src: url(data:font/woff2;base64,${font.toString("base64")}) format('woff2'); font-weight: 100 900; }
    @page { size: A4; margin: 18mm 17mm; }
    body { font-family: Pretendard, sans-serif; color: #191b20; font-size: 11pt; line-height: 1.7; overflow-wrap: anywhere; }
    h1, h2, h3, h4, h5, h6 { margin: 1.2em 0 .45em; line-height: 1.35; break-after: avoid; }
    body > h1 { margin-top: 0; font-size: 20pt; }
    .node-markdown h1 { font-size: 17pt; } .node-markdown h2 { font-size: 15pt; } .node-markdown h3 { font-size: 13pt; }
    p, ul, ol, blockquote, pre { margin: 0 0 .85em; } ul, ol { padding-left: 1.6em; }
    li ul, li ol { margin-bottom: 0; } blockquote { padding-left: 12px; border-left: 3px solid #dcdee3; color: #555d6d; }
    code { padding: .1em .3em; background: #f2f3f5; border-radius: 4px; }
    pre { padding: 10px; background: #f2f3f5; white-space: pre-wrap; overflow-wrap: anywhere; }
    pre code { padding: 0; } a { color: #b93901; } hr { border: 0; border-top: 1px solid #dcdee3; }
    table { width: 100%; border-collapse: collapse; margin-bottom: .85em; table-layout: auto; }
    th, td { padding: 6px 8px; border: 1px solid #dcdee3; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #f2f3f5; } tr { break-inside: avoid; } img { max-width: 100%; }
    </style></head><body>${heading}${markdown}</body></html>`;
  const source = path.join(directory, "document.html");
  await writeFile(source, html, { mode: 0o600 });
  await exec(browser, [
    "--headless", "--disable-gpu", "--disable-extensions", "--disable-background-networking",
    "--disable-sync", "--disable-default-apps", "--no-first-run", "--no-pdf-header-footer",
    `--user-data-dir=${path.join(directory, "profile")}`, `--print-to-pdf=${output}`,
    pathToFileURL(source).href,
  ], { timeout: 45_000, maxBuffer: 1024 * 1024 });
}

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error("문서 파일 경로가 필요합니다.");
  const { title, body } = JSON.parse(await readFile(input, "utf8")) as { title: string; body: string };
  await writeNodeDocumentPdf(title, body, output);
}
void main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "PDF 생성 오류"}\n`); process.exitCode = 1; });
