export type FundCategory = "Equity" | "Debt" | "Hybrid" | "Index" | "Other";

export type FundScheme = {
  schemeCode: string;
  isin: string | null;
  name: string;
  fundHouse: string;
  category: FundCategory;
  categoryLabel: string;
  plan: string;
  option: string;
  nav: number;
  navDate: string;
};

export type FundQuery = {
  search: string;
  category: FundCategory | "All";
  fundHouse: string;
  sort: "name" | "nav-desc" | "nav-asc";
  page: number;
  pageSize: number;
};

export type FundPageData = {
  schemes: FundScheme[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  navDate: string | null;
  totalSchemes: number;
  categoryCounts: Record<FundCategory, number>;
  fundHouses: string[];
};

export type NavObservation = {
  date: string;
  nav: number;
};

export type FundNavHistory = {
  schemeCode: string;
  navDate: string;
  observations: NavObservation[];
};

export type FundPerformance = {
  schemeCode: string;
  period: "1M" | "3M" | "1Y" | "3Y" | "5Y";
  fromDate: string;
  toDate: string;
  startNav: number;
  latestNav: number;
  returnPercent: number;
  observations: NavObservation[];
};
