import { warmFishTagTranslations } from "../lib/fish-tag-translations";

warmFishTagTranslations().then((result) => console.log(result)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "태그 번역을 완료하지 못했습니다.");
  process.exitCode = 1;
});
