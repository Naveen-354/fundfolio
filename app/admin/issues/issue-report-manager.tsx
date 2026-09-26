"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import type { IssueReport, IssueReportCounts, IssueReportStatus } from "@/lib/issues/types";

type ReportPage = {
  reports: IssueReport[];
  total: number;
  counts: IssueReportCounts;
  page: number;
  pageSize: number;
  pageCount: number;
};

const statusLabels: Record<IssueReportStatus, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved" };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const emptyReportPage: ReportPage = {
  reports: [], total: 0, counts: { open: 0, in_progress: 0, resolved: 0 }, page: 1, pageSize: 40, pageCount: 1,
};

export function IssueReportManager({ initialData = emptyReportPage, initialError = "" }: { initialData?: ReportPage; initialError?: string }) {
  const [data, setData] = useState<ReportPage>(initialData);
  const [filter, setFilter] = useState<IssueReportStatus | "all">("open");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const requestSequence = useRef(0);

  async function loadReports(nextFilter = filter, nextSearch = search, nextPage = page) {
    const requestNumber = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ status: nextFilter, search: nextSearch, page: String(nextPage) });
      const response = await fetch(`/api/admin/issue-reports?${params}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Reports could not be loaded.");
      if (requestNumber !== requestSequence.current) return;
      setError("");
      setData(result as ReportPage);
    } catch (cause) {
      if (requestNumber === requestSequence.current) setError(cause instanceof Error ? cause.message : "Reports could not be loaded.");
    } finally {
      if (requestNumber === requestSequence.current) setLoading(false);
    }
  }

  const selected = useMemo(() => data?.reports.find((report) => report.id === selectedId) ?? null, [data, selectedId]);

  function chooseFilter(value: IssueReportStatus | "all") {
    setFilter(value);
    setLoading(true);
    setPage(1);
    setNotice("");
    void loadReports(value, search, 1);
  }

  async function updateReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const status = form.get("status") as IssueReportStatus;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/issue-reports/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, resolutionNote }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "This report could not be updated.");
      setNotice("Report updated.");
      await loadReports();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This report could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  const counts = data?.counts ?? { open: 0, in_progress: 0, resolved: 0 };

  return (
    <section className="admin-content issue-reports-content">
      <div className="admin-page-heading">
        <div><span className="eyebrow">USER SUPPORT</span><h1>Problem reports</h1><p>Review reports from the public site, track progress, and record the resolution.</p></div>
        <button className="issue-refresh" type="button" onClick={() => void loadReports()} disabled={loading}>↻ Refresh</button>
      </div>

      <div className="issue-summary-grid">
        <button className={filter === "open" ? "issue-summary-card selected" : "issue-summary-card"} type="button" onClick={() => chooseFilter("open")}><span>OPEN</span><strong>{counts.open}</strong><small>Needs review</small></button>
        <button className={filter === "in_progress" ? "issue-summary-card selected" : "issue-summary-card"} type="button" onClick={() => chooseFilter("in_progress")}><span>IN PROGRESS</span><strong>{counts.in_progress}</strong><small>Being investigated</small></button>
        <button className={filter === "resolved" ? "issue-summary-card selected" : "issue-summary-card"} type="button" onClick={() => chooseFilter("resolved")}><span>RESOLVED</span><strong>{counts.resolved}</strong><small>Closed reports</small></button>
      </div>

      <section className="issue-report-panel">
        <div className="issue-report-toolbar">
          <div><h2>Report queue</h2><p>{data?.total ?? 0} {filter === "all" ? "reports" : `${statusLabels[filter as IssueReportStatus].toLowerCase()} reports`}</p></div>
          <div className="issue-report-controls">
            <label className="issue-report-search"><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={(event) => { const value = event.target.value; setSearch(value); setPage(1); void loadReports(filter, value, 1); }} placeholder="Search reports" aria-label="Search problem reports" /></label>
            <label className="issue-report-filter"><span className="visually-hidden">Filter reports</span><select value={filter} onChange={(event) => chooseFilter(event.target.value as IssueReportStatus | "all")}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="all">All reports</option></select></label>
          </div>
        </div>

        {notice && <div className="issue-report-feedback success" role="status">{notice}</div>}
        {error && <div className="issue-report-feedback error" role="alert">{error}<button type="button" onClick={() => void loadReports()}>Try again</button></div>}

        <div className="issue-report-layout">
          <div className="issue-report-list" aria-label="Problem reports">
            {loading ? <div className="issue-report-empty">Loading reports…</div> : data.reports.length ? data.reports.map((report) => <button type="button" key={report.id} className={selectedId === report.id ? "issue-report-row selected" : "issue-report-row"} onClick={() => { setSelectedId(report.id); setResolutionNote(report.resolutionNote ?? ""); setNotice(""); }} aria-pressed={selectedId === report.id}>
              <span className={`issue-status-dot ${report.status}`} />
              <span className="issue-row-copy"><strong>{report.reporterName || report.reporterEmail || "Anonymous report"}</strong><span>{report.message}</span><small>{formatDate(report.createdAt)}</small></span>
              <span className={`issue-status-badge ${report.status}`}>{statusLabels[report.status]}</span>
            </button>) : <div className="issue-report-empty"><strong>{error ? "Reports are unavailable" : "No reports here"}</strong><span>{error ? "Check the connection and try again." : "New user reports will appear in this queue."}</span></div>}
          </div>

          <div className="issue-report-detail">
            {selected ? <>
              <div className="issue-detail-heading"><span className={`issue-status-badge ${selected.status}`}>{statusLabels[selected.status]}</span><time>{formatDate(selected.createdAt)}</time></div>
              <h3>{selected.reporterName || "Anonymous report"}</h3>
              {selected.reporterEmail && <a className="issue-report-email" href={`mailto:${selected.reporterEmail}`}>{selected.reporterEmail}</a>}
              <p className="issue-report-message">{selected.message}</p>
              {selected.pagePath && <a className="issue-page-link" href={selected.pagePath} target="_blank" rel="noreferrer">Reported from {selected.pagePath} ↗</a>}
              {selected.resolvedAt && <p className="issue-resolved-meta">Resolved {formatDate(selected.resolvedAt)}{selected.resolvedBy ? ` by ${selected.resolvedBy}` : ""}</p>}
              <form className="issue-resolution-form" onSubmit={updateReport}>
                <label>Status<select name="status" defaultValue={selected.status} key={`${selected.id}-${selected.status}`}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select></label>
                <label>Resolution note <span>optional</span><textarea value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} rows={4} maxLength={5000} placeholder="Record how the issue was resolved or what the user should know." /></label>
                <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save update"}</button>
              </form>
            </> : <div className="issue-detail-empty"><span>↖</span><strong>Select a report</strong><p>Choose a report from the queue to review its details and update its status.</p></div>}
          </div>
        </div>
        <div className="issue-report-footer"><span>Showing {data.reports.length} of {data.total}</span><div><button type="button" onClick={() => { const next = Math.max(1, page - 1); setPage(next); void loadReports(filter, search, next); }} disabled={page <= 1 || loading}>←</button><span>Page {page} of {data.pageCount}</span><button type="button" onClick={() => { const next = Math.min(data.pageCount, page + 1); setPage(next); void loadReports(filter, search, next); }} disabled={page >= data.pageCount || loading}>→</button></div></div>
      </section>
    </section>
  );
}
