"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

export function ProblemReportWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open]);

  if (pathname.startsWith("/admin")) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setStatus("sending");
    setError("");

    try {
      const response = await fetch("/api/issue-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          message: formData.get("message"),
          pagePath: window.location.pathname,
          company: formData.get("company"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The report could not be sent.");
      form.reset();
      setStatus("sent");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "The report could not be sent.");
    }
  }

  return (
    <>
      <button className="problem-report-trigger" type="button" onClick={() => { setOpen(true); setStatus("idle"); setError(""); }} aria-haspopup="dialog" aria-expanded={open}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.4-.75L4 20l1.55-4.25A7.47 7.47 0 0 1 5 12.5 7.5 7.5 0 1 1 20 11.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M12.5 8v4m0 3h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        <span>Report a problem</span>
      </button>
      {open && <div className="problem-report-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
        <section className="problem-report-dialog" role="dialog" aria-modal="true" aria-labelledby="problem-report-title" aria-describedby="problem-report-description">
          <button className="problem-report-close" type="button" onClick={() => setOpen(false)} aria-label="Close report form">×</button>
          {status === "sent" ? <div className="problem-report-success">
            <span className="problem-report-success-icon" aria-hidden="true">✓</span>
            <h2 id="problem-report-title">Thanks for the report</h2>
            <p id="problem-report-description">Your message is in our review queue. The team can now investigate it.</p>
            <button type="button" onClick={() => setOpen(false)}>Done</button>
          </div> : <>
            <span className="problem-report-kicker">HELP US IMPROVE</span>
            <h2 id="problem-report-title">Report a problem</h2>
            <p id="problem-report-description">Tell us what went wrong. We’ll attach this page so the team has context.</p>
            <form ref={formRef} onSubmit={submit}>
              <label>Name <span>optional</span><input name="name" autoComplete="name" maxLength={120} placeholder="Your name" /></label>
              <label>Email <span>optional</span><input name="email" type="email" autoComplete="email" maxLength={320} placeholder="Where we can reach you" /></label>
              <label>What happened?<textarea name="message" required minLength={10} maxLength={5000} rows={5} placeholder="Describe the problem and what you expected to happen." /></label>
              <label className="problem-report-honeypot" aria-hidden="true">Company<input name="company" tabIndex={-1} autoComplete="off" /></label>
              {status === "error" && <p className="problem-report-error" role="alert">{error}</p>}
              <div className="problem-report-actions"><span>We only use your details to review this report.</span><button type="submit" disabled={status === "sending"}>{status === "sending" ? "Sending…" : "Send report"}</button></div>
            </form>
          </>}
        </section>
      </div>}
    </>
  );
}
