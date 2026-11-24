import { getFishCatalogStatus, refreshFishCatalog } from "../lib/fish-catalog-cache";
import { drainFishPretranslation } from "../lib/fish-catalog-pretranslation";
import { warmFishTagTranslations } from "../lib/fish-tag-translations";

async function main() {
  let result = await refreshFishCatalog();
  if (!result.pages) return;
  while (!result.complete && result.pages > 0) result = await refreshFishCatalog();
  console.log(await getFishCatalogStatus());
  if (result.complete) {
    await Promise.all([warmFishTagTranslations(), drainFishPretranslation({ concurrency: 2 })]);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Fish Audio 목록을 동기화하지 못했습니다.");
  process.exitCode = 1;
});
