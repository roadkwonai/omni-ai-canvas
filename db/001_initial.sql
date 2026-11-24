CREATE SCHEMA IF NOT EXISTS drama_canvas;

CREATE TABLE IF NOT EXISTS drama_canvas.projects (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  graph jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drama_canvas.runs (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES drama_canvas.projects(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  input jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, request_id)
);

CREATE INDEX IF NOT EXISTS runs_queue_idx ON drama_canvas.runs (created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS runs_project_idx ON drama_canvas.runs (project_id, created_at DESC);
