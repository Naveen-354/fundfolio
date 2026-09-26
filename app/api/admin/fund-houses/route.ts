import { getAdminAccess, getSupabasePublicConfig } from "@/lib/admin/access";
import { getAmfiFundHouses } from "@/lib/funds/amfi";
import { listFundHouses, syncAmfiFundHouses } from "@/lib/funds/fund-houses";
import { isDatabaseConfigured } from "@/lib/funds/postgres-repository";

export async function GET() {
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
      return Response.json({ error: "Complete the authenticator check before managing fund houses." }, { status: 403 });
    }

    const amfiFundHouses = await getAmfiFundHouses();
    await syncAmfiFundHouses(amfiFundHouses);
    const houses = await listFundHouses(amfiFundHouses.map(({ sourceKey }) => sourceKey));

    return Response.json({ fundHouses: houses }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Fund houses are temporarily unavailable. Check the database connection and try again." }, { status: 502 });
  }
}
