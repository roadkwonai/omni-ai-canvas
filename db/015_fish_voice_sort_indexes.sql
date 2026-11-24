CREATE INDEX IF NOT EXISTS fish_voice_catalog_popular_idx
  ON drama_canvas.fish_voice_catalog (task_count DESC, popularity_rank, id);
CREATE INDEX IF NOT EXISTS fish_voice_catalog_recent_idx
  ON drama_canvas.fish_voice_catalog (created_at DESC NULLS LAST, popularity_rank, id);
DROP INDEX IF EXISTS drama_canvas.fish_voice_catalog_gender_rank_idx;
