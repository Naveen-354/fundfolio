CREATE TABLE public.site_typography_settings (
  singleton_key SMALLINT PRIMARY KEY DEFAULT 1 CHECK (singleton_key = 1),
  body_font TEXT NOT NULL DEFAULT 'arial'
    CHECK (body_font IN ('system', 'arial', 'verdana', 'trebuchet', 'georgia', 'monospace')),
  display_font TEXT NOT NULL DEFAULT 'georgia'
    CHECK (display_font IN ('system', 'arial', 'verdana', 'trebuchet', 'georgia', 'monospace')),
  font_scale SMALLINT NOT NULL DEFAULT 100 CHECK (font_scale BETWEEN 80 AND 125),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.site_typography_settings (singleton_key)
VALUES (1)
ON CONFLICT (singleton_key) DO NOTHING;

ALTER TABLE public.site_typography_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.site_typography_settings FROM anon, authenticated;
