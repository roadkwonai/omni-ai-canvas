ALTER TABLE drama_canvas.fish_voice_sync
  ADD COLUMN IF NOT EXISTS scope_plan text[] NOT NULL DEFAULT
  ARRAY['', 'ko', 'en', 'ja', 'zh', 'ru', 'es', 'fr', 'de', 'ar', 'pt',
        'hi', 'id', 'it', 'th', 'vi', 'tr', 'nl', 'pl', 'sv', 'ro', 'uk',
        'cy', 'el', 'ky', 'lv', 'rw', 'sw', 'tl']::text[];
