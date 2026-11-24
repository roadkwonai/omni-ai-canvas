import { database } from "./db";
import type { Graph, Project } from "./types";

export type BoardPreset = { id: string; name: string; graph: Graph; profileId: string | null; productionSettings: Project["productionSettings"]; createdAt: string };

function summary(row: Record<string, unknown>) {
  return { id: row.id as string, name: row.name as string, profileId: (row.production_profile_id as string | null) ?? null, productionSettings: (row.production_settings as Project["productionSettings"]) ?? null, createdAt: new Date(row.created_at as string).toISOString() };
}

function preset(row: Record<string, unknown>): BoardPreset {
  return { ...summary(row), graph: row.graph as Graph };
}

export async function listBoardPresets(): Promise<Omit<BoardPreset, "graph">[]> {
  const sql = database();
  const rows = await sql`SELECT id, name, production_profile_id, production_settings, created_at FROM drama_canvas.board_presets ORDER BY created_at DESC, id DESC`;
  return rows.map(summary);
}

export async function getBoardPreset(id: string): Promise<BoardPreset | null> {
  const sql = database();
  const rows = await sql`SELECT id, name, graph, production_profile_id, production_settings, created_at FROM drama_canvas.board_presets WHERE id = ${id}`;
  return rows[0] ? preset(rows[0]) : null;
}

export async function createBoardPreset(name: string, graph: Graph, projectId: string, version: number): Promise<BoardPreset | null> {
  const sql = database();
  const rows = await sql`INSERT INTO drama_canvas.board_presets (id, name, graph, production_profile_id, production_settings)
    SELECT ${crypto.randomUUID()}::uuid, ${name}, ${JSON.stringify(graph)}::jsonb, production_profile_id, production_settings
    FROM drama_canvas.projects WHERE id = ${projectId} AND version = ${version} AND deleted_at IS NULL
    RETURNING id, name, graph, production_profile_id, production_settings, created_at`;
  return rows[0] ? preset(rows[0]) : null;
}
