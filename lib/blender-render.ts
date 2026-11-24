import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  unlink,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { MAX_MEDIA_BYTES, storeMedia } from "./media";
import { parseBlenderScene, type BlenderSceneSpec } from "./blender-scene-spec";
import type { Asset } from "./types";

const exec = promisify(execFile);
export class BlenderRenderError extends Error {}

export async function findBlender(): Promise<string> {
  const candidates = [
    process.env.BLENDER_BIN,
    "/Applications/Blender.app/Contents/MacOS/Blender",
    "blender",
  ].filter((item): item is string => !!item);
  for (const candidate of candidates) {
    try {
      const { stdout } = await exec(candidate, ["--version"], {
        timeout: 10_000,
        maxBuffer: 20_000,
      });
      if (/^Blender\s+\d/m.test(stdout)) return candidate;
    } catch {
      /* 다음 설치 경로를 확인한다. */
    }
  }
  throw new BlenderRenderError(
    "Blender를 찾지 못했습니다. 설치 경로 또는 BLENDER_BIN을 확인하세요.",
  );
}

export function runBlender(
  executable: string,
  args: string[],
  timeout: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: os.tmpdir(),
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        NODE_ENV: process.env.NODE_ENV,
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        LANG: process.env.LANG,
      },
    });
    let errorText = "";
    let timedOut = false;
    let aborted = false;
    const kill = () => {
      if (!child.pid) return;
      try {
        if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, timeout);
    const abort = () => {
      aborted = true;
      kill();
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    child.stderr.on("data", (chunk: Buffer) => {
      errorText = (errorText + chunk.toString()).slice(-4000);
    });
    child.on("error", () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new BlenderRenderError("Blender 실행을 시작하지 못했습니다."));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (code === 0 && !timedOut && !aborted) resolve();
      else
        reject(
          new BlenderRenderError(
            aborted
              ? "Blender 렌더가 취소되었습니다."
              : timedOut
                ? "Blender 렌더 시간이 초과되었습니다."
                : `Blender 렌더에 실패했습니다. ${errorText.includes("SCENE_ROOM:") ? errorText.split("SCENE_ROOM:").pop()?.split("\n")[0] : "모델과 장면 설정을 확인하세요."}`,
          ),
        );
    });
  });
}

export async function renderBlenderScene(
  input: BlenderSceneSpec,
  paths: { characterPath: string; environmentPath: string; actorPaths?: string[] },
  quality: "preview" | "final",
  signal?: AbortSignal,
): Promise<Asset> {
  const spec = parseBlenderScene(input);
  if (!spec || !["preview", "final"].includes(quality))
    throw new BlenderRenderError("3D 장면 설정을 확인해 주세요.");
  for (const filename of [paths.characterPath, paths.environmentPath, ...(paths.actorPaths ?? [])]) {
    if (
      !path.isAbsolute(filename) ||
      path.extname(filename).toLowerCase() !== ".glb"
    )
      throw new BlenderRenderError("GLB 자산 경로를 확인해 주세요.");
    const info = await stat(filename).catch(() => null);
    if (!info?.isFile() || info.size < 20 || info.size > MAX_MEDIA_BYTES)
      throw new BlenderRenderError("GLB 자산 파일을 찾을 수 없습니다.");
  }
  const executable = await findBlender();
  const hash = createHash("sha256");
  hash.update(JSON.stringify({ spec, quality, paths }));
  for (const file of [paths.characterPath, paths.environmentPath, ...(paths.actorPaths ?? [])]) hash.update(await readFile(file));
  hash.update((await exec(executable, ["--version"], { timeout: 10000 })).stdout);
  hash.update(await readFile(path.join(process.cwd(), "scripts", "blender_scene.py")));
  const cache = path.join(process.cwd(), ".scene-room", "blender-frames", hash.digest("hex"));
  await mkdir(cache, { recursive: true, mode: 0o700 });
  for (const name of await readdir(cache)) {
    if (!/^frame-\d{4}\.png$/.test(name)) continue;
    const filename = path.join(cache, name);
    try {
      const png = await readFile(filename);
      const { default: sharp } = await import("sharp");
      await sharp(png).raw().toBuffer();
    } catch {
      await unlink(filename).catch(() => {});
    }
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), "scene-blender-"));
  try {
    const config = path.join(directory, "scene.json"),
      output = path.join(directory, "render.mp4");
    const script = path.join(process.cwd(), "scripts", "blender_scene.py");
    await access(script);
    await writeFile(
      config,
      JSON.stringify({
        spec,
        paths,
        quality,
        frames: path.join(cache, "frame-"),
        resume: true,
      }),
      { mode: 0o600 },
    );
    await runBlender(
      executable,
      [
        "--background",
        "--factory-startup",
        "--disable-autoexec",
        "--python-exit-code",
        "1",
        "--python",
        script,
        "--",
        config,
      ],
      quality === "preview" ? 240_000 : 900_000,
      signal,
    );
    await exec(
      "ffmpeg",
      [
        "-v",
        "error",
        "-nostdin",
        "-framerate",
        String(spec.fps),
        "-start_number",
        "1",
        "-i",
        path.join(cache, "frame-%04d.png"),
        "-an",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-y",
        output,
      ],
      { timeout: 120_000, maxBuffer: 100_000, signal },
    );
    const info = await stat(output).catch(() => null);
    if (!info?.isFile() || info.size === 0 || info.size > MAX_MEDIA_BYTES)
      throw new BlenderRenderError(
        "렌더 결과의 크기 또는 형식을 확인해 주세요.",
      );
    const probe = await exec(
      "ffprobe",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_entries",
        "format=duration:stream=codec_type,codec_name",
        "-of",
        "json",
        output,
      ],
      { timeout: 20_000, maxBuffer: 100_000 },
    );
    const metadata = JSON.parse(probe.stdout) as {
      format?: { duration?: string };
      streams?: { codec_type?: string; codec_name?: string }[];
    };
    const duration = Number(metadata.format?.duration);
    if (
      !metadata.streams?.some(
        (stream) =>
          stream.codec_type === "video" && stream.codec_name === "h264",
      ) ||
      !Number.isFinite(duration) ||
      Math.abs(duration - spec.seconds) > Math.max(0.15, 2 / spec.fps)
    )
      throw new BlenderRenderError(
        "렌더 영상의 재생 길이 또는 코덱이 올바르지 않습니다.",
      );
    const result = await storeMedia(
      await readFile(output),
      quality === "preview" ? "Blender 프리비즈.mp4" : "Blender 최종 장면.mp4",
      "video",
    );
    await rm(cache, { recursive: true, force: true });
    return result;
  } finally {
    await rm(directory, { recursive: true, force: true });
    const files = (await readdir(cache).catch(() => [])).filter((name) => /^frame-\d{4}\.png$/.test(name)).sort();
    let bytes = 0;
    for (const name of files) {
      const file = path.join(cache, name);
      bytes += (await stat(file).catch(() => ({ size: 0 }))).size;
      if (bytes > 512 * 1024 * 1024) await unlink(file).catch(() => {});
    }
  }
}
