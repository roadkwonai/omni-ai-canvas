import { spawn } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { MAX_MEDIA_BYTES, storeMedia } from "./media";
import type { ProviderInfo, RunInput, RunResult } from "./types";

const installationRequired = "Road Music을 설치하고 ROAD_MUSIC_HOME에 설치 폴더를 지정하세요.";
const home = () => process.env.ROAD_MUSIC_HOME?.trim();
const cli = (directory: string) => path.resolve(directory, "cli", "road-music.js");
const env: NodeJS.ProcessEnv = {
  NODE_ENV: process.env.NODE_ENV,
  ...Object.fromEntries(
    [
      "PATH",
      "HOME",
      "USER",
      "TMPDIR",
      "LANG",
      "LC_ALL",
      "SHELL",
      "ROADMUSIC_DATA_DIR",
    ].flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
  ),
};

async function call(
  command:
    | "service:status"
    | "app:state"
    | "song:prepare"
    | "song:generate"
    | "job:wait",
  params?: object,
  timeout = 30_000,
): Promise<unknown> {
  const directory = home();
  if (!directory) throw new Error(installationRequired);
  return new Promise((resolve, reject) => {
    const args = [cli(directory), command];
    if (params) args.push("--stdin");
    if (command === "service:status") args.push("--no-start");
    if (command === "job:wait") args.push("--timeout", String(timeout));
    const child = spawn(process.execPath, args, {
      cwd: directory,
      env,
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "ignore"],
    });
    let output = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform !== "win32" && child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      } else child.kill("SIGKILL");
    }, timeout + 5000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.length > 2_000_000) child.kill("SIGKILL");
    });
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("Road Music CLI를 실행할 수 없습니다."));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut)
        return reject(new Error("Road Music 응답 시간이 초과됐습니다."));
      let result: {
        ok?: boolean;
        result?: unknown;
        error?: { code?: string; uncertain?: boolean };
      };
      try {
        result = JSON.parse(output);
      } catch {
        return reject(new Error("Road Music 응답을 확인하지 못했습니다."));
      }
      if (code !== 0 || result.ok !== true)
        return reject(
          new Error(
            command === "song:generate"
              ? "Road Music 제출 상태를 확인할 수 없습니다. 서비스의 작업 목록을 확인하세요."
              : "Road Music 서비스와 엔진 상태를 확인하세요.",
          ),
        );
      resolve(result.result);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(params ? JSON.stringify(params) : undefined);
  });
}

export async function roadMusicInfo(): Promise<ProviderInfo> {
  let installed = false;
  let running = false;
  const directory = home();
  try {
    installed = Boolean(directory && (await stat(cli(directory))).isFile());
  } catch {
    /* CLI unavailable */
  }
  if (installed) {
    try {
      await call("service:status");
      running = true;
    } catch {
      /* service is stopped */
    }
  }
  return {
    id: "road-music",
    label: "Road Music",
    operations: ["audio"],
    available: installed,
    detail: !installed
      ? installationRequired
      : running
        ? "로컬 서비스 연결됨 · 엔진 상태는 실행 시 확인"
        : "생성 시 로컬 서비스를 시작합니다 · 엔진 설치 필요 여부 확인",
    billing: "로컬 엔진 사용",
    website: "https://github.com/roadkwonai/music-road",
  };
}

