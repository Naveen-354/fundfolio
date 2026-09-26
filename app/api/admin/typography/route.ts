import { getAdminAccess, getSupabasePublicConfig } from "@/lib/admin/access";
import {
  getPublicTypographySettings,
  savePublicTypographySettings,
} from "@/lib/site/typography";
import { isTypographyFont } from "@/lib/site/typography-shared";
import { isDatabaseConfigured } from "@/lib/funds/postgres-repository";

function response(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function authorize() {
  if (!getSupabasePublicConfig().configured) return { error: response({ error: "Admin authentication is not configured." }, 503) };
  if (!isDatabaseConfigured()) return { error: response({ error: "The settings database is not configured." }, 503) };

  const access = await getAdminAccess();
  if (!access) return { error: response({ error: "This account is not authorized for admin access." }, 403) };
  if (access.mfaEnabled && !access.aal2) {
    return { error: response({ error: "Complete the authenticator check before editing public typography." }, 403) };
  }
  return { error: null };
}

export async function GET() {
  try {
    const authorization = await authorize();
    if (authorization.error) return authorization.error;
    return response({ settings: await getPublicTypographySettings() });
  } catch {
    return response({ error: "Public typography settings could not be loaded." }, 502);
  }
}

export async function PUT(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return response({ error: "This request is not allowed." }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response({ error: "Invalid typography settings." }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return response({ error: "Invalid typography settings." }, 400);
  }
  const settingsBody = body as { bodyFont?: unknown; displayFont?: unknown; fontScale?: unknown; schemeListScale?: unknown };
  const validScale = (value: unknown): value is number => typeof value === "number"
    && Number.isInteger(value) && value >= 80 && value <= 125 && value % 5 === 0;
  if (!isTypographyFont(settingsBody.bodyFont) || !isTypographyFont(settingsBody.displayFont)
    || !validScale(settingsBody.fontScale) || !validScale(settingsBody.schemeListScale)) {
    return response({ error: "Choose supported fonts and text sizes from 80% to 125%." }, 400);
  }

  try {
    const authorization = await authorize();
    if (authorization.error) return authorization.error;
    const settings = await savePublicTypographySettings({
      bodyFont: settingsBody.bodyFont,
      displayFont: settingsBody.displayFont,
      fontScale: settingsBody.fontScale,
      schemeListScale: settingsBody.schemeListScale,
    });
    return response({ settings });
  } catch {
    return response({ error: "Public typography settings could not be saved." }, 502);
  }
}
