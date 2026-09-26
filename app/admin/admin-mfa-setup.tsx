"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = "disabled" | "enabled" | "enrolling";
type MfaResponse = { enabled?: boolean; factorId?: string; qrCode?: string; secret?: string; error?: string };

async function postMfaAction(payload: Record<string, string>) {
  const response = await fetch("/api/admin/mfa", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json() as MfaResponse;
  if (!response.ok) throw new Error(data.error ?? "The authenticator request could not be completed.");
  return data;
}

function normalizeQrDataUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("data:")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}`;
  }

  const comma = trimmed.indexOf(",");
  if (comma === -1) return "";

  const metadata = trimmed.slice(0, comma);
  if (metadata.includes(";base64")) return trimmed;

  const mimeType = metadata.match(/^data:([^;,]+)/)?.[1] ?? "image/svg+xml";
  let payload = trimmed.slice(comma + 1);
  try {
    payload = decodeURIComponent(payload);
  } catch {
    // Preserve the original SVG if it is not URI-encoded.
  }

  return `data:${mimeType};charset=utf-8,${encodeURIComponent(payload.trim())}`;
}

export function AdminMfaSetup({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialEnabled ? "enabled" : "disabled");
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function startSetup() {
    setBusy(true);
    setError("");
    try {
      const enrollment = await postMfaAction({ action: "enroll" });
      if (enrollment.enabled) {
        setStatus("enabled");
        router.refresh();
        return;
      }
      if (!enrollment.factorId || !enrollment.qrCode || !enrollment.secret) {
        throw new Error("Supabase did not return the authenticator setup details. Try again.");
      }

      setFactorId(enrollment.factorId);
      setQrCode(enrollment.qrCode);
      setSecret(enrollment.secret);
      setStatus("enrolling");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authenticator setup could not be started.");
    } finally {
      setBusy(false);
    }
  }

  async function verifySetup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError("");
    try {
      await postMfaAction({ action: "verify", factorId, code });

      setStatus("enabled");
      setFactorId("");
      setQrCode("");
      setSecret("");
      setCode("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authenticator setup could not be verified.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelSetup() {
    if (!factorId) return;
    setBusy(true);
    setError("");
    try {
      await postMfaAction({ action: "cancel", factorId });
      setStatus("disabled");
      setFactorId("");
      setQrCode("");
      setSecret("");
      setCode("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The unfinished authenticator setup could not be cancelled.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "enabled") {
    return (
      <section className="admin-mfa-banner admin-mfa-enabled" aria-label="Authenticator security status">
        <span className="admin-mfa-icon" aria-hidden="true">✓</span>
        <div><div className="admin-mfa-eyebrow">ADMIN ACCOUNT SECURITY</div><h2>Authenticator protection is active</h2><p>Your admin sign-ins use a password and a code from your authenticator app.</p></div>
      </section>
    );
  }

  return (
    <section className="admin-mfa-banner admin-mfa-warning" aria-labelledby="admin-mfa-title" role="alert">
      <span className="admin-mfa-icon" aria-hidden="true">!</span>
      <div className="admin-mfa-copy">
        <div className="admin-mfa-eyebrow">CRITICAL SECURITY WARNING</div>
        <h2 id="admin-mfa-title">Protect your administrator account</h2>
        <p>Authenticator MFA is not enabled. You can keep using the workspace, but adding it is strongly recommended.</p>

        {status === "enrolling" && (
          <form className="admin-mfa-enrollment" onSubmit={verifySetup}>
            <p>Scan this QR code with an authenticator app, then enter the six-digit code it generates.</p>
            <Image className="admin-mfa-qr" src={normalizeQrDataUrl(qrCode)} width={152} height={152} unoptimized alt="Authenticator setup QR code" />
            <span className="mfa-secret-label">OR ENTER THIS SETUP KEY</span>
            <code className="mfa-secret">{secret}</code>
            <label htmlFor="admin-mfa-code">Authenticator code</label>
            <input
              id="admin-mfa-code"
              className="admin-mfa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9\s]{6,8}"
              maxLength={8}
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="000 000"
            />
            <div className="admin-mfa-actions">
              <button className="admin-mfa-primary" type="submit" disabled={busy}>{busy ? "Verifying…" : "Enable MFA"}</button>
              <button className="admin-mfa-secondary" type="button" onClick={cancelSetup} disabled={busy}>Cancel setup</button>
            </div>
          </form>
        )}

        {error && <p className="admin-mfa-error" role="alert">{error}</p>}
      </div>
      {status === "disabled" && <button className="admin-mfa-primary admin-mfa-start" type="button" onClick={startSetup} disabled={busy}>{busy ? "Preparing…" : "Set up MFA"}</button>}
    </section>
  );
}
