import { getAdminAccess, getSupabasePublicConfig } from "@/lib/admin/access";
import { updateFundHouse, type FundHousePatch } from "@/lib/funds/fund-houses";
import { isDatabaseConfigured } from "@/lib/funds/postgres-repository";

type RequestBody = Record<string, unknown>;

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function readTextField(body: RequestBody, key: string, maxLength: number): { present: boolean; value?: string | null; error?: string } {
  if (!(key in body)) return { present: false };
  const value = body[key];
  if (value === null) return { present: true, value: null };
  if (typeof value !== "string") return { present: true, error: `${key} must be text.` };
  const trimmed = value.trim();
  if (trimmed.length > maxLength) return { present: true, error: `${key} must be ${maxLength} characters or fewer.` };
  return { present: true, value: trimmed || null };
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/admin/fund-houses/[id]">) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "This request is not allowed." }, 403);
  if (!getSupabasePublicConfig().configured) return reply({ error: "Admin authentication is not configured." }, 503);
  if (!isDatabaseConfigured()) return reply({ error: "The fund-house database is not configured." }, 503);

  const access = await getAdminAccess();
  if (!access) return reply({ error: "This account is not authorized for admin access." }, 403);
  if (access.mfaEnabled && !access.aal2) return reply({ error: "Complete the authenticator check before managing fund houses." }, 403);

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return reply({ error: "Invalid fund-house identifier." }, 400);
  }

  let body: RequestBody;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return reply({ error: "Invalid request." }, 400);
    body = parsed as RequestBody;
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }

  const patch: FundHousePatch = {};
  const amfiId = readTextField(body, "amfiId", 64);
  const rtaType = readTextField(body, "rtaType", 40);
  const rtaCode = readTextField(body, "rtaCode", 64);
  for (const field of [amfiId, rtaType, rtaCode]) {
    if (field.error) return reply({ error: field.error }, 400);
  }
  if (amfiId.present) patch.amfiId = amfiId.value;
  if (rtaType.present) patch.rtaType = rtaType.value;
  if (rtaCode.present) patch.rtaCode = rtaCode.value;

  if ("isActive" in body) {
    if (typeof body.isActive !== "boolean") return reply({ error: "isActive must be true or false." }, 400);
    patch.isActive = body.isActive;
  }
  if (Object.keys(patch).length === 0) return reply({ error: "No fund-house fields were provided." }, 400);

  try {
    const fundHouse = await updateFundHouse(id, patch);
    if (!fundHouse) return reply({ error: "Fund house not found." }, 404);
    return reply({ fundHouse });
  } catch {
    return reply({ error: "The fund-house update could not be saved." }, 502);
  }
}
