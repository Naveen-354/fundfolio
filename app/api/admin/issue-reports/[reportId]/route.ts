import { getAdminAccess, getSupabasePublicConfig } from "@/lib/admin/access";
import { isDatabaseConfigured } from "@/lib/funds/postgres-repository";
import { updateIssueReport } from "@/lib/issues/repository";
import { issueReportStatuses } from "@/lib/issues/types";

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) return reply({ error: "This request is not allowed." }, 403);
  if (!getSupabasePublicConfig().configured) return reply({ error: "Admin authentication is not configured." }, 503);
  if (!isDatabaseConfigured()) return reply({ error: "The issue-report database is not configured." }, 503);

  const access = await getAdminAccess();
  if (!access) return reply({ error: "This account is not authorized for admin access." }, 403);
  if (access.mfaEnabled && !access.aal2) return reply({ error: "Complete the authenticator check before managing reports." }, 403);

  const { reportId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reportId)) {
    return reply({ error: "This report could not be found." }, 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "Invalid report update." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "Invalid report update." }, 400);

  const fields = body as { status?: unknown; resolutionNote?: unknown };
  const validStatus = fields.status === undefined || issueReportStatuses.includes(fields.status as (typeof issueReportStatuses)[number]);
  const validNote = fields.resolutionNote === undefined || fields.resolutionNote === null || (typeof fields.resolutionNote === "string" && fields.resolutionNote.trim().length <= 5000);
  if (!validStatus || !validNote || (fields.status === undefined && fields.resolutionNote === undefined)) {
    return reply({ error: "Choose a valid status and a resolution note under 5,000 characters." }, 400);
  }

  try {
    const report = await updateIssueReport({
      id: reportId,
      adminEmail: access.email,
      ...(fields.status !== undefined ? { status: fields.status as (typeof issueReportStatuses)[number] } : {}),
      ...(fields.resolutionNote !== undefined ? { resolutionNote: typeof fields.resolutionNote === "string" ? fields.resolutionNote.trim() || null : null } : {}),
    });
    if (!report) return reply({ error: "This report could not be found." }, 404);
    return reply({ report });
  } catch {
    return reply({ error: "This report could not be updated. Try again." }, 502);
  }
}
