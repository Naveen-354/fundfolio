import { getAdminAccess, getSupabasePublicConfig } from "@/lib/admin/access";
import { syncAmfiSchemesToDatabase } from "@/lib/funds/amfi-sync";
import { isDatabaseConfigured } from "@/lib/funds/postgres-repository";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "This request is not allowed." }, { status: 403 });
  }
  if (!getSupabasePublicConfig().configured) {
    return Response.json({ error: "Admin authentication is not configured." }, { status: 503 });
  }
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "The fund-house database is not configured." }, { status: 503 });
  }

  try {
    const access = await getAdminAccess();
    if (!access) return Response.json({ error: "This account is not authorized for admin access." }, { status: 403 });
    if (access.mfaEnabled && !access.aal2) {
      return Response.json({ error: "Complete the authenticator check before syncing AMFI data." }, { status: 403 });
    }

    const result = await syncAmfiSchemesToDatabase();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "AMFI data could not be synced. Try again when the AMFI feed is available." }, { status: 502 });
  }
}
