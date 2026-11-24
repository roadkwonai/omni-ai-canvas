import { higgsfieldDirectingGuide } from "@/lib/director-guidance";
import { localApi } from "@/lib/http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const sources: Record<string, { file: string; hash: string }> = {
  prompt: { file: ".agents/skills/higgsfield-generate/references/prompt-engineering.md", hash: "26e4d828d985ae21a450c5eb5f824ec2db70a2a2aa4feef8fc135f784cc41c44" },
  "cinematic-acting": { file: ".scene-room/research/higgsfield-originals/cinematic-acting.md", hash: "f1a61a1f9572380f79b38b17a4580690370c9e146db1bf3d325e64a57549baa8" },
  "cinematic-anamorphic": { file: ".scene-room/research/higgsfield-originals/cinematic-anamorphic.md", hash: "ae747d6972c6974ffaaf582da94093932e947c92873e41d137a8edfbc8c9407b" },
  "cinematic-prompt-engine": { file: ".scene-room/research/higgsfield-originals/cinematic-prompt-engine.md", hash: "da8bd98ef4c8208b46b827c45ef85317c34269c47dba6126320a28dd2551bf23" },
  "short-drama-screenwriter": { file: ".scene-room/research/higgsfield-originals/short-drama-screenwriter.md", hash: "1faecbba58fbc9e56646d1c109d3c625c7f65cc32fb3bb5d9068264b13f9ddd6" },
  "short-drama-seedance-prompt": { file: ".scene-room/research/higgsfield-originals/short-drama-seedance-prompt.md", hash: "b3e4689edcbbe003ba61aa9dbb403f2baf445221cbb8d8a6c5806490d32d7f7f" },
  "commercial-seedance-prompt": { file: ".scene-room/research/higgsfield-originals/commercial-seedance-prompt.md", hash: "bced57a261d05e112927adc5f726558dd7ced8b85756ba3f313208eede046f1d" },
  "commercial-acting-director": { file: ".scene-room/research/higgsfield-originals/commercial-acting-director.md", hash: "42acf13095125a24c09d1d5623778d24288d6ee0e06cd99dc871814ea6f7144d" },
  "soul-id": { file: ".agents/skills/higgsfield-soul-id/SKILL.md", hash: "dd21b34df72490bb24e4386ae172839843cb8a637df4d1aa4cf3d03c05b08f43" },
  "product-photoshoot": { file: ".agents/skills/higgsfield-product-photoshoot/SKILL.md", hash: "89c9e289318a8a6ede6b8bd61bb4b330353a97528aa3869bf51977220e88ae38" },
  "faceless-video": { file: ".agents/skills/higgsfield-faceless-video/SKILL.md", hash: "1ec7a771e5bf022134df37e1a9c1ac48e9cfb11d11d1a2b1db354b4d7971e715" },
  "video-explainer": { file: ".agents/skills/higgsfield-video-explainer/SKILL.md", hash: "72c440812a27852659155c63edef2e8585bfc414995a324bc02b64cb786e435d" },
};

export async function GET(request: Request) {
  return localApi(request, async () => {
    const requested = new URL(request.url).searchParams.get("source");
    if (requested) {
      const entry = Object.hasOwn(sources, requested) ? sources[requested] : undefined;
      if (!entry) return Response.json({ error: "지원하는 원본을 선택해 주세요." }, { status: 400 });
      const content = await readFile(path.join(/* turbopackIgnore: true */ process.cwd(), entry.file), "utf8").catch(() => null);
      if (!content) {
        const error = entry.file.startsWith(".scene-room/")
          ? `제작자 원문은 별도로 보관합니다. 출처에서 받은 원문을 ${entry.file}에 저장하세요.`
          : "동봉된 스킬 원문을 찾을 수 없습니다. npm run setup:check로 프로젝트 파일을 확인하세요.";
        return Response.json({ error }, { status: 404 });
      }
      if (createHash("sha256").update(content).digest("hex") !== entry.hash)
        return Response.json({ error: "고정된 스킬 원본과 일치하지 않습니다." }, { status: 409 });
      return Response.json({ content }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ common: higgsfieldDirectingGuide() }, { headers: { "Cache-Control": "no-store" } });
  });
}
