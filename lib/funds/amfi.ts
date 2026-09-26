import "server-only";

import type {
  FundCategory,
  FundPageData,
  FundNavHistory,
  FundPerformance,
  FundQuery,
  FundScheme,
  NavObservation,
} from "@/lib/funds/types";
import { getDisabledFundHouseKeys } from "@/lib/funds/fund-houses";
import { isDatabaseConfigured, PostgresFundRepository } from "@/lib/funds/postgres-repository";

const NAV_FEED_URL = "https://www.amfiindia.com/spages/NAVAll.txt";
const HISTORY_API_URL = "https://www.amfiindia.com/api/nav-history";
const revalidationSeconds = 60 * 60 * 6;
const allCategories: FundCategory[] = ["Equity", "Debt", "Hybrid", "Index", "Other"];

const emptyCounts = (): Record<FundCategory, number> => ({
  Equity: 0,
  Debt: 0,
  Hybrid: 0,
  Index: 0,
  Other: 0,
});

function categoryFromHeading(heading: string): { category: FundCategory; label: string } {
  const lower = heading.toLowerCase();
  const label = heading.replace(/^(equity|debt|hybrid|other)\s+schemes?\s*-\s*/i, "")
    .replace(/^income\/debt oriented schemes\s*-\s*/i, "");
  if (lower.includes("index")) return { category: "Index", label: "Index funds" };
  if (lower.startsWith("equity")) return { category: "Equity", label: label || "Equity" };
  if (lower.startsWith("debt") || lower.startsWith("income/debt")) return { category: "Debt", label: label || "Debt" };
  if (lower.startsWith("hybrid")) return { category: "Hybrid", label: label || "Hybrid" };
  return { category: "Other", label: label || "Other" };
}

function isoDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return null;
  const parsed = new Date(`${match[2]} ${match[1]}, ${match[3]} 12:00:00 UTC`);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0, 10);
}

