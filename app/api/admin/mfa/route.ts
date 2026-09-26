import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin/access";

type MfaAction = "enroll" | "verify" | "cancel";
type MfaRequest = { action?: unknown; factorId?: unknown; code?: unknown };

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return reply({ error: "This request is not allowed." }, 403);
  }

  let body: MfaRequest;
  try {
    body = await request.json() as MfaRequest;
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }

  const action = body.action as MfaAction;
  if (!["enroll", "verify", "cancel"].includes(action)) {
    return reply({ error: "Invalid authenticator action." }, 400);
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return reply({ error: "Your admin session has expired. Sign in again, then retry MFA setup." }, 401);
  }
  if (!isAdminEmail(user.email)) {
    return reply({ error: "This account is not authorized for admin access." }, 403);
  }

  if (action === "enroll") {
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) return reply({ error: factorsError.message }, 400);

    if (factors.totp.some((factor) => factor.status === "verified")) {
      return reply({ enabled: true });
    }

    for (const factor of factors.all.filter((candidate) => candidate.factor_type === "totp" && candidate.status === "unverified")) {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (unenrollError) return reply({ error: unenrollError.message }, 400);
    }

    const { data: enrollment, error: enrollmentError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Fundfolio admin",
    });
    if (enrollmentError) return reply({ error: enrollmentError.message }, 400);

    return reply({
      factorId: enrollment.id,
      qrCode: enrollment.totp.qr_code,
      secret: enrollment.totp.secret,
    });
  }

  if (typeof body.factorId !== "string" || !body.factorId) {
    return reply({ error: "The authenticator factor is missing." }, 400);
  }

  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError) return reply({ error: factorsError.message }, 400);
  const factor = factors.all.find((candidate) => candidate.id === body.factorId);
  if (!factor || factor.factor_type !== "totp" || factor.status !== "unverified") {
    return reply({ error: "This unfinished authenticator setup is no longer available. Start setup again." }, 409);
  }

  if (action === "cancel") {
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (unenrollError) return reply({ error: unenrollError.message }, 400);
    return reply({ cancelled: true });
  }

  if (typeof body.code !== "string" || !/^[0-9\s]{6,8}$/.test(body.code)) {
    return reply({ error: "Enter the six-digit code from your authenticator app." }, 400);
  }

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (challengeError) return reply({ error: challengeError.message }, 400);

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code: body.code.replace(/\s/g, ""),
  });
  if (verifyError) return reply({ error: "That code could not be verified. Check your authenticator and try again." }, 400);

  return reply({ enabled: true });
}
