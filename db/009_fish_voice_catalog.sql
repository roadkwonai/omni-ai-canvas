CREATE TABLE IF NOT EXISTS drama_canvas.fish_voice_catalog (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  name_ko text,
  description_ko text,
  preview_url text,
  gender text,
  tags text[] NOT NULL DEFAULT '{}',
  popularity_rank integer NOT NULL,
  task_count bigint NOT NULL DEFAULT 0,
  created_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fish_voice_catalog_rank_idx ON drama_canvas.fish_voice_catalog (popularity_rank, id);
CREATE INDEX IF NOT EXISTS fish_voice_catalog_gender_rank_idx ON drama_canvas.fish_voice_catalog (gender, popularity_rank);
CREATE INDEX IF NOT EXISTS fish_voice_catalog_tags_idx ON drama_canvas.fish_voice_catalog USING GIN(tags);
CREATE TABLE IF NOT EXISTS drama_canvas.fish_voice_sync (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  next_page integer NOT NULL DEFAULT 1,
  complete boolean NOT NULL DEFAULT false,
  lease_token uuid,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
