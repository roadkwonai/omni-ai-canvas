import { drainFishPretranslation } from "../lib/fish-catalog-pretranslation";

drainFishPretranslation().then((status) => console.log(status)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Fish Audio 사전 번역을 완료하지 못했습니다.");
  process.exitCode = 1;
});
