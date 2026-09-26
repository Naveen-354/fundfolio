import { getAdminAccess, getSupabasePublicConfig } from "@/lib/admin/access";
import { isDatabaseConfigured, getPostgresPool } from "@/lib/funds/postgres-repository";

const categories = new Set(["Equity", "Debt", "Hybrid", "Index", "Other"]);
const pageSize = 25;

export async function GET(request: Request) {
  if (!getSupabasePublicConfig().configured) {
    return Response.json({ error: "Admin authentication is not configured." }, { status: 503 });
  }
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "The scheme database is not configured." }, { status: 503 });
  }

  try {
    const access = await getAdminAccess();
    if (!access) return Response.json({ error: "This account is not authorized for admin access." }, { status: 403 });
    if (access.mfaEnabled && !access.aal2) {
      return Response.json({ error: "Complete the authenticator check before viewing schemes." }, { status: 403 });
    }

    const params = new URL(request.url).searchParams;
    const rawCategory = params.get("category") ?? "All";
    const category = rawCategory === "All" || categories.has(rawCategory) ? rawCategory : "All";
    const query = (params.get("search") ?? "").trim().slice(0, 100);
    const requestedPage = Math.min(Math.max(Number(params.get("page")) || 1, 1), 500);
    const values: unknown[] = [];
    const clauses: string[] = [];

    if (category !== "All") {
      values.push(category);
      clauses.push(`s.category = $${values.length}`);
    }
    if (query) {
      const escaped = query.replace(/[\\%_]/g, "\\$&");
      values.push(`%${escaped}%`);
      clauses.push(`(s.scheme_name ILIKE $${values.length} ESCAPE E'\\\\' OR h.amfi_name ILIKE $${values.length} ESCAPE E'\\\\' OR s.amfi_scheme_code ILIKE $${values.length} ESCAPE E'\\\\')`);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const pool = getPostgresPool();
    const countResult = await pool.query<{ total: string }>(
      `SELECT count(*)::text AS total
       FROM schemes s
       JOIN fund_houses h ON h.id = s.fund_house_id
       ${whereClause}`,
      values,
    );
    const total = Number(countResult.rows[0]?.total ?? 0);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, pageCount);
    const pageValues = [...values, pageSize, (page - 1) * pageSize];
    const result = await pool.query(
      `SELECT s.amfi_scheme_code AS "schemeCode", s.scheme_name AS name,
              h.amfi_name AS "fundHouse", s.category, s.category_label AS "categoryLabel",
              latest.nav::float8 AS nav, latest.nav_date::text AS "navDate",
              s.is_active AS "schemeActive", h.is_active AS "fundHouseActive",
              s.amfi_portal_scheme_id AS "amfiPortalSchemeId"
       FROM schemes s
       JOIN fund_houses h ON h.id = s.fund_house_id
       LEFT JOIN LATERAL (
         SELECT nh.nav, nh.nav_date FROM nav_history nh
         WHERE nh.scheme_id = s.id ORDER BY nh.nav_date DESC LIMIT 1
       ) latest ON TRUE
       ${whereClause}
       ORDER BY s.scheme_name ASC, s.amfi_scheme_code ASC
       LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
      pageValues,
    );

    return Response.json({ schemes: result.rows, total, page, pageSize, pageCount }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json({ error: "Schemes are temporarily unavailable. Check the database connection and try again." }, { status: 502 });
  }
}
