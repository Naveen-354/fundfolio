"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FundPageData, FundScheme } from "@/lib/funds/types";
import { typographyFonts, type PublicTypographySettings } from "@/lib/site/typography-shared";
import { PerformancePanel } from "@/app/performance-panel";

const filters = ["All", "Equity", "Debt", "Hybrid", "Index", "Other"] as const;

function formatNav(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><span /></span>;
}

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="10.8" cy="10.8" r="6.6" stroke="currentColor" strokeWidth="1.8"/><path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}

function ChevronIcon({ direction = "right" }: { direction?: "left" | "right" }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={direction === "left" ? "flip-icon" : undefined}><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function useDismissableOpen() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return { open, setOpen, containerRef };
}

function FundHouseSelect({ fundHouses, value, onChange }: { fundHouses: string[]; value: string; onChange: (value: string) => void }) {
  const { open, setOpen, containerRef } = useDismissableOpen();
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      searchRef.current?.focus();
    }
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-IN");
    if (!needle) return fundHouses;
    return fundHouses.filter((house) => house.toLocaleLowerCase("en-IN").includes(needle));
  }, [fundHouses, query]);

  function select(house: string) {
    onChange(house);
    setOpen(false);
  }

  return (
    <div className={open ? "custom-select fund-house-select open" : "custom-select fund-house-select"} ref={containerRef}>
      <span className="custom-select-label">FUND HOUSE</span>
      <button type="button" className="custom-select-trigger" onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open}>
        <span>{value || "All fund houses"}</span>
        <span className="custom-select-caret">⌄</span>
      </button>
      {open && (
        <div className="custom-select-panel" role="listbox" aria-label="Fund houses">
          <label className="custom-select-search"><SearchIcon /><input ref={searchRef} type="text" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search fund houses…" aria-label="Search fund houses" /></label>
          <div className="custom-select-options">
            <button type="button" role="option" aria-selected={!value} className={!value ? "selected" : undefined} onClick={() => select("")}>All fund houses</button>
            {filtered.map((house) => (
              <button key={house} type="button" role="option" aria-selected={value === house} className={value === house ? "selected" : undefined} onClick={() => select(house)}>{house}</button>
            ))}
            {filtered.length === 0 && <div className="custom-select-empty">No fund houses match “{query}”.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

const sortOptions = [
  { value: "name", label: "Scheme name" },
  { value: "nav-desc", label: "NAV · high to low" },
  { value: "nav-asc", label: "NAV · low to high" },
] as const;

function SortSelect({ value, onChange }: { value: "name" | "nav-desc" | "nav-asc"; onChange: (value: "name" | "nav-desc" | "nav-asc") => void }) {
  const { open, setOpen, containerRef } = useDismissableOpen();
  const current = sortOptions.find((option) => option.value === value) ?? sortOptions[0];

  function select(next: (typeof sortOptions)[number]["value"]) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div className={open ? "custom-select sort-select open" : "custom-select sort-select"} ref={containerRef}>
      <span className="custom-select-label">SORT BY</span>
      <button type="button" className="custom-select-trigger" onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open}>
        <span>{current.label}</span>
        <span className="custom-select-caret">⌄</span>
      </button>
      {open && (
        <div className="custom-select-panel" role="listbox" aria-label="Sort schemes">
          <div className="custom-select-options">
            {sortOptions.map((option) => (
              <button key={option.value} type="button" role="option" aria-selected={value === option.value} className={value === option.value ? "selected" : undefined} onClick={() => select(option.value)}>{option.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SchemeRow({ scheme, expanded, onToggle }: { scheme: FundScheme; expanded: boolean; onToggle: () => void }) {
  return <>
    <tr className={expanded ? "scheme-row is-expanded" : "scheme-row"} onClick={onToggle}>
      <td className="scheme-name-cell"><div className="fund-monogram">{scheme.fundHouse.replace(/\s+Mutual Fund$/i, "").slice(0, 2).toUpperCase()}</div><div className="fund-name-wrap"><strong>{scheme.name}</strong><span>{scheme.fundHouse.replace(/\s+Mutual Fund$/i, "")} <i /> Direct · Growth</span></div></td>
      <td><span className={`category-pill category-${scheme.category.toLowerCase()}`}>{scheme.category}</span><small className="table-sub-label">{scheme.categoryLabel}</small></td>
      <td className="nav-value-cell"><strong>{formatNav(scheme.nav)}</strong><span>NAV · per unit</span></td>
      <td className="date-cell"><strong>{formatDate(scheme.navDate)}</strong><span>AMFI close</span></td>
      <td><Link className="performance-button" href={`/schemes/${scheme.schemeCode}`} onClick={(event) => event.stopPropagation()}>View details<ChevronIcon /></Link></td>
    </tr>
    {expanded && <tr className="performance-row"><td colSpan={5}><PerformancePanel schemeCode={scheme.schemeCode} name={scheme.name} /></td></tr>}
  </>;
}

function SchemeSkeleton() {
  return <div className="scheme-skeletons" aria-label="Loading schemes">{[0, 1, 2, 3, 4].map((item) => <div className="skeleton-row" key={item}><span /><div><span /><span /></div><span /><span /><span /></div>)}</div>;
}

export function FundExplorer({ initialData, typography }: { initialData: FundPageData; typography: PublicTypographySettings }) {
  const [data, setData] = useState(initialData);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof filters)[number]>("All");
  const [fundHouse, setFundHouse] = useState("");
  const [sort, setSort] = useState<"name" | "nav-desc" | "nav-asc">("name");
  const [page, setPage] = useState(1);
  const [expandedScheme, setExpandedScheme] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialData.totalSchemes === 0);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const firstQuery = useRef(true);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
    }
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  useEffect(() => {
    if (firstQuery.current) {
      firstQuery.current = false;
      if (initialData.totalSchemes > 0) return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ search, category, fundHouse, sort, page: String(page) });
      void fetch(`/api/schemes?${params}`, { signal: controller.signal, cache: "no-store" })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok) throw new Error(body.error ?? "The scheme list could not be loaded.");
          return body as FundPageData;
        })
        .then((body) => { setData(body); setExpandedScheme(null); })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The scheme list could not be loaded.");
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, search ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search, category, fundHouse, sort, page, retryKey, initialData.totalSchemes]);

  function chooseCategory(value: (typeof filters)[number]) {
    setCategory(value);
    setPage(1);
    setExpandedScheme(null);
  }

  function chooseFundHouse(value: string) {
    setFundHouse(value);
    setPage(1);
    setExpandedScheme(null);
  }

  function chooseSort(value: "name" | "nav-desc" | "nav-asc") {
    setSort(value);
    setPage(1);
  }

  function categoryCount(name: (typeof filters)[number]) {
    return name === "All" ? data.totalSchemes : data.categoryCounts[name];
  }

  return (
    <div className="site-shell" style={{
      "--public-body-font-family": typographyFonts[typography.bodyFont].stack,
      "--public-display-font-family": typographyFonts[typography.displayFont].stack,
      "--public-font-scale": String(typography.fontScale / 100),
      "--scheme-list-font-scale": String(typography.schemeListScale / 100),
    } as React.CSSProperties}>
      <header className="topbar">
        <Link className="brand" href="/"><BrandMark /><span className="brand-copy"><strong>fundfolio<span>.</span></strong><small>INDIA’S OPEN FUND DIRECTORY</small></span></Link>
        <nav className="main-navigation" aria-label="Main navigation"><a className="nav-link active" href="#explore">Explore funds</a><a className="nav-link" href="#about">About the data</a></nav>
        <div className="topbar-actions">
            <span className="open-access"><span className="status-dot" /> Open access</span>
          </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-star">✳</span> BUILT ON OFFICIAL AMFI DATA</div>
            <h1>Find the fund<br /><span>behind the numbers.</span></h1>
            <p>A clearer way to explore India’s mutual fund universe. Search thousands of schemes, understand their NAV history, and get the facts without the noise.</p>
            <div className="hero-actions"><a className="primary-cta" href="#explore">Explore all funds <ChevronIcon /></a><span className="hero-no-cost"><span>₹0</span> to use · always</span></div>
            <div className="hero-trust"><div className="trust-avatars"><span>A</span><span>₹</span><span>↗</span></div><span>Public data. Transparent numbers.<br /><strong>Made for every investor.</strong></span></div>
          </div>
          <div className="hero-visual">
            <div className="visual-grid" />
            <div className="visual-header"><span><i /> LIVE NAV COVERAGE</span><span>01 / AMFI</span></div>
            <div className="visual-label">India’s scheme universe</div>
            <div className="visual-count">{data.totalSchemes ? formatCount(data.totalSchemes) : "—"}<span>+</span></div>
            <div className="visual-description">Direct plan · Growth option</div>
            <div className="mini-chart-wrap" aria-hidden="true"><div className="mini-chart-grid"><span /><span /><span /></div><svg viewBox="0 0 480 132" preserveAspectRatio="none"><defs><linearGradient id="mini-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#daf781" stopOpacity=".38"/><stop offset="1" stopColor="#daf781" stopOpacity="0"/></linearGradient></defs><path d="M0 111 C32 102 42 108 67 91 S104 78 119 87 S144 67 165 76 S188 55 207 63 S232 48 251 60 S285 41 300 49 S323 31 349 39 S372 18 392 29 S425 10 442 22 S462 7 480 11 V132 H0 Z" fill="url(#mini-area)"/><path d="M0 111 C32 102 42 108 67 91 S104 78 119 87 S144 67 165 76 S188 55 207 63 S232 48 251 60 S285 41 300 49 S323 31 349 39 S372 18 392 29 S425 10 442 22 S462 7 480 11" fill="none" stroke="#d8f77a" strokeWidth="2.3" vectorEffect="non-scaling-stroke" /></svg><div className="chart-glow-dot" /></div>
            <div className="visual-foot"><span>NAV records from AMFI India</span><span>{data.navDate ? `UPDATED ${formatDate(data.navDate).toUpperCase()}` : "SOURCE · AMFI INDIA"}</span></div>
            <div className="visual-stamp"><span>NO PAYWALL</span><strong>◎</strong></div>
          </div>
          <div className="hero-down"><span /> A BETTER PLACE TO START</div>
        </section>

        <section className="market-strip" aria-label="Fund category coverage">
          <div className="strip-intro"><span className="eyebrow">THE MARKET, MADE CLEAR</span><strong>One open directory.<br />Every major category.</strong></div>
          {filters.slice(1, 5).map((name, index) => <div className="market-stat" key={name}><span className={`market-icon market-icon-${index}`}>{["↗", "◌", "◒", "⌗"][index]}</span><div><strong>{categoryCount(name) ? formatCount(categoryCount(name)) : "—"}</strong><span>{name} schemes</span></div><small>0{index + 1}</small></div>)}
          <div className="strip-source"><span className="source-spark">✳</span><span>FREE &amp; OPEN<br /><strong>for everyone</strong></span></div>
        </section>

        <section className="explorer-section" id="explore">
          <div className="explorer-heading">
            <div><div className="eyebrow">THE DIRECTORY</div><h2>Explore mutual funds<span>.</span></h2><p>Search and compare direct growth schemes using the latest NAV reported to AMFI.</p></div>
            <div className="live-source"><span className="source-live-dot" /><div><strong>Official source</strong><span>AMFI India · free data</span></div><a href="https://www.amfiindia.com/net-asset-value/nav-download" target="_blank" rel="noreferrer" aria-label="AMFI India NAV download source">↗</a></div>
          </div>

          <div className="explorer-card">
            <div className="explorer-tools">
              <label className="search-box"><SearchIcon /><input ref={searchInput} type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search schemes, fund houses…" aria-label="Search mutual fund schemes" /><kbd>⌘ K</kbd></label>
              <FundHouseSelect fundHouses={data.fundHouses} value={fundHouse} onChange={chooseFundHouse} />
              <SortSelect value={sort} onChange={chooseSort} />
            </div>
            <div className="filter-row"><div className="filter-tabs" role="tablist" aria-label="Filter by fund category">{filters.map((name) => <button key={name} role="tab" aria-selected={category === name} className={category === name ? "selected" : ""} onClick={() => chooseCategory(name)} type="button">{name}<span>{formatCount(categoryCount(name))}</span></button>)}</div><div className="results-meta"><span className="source-live-dot" />{data.navDate ? `NAV as of ${formatDate(data.navDate)}` : "Waiting for AMFI feed"}</div></div>

            <div className="table-heading"><div><span>SCHEME NAME</span></div><div><span>FUND CATEGORY</span></div><div><span>NET ASSET VALUE</span></div><div><span>AS OF</span></div><div><span>PERFORMANCE</span></div></div>
            {loading ? <SchemeSkeleton /> : error ? <div className="empty-state"><span>↻</span><strong>We couldn’t load fund data</strong><p>{error}</p><button type="button" onClick={() => setRetryKey((value) => value + 1)}>Try again</button></div> : data.schemes.length ? (
              <div className="table-scroll"><table className="scheme-table"><colgroup><col className="scheme-col-name" /><col className="scheme-col-category" /><col className="scheme-col-nav" /><col className="scheme-col-date" /><col className="scheme-col-action" /></colgroup><thead className="visually-hidden"><tr><th>Scheme name</th><th>Category</th><th>NAV</th><th>As of</th><th>Performance</th></tr></thead><tbody>{data.schemes.map((scheme) => <SchemeRow key={scheme.schemeCode} scheme={scheme} expanded={expandedScheme === scheme.schemeCode} onToggle={() => setExpandedScheme((current) => current === scheme.schemeCode ? null : scheme.schemeCode)} />)}</tbody></table></div>
            ) : <div className="empty-state"><span>⌕</span><strong>No schemes found</strong><p>Try another name or switch to a different category.</p><button type="button" onClick={() => { setSearch(""); setFundHouse(""); chooseCategory("All"); }}>Clear filters</button></div>}

            <div className="table-footer"><span>Showing <strong>{data.schemes.length ? (data.page - 1) * data.pageSize + 1 : 0}–{Math.min(data.page * data.pageSize, data.total)}</strong> of <strong>{formatCount(data.total)}</strong> schemes</span><div className="pagination"><button aria-label="Previous page" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronIcon direction="left" /></button><span>Page <strong>{data.page}</strong> of <strong>{data.pageCount}</strong></span><button aria-label="Next page" type="button" disabled={page >= data.pageCount || loading} onClick={() => setPage((value) => Math.min(data.pageCount, value + 1))}><ChevronIcon /></button></div></div>
          </div>
          <div className="directory-disclaimer"><span className="disclaimer-mark">i</span><p>NAVs are sourced from AMFI India. Performance is calculated from reported historical NAVs and shown for information only. Mutual fund investments are subject to market risks.</p><a href="https://www.amfiindia.com/net-asset-value/nav-history" target="_blank" rel="noreferrer">About AMFI NAVs <ChevronIcon /></a></div>
        </section>

        <section className="about-section" id="about">
          <div className="about-kicker"><span className="eyebrow">OPEN DATA, BETTER CONTEXT</span><span className="about-line" /></div>
          <div className="about-content"><h2>Good decisions start<br />with <em>good information.</em></h2><div><p>Fundfolio makes publicly available mutual fund data easier to explore. Scheme details and NAV history come from AMFI India, the Association of Mutual Funds in India.</p><a href="https://www.amfiindia.com/" target="_blank" rel="noreferrer">Learn about AMFI <ChevronIcon /></a></div></div>
          <div className="about-bottom"><span><BrandMark /> FUND FOLIO, OPEN BY DESIGN</span><span>NO ADVICE · NO PAYWALL · JUST DATA</span></div>
        </section>
      </main>

      <footer className="site-footer"><Link className="brand" href="/"><BrandMark /><span className="brand-copy"><strong>fundfolio<span>.</span></strong><small>INDIA’S OPEN FUND DIRECTORY</small></span></Link><span>Free, public mutual fund information for everyone.</span><span>Market data by AMFI India <span className="footer-divider">·</span> For information only</span></footer>
    </div>
  );
}
