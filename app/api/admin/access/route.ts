import { getAdminAccess, getSupabasePublicConfig } from "@/lib/admin/access";

export async function GET() {
  if (!getSupabasePublicConfig().configured) {
    return Response.json({ error: "Admin authentication is not configured." }, { status: 503 });
  }

  const access = await getAdminAccess();
  if (!access) return Response.json({ error: "This account is not authorized for admin access." }, { status: 403 });
  return Response.json({
    authorized: true,
    email: access.email,
    aal2: access.aal2,
    mfaEnabled: access.mfaEnabled,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
