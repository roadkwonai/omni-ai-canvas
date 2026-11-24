CREATE TABLE IF NOT EXISTS drama_canvas.fish_voice_tag_translations (
  tag text PRIMARY KEY,
  label_ko text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
