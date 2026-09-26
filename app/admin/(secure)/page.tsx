import type { Metadata } from "next";
import { isDatabaseConfigured } from "@/lib/funds/postgres-repository";

export const metadata: Metadata = { title: "Overview" };

export default function AdminOverview() {
  const databaseConnected = isDatabaseConfigured();

  return (
    <div className="admin-content">
      <div className="admin-page-heading">
        <div><div className="eyebrow">SYSTEM OVERVIEW</div><h1>Good to have you back.</h1><p>Your private admin workspace for the Fundfolio data platform.</p></div>
        <div className="admin-secure-pill"><span className="status-dot" /> Approved admin session</div>
      </div>
      <section className="admin-status-grid" aria-label="Platform status">
        <article className="admin-status-card"><div className="admin-card-icon green">◉</div><div className="admin-card-label">PUBLIC DATA SOURCE</div><h2>AMFI India</h2><p>Official daily NAV feed</p><span className="admin-card-state"><span className="status-dot" /> Connected</span></article>
        <article className="admin-status-card"><div className="admin-card-icon lavender">▤</div><div className="admin-card-label">POSTGRES DATABASE</div><h2>{databaseConnected ? "Connection configured" : "Ready to connect"}</h2><p>{databaseConnected ? "Using DATABASE_URL" : "Supabase or Neon compatible"}</p><span className={`admin-card-state ${databaseConnected ? "" : "muted"}`}><span className="status-dot" /> {databaseConnected ? "Configured" : "Not configured"}</span></article>
        <article className="admin-status-card"><div className="admin-card-icon peach">⌘</div><div className="admin-card-label">ADMIN ACCESS</div><h2>Approved administrator</h2><p>Restricted to your approved account</p><span className="admin-card-state"><span className="status-dot" /> Authorized</span></article>
      </section>
      <section className="admin-foundation-panel">
        <div className="admin-foundation-symbol">✳</div>
        <div><div className="eyebrow">PHASE 1 FOUNDATION</div><h2>Public data, safely separated.</h2><p>The public experience reads AMFI NAV data. This private workspace has its own authenticated layout, session checks, and database boundary for future operations.</p></div>
        <div className="admin-foundation-detail"><span>DATABASE SCHEMA</span><strong>PostgreSQL · portable</strong><small>Versioned SQL migration</small></div>
      </section>
    </div>
  );
}
