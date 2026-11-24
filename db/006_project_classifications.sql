CREATE TABLE IF NOT EXISTS drama_canvas.project_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('category', 'tag')),
  name text NOT NULL CHECK (length(btrim(name)) > 0 AND ((kind = 'category' AND length(name) <= 60) OR (kind = 'tag' AND length(name) <= 40))),
  UNIQUE (kind, name)
);
INSERT INTO drama_canvas.project_classifications (kind, name)
SELECT 'category', category FROM drama_canvas.projects WHERE category IS NOT NULL AND btrim(category) <> '' AND length(category) <= 60 GROUP BY category
ON CONFLICT (kind, name) DO NOTHING;
INSERT INTO drama_canvas.project_classifications (kind, name)
SELECT 'tag', name FROM drama_canvas.projects CROSS JOIN LATERAL unnest(tags) AS name WHERE btrim(name) <> '' AND length(name) <= 40 GROUP BY name
ON CONFLICT (kind, name) DO NOTHING;
