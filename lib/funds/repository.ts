export type SchemeRecord = {
  id: string;
  schemeCode: string;
  fundHouse: string;
  name: string;
  category: string;
  categoryLabel: string;
  plan: string;
  option: string;
  isin: string | null;
  nav: number | null;
  navDate: string | null;
};

export type SchemeSearch = {
  query?: string;
  category?: string;
  fundHouse?: string;
  sort?: "name" | "nav-desc" | "nav-asc";
  limit?: number;
  offset?: number;
};

export type NavRecord = { date: string; nav: number };

export interface FundRepository {
  searchSchemes(search: SchemeSearch): Promise<{ schemes: SchemeRecord[]; total: number }>;
  getNavHistory(schemeCode: string, fromDate: string, toDate: string): Promise<NavRecord[]>;
}
