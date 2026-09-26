CREATE TABLE public.issue_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reporter_name TEXT CHECK (reporter_name IS NULL OR char_length(reporter_name) <= 120),
  reporter_email TEXT CHECK (reporter_email IS NULL OR char_length(reporter_email) <= 320),
  message TEXT NOT NULL CHECK (char_length(btrim(message)) BETWEEN 10 AND 5000),
  page_path TEXT CHECK (page_path IS NULL OR char_length(page_path) <= 2048),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  resolution_note TEXT CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 5000),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT CHECK (resolved_by IS NULL OR char_length(resolved_by) <= 320)
);

CREATE INDEX issue_reports_status_created_at_idx
  ON public.issue_reports (status, created_at DESC);

CREATE INDEX issue_reports_created_at_idx
  ON public.issue_reports (created_at DESC);

ALTER TABLE public.issue_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.issue_reports FROM PUBLIC, anon, authenticated;
