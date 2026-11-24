CREATE TABLE IF NOT EXISTS drama_canvas.style_presets (
  id uuid PRIMARY KEY,
  draft jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS style_presets_updated_idx ON drama_canvas.style_presets (updated_at DESC);
