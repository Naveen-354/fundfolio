"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseInviteClient } from "@/lib/supabase/client";

type PublicConfig = { url: string; anonKey: string; configured: boolean };
type PageState = "checking" | "ready" | "invalid" | "complete";

export function AdminSetPassword({ config }: { config: PublicConfig }) {
  const router = useRouter();
  const supabase = useMemo(() => config.configured
    ? createSupabaseInviteClient(config.url, config.anonKey)
    : null, [config.configured, config.url, config.anonKey]);
  const [state, setState] = useState<PageState>(config.configured ? "checking" : "invalid");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState(config.configured ? "" : "Admin authentication is not configured for this app.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    let cancelled = false;

    async function verifyInvite(authClient: SupabaseClient) {
      const callbackParams = new URLSearchParams(window.location.hash.slice(1));
      const searchParams = new URLSearchParams(window.location.search);
      const callbackError = callbackParams.get("error_description") ?? searchParams.get("error_description");
      const accessToken = callbackParams.get("access_token") ?? searchParams.get("access_token");
      const refreshToken = callbackParams.get("refresh_token") ?? searchParams.get("refresh_token");
      const code = searchParams.get("code");
      const tokenHash = searchParams.get("token_hash");
      const callbackType = searchParams.get("type");
      const hasCallback = Boolean(window.location.hash || code || tokenHash || accessToken);

      if (callbackError) {
        clearAuthCallbackUrl();
        setState("invalid");
        setError(callbackError);
        return;
      }

      if (accessToken && refreshToken) {
        let sessionError;
        try {
          ({ error: sessionError } = await authClient.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          }));
        } finally {
          clearAuthCallbackUrl();
        }
        if (sessionError) {
          setState("invalid");
          setError(sessionError.message);
          return;
        }
      } else if (tokenHash) {
        if (callbackType !== "invite") {
          clearAuthCallbackUrl();
          setState("invalid");
          setError("This link is not a valid administrator invitation.");
          return;
        }

        let verificationError;
        try {
          ({ error: verificationError } = await authClient.auth.verifyOtp({
            token_hash: tokenHash,
            type: "invite",
          }));
        } finally {
          clearAuthCallbackUrl();
        }
        if (verificationError) {
          setState("invalid");
          setError(verificationError.message);
          return;
        }
      } else if (code) {
        let exchangeError;
        try {
          ({ error: exchangeError } = await authClient.auth.exchangeCodeForSession(code));
        } finally {
          clearAuthCallbackUrl();
        }
        if (exchangeError) {
          setState("invalid");
          setError(exchangeError.message);
          return;
        }
      } else if (hasCallback) {
        clearAuthCallbackUrl();
      }

      const { data: { user }, error: authError } = await authClient.auth.getUser();
      if (cancelled) return;
      if (authError || !user) {
        setState("invalid");
        setError(authError?.message === "Auth session missing!"
          ? "Supabase did not establish a sign-in session from this invitation. If the link was already used or has expired, ask the inviter for a fresh one. Open the fresh link in the same browser you’ll use to set your password; localhost links only work on the computer running the app."
          : authError?.message ?? "This invitation is invalid or has expired. Ask an administrator to send a new one.");
        return;
      }

      try {
        const response = await fetch("/api/admin/access", { cache: "no-store" });
        if (response.status === 403) {
          await authClient.auth.signOut();
          throw new Error("This account is not on the admin access list.");
        }
        if (!response.ok) throw new Error("We could not verify this account’s admin access. Try again shortly.");
        const access = await response.json() as { email?: string };
        if (!cancelled) {
          setEmail(access.email ?? user.email ?? "");
          setState("ready");
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "The invitation could not be verified.");
          setState("invalid");
        }
      }
    }

    void verifyInvite(client).catch((cause) => {
      if (cancelled) return;
      clearAuthCallbackUrl();
      setError(cause instanceof Error ? cause.message : "The invitation could not be verified.");
      setState("invalid");
    });
    return () => { cancelled = true; };
  }, [supabase]);

  async function setAdminPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setError("");
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setState("complete");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The password could not be saved. Try again.");
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
          <h1>One secure step before your workspace is ready.</h1>
          <p>Create your administrator password and continue to your workspace. You can set up an authenticator there whenever you’re ready.</p>
        </div>
        <div className="login-aside-footer"><span className="status-dot" /> MFA recommended · optional <span>·</span> AMFI data platform</div>
        <div className="aside-orbit orbit-one" /><div className="aside-orbit orbit-two" />
      </aside>

      <main className="admin-login-main">
        <Link className="login-back-link" href="/">← Back to Fundfolio</Link>
        <section className="login-card">
          <div className="login-card-icon">⌘</div>
          <div className="eyebrow">ADMINISTRATION</div>
          <h2>{state === "complete" ? "Password created" : "Set your password"}</h2>
          <p className="login-intro">
            {state === "ready" ? `Finish setting up access for ${email}.` : state === "checking" ? "Verifying your secure invitation…" : state === "complete" ? "Your password is ready. You can add authenticator protection from your admin workspace." : "Use a valid administrator invitation to continue."}
          </p>

          {!config.configured ? (
            <div className="admin-config-notice"><strong>Authentication needs setup</strong><p>Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your environment.</p></div>
          ) : state === "ready" ? (
            <form className="admin-login-form" onSubmit={setAdminPassword}>
              <label htmlFor="admin-new-password">New password</label>
              <input id="admin-new-password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 12 characters" />
              <label htmlFor="admin-confirm-password">Confirm password</label>
              <input id="admin-confirm-password" type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Enter it again" />
              <button className="admin-submit" type="submit" disabled={busy}>{busy ? "Saving password…" : "Create password"}<span>→</span></button>
            </form>
          ) : state === "complete" ? (
            <button className="admin-submit" type="button" onClick={() => { router.replace("/admin"); router.refresh(); }}>Continue to admin workspace<span>→</span></button>
          ) : (
            <div className="admin-config-notice"><strong>Invitation required</strong><p>Open a fresh invite link sent to your approved administrator email address.</p></div>
          )}

          {error && <p className="admin-login-error" role="alert">{error}</p>}
          <div className="login-card-foot"><span className="status-dot" /> Restricted to approved administrators <span>·</span> MFA optional</div>
        </section>
        <div className="login-copyright">© {new Date().getFullYear()} Fundfolio <span>·</span> A read-only public data platform</div>
      </main>
    </div>
  );
}

function clearAuthCallbackUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  for (const parameter of ["code", "token_hash", "access_token", "refresh_token", "error", "error_code", "error_description", "type"]) {
    url.searchParams.delete(parameter);
  }
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}
