"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Scheme = {
  schemeCode: string;
  name: string;
  fundHouse: string;
  category: string;
  categoryLabel: string;
  nav: number | null;
  navDate: string | null;
  schemeActive: boolean;
  fundHouseActive: boolean;
  amfiPortalSchemeId: string | null;
};

type SchemePage = {
  schemes: Scheme[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

const categoryOptions = ["All", "Equity", "Debt", "Hybrid", "Index", "Other"];
const numberFormat = new Intl.NumberFormat("en-IN");
const navFormat = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

function dateLabel(date: string | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00.000Z`));
}

async function readPage(response: Response): Promise<SchemePage> {
  const body = await response.json().catch(() => ({})) as SchemePage & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Schemes could not be loaded.");
  return body;
}

export function SchemeManager() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SchemePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ search, category, page: String(page) });
      void fetch(`/api/admin/schemes?${params}`, { cache: "no-store", signal: controller.signal })
        .then(readPage)
        .then((result) => { if (current) setData(result); })
        .catch((cause: unknown) => {
          if (current && !(cause instanceof DOMException && cause.name === "AbortError")) {
            setError(cause instanceof Error ? cause.message : "Schemes could not be loaded.");
          }
        })
        .finally(() => { if (current) setLoading(false); });
    }, search ? 250 : 0);

    return () => {
      current = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, category, page, reloadKey]);

  useEffect(() => {
    if (!data) return;
    setDrafts(Object.fromEntries(data.schemes.map((scheme) => [scheme.schemeCode, scheme.amfiPortalSchemeId ?? ""])));
  }, [data]);

  async function savePortalId(scheme: Scheme) {
    const value = (drafts[scheme.schemeCode] ?? "").trim();
    setBusy(scheme.schemeCode);
    setSaveError("");
    setSaveNotice("");
    try {
      const response = await fetch(`/api/admin/schemes/${scheme.schemeCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amfiPortalSchemeId: value || null }),
      });
      const body = await response.json().catch(() => ({})) as { scheme?: { amfiPortalSchemeId: string | null }; error?: string };
      if (!response.ok) throw new Error(body.error ?? "The scheme could not be updated.");
      setData((current) => current ? {
        ...current,
        schemes: current.schemes.map((item) => item.schemeCode === scheme.schemeCode
          ? { ...item, amfiPortalSchemeId: body.scheme?.amfiPortalSchemeId ?? null }
          : item),
      } : current);
      setSaveNotice(`AMFI portal ID saved for ${scheme.name}.`);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "The scheme could not be updated.");
    } finally {
      setBusy("");
    }
  }

  const visibleRangeStart = data?.schemes.length ? (data.page - 1) * data.pageSize + 1 : 0;
  const visibleRangeEnd = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <div className="admin-content admin-schemes-content">
      <div className="admin-page-heading">
        <div><div className="eyebrow">AMFI DATA CATALOG</div><h1>Schemes</h1><p>Browse imported schemes, latest NAVs, and public visibility.</p></div>
        <div className="admin-secure-pill"><span className="status-dot" /> {numberFormat.format(data?.total ?? 0)} schemes</div>
      </div>

      <section className="admin-scheme-panel" aria-label="Scheme catalog">
        <div className="admin-scheme-toolbar">
          <div><h2>Imported scheme list</h2><p>Search by scheme, fund house, or AMFI scheme code.</p></div>
          <div className="admin-scheme-toolbar-actions">
            <label className="admin-scheme-search"><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search schemes" aria-label="Search schemes" /></label>
            <label className="admin-scheme-category"><span className="visually-hidden">Filter by category</span><select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>{categoryOptions.map((item) => <option key={item} value={item}>{item === "All" ? "All categories" : item}</option>)}</select></label>
            <button className="fund-house-refresh" type="button" onClick={() => setReloadKey((value) => value + 1)} disabled={loading}>Refresh</button>
          </div>
        </div>

        {saveError && <div className="fund-house-message error" role="alert"><span>{saveError}</span></div>}
        {saveNotice && !saveError && <div className="fund-house-message success" role="status">{saveNotice}</div>}

        {error ? (
          <div className="admin-scheme-empty" role="alert"><strong>Couldn’t load schemes</strong><span>{error}</span><button type="button" onClick={() => setReloadKey((value) => value + 1)}>Try again</button></div>
        ) : loading && !data ? (
          <div className="admin-scheme-empty"><span className="loading-ring" /> Loading schemes…</div>
        ) : data?.schemes.length ? (
          <div className="admin-scheme-table-scroll" aria-busy={loading}>
            <table className="admin-scheme-table">
              <thead><tr><th scope="col">Scheme</th><th scope="col">Fund house</th><th scope="col">Category</th><th scope="col">Latest NAV</th><th scope="col">As of</th><th scope="col">Visibility</th><th scope="col">AMFI portal ID</th></tr></thead>
              <tbody>{data.schemes.map((scheme) => {
                const status = !scheme.schemeActive ? "Inactive" : scheme.fundHouseActive ? "Public" : "Hidden";
                const draft = drafts[scheme.schemeCode] ?? "";
                const dirty = draft.trim() !== (scheme.amfiPortalSchemeId ?? "");
                const saving = busy === scheme.schemeCode;
                return <tr key={scheme.schemeCode}>
                  <th scope="row"><strong>{scheme.name}</strong><small>AMFI {scheme.schemeCode}</small></th>
                  <td>{scheme.fundHouse}</td>
                  <td><span className="admin-scheme-category-label">{scheme.categoryLabel || scheme.category}</span></td>
                  <td className="admin-scheme-nav">{scheme.nav == null ? "—" : `₹${navFormat.format(scheme.nav)}`}</td>
                  <td>{dateLabel(scheme.navDate)}</td>
                  <td><span className={`admin-scheme-status ${status.toLowerCase()}`}>{status}</span></td>
                  <td className="admin-scheme-portal-id">
                    <input
                      aria-label={`${scheme.name} AMFI portal scheme ID`}
                      value={draft}
                      onChange={(event) => setDrafts((current) => ({ ...current, [scheme.schemeCode]: event.target.value }))}
                      placeholder="e.g. 13771"
                      inputMode="numeric"
                      maxLength={12}
                      disabled={saving}
                    />
                    <button type="button" onClick={() => void savePortalId(scheme)} disabled={!dirty || saving}>{saving ? "Saving…" : "Save"}</button>
                    {scheme.amfiPortalSchemeId && <Link href={`/schemes/${scheme.schemeCode}`} target="_blank" rel="noopener noreferrer">View</Link>}
                  </td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        ) : (
          <div className="admin-scheme-empty">{search || category !== "All" ? "No schemes match these filters." : "No schemes have been imported yet."}</div>
        )}

        <div className="admin-scheme-footer">
          <span>Showing <strong>{visibleRangeStart}–{visibleRangeEnd}</strong> of <strong>{numberFormat.format(data?.total ?? 0)}</strong></span>
          <div className="admin-scheme-pagination"><button type="button" aria-label="Previous page" disabled={!data || data.page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button><span>Page <strong>{data?.page ?? 1}</strong> of <strong>{data?.pageCount ?? 1}</strong></span><button type="button" aria-label="Next page" disabled={!data || data.page >= data.pageCount || loading} onClick={() => setPage((value) => value + 1)}>›</button></div>
        </div>
      </section>
    </div>
  );
}
