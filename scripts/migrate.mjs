import { readFile, readdir } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) throw new Error("DATABASE_URL_UNPOOLED가 필요합니다.");
const sql = neon(url);
await sql`CREATE SCHEMA IF NOT EXISTS drama_canvas`;
await sql`CREATE TABLE IF NOT EXISTS drama_canvas.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
const applied = new Set(
  (await sql`SELECT name FROM drama_canvas.schema_migrations`).map(
    (row) => row.name,
  ),
);
const directory = new URL("../db/", import.meta.url);
const files = (await readdir(directory))
  .filter((name) => /^\d+_[\w-]+\.sql$/.test(name))
  .sort();
for (const name of files) {
  if (applied.has(name)) continue;
  const migration = await readFile(new URL(name, directory), "utf8");
  const statements = migration
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  await sql.transaction([
    ...statements.map((statement) => sql.query(statement)),
    sql`INSERT INTO drama_canvas.schema_migrations (name) VALUES (${name})`,
  ]);
}
console.log("drama_canvas 스키마를 적용했습니다.");
