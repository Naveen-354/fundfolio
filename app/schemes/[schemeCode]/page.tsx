import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  buildSchemeOptions,
  extractVariantTag,
  fetchAmfiSchemeAum,
  fetchAmfiSchemeDetails,
  fetchAmfiSchemeNav,
  fetchAmfiSchemeSummary,
  getSchemePortalRef,
} from "@/lib/funds/amfi-portal";
import { defaultPublicTypography, typographyFonts } from "@/lib/site/typography-shared";
import { getPublicTypographySettings } from "@/lib/site/typography";
import { NavHistorySelector, type NavHistoryChoice } from "@/app/nav-history-selector";
import { InvestmentCalculator } from "@/app/calculator";
import { RiskometerGauge, classifyRiskLevel } from "@/app/riskometer";

const navHistoryFamilyOrder = ["direct|growth", "direct|idcw", "regular|growth", "regular|idcw"] as const;
const navHistoryFamilyLabels: Record<(typeof navHistoryFamilyOrder)[number], string> = {
  "direct|growth": "Direct · Growth",
  "direct|idcw": "Direct · IDCW",
  "regular|growth": "Regular · Growth",
  "regular|idcw": "Regular · IDCW",
};

// Each Plan+Option family (Direct Growth, Direct IDCW, Regular Growth, Regular IDCW) has
// its own AMFI scheme code and therefore its own independent NAV history — not just the
// one this page's own URL happens to be keyed by. Built from amfiCodeByFamily rather
// than the full options list, since finer sub-variants (payout vs reinvestment, SIP
// frequency) share one legacy code and would just show the same chart twice.
function buildNavHistoryChoices(defaultCode: string, amfiCodeByFamily: Record<string, string> | undefined): NavHistoryChoice[] {
  const byCode = new Map<string, string>();
  for (const family of navHistoryFamilyOrder) {
    const code = amfiCodeByFamily?.[family];
    if (code && !byCode.has(code)) byCode.set(code, navHistoryFamilyLabels[family]);
  }
  if (!byCode.has(defaultCode)) byCode.set(defaultCode, "Default");
  return [...byCode].map(([code, label]) => ({ code, label }));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed);
}

