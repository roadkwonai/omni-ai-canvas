import { neon } from "@neondatabase/serverless";
import type { StylePresetDraft } from "./style-preset-core";

export type SavedStylePreset = {
  id: string;
  version: number;
  updatedAt: string;
  draft: StylePresetDraft;
};

function database() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL이 설정되지 않았습니다.");
  return neon(process.env.DATABASE_URL);
}

function preset(row: Record<string, unknown>): SavedStylePreset {
  return {
    id: row.id as string,
    version: row.version as number,
    updatedAt: new Date(row.updated_at as string).toISOString(),
    draft: row.draft as StylePresetDraft,
  };
}

export async function listStylePresets(): Promise<SavedStylePreset[]> {
  const sql = database();
  const rows =
    await sql`SELECT id, draft, version, updated_at FROM drama_canvas.style_presets ORDER BY updated_at DESC, id DESC`;
  return rows.map(preset);
}

export async function createStylePreset(
  draft: StylePresetDraft,
): Promise<SavedStylePreset> {
  const sql = database();
  const rows =
    await sql`INSERT INTO drama_canvas.style_presets (id, draft) VALUES (${crypto.randomUUID()}, ${JSON.stringify(draft)}::jsonb) RETURNING id, draft, version, updated_at`;
  return preset(rows[0]);
}

export async function saveStylePreset(
  id: string,
  version: number,
  draft: StylePresetDraft,
): Promise<SavedStylePreset | null> {
  const sql = database();
  const rows =
    await sql`UPDATE drama_canvas.style_presets SET draft = ${JSON.stringify(draft)}::jsonb, version = version + 1, updated_at = now() WHERE id = ${id} AND version = ${version} RETURNING id, draft, version, updated_at`;
  return rows[0] ? preset(rows[0]) : null;
}
