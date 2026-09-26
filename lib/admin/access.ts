import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AdminAccess = { email: string; aal2: boolean; mfaEnabled: boolean };

export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return { url, anonKey, configured: Boolean(url && anonKey) };
}

export function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

export async function getAdminAccess(): Promise<AdminAccess | null> {
  const { configured } = getSupabasePublicConfig();
  if (!configured) return null;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;

  const [{ data: assurance }, { data: factors, error: factorsError }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  if (factorsError) return null;

  return {
    email: user.email ?? "",
    aal2: assurance?.currentLevel === "aal2",
    mfaEnabled: factors.totp.some((factor) => factor.status === "verified"),
  };
}

export async function requireAdmin(): Promise<AdminAccess> {
  const access = await getAdminAccess();
  if (!access) redirect("/admin/login");
  if (access.mfaEnabled && !access.aal2) redirect("/admin/login?step=mfa");
  return access;
}
