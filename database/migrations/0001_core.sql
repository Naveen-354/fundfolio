CREATE TABLE fund_houses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL UNIQUE,
  amfi_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE schemes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_house_id UUID NOT NULL REFERENCES fund_houses(id),
  amfi_scheme_code TEXT NOT NULL UNIQUE,
  scheme_name TEXT NOT NULL,
  category TEXT NOT NULL,
  category_label TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  option_name TEXT NOT NULL,
  isin_growth TEXT,
  isin_dividend_reinvestment TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX schemes_category_active_idx ON schemes (category, is_active, scheme_name);
CREATE INDEX schemes_house_active_idx ON schemes (fund_house_id, is_active);

CREATE TABLE nav_history (
  scheme_id UUID NOT NULL REFERENCES schemes(id) ON DELETE CASCADE,
  nav_date DATE NOT NULL,
  nav NUMERIC(20, 8) NOT NULL CHECK (nav > 0),
  source TEXT NOT NULL DEFAULT 'amfi',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scheme_id, nav_date)
);

CREATE INDEX nav_history_date_idx ON nav_history (nav_date DESC);
