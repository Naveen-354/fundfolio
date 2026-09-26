import { getAdminAccess, getSupabasePublicConfig } from "@/lib/admin/access";
import { updateSchemePortalId } from "@/lib/funds/amfi-portal";
import { isDatabaseConfigured } from "@/lib/funds/postgres-repository";

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ schemeCode: string }> }) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "This request is not allowed." }, 403);
  if (!getSupabasePublicConfig().configured) return reply({ error: "Admin authentication is not configured." }, 503);
  if (!isDatabaseConfigured()) return reply({ error: "The scheme database is not configured." }, 503);

  const access = await getAdminAccess();
  if (!access) return reply({ error: "This account is not authorized for admin access." }, 403);
  if (access.mfaEnabled && !access.aal2) return reply({ error: "Complete the authenticator check before managing schemes." }, 403);

  const { schemeCode } = await params;
  if (!/^\d{1,12}$/.test(schemeCode)) return reply({ error: "Invalid AMFI scheme code." }, 400);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return reply({ error: "Invalid request." }, 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }

  if (!("amfiPortalSchemeId" in body)) return reply({ error: "amfiPortalSchemeId is required." }, 400);
  const raw = body.amfiPortalSchemeId;
  if (raw !== null && typeof raw !== "string") return reply({ error: "amfiPortalSchemeId must be text." }, 400);
  const trimmed = typeof raw === "string" ? raw.trim() : null;
  if (trimmed && !/^\d{1,12}$/.test(trimmed)) return reply({ error: "amfiPortalSchemeId must be the numeric AMFI portal scheme ID." }, 400);

  try {
    const scheme = await updateSchemePortalId(schemeCode, trimmed || null);
    if (!scheme) return reply({ error: "Scheme not found." }, 404);
    return reply({ scheme });
  } catch {
    return reply({ error: "The scheme update could not be saved." }, 502);
  }
}
