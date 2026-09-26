import "server-only";

import { getPostgresPool, isDatabaseConfigured } from "@/lib/funds/postgres-repository";
import type { IssueReport, IssueReportCounts, IssueReportStatus } from "@/lib/issues/types";

export type IssueReportSearch = {
  status: IssueReportStatus | "all";
  search: string;
  limit: number;
  offset: number;
};

export async function createIssueReport(input: {
  reporterName: string | null;
  reporterEmail: string | null;
  message: string;
  pagePath: string | null;
}): Promise<void> {
  if (!isDatabaseConfigured()) throw new Error("DATABASE_URL is not configured");
  await getPostgresPool().query(
    `INSERT INTO public.issue_reports (reporter_name, reporter_email, message, page_path)
     VALUES ($1, $2, $3, $4)`,
    [input.reporterName, input.reporterEmail, input.message, input.pagePath],
  );
}

export async function listIssueReports(query: IssueReportSearch): Promise<{
  reports: IssueReport[];
  total: number;
  counts: IssueReportCounts;
}> {
  if (!isDatabaseConfigured()) throw new Error("DATABASE_URL is not configured");

  const pool = getPostgresPool();
  const values: unknown[] = [];
  const clauses: string[] = [];

  if (query.status !== "all") {
    values.push(query.status);
    clauses.push(`status = $${values.length}`);
  }
  if (query.search) {
    values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
    const parameter = `$${values.length}`;
    clauses.push(`(message ILIKE ${parameter} ESCAPE E'\\\\' OR reporter_name ILIKE ${parameter} ESCAPE E'\\\\' OR reporter_email ILIKE ${parameter} ESCAPE E'\\\\' OR page_path ILIKE ${parameter} ESCAPE E'\\\\')`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const [rows, totalResult, countsResult] = await Promise.all([
    pool.query(
      `SELECT id, created_at AS "createdAt", updated_at AS "updatedAt",
              reporter_name AS "reporterName", reporter_email AS "reporterEmail",
              message, page_path AS "pagePath", status,
              resolution_note AS "resolutionNote", resolved_at AS "resolvedAt",
              resolved_by AS "resolvedBy"
       FROM public.issue_reports
       ${where}
       ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.limit, query.offset],
    ),
    pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM public.issue_reports ${where}`,
      values,
    ),
    pool.query<{ status: IssueReportStatus; total: string }>(
      `SELECT status, count(*)::text AS total
       FROM public.issue_reports
       GROUP BY status`,
    ),
  ]);

  const counts: IssueReportCounts = { open: 0, in_progress: 0, resolved: 0 };
  for (const row of countsResult.rows) counts[row.status] = Number(row.total);

  return {
    reports: rows.rows as IssueReport[],
    total: Number(totalResult.rows[0]?.total ?? 0),
    counts,
  };
}

export async function updateIssueReport(input: {
  id: string;
  adminEmail: string;
  status?: IssueReportStatus;
  resolutionNote?: string | null;
}): Promise<IssueReport | null> {
  if (!isDatabaseConfigured()) throw new Error("DATABASE_URL is not configured");

  const assignments: string[] = [];
  const values: unknown[] = [input.id];
  if (input.status) {
    values.push(input.status);
    const statusParameter = `$${values.length}`;
    values.push(input.adminEmail);
    const adminParameter = `$${values.length}`;
    assignments.push(`status = ${statusParameter}`);
    assignments.push(`resolved_at = CASE WHEN ${statusParameter} = 'resolved' THEN COALESCE(resolved_at, NOW()) ELSE NULL END`);
    assignments.push(`resolved_by = CASE WHEN ${statusParameter} = 'resolved' THEN ${adminParameter} ELSE NULL END`);
  }
  if (input.resolutionNote !== undefined) {
    values.push(input.resolutionNote);
    assignments.push(`resolution_note = $${values.length}`);
  }
  if (assignments.length === 0) return null;

  const result = await getPostgresPool().query(
    `UPDATE public.issue_reports
     SET ${assignments.join(", ")}, updated_at = NOW()
     WHERE id = $1
     RETURNING id, created_at AS "createdAt", updated_at AS "updatedAt",
               reporter_name AS "reporterName", reporter_email AS "reporterEmail",
               message, page_path AS "pagePath", status,
               resolution_note AS "resolutionNote", resolved_at AS "resolvedAt",
               resolved_by AS "resolvedBy"`,
    values,
  );

  return (result.rows[0] as IssueReport | undefined) ?? null;
}
