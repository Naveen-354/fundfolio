import "server-only";

import { Pool } from "pg";
import type { FundRepository, NavRecord, SchemeRecord, SchemeSearch } from "@/lib/funds/repository";
import type { FundCategory, FundPageData, FundQuery, FundScheme } from "@/lib/funds/types";

const poolKey = Symbol.for("fundfolio.postgres.pool");
const globalPool = globalThis as typeof globalThis & { [poolKey]?: Pool };

export function getPostgresPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");
  if (!globalPool[poolKey]) {
    globalPool[poolKey] = new Pool({
      connectionString,
      max: 4,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      application_name: "fundfolio-web",
    });
  }
  return globalPool[poolKey];
}

const sortExpressions = {
  name: "s.scheme_name ASC",
  "nav-asc": "s.nav ASC NULLS LAST, s.scheme_name ASC",
  "nav-desc": "s.nav DESC NULLS LAST, s.scheme_name ASC",
} as const;

const fundCategories: FundCategory[] = ["Equity", "Debt", "Hybrid", "Index", "Other"];

function emptyCategoryCounts(): Record<FundCategory, number> {
  return { Equity: 0, Debt: 0, Hybrid: 0, Index: 0, Other: 0 };
}

export class PostgresFundRepository implements FundRepository {
  async getFundPage(query: FundQuery): Promise<FundPageData> {
    const pageSize = Math.min(Math.max(query.pageSize, 1), 100);
    const requestedPage = Math.max(query.page, 1);
    const search = {
      query: query.search,
      category: query.category,
      fundHouse: query.fundHouse,
      sort: query.sort,
      limit: pageSize,
      offset: (requestedPage - 1) * pageSize,
    } as const;

    let result = await this.searchSchemes(search);
    const [statsResult, fundHousesResult] = await Promise.all([
      getPostgresPool().query<{ category: string; total: string; navDate: string | null }>(
        `SELECT s.category, count(*)::text AS total, max(s.nav_date)::text AS "navDate"
         FROM schemes s
         JOIN fund_houses h ON h.id = s.fund_house_id
         WHERE s.is_active = TRUE AND h.is_active = TRUE
         GROUP BY s.category`,
      ),
      getPostgresPool().query<{ amfiName: string }>(
        `SELECT DISTINCT h.amfi_name AS "amfiName"
         FROM schemes s
         JOIN fund_houses h ON h.id = s.fund_house_id
         WHERE s.is_active = TRUE AND h.is_active = TRUE
         ORDER BY h.amfi_name ASC`,
      ),
    ]);

    const categoryCounts = emptyCategoryCounts();
    let navDate: string | null = null;
    for (const row of statsResult.rows) {
      const category = fundCategories.includes(row.category as FundCategory) ? row.category as FundCategory : "Other";
      categoryCounts[category] += Number(row.total);
      if (row.navDate && (!navDate || row.navDate > navDate)) navDate = row.navDate;
    }
    const fundHouses = fundHousesResult.rows.map((row) => row.amfiName);

    const pageCount = Math.max(1, Math.ceil(result.total / pageSize));
    const page = Math.min(requestedPage, pageCount);
    if (page !== requestedPage) {
      result = await this.searchSchemes({ ...search, offset: (page - 1) * pageSize });
    }

    const schemes: FundScheme[] = result.schemes.map((scheme) => ({
      schemeCode: scheme.schemeCode,
      isin: scheme.isin,
      name: scheme.name,
      fundHouse: scheme.fundHouse,
      category: fundCategories.includes(scheme.category as FundCategory) ? scheme.category as FundCategory : "Other",
      categoryLabel: scheme.categoryLabel,
      plan: scheme.plan,
      option: scheme.option,
      nav: scheme.nav ?? 0,
      navDate: scheme.navDate ?? navDate ?? "",
    }));

    return {
      schemes,
      total: result.total,
      page,
      pageSize,
      pageCount,
      navDate,
      totalSchemes: Object.values(categoryCounts).reduce((total, count) => total + count, 0),
      categoryCounts,
      fundHouses,
    };
  }

  async searchSchemes(search: SchemeSearch): Promise<{ schemes: SchemeRecord[]; total: number }> {
    const pool = getPostgresPool();
    const limit = Math.min(Math.max(search.limit ?? 20, 1), 100);
    const offset = Math.max(search.offset ?? 0, 0);
    const values: unknown[] = [];
    const clauses = ["s.is_active = TRUE", "h.is_active = TRUE"];

    if (search.category && search.category !== "All") {
      values.push(search.category);
      clauses.push(`s.category = $${values.length}`);
    }
    if (search.fundHouse?.trim()) {
      values.push(search.fundHouse.trim());
      clauses.push(`h.amfi_name = $${values.length}`);
    }
    if (search.query?.trim()) {
      const escaped = search.query.trim().replace(/[\\%_]/g, "\\$&");
      values.push(`%${escaped}%`);
      clauses.push(`(s.scheme_name ILIKE $${values.length} ESCAPE E'\\\\' OR h.amfi_name ILIKE $${values.length} ESCAPE E'\\\\')`);
    }

    const whereClause = clauses.join(" AND ");
    const countResult = await pool.query<{ total: string }>(
      `SELECT count(*)::text AS total
       FROM schemes s
       JOIN fund_houses h ON h.id = s.fund_house_id
       WHERE ${whereClause}`,
      values,
    );
    const orderBy = sortExpressions[search.sort ?? "name"];
    const pageValues = [...values, limit, offset];
    const result = await pool.query(
      `SELECT s.id, s.amfi_scheme_code AS "schemeCode", h.amfi_name AS "fundHouse", s.scheme_name AS name,
              s.category, s.category_label AS "categoryLabel", s.plan_name AS plan, s.option_name AS option,
              s.isin_growth AS isin, s.nav::float8 AS nav, s.nav_date::text AS "navDate"
       FROM schemes s
       JOIN fund_houses h ON h.id = s.fund_house_id
       WHERE ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
      pageValues,
    );
    return { schemes: result.rows as SchemeRecord[], total: Number(countResult.rows[0]?.total ?? 0) };
  }

  async getNavHistory(schemeCode: string, fromDate: string, toDate: string): Promise<NavRecord[]> {
    const result = await getPostgresPool().query(
      `SELECT nh.nav_date::text AS date, nh.nav::float8 AS nav
       FROM nav_history nh
       JOIN schemes s ON s.id = nh.scheme_id
       JOIN fund_houses h ON h.id = s.fund_house_id
       WHERE s.amfi_scheme_code = $1 AND s.is_active = TRUE AND h.is_active = TRUE
         AND nh.nav_date BETWEEN $2::date AND $3::date
       ORDER BY nh.nav_date ASC`,
      [schemeCode, fromDate, toDate],
    );
    return result.rows as NavRecord[];
  }
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