export function parseAmfiNavReport(report: string): FundScheme[] {
  const schemes: FundScheme[] = [];
  let openEnded = false;
  let currentCategory: { category: FundCategory; label: string } = {
    category: "Other",
    label: "Other schemes",
  };
  let fundHouse = "AMFI member fund";

  for (const rawLine of report.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line.match(/^Open Ended Schemes\((.*)\)$/i);
    if (heading) {
      openEnded = true;
      currentCategory = categoryFromHeading(heading[1]);
      continue;
    }
    if (/^(close ended|interval) schemes\(/i.test(line)) {
      openEnded = false;
      continue;
    }

    if (!line.includes(";") && /mutual fund$/i.test(line)) {
      fundHouse = line;
      continue;
    }
    if (!openEnded || !/^\d+;/.test(line)) continue;

    const fields = line.split(";");
    if (fields.length < 8) continue;
    const [schemeCode, isin, , name, plan, option, rawNav, rawDate] = fields.map((field) => field.trim());
    const normalizedPlan = plan.toLowerCase();
    const normalizedOption = option.toLowerCase();
    const nav = Number(rawNav);
    const navDate = isoDate(rawDate);

    if (!normalizedPlan.includes("direct") || !normalizedOption.includes("growth")) continue;
    if (!schemeCode || !name || !Number.isFinite(nav) || nav <= 0 || !navDate) continue;

    schemes.push({
      schemeCode,
      isin: isin && isin !== "-" ? isin : null,
      name,
      fundHouse,
      category: currentCategory.category,
      categoryLabel: currentCategory.label,
      plan,
      option,
      nav,
      navDate,
    });
  }

  return schemes;
}

export function fundHouseSourceKey(amfiName: string): string {
  return amfiName.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN");
}

export function parseAmfiFundHouses(report: string): Array<{ sourceKey: string; amfiName: string }> {
  const names = new Map<string, string>();
  for (const rawLine of report.split(/\r?\n/)) {
    const name = rawLine.trim();
    if (!name || name.includes(";") || !/mutual fund$/i.test(name)) continue;
    const sourceKey = fundHouseSourceKey(name);
    if (sourceKey && !names.has(sourceKey)) names.set(sourceKey, name);
  }
  return [...names].map(([sourceKey, amfiName]) => ({ sourceKey, amfiName }));
}

export async function fetchAmfiNavReport(fresh = false): Promise<string> {
  const response = await fetch(NAV_FEED_URL, {
    headers: { "User-Agent": "Fundfolio/1.0 (public AMFI NAV viewer)" },
    ...(fresh ? { cache: "no-store" as const } : { next: { revalidate: revalidationSeconds } }),
  });
  if (!response.ok) throw new Error(`AMFI NAV feed returned ${response.status}`);
  return response.text();
}

export async function getAmfiSchemes(): Promise<FundScheme[]> {
  const schemes = parseAmfiNavReport(await fetchAmfiNavReport());
  if (schemes.length === 0) throw new Error("AMFI returned no direct growth schemes");
  return schemes;
}

export async function getAmfiFundHouses(): Promise<Array<{ sourceKey: string; amfiName: string }>> {
  const fundHouses = parseAmfiFundHouses(await fetchAmfiNavReport());
  if (fundHouses.length === 0) throw new Error("AMFI returned no fund houses");
  return fundHouses;
}

async function getPublicAmfiSchemes(): Promise<FundScheme[]> {
  const schemes = await getAmfiSchemes();
  if (!isDatabaseConfigured()) return schemes;
  const disabledFundHouses = await getDisabledFundHouseKeys();
  return schemes.filter((scheme) => !disabledFundHouses.has(fundHouseSourceKey(scheme.fundHouse)));
}

export async function getFundPage(query: FundQuery): Promise<FundPageData> {
  if (isDatabaseConfigured()) return new PostgresFundRepository().getFundPage(query);

  const allSchemes = await getPublicAmfiSchemes();
  const categoryCounts = emptyCounts();
  for (const scheme of allSchemes) categoryCounts[scheme.category] += 1;

  const needle = query.search.trim().toLocaleLowerCase("en-IN");
  const fundHouseFilter = query.fundHouse.trim();
  const matching = allSchemes.filter((scheme) => {
    if (query.category !== "All" && scheme.category !== query.category) return false;
    if (fundHouseFilter && scheme.fundHouse !== fundHouseFilter) return false;
    if (!needle) return true;
    return `${scheme.name} ${scheme.fundHouse} ${scheme.categoryLabel}`
      .toLocaleLowerCase("en-IN")
      .includes(needle);
  });

  matching.sort((left, right) => {
    if (query.sort === "nav-desc") return right.nav - left.nav || left.name.localeCompare(right.name);
    if (query.sort === "nav-asc") return left.nav - right.nav || left.name.localeCompare(right.name);
    return left.name.localeCompare(right.name, "en-IN");
  });

  const pageCount = Math.max(1, Math.ceil(matching.length / query.pageSize));
  const page = Math.min(Math.max(1, query.page), pageCount);
  const offset = (page - 1) * query.pageSize;

  return {
    schemes: matching.slice(offset, offset + query.pageSize),
    total: matching.length,
    page,
    pageSize: query.pageSize,
    pageCount,
    navDate: allSchemes.reduce<string | null>((latest, scheme) => !latest || scheme.navDate > latest ? scheme.navDate : latest, null),
    totalSchemes: allSchemes.length,
    categoryCounts,
    fundHouses: [...new Set(allSchemes.map((scheme) => scheme.fundHouse))].sort((a, b) => a.localeCompare(b, "en-IN")),
  };
}

type AmfiHistoryResponse = {
  data?: {
    nav_groups?: Array<{
      historical_records?: Array<{ date?: string; nav?: number | string }>;
    }>;
  };
  message?: string;
};

function amfiApiHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    Referer: "https://www.amfiindia.com/net-asset-value/nav-history",
    "User-Agent": "Fundfolio/1.0 (public AMFI NAV viewer)",
  };
}

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T12:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export async function getAmfiNavHistory(schemeCode: string): Promise<FundNavHistory | null> {
  // Deliberately doesn't require schemeCode to be one of getPublicAmfiSchemes()'s
  // Direct+Growth schemes (the site's own scheme list is Direct+Growth only, by
  // design — see parseAmfiNavReport). mfapi.in tracks every plan/option variant
  // (Regular, IDCW, ...) under its own AMFI code, and reports its own latest
  // observation date, so there's no need to cross-reference our restricted list just
  // to bound "today" — that cross-reference used to make this function silently fail
  // for any code outside the Direct+Growth set, e.g. the other plan/option variants
  // shown on a scheme's own details page.
  const url = `https://api.mfapi.in/mf/${schemeCode}`;
  const response = await fetch(url, { next: { revalidate: revalidationSeconds } });
  if (!response.ok) throw new Error(`mfapi.in history returned ${response.status}`);
  const history = (await response.json()) as { data?: Array<{ date: string; nav: string }> };
  if (!history?.data?.length) return null;

  const observations: NavObservation[] = history.data
    .map((record) => {
      const parts = record.date ? record.date.split("-") : [];
      const isoDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : "";
      return { date: isoDate, nav: Number(record.nav) };
    })
    .filter((record) => /^\d{4}-\d{2}-\d{2}$/.test(record.date) && Number.isFinite(record.nav) && record.nav > 0)
    .sort((left, right) => left.date.localeCompare(right.date));

  if (!observations.length) return null;
  return { schemeCode, navDate: observations[observations.length - 1].date, observations };
}

function periodLength(period: FundPerformance["period"]): number {
  return { "1M": 31, "3M": 93, "1Y": 366, "3Y": 1096, "5Y": 1827 }[period];
}

export async function getAmfiPerformance(
  schemeCode: string,
  period: FundPerformance["period"],
): Promise<FundPerformance | null> {
  const history = await getAmfiNavHistory(schemeCode);
  if (!history) return null;

  const fromDate = shiftDate(history.navDate, -periodLength(period));
  const toDate = history.navDate;
  const observations = history.observations.filter((record) => record.date >= fromDate && record.date <= toDate);
  if (observations.length < 2) return null;
  const first = observations[0];
  const last = observations[observations.length - 1];
  const elapsedDays = Math.max(1, Math.round((Date.parse(`${last.date}T00:00:00Z`) - Date.parse(`${first.date}T00:00:00Z`)) / 86_400_000));
  const totalReturn = last.nav / first.nav;
  const returnPercent = period === "1Y" || period === "3Y" || period === "5Y"
    ? (Math.pow(totalReturn, 365.25 / elapsedDays) - 1) * 100
    : (totalReturn - 1) * 100;

  return {
    schemeCode,
    period,
    fromDate: first.date,
    toDate: last.date,
    startNav: first.nav,
    latestNav: last.nav,
    returnPercent,
    observations,
  };
}

export const categories = allCategories;

