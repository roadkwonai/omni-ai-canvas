// 랜딩과 사용 가이드만 정적 사이트로 만든다. node scripts/build-pages.mjs → .pages-build/out
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const origin = process.env.PAGES_ORIGIN ?? "https://roadkwonai.github.io", base = process.env.PAGES_BASE ?? "/omni-ai-canvas";
const work = ".pages-build";
await rm(work, { recursive: true, force: true });
await mkdir(`${work}/public/director/examples`, { recursive: true });
for (const path of ["components", "lib", "tsconfig.json", "package.json", "public/brand", "public/fonts", "public/guide", "public/landing", "public/sample", "public/director/moves"])
  await cp(path, `${work}/${path}`, { recursive: true });
// 제작실과 API는 로컬에서만 쓰므로 넣지 않는다.
await cp("app", `${work}/app`, { recursive: true, filter: (path) => !/^app\/(api|studio)(\/|$)/.test(path) });
const showcase = await readFile("lib/director-showcase.ts", "utf8");
for (const [, id] of showcase.matchAll(/^    \["([a-z0-9-]+)"/gm))
  await cp(`public/director/examples/${id}.webp`, `${work}/public/director/examples/${id}.webp`).catch(() => {});
await writeFile(`${work}/next.config.ts`, `import path from "node:path";
export default { output: "export", basePath: ${JSON.stringify(base)}, trailingSlash: true, devIndicators: false, turbopack: { root: path.resolve(process.cwd(), "..") } };
`);
const result = spawnSync(process.execPath, ["../node_modules/next/dist/bin/next", "build"], {
  cwd: work, stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production", NEXT_PUBLIC_BASE_PATH: base, NEXT_PUBLIC_SITE_ORIGIN: origin },
});
if (result.status) process.exit(result.status);
await writeFile(`${work}/out/.nojekyll`, "");
