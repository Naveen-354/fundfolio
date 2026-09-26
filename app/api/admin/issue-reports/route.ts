import { getAdminAccess, getSupabasePublicConfig } from "@/lib/admin/access";
import { isDatabaseConfigured } from "@/lib/funds/postgres-repository";
import { listIssueReports } from "@/lib/issues/repository";
import { issueReportStatuses } from "@/lib/issues/types";

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function authorize() {
  if (!getSupabasePublicConfig().configured) return { error: reply({ error: "Admin authentication is not configured." }, 503) };
  if (!isDatabaseConfigured()) return { error: reply({ error: "The issue-report database is not configured." }, 503) };

  const access = await getAdminAccess();
  if (!access) return { error: reply({ error: "This account is not authorized for admin access." }, 403) };
  if (access.mfaEnabled && !access.aal2) return { error: reply({ error: "Complete the authenticator check before managing reports." }, 403) };
  return { error: null, access };
}

export async function GET(request: Request) {
  try {
    const authorization = await authorize();
    if (authorization.error) return authorization.error;

    const params = new URL(request.url).searchParams;
    const status = params.get("status") ?? "open";
    if (status !== "all" && !issueReportStatuses.includes(status as (typeof issueReportStatuses)[number])) {
      return reply({ error: "Choose a valid report status." }, 400);
    }
    const search = (params.get("search") ?? "").trim().slice(0, 100);
    const pageValue = Number(params.get("page") ?? "1");
    const page = Number.isInteger(pageValue) ? Math.max(1, pageValue) : 1;
    const limit = 40;
    const result = await listIssueReports({ status: status as "all" | (typeof issueReportStatuses)[number], search, limit, offset: (page - 1) * limit });
    return reply({ ...result, page, pageSize: limit, pageCount: Math.max(1, Math.ceil(result.total / limit)) });
  } catch {
    return reply({ error: "Problem reports could not be loaded. Check the database connection and try again." }, 502);
  }
}