function within(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

export async function executeRoadMusic(
  input: RunInput,
  onSubmitted: (id: string) => Promise<void>,
): Promise<RunResult> {
  const options = input.audio;
  if (
    !options ||
    !["ace", "yue-mlx", "yue"].includes(options.engine) ||
    !["music", "sfx", "ambience"].includes(options.purpose) ||
    !Number.isInteger(options.seconds)
  )
    throw new Error("음악 엔진과 길이를 확인하세요.");
  const effect = options.purpose !== "music";
  if (
    effect &&
    (options.engine !== "ace" || options.seconds < 1 || options.seconds > 30)
  )
    throw new Error("효과음과 환경음은 ACE에서 1~30초로 생성합니다.");
  if (
    !effect &&
    (options.seconds < (options.engine === "ace" ? 1 : 20) ||
      options.seconds > (options.engine === "ace" ? 600 : 360))
  )
    throw new Error("엔진에 맞는 음악 길이를 확인하세요.");
  const style = input.prompt.trim();
  if (!style || style.length > 2000)
    throw new Error("음악 요청은 2000자 이하여야 합니다.");
  const request = {
    title: input.target?.title?.slice(0, 200) || "Omni AI Canvas 음향",
    engine: options.engine,
    style,
    instrumental: true,
    ...(effect ? { soundEffect: true } : {}),
    targetSeconds: options.seconds,
    count: 1,
    requestPrompt: input.prompt,
  };
  const prepared = (await call("song:prepare", request)) as {
    valid?: boolean;
    errors?: unknown[];
    changes?: { style?: { dropped?: unknown[] } };
  };
  if (!prepared?.valid || prepared.changes?.style?.dropped?.length)
    throw new Error(
      "Road Music 생성 준비 검증에 실패했습니다. 음악 지시와 엔진 설정을 확인하세요.",
    );
  const state = (await call("app:state")) as {
    songsDir?: unknown;
    engines?: Record<string, boolean>;
  };
  if (
    !state?.engines?.[options.engine] ||
    typeof state.songsDir !== "string" ||
    !path.isAbsolute(state.songsDir)
  )
    throw new Error(
      "선택한 Road Music 엔진이 준비되지 않았습니다. 엔진 설정을 확인하세요.",
    );
  const allowedRoot = await realpath(state.songsDir);
  const submitted = (await call("song:generate", request, 120_000)) as {
    jobId?: unknown;
    jobs?: { jobId?: unknown }[];
  };
  const id =
    submitted?.jobId ??
    (submitted?.jobs?.length === 1 ? submitted.jobs[0]?.jobId : undefined);
  if (typeof id !== "string" || !/^[\w-]{1,128}$/.test(id))
    throw new Error(
      "Road Music 작업 번호를 확인하지 못했습니다. 작업 목록을 확인하세요.",
    );
  try {
    await onSubmitted(id);
  } catch {
    throw new Error(
      `Road Music 작업 ${id}의 번호를 이력에 저장하지 못했습니다. 작업 목록을 확인하세요.`,
    );
  }
  const message = `Road Music 작업 ${id}의 결과를 확인하지 못했습니다. 작업 목록에서 상태를 확인하세요.`;
  let done: {
    ok?: boolean;
    song?: { dir?: unknown; audio?: unknown; jobId?: unknown };
  };
  try {
    done = (await call(
      "job:wait",
      { jobId: id, timeoutMs: 3_590_000 },
      3_600_000,
    )) as typeof done;
  } catch {
    throw new Error(message);
  }
  const song = done?.song;
  if (
    !done?.ok ||
    song?.jobId !== id ||
    typeof song.dir !== "string" ||
    typeof song.audio !== "string"
  )
    throw new Error(message);
  let dir: string;
  let file: string;
  try {
    dir = await realpath(song.dir);
    file = await realpath(song.audio);
  } catch {
    throw new Error(message);
  }
  if (!within(allowedRoot, dir) || !within(dir, file))
    throw new Error(
      `Road Music 작업 ${id}의 결과가 허용된 음악 폴더 밖에 있습니다.`,
    );
  const info = await stat(file);
  if (!info.isFile() || info.size < 1 || info.size > MAX_MEDIA_BYTES)
    throw new Error(message);
  const asset = await storeMedia(
    await readFile(file),
    path.basename(file),
    "audio",
  );
  return {
    asset,
    text:
      options.engine === "ace"
        ? "생성된 음원의 길이와 내용은 청취로 확인하세요."
        : "YuE 연주곡의 실제 길이와 보컬 유무는 청취로 확인하세요.",
  };
}
