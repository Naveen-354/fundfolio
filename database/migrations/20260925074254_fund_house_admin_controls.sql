ALTER TABLE public.fund_houses
  ADD COLUMN amfi_id TEXT,
  ADD COLUMN rta_type TEXT,
  ADD COLUMN rta_code TEXT,
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.fund_houses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nav_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.fund_houses, public.schemes, public.nav_history FROM anon, authenticated;
