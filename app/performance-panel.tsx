"use client";

import { useEffect, useMemo, useState } from "react";
import type { FundPerformance } from "@/lib/funds/types";

const periods: FundPerformance["period"][] = ["1M", "3M", "1Y", "3Y", "5Y"];

function formatNav(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export function PerformancePanel({ schemeCode, name }: { schemeCode: string; name: string }) {
  const [period, setPeriod] = useState<FundPerformance["period"]>("1Y");
  const [result, setResult] = useState<FundPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/schemes/${schemeCode}/performance?period=${period}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Performance history is unavailable.");
        return data as FundPerformance;
      })
      .then((data) => { if (!cancelled) setResult(data); })
      .catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Performance history is unavailable."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [schemeCode, period]);

  const chart = useMemo(() => {
    if (!result?.observations.length) return null;
    const points = result.observations;
    const stride = Math.max(1, Math.ceil(points.length / 72));
    const sampled = points.filter((_, index) => index % stride === 0 || index === points.length - 1);
    const values = sampled.map((point) => point.nav);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const span = maximum - minimum || 1;
    const plotted = sampled.map((point, index) => ({
      x: 4 + (index / Math.max(1, sampled.length - 1)) * 592,
      y: 118 - ((point.nav - minimum) / span) * 102,
      date: point.date,
      nav: point.nav,
    }));
    const polylinePoints = plotted.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    return { points: polylinePoints, minimum, maximum, plotted };
  }, [result]);

  useEffect(() => { setHoverIndex(null); }, [chart]);

  const hoverPoint = chart && hoverIndex !== null ? chart.plotted[hoverIndex] : null;

  function handleChartPointerMove(event: React.MouseEvent<SVGSVGElement>) {
    if (!chart) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const cursorX = ((event.clientX - rect.left) / rect.width) * 600;
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    chart.plotted.forEach((point, index) => {
      const distance = Math.abs(point.x - cursorX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setHoverIndex(nearestIndex);
  }

  function handleChartPointerLeave() {
    setHoverIndex(null);
  }

  return (
    <div className="performance-panel">
      <div className="performance-topline"><div><span className="performance-kicker">HISTORICAL PERFORMANCE</span><strong>{name}</strong></div><div className="period-tabs" role="tablist" aria-label="Performance period">
        {periods.map((item) => <button key={item} type="button" role="tab" aria-selected={period === item} className={period === item ? "selected" : ""} onClick={() => { setLoading(true); setError(""); setPeriod(item); }}>{item}</button>)}
      </div></div>
      {loading ? <div className="chart-loading"><span className="loading-ring" /> Loading NAV history from AMFI…</div> : error || !result || !chart ? <div className="chart-error"><span>↗</span><p>{error || "NAV history is not available for this scheme."}</p><small>AMFI may not have enough observations for this period yet.</small></div> : (
        <div className="performance-content">
          <div className="performance-chart-wrap">
            <svg
              className="performance-chart"
              viewBox="0 0 600 130"
              role="img"
              aria-label={`${period} NAV history for ${name}`}
              preserveAspectRatio="none"
              onMouseMove={handleChartPointerMove}
              onMouseLeave={handleChartPointerLeave}
            >
              <defs><linearGradient id={`chart-fill-${schemeCode}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#6cae83" stopOpacity=".22"/><stop offset="100%" stopColor="#6cae83" stopOpacity="0"/></linearGradient></defs>
              <path d={`M ${chart.points.replaceAll(" ", " L ")} L 596 126 L 4 126 Z`} fill={`url(#chart-fill-${schemeCode})`} />
              <line x1="4" y1="16" x2="596" y2="16" className="chart-gridline"/><line x1="4" y1="67" x2="596" y2="67" className="chart-gridline"/><line x1="4" y1="118" x2="596" y2="118" className="chart-gridline"/>
              <polyline points={chart.points} fill="none" className="chart-stroke" strokeLinecap="round" strokeLinejoin="round" />
              {hoverPoint && <line x1={hoverPoint.x} y1="10" x2={hoverPoint.x} y2="122" className="chart-hover-line" />}
              {hoverPoint && <circle cx={hoverPoint.x} cy={hoverPoint.y} r="3.4" className="chart-hover-dot" />}
            </svg>
            {hoverPoint && (
              <div className="chart-tooltip" style={{ left: `${Math.min(94, Math.max(6, (hoverPoint.x / 600) * 100))}%` }}>
                <strong>{formatNav(hoverPoint.nav)}</strong>
                <span>{formatDate(hoverPoint.date)}</span>
              </div>
            )}
            <div className="chart-axis-labels"><span>{formatDate(result.fromDate)}</span><span>{formatDate(result.toDate)}</span></div>
          </div>
          <div className="performance-summary">
            <div className="performance-return"><span>PERIOD RETURN</span><strong className={result.returnPercent >= 0 ? "positive" : "negative"}>{result.returnPercent >= 0 ? "+" : ""}{result.returnPercent.toFixed(2)}%</strong><small>{period === "1M" || period === "3M" ? "Total return" : "Annualised · CAGR"}</small></div>
            <div><span>STARTING NAV</span><strong>{formatNav(result.startNav)}</strong></div>
            <div><span>LATEST NAV</span><strong>{formatNav(result.latestNav)}</strong></div>
            <div className="chart-extremes"><span>{formatNav(chart.minimum)} low</span><span>{formatNav(chart.maximum)} high</span></div>
          </div>
        </div>
      )}
      <div className="performance-footnote">Calculated from AMFI-reported NAV observations. Past performance does not predict future returns.</div>
    </div>
  );
}
