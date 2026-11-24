import type { NextConfig } from "next";

const config: NextConfig = {
  turbopack: { root: process.cwd() },
  async redirects() {
    return [
      { source: "/", has: [{ type: "query", key: "project" }], destination: "/studio", permanent: false },
    ];
  },
  // 로컬 모델·미디어·개인 참고 자료는 제작자의 작업 폴더에서만 읽는다.
  outputFileTracingExcludes: {
    "/*": [
      "./.env*", "./.npmrc", "./.scene-room/**", "./productions/**", "./resources/**",
      "./{.ssh,.gnupg,.aws,.azure,.kube,.kling,.higgsfield,.topview,.secrets}/**",
      "./.omx/**", "./.hallmark/**", "./.impeccable/**", "./docs/research-assets/**",
      "./docs/newtake-portrait-live-verification.md", "./docs/diagrams/*.browser-check.json",
      "./docs/diagrams/*.delivery.json", "./docs/diagrams/*.finalize*.json",
      "./**/{auth,credentials*,secrets}.json", "./**/*.{pem,key,p12,pfx,kdbx,log,dump,db}",
      "./**/{.credentials*,id_rsa,id_ed25519,id_ecdsa,*.credentials.json}",
    ],
  },
  devIndicators: false,
};

export default config;
