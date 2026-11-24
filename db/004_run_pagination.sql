CREATE INDEX IF NOT EXISTS runs_project_page_idx
  ON drama_canvas.runs (project_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS runs_project_active_page_idx
  ON drama_canvas.runs (project_id, created_at DESC, id DESC)
  WHERE status IN ('queued', 'running');
