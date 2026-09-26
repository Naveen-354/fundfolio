ALTER TABLE public.site_typography_settings
  ADD COLUMN scheme_list_scale SMALLINT NOT NULL DEFAULT 100
    CHECK (scheme_list_scale BETWEEN 80 AND 125 AND scheme_list_scale % 5 = 0);
