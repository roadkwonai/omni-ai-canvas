CREATE TABLE IF NOT EXISTS drama_canvas.workspace_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version integer NOT NULL CHECK (version > 0),
  defaults jsonb NOT NULL CHECK (jsonb_typeof(defaults) = 'object'),
  workspace jsonb NOT NULL CHECK (jsonb_typeof(workspace) = 'object'),
  paid_image_providers jsonb NOT NULL CHECK (jsonb_typeof(paid_image_providers) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
