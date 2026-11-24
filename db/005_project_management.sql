ALTER TABLE drama_canvas.projects ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE drama_canvas.projects ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE drama_canvas.projects ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE drama_canvas.projects ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE drama_canvas.projects ADD COLUMN IF NOT EXISTS last_opened_at timestamptz;
CREATE INDEX IF NOT EXISTS projects_recent_activity_idx ON drama_canvas.projects ((GREATEST(updated_at, last_opened_at)) DESC, id DESC);