function formatCrores(value: number) {
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value)} Cr`;
}

function SiteHeader() {
  return (
    <header className="topbar">
      <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true"><span /></span><span className="brand-copy"><strong>fundfolio<span>.</span></strong><small>INDIA’S OPEN FUND DIRECTORY</small></span></Link>
      <nav className="main-navigation" aria-label="Main navigation"><Link className="nav-link" href="/">Explore funds</Link></nav>
      <div className="topbar-actions"><span className="open-access"><span className="status-dot" /> Open access</span></div>
    </header>
  );
}

async function loadShellStyle(): Promise<CSSProperties> {
  const typography = await getPublicTypographySettings().catch(() => defaultPublicTypography);
  return {
    "--public-body-font-family": typographyFonts[typography.bodyFont].stack,
    "--public-display-font-family": typographyFonts[typography.displayFont].stack,
    "--public-font-scale": String(typography.fontScale / 100),
    "--scheme-list-font-scale": String(typography.schemeListScale / 100),
  } as CSSProperties;
}

export async function generateMetadata({ params }: { params: Promise<{ schemeCode: string }> }): Promise<Metadata> {
  const { schemeCode } = await params;
  const ref = /^\d{1,12}$/.test(schemeCode) ? await getSchemePortalRef(schemeCode).catch(() => null) : null;
  return { title: ref ? `${ref.name} — Fundfolio` : "Scheme details — Fundfolio" };
}

export default async function SchemeDetailPage({ params }: { params: Promise<{ schemeCode: string }> }) {
  await connection();
  const { schemeCode } = await params;
  if (!/^\d{1,12}$/.test(schemeCode)) notFound();

  const [ref, shellStyle] = await Promise.all([getSchemePortalRef(schemeCode).catch(() => null), loadShellStyle()]);

  if (!ref) {
    return (
      <div className="site-shell" style={shellStyle}>
        <SiteHeader />
        <main>
          <section className="scheme-detail-section">
            <div className="scheme-detail-empty">
              <h1>Details aren’t available yet</h1>
              <p>This scheme doesn’t have an AMFI portal ID configured. An administrator can add one from the Schemes admin page.</p>
              <Link href="/" className="primary-cta">Back to the directory</Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const [details, navRows, aumRows, summary] = await Promise.all([
    fetchAmfiSchemeDetails(ref.mfId, ref.sdId).catch(() => null),
    fetchAmfiSchemeNav(ref.mfId, ref.sdId).catch(() => []),
    fetchAmfiSchemeAum(ref.mfId, ref.sdId).catch(() => []),
    fetchAmfiSchemeSummary(ref.sdId).catch(() => null),
  ]);

  const generalFields = summary?.fields.filter((field) => field.group === "general") ?? [];
  const transactionFields = summary?.fields.filter((field) => field.group === "transaction") ?? [];
  const options = summary ? buildSchemeOptions(navRows, summary.isinToRtaCode, summary.rtaCodeByFamily, summary.amfiCodeByFamily) : [];
  const navHistoryChoices = buildNavHistoryChoices(ref.schemeCode, summary?.amfiCodeByFamily);
  const riskLevel = classifyRiskLevel(summary?.riskometer.current);
  const riskLevelAtLaunch = classifyRiskLevel(summary?.riskometer.atLaunch);

  return (
    <div className="site-shell" style={shellStyle}>
      <SiteHeader />
      <main>
        <section className="scheme-detail-section">
          <Link href="/" className="scheme-detail-back">← Back to the directory</Link>
          <div className="scheme-detail-header">
            <span className="eyebrow">AMFI SCHEME DETAILS</span>
            <h1>{ref.name}</h1>
            <p>{ref.fundHouse}</p>
          </div>

          {details ? (
            <div className="scheme-detail-overview">
              <div><span>Category</span><strong>{details.SchemeCat_Desc}</strong></div>
              <div><span>Type</span><strong>{details.SchemeType_Desc}</strong></div>
              <div><span>Launch date</span><strong>{formatDate(details.Launch_Date)}</strong></div>
              <div><span>Minimum investment</span><strong>₹{details.Scheme_min_amt}</strong></div>
              {details.AMC_Website && <div><span>AMC website</span><a href={details.AMC_Website} target="_blank" rel="noopener noreferrer">{details.AMC_Website} ↗</a></div>}
            </div>
          ) : <p className="scheme-detail-warning">Scheme overview is temporarily unavailable from AMFI.</p>}

          {(details?.Scheme_Objective || riskLevel) && (
            <div className="scheme-detail-objective-row">
              {details?.Scheme_Objective && <div className="scheme-detail-copy"><h2>Objective</h2><p>{details.Scheme_Objective}</p></div>}
              {riskLevel && <RiskometerGauge level={riskLevel} launchLevel={riskLevelAtLaunch} />}
            </div>
          )}
          {details?.Scheme_load && <div className="scheme-detail-copy"><h2>Load structure</h2><p>{details.Scheme_load}</p></div>}

          <h2 className="scheme-detail-heading">NAV history</h2>
          <NavHistorySelector schemeName={ref.name} defaultCode={ref.schemeCode} choices={navHistoryChoices} />
          <InvestmentCalculator schemeCode={ref.schemeCode} schemeName={ref.name} />

          <h2 className="scheme-detail-heading">Current NAV by plan &amp; option</h2>
          {navRows.length ? (
            <div className="table-scroll">
              <table className="scheme-detail-table">
                <thead><tr><th>Plan</th><th>Option</th><th>ISIN</th><th>NAV</th><th>As of</th></tr></thead>
                <tbody>{navRows.map((row) => {
                  const tag = extractVariantTag(row.Scheme_NAV_Name, row.Plan);
                  return <tr key={row.Scheme_NAV_Name}>
                    <td>{row.Plan}</td>
                    <td>{row.Option}{tag ? ` (${tag})` : ""}</td>
                    <td>{row.ISIN_Div_Payout_ISIN_Growth || "—"}</td>
                    <td>₹{row.Net_Asset_Value}</td>
                    <td>{formatDate(row.Date)}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          ) : <p className="scheme-detail-warning">NAV data is temporarily unavailable from AMFI.</p>}

          <h2 className="scheme-detail-heading">Average AUM by plan &amp; option</h2>
          {aumRows.length ? (
            <div className="table-scroll">
              <table className="scheme-detail-table">
                <thead><tr><th>Plan</th><th>Option</th><th>Average AUM</th><th>For the quarter ending</th></tr></thead>
                <tbody>{aumRows.map((row) => {
                  const tag = extractVariantTag(row.Scheme_NAV_Name, row.Plan);
                  return <tr key={row.Scheme_NAV_Name}>
                    <td>{row.Plan}</td>
                    <td>{row.Option}{tag ? ` (${tag})` : ""}</td>
                    <td>{formatCrores(row.Average_AUM_For_The_Quarter)}</td>
                    <td>{row.As_At_The_End_Of}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          ) : <p className="scheme-detail-warning">AUM data is temporarily unavailable from AMFI.</p>}

          {options.length > 0 && (
            <>
              <h2 className="scheme-detail-heading">Options, ISINs &amp; RTA codes</h2>
              <div className="table-scroll">
                <table className="scheme-detail-table">
                  <thead><tr><th>Option</th><th>ISIN</th><th>RTA code</th><th>AMFI code</th></tr></thead>
                  <tbody>{options.map((option) => (
                    <tr key={option.isin}>
                      <td>{option.name}</td>
                      <td>{option.isin}</td>
                      <td>{option.rtaCode}</td>
                      <td>{option.amfiCode}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}

          {generalFields.length > 0 && (
            <details className="scheme-detail-more">
              <summary>More scheme details</summary>
              <p className="scheme-detail-more-hint">Fund structure, management, benchmark and service providers.</p>
              <div className="scheme-detail-overview">
                {generalFields.map((field) => <div key={field.key}><span>{field.label}</span><strong>{field.value}</strong></div>)}
              </div>
            </details>
          )}

          {(transactionFields.length > 0 || (summary && summary.sipSwpStp.rows.length > 0)) && (
            <details className="scheme-detail-more">
              <summary>Transaction details</summary>
              <p className="scheme-detail-more-hint">Minimums, switches, SIP/SWP/STP rules and exit load.</p>
              {transactionFields.length > 0 && (
                <div className="scheme-detail-overview">
                  {transactionFields.map((field) => <div key={field.key}><span>{field.label}</span><strong>{field.value}</strong></div>)}
                </div>
              )}
              {summary && summary.sipSwpStp.rows.length > 0 && (
                <>
                  <h3 className="scheme-detail-subheading">SIP / SWP / STP rules</h3>
                  <div className="table-scroll">
                    <table className="scheme-detail-table wrap-cells">
                      <thead><tr><th></th><th>SIP</th><th>STP</th><th>SWP</th></tr></thead>
                      <tbody>{summary.sipSwpStp.rows.map((row) => (
                        <tr key={row.label}>
                          <th scope="row">{row.label}</th>
                          <td>{row.SIP}</td>
                          <td>{row.STP}</td>
                          <td>{row.SWP}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  {summary.sipSwpStp.notes.length > 0 && (
                    <p className="scheme-detail-more-hint">{summary.sipSwpStp.notes.join(" · ")}</p>
                  )}
                </>
              )}
            </details>
          )}

          {summary && (summary.documentUrls.infoDocumentUrl || summary.documentUrls.summaryPdfUrl || summary.documentUrls.summaryXlsUrl || summary.documentUrls.summaryXmlUrl) && (
            <div className="scheme-detail-documents">
              <span>Official AMFI documents:</span>
              {summary.documentUrls.infoDocumentUrl && <a href={summary.documentUrls.infoDocumentUrl} target="_blank" rel="noopener noreferrer">Scheme information (PDF) ↗</a>}
              {summary.documentUrls.summaryPdfUrl && <a href={summary.documentUrls.summaryPdfUrl} target="_blank" rel="noopener noreferrer">Summary (PDF) ↗</a>}
              {summary.documentUrls.summaryXlsUrl && <a href={summary.documentUrls.summaryXlsUrl} target="_blank" rel="noopener noreferrer">Summary (XLS) ↗</a>}
              {summary.documentUrls.summaryXmlUrl && <a href={summary.documentUrls.summaryXmlUrl} target="_blank" rel="noopener noreferrer">Summary (XML) ↗</a>}
            </div>
          )}

          <p className="scheme-detail-footnote">Sourced live from AMFI India’s scheme-details and scheme-data APIs.</p>
        </section>
      </main>
    </div>
  );
}
