ALTER TABLE drama_canvas.projects ADD COLUMN IF NOT EXISTS production_profile_id text;
ALTER TABLE drama_canvas.projects ADD COLUMN IF NOT EXISTS production_settings jsonb;

CREATE TABLE IF NOT EXISTS drama_canvas.board_presets (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  graph jsonb NOT NULL,
  production_profile_id text,
  production_settings jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
