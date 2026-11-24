ALTER TABLE drama_canvas.fish_voice_sync
  ADD COLUMN IF NOT EXISTS next_scope integer NOT NULL DEFAULT 0;
