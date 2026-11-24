ALTER TABLE drama_canvas.fish_voice_catalog
  ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS fish_voice_catalog_languages_idx
  ON drama_canvas.fish_voice_catalog USING GIN(languages);
