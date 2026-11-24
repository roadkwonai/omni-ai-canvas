import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { inspectAttachmentFile } from "./attachment-files";
import { MAX_REFERENCE_VIDEO_BYTES } from "./reference-limits";

const exec = promisify(execFile);

async function readYouTubeSubtitle(url: string, directory: string) {
  for (const mode of ["manual", "automatic"] as const) {
    const output = path.join(directory, `subtitle-${mode}`);
    const process = exec(
      "yt-dlp",
      [
        "--ignore-config",
        "--no-cache-dir",
        "--no-playlist",
        "--no-cookies",
        "--no-progress",
        "--skip-download",
        "--socket-timeout",
        "10",
        "--retries",
        "0",
        "--max-filesize",
        "256K",
        mode === "manual" ? "--write-subs" : "--write-auto-subs",
        "--sub-langs",
        "ko,en",
        "--sub-format",
        "vtt",
        "-o",
        output,
        "--",
        url,
      ],
      {
        timeout: 25_000,
        maxBuffer: 128 * 1024,
        cwd: directory,
        env: {
          PATH: globalThis.process.env.PATH,
          HOME: directory,
          LANG: "C.UTF-8",
          NODE_ENV: globalThis.process.env.NODE_ENV,
        },
      },
    );
    const monitor = setInterval(() => {
      void readdir(directory)
        .then(async (names) => {
          for (const name of names.filter((entry) =>
            entry.startsWith(`subtitle-${mode}.`),
          )) {
            if ((await stat(path.join(directory, name))).size > 256 * 1024)
              process.child.kill();
          }
        })
        .catch(() => {});
    }, 250);
    try {
      await process;
      for (const language of ["ko", "en"]) {
        const file = `${output}.${language}.vtt`;
        const info = await stat(file).catch(() => null);
        if (!info || !info.isFile() || info.size < 1 || info.size > 256 * 1024)
          continue;
        const text = (await readFile(file, "utf8")).trim();
        if (text.startsWith("WEBVTT"))
          return {
            text,
            note: `YouTube ${mode === "manual" ? "제공 자막" : "자동 생성 자막"} (${language})`,
          };
      }
    } catch {
      // 자막 접근이 실패해도 영상 자체는 계속 분석한다.
    } finally {
      clearInterval(monitor);
    }
  }
  return undefined;
}

export function canonicalYouTubeUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("공개 YouTube 영상 주소를 확인해 주세요.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error("공개 YouTube 영상 주소를 확인해 주세요.");
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be")
    id = /^\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
    if (url.pathname === "/watch") {
      const values = url.searchParams.getAll("v");
      id = values.length === 1 ? values[0] : null;
    } else
      id = /^\/(?:shorts|embed)\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  }
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id))
    throw new Error("공개 YouTube 영상 주소를 확인해 주세요.");
  return `https://www.youtube.com/watch?v=${id}`;
}

export async function inspectYouTubeReference(value: string) {
  const url = canonicalYouTubeUrl(value);
  const directory = await mkdtemp(path.join(os.tmpdir(), "scene-reference-"));
  const output = path.join(directory, "reference.mp4");
  try {
    try {
      const download = exec(
        "yt-dlp",
        [
          "--ignore-config",
          "--no-cache-dir",
          "--no-playlist",
          "--no-cookies",
          "--no-progress",
          "--no-part",
          "--socket-timeout",
          "15",
          "--retries",
          "1",
          "--fragment-retries",
          "1",
          "--max-filesize",
          "1024M",
          "--match-filter",
          "duration <= 3600 & !is_live",
          "-f",
          "best[ext=mp4][vcodec!=none]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo[ext=mp4]",
          "--merge-output-format",
          "mp4",
          "-o",
          output,
          "--",
          url,
        ],
        {
          timeout: 600_000,
          maxBuffer: 512 * 1024,
          cwd: directory,
          env: {
            PATH: process.env.PATH,
            HOME: directory,
            LANG: "C.UTF-8",
            NODE_ENV: process.env.NODE_ENV,
          },
        },
      );
      const monitor = setInterval(() => {
        void readdir(directory).then(async (names) => {
          let partsSize = 0;
          for (const name of names) {
            const info = await stat(path.join(directory, name)).catch(() => null);
            if (!info?.isFile()) continue;
            if (info.size > MAX_REFERENCE_VIDEO_BYTES) {
              download.child.kill();
              return;
            }
            if (name !== "reference.mp4" && name !== "reference.temp.mp4")
              partsSize += info.size;
          }
          if (partsSize > MAX_REFERENCE_VIDEO_BYTES) download.child.kill();
        }).catch(() => {});
      }, 500);
      try { await download; } finally { clearInterval(monitor); }
      const info = await stat(output);
      if (!info.isFile() || info.size < 1 || info.size > MAX_REFERENCE_VIDEO_BYTES)
        throw new Error("invalid size");
      const externalSubtitle = await readYouTubeSubtitle(url, directory);
      return await inspectAttachmentFile(
        output,
        "YouTube 레퍼런스.mp4",
        {
          referenceVideo: true,
          sourceUrl: url,
          ...(externalSubtitle ? { externalSubtitle } : {}),
        },
      );
    } catch {
      throw new Error(
        "공개 영상을 가져오지 못했습니다. 60분·1 GiB 이하의 MP4 또는 WebM 파일을 첨부해 주세요.",
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
