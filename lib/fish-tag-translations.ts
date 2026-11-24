import { database } from "./db";
import { knownFishTags } from "./fish-tag-labels";
import { translateFishTtsVoices } from "./tts-translation";

export async function readFishTagLabels(): Promise<Record<string, string>> {
  const sql = database();
  const rows = await sql`SELECT tag, label_ko FROM drama_canvas.fish_voice_tag_translations`;
  return Object.fromEntries(rows.map((row) => [String(row.tag), String(row.label_ko)]));
}

export async function warmFishTagTranslations(): Promise<{ translated: number; remaining: number }> {
  const sql = database();
  const rows = await sql`SELECT DISTINCT tag FROM drama_canvas.fish_voice_catalog,
    LATERAL unnest(tags) AS tag WHERE tag IS NOT NULL AND tag <> '' ORDER BY tag`;
  const existing = await readFishTagLabels();
  const tags = rows.map((row) => String(row.tag)).filter((tag) => !existing[tag]);
  let translated = 0;
  const direct = tags.flatMap((tag) => {
    const label = knownFishTags[tag] ?? knownFishTags[tag.toLowerCase()];
    if (label) return [{ id: tag, nameKo: label }];
    if (!/[\p{L}]/u.test(tag) || /^[가-힣\d\s-]+$/u.test(tag)) return [{ id: tag, nameKo: tag }];
    return [];
  });
  async function save(items: {id: string; nameKo: string}[]) {
    if (!items.length) return;
    await sql.transaction(items.map((item) => sql`INSERT INTO drama_canvas.fish_voice_tag_translations (tag, label_ko)
      VALUES (${item.id}, ${item.nameKo}) ON CONFLICT (tag) DO NOTHING`));
    translated += items.length;
  }
  await save(direct);
  const directTags = new Set(direct.map((item) => item.id));
  const remaining = tags.filter((tag) => !directTags.has(tag));
  for (let offset = 0; offset < remaining.length; offset += 20) {
    const batch = remaining.slice(offset, offset + 20);
    const items = batch.map((tag, index) => ({ id: String(index), name: tag }));
    const output = await translateFishTtsVoices(items);
    await save(output.map((item) => ({ id: batch[Number(item.id)], nameKo: item.nameKo })));
  }
  return { translated, remaining: tags.length - translated };
}
