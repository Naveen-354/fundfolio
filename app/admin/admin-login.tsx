"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type PublicConfig = { url: string; anonKey: string; configured: boolean };
type Step = "login" | "verify";

export function AdminLogin({ config }: { config: PublicConfig }) {
  const router = useRouter();
  const supabase = useMemo(() => config.configured
    ? createSupabaseBrowserClient(config.url, config.anonKey)
    : null, [config.configured, config.url, config.anonKey]);
  const [step, setStep] = useState<Step>("login");
  const [factorId, setFactorId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const requestAccess = useCallback(async (client: SupabaseClient) => {
    const response = await fetch("/api/admin/access", { cache: "no-store" });
    const data = await response.json() as { aal2?: boolean; mfaEnabled?: boolean; error?: string };
    if (response.status === 403) {
      await client.auth.signOut();
      throw new Error("This account is not on the admin access list.");
    }
    if (!response.ok) throw new Error(data.error ?? "Unable to verify admin access.");
    if (data.aal2 || !data.mfaEnabled) {
      router.replace("/admin");
      router.refresh();
      return true;
    }
    return false;
  }, [router]);

  const prepareMfa = useCallback(async (client: SupabaseClient) => {
    if (await requestAccess(client)) return;
    const { data, error: factorsError } = await client.auth.mfa.listFactors();
    if (factorsError) throw factorsError;
    const verified = data.totp.find((factor) => factor.status === "verified");
    if (verified) {
      const challenge = await client.auth.mfa.challenge({ factorId: verified.id });
      if (challenge.error) throw challenge.error;
      setFactorId(verified.id);
      setChallengeId(challenge.data.id);
      setStep("verify");
      return;
    }

    router.replace("/admin");
    router.refresh();
  }, [requestAccess, router]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session || cancelled) return;
      setBusy(true);
      try {
        await prepareMfa(supabase);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not resume admin sign-in.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    });
    return () => { cancelled = true; };
  }, [supabase, prepareMfa]);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) throw new Error("Check your email and password, then try again.");
      await prepareMfa(supabase);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !factorId || !challengeId) return;
    setBusy(true);
    setError("");
    try {
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId, code: code.replace(/\s/g, "") });
      if (verifyError) throw new Error("That code could not be verified. Check your authenticator and try again.");
      const response = await fetch("/api/admin/access", { cache: "no-store" });
      if (!response.ok) throw new Error("The second factor was verified, but this account does not have admin access.");
      const access = await response.json() as { aal2?: boolean };
      if (!access.aal2) throw new Error("The admin session has not reached multi-factor assurance.");
      router.replace("/admin");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verification could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-login-shell">
      <aside className="admin-login-aside">
        <Link className="brand admin-login-brand" href="/">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-copy"><strong>Fundfolio</strong><small>ADMIN CONSOLE</small></span>
        </Link>
        <div className="login-aside-content">
          <div className="eyebrow light-eyebrow">PRIVATE WORKSPACE</div>
          <h1>Clarity for the people behind the platform.</h1>
          <p>Manage the foundations of a more transparent view of India’s mutual fund data.</p>
        </div>
        <div className="login-aside-footer"><span className="status-dot" /> Approved administrators only <span>·</span> MFA optional</div>
        <div className="aside-orbit orbit-one" /><div className="aside-orbit orbit-two" />
      </aside>

      <main className="admin-login-main">
        <Link className="login-back-link" href="/">← Back to Fundfolio</Link>
        <section className="login-card">
          <div className="login-card-icon">⌘</div>
          <div className="eyebrow">ADMINISTRATION</div>
          <h2>{step === "login" ? "Welcome back" : "Verify it’s you"}</h2>
          <p className="login-intro">{step === "login" ? "Sign in with your administrator account to continue." : "Enter the six-digit code from your authenticator app."}</p>

          {!config.configured ? (
            <div className="admin-config-notice"><strong>Authentication needs setup</strong><p>Add <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, and <code>ADMIN_EMAILS</code> to your environment before signing in.</p><small>Email sign-in must be enabled in Supabase. Authenticator MFA can be added from the admin workspace.</small></div>
          ) : step === "login" ? (
            <form className="admin-login-form" onSubmit={signIn}>
              <label htmlFor="admin-email">Email address</label>
              <input id="admin-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" />
              <label htmlFor="admin-password">Password</label>
              <input id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" />
              <button className="admin-submit" type="submit" disabled={busy}>{busy ? "Checking access…" : "Continue securely"}<span>→</span></button>
            </form>
          ) : (
            <form className="admin-login-form" onSubmit={verifyCode}>
              <label htmlFor="admin-totp">Authenticator code</label>
              <input id="admin-totp" className="totp-input" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9\s]{6,8}" maxLength={8} required value={code} onChange={(event) => setCode(event.target.value)} placeholder="000 000" autoFocus />
              <button className="admin-submit" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify and open workspace"}<span>→</span></button>
              <button className="login-change-account" type="button" onClick={async () => { await supabase?.auth.signOut(); setStep("login"); setCode(""); setError(""); }}>Use another account</button>
            </form>
          )}

          {error && <p className="admin-login-error" role="alert">{error}</p>}
          <div className="login-card-foot"><span className="status-dot" /> Restricted to approved administrators <span>·</span> MFA optional</div>
        </section>
        <div className="login-copyright">© {new Date().getFullYear()} Fundfolio <span>·</span> A read-only public data platform</div>
      </main>
    </div>
  );
}
