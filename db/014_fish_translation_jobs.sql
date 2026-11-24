CREATE TABLE IF NOT EXISTS drama_canvas.fish_translation_job (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  lease_token uuid,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS drama_canvas.fish_translation_retry (
  id text PRIMARY KEY,
  source_hash text NOT NULL,
  retry_after timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 1
);
