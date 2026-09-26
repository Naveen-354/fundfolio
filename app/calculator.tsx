"use client";

import { useState, type FormEvent } from "react";
import type { HistoricalInvestmentResult, InvestmentMode } from "@/lib/funds/investment-calculation";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getDefaultStartDate() {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  return date.toISOString().slice(0, 10);
}

export function InvestmentCalculator({ schemeCode, schemeName }: { schemeCode: string; schemeName: string }) {
  const [mode, setMode] = useState<InvestmentMode>("sip");
  const [amount, setAmount] = useState("10000");
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [withdrawalDate, setWithdrawalDate] = useState(getTodayDate);
  const [annualStepUp, setAnnualStepUp] = useState("0");
  const [result, setResult] = useState<HistoricalInvestmentResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(`/api/schemes/${schemeCode}/investment-calculator`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, amount: Number(amount), startDate, withdrawalDate, annualStepUp: Number(annualStepUp) }),
      });
      const data = await response.json() as HistoricalInvestmentResult | { error?: string };
      if (!response.ok) throw new Error("error" in data ? data.error ?? "Unable to calculate this investment." : "Unable to calculate this investment.");
      setResult(data as HistoricalInvestmentResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "NAV history is temporarily unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function clearResult() {
    setResult(null);
    setError("");
  }

  return (
    <section className="historical-calculator" aria-labelledby="historical-calculator-title">
      <header className="historical-calculator-header">
        <div>
          <span className="historical-calculator-kicker">A LOOK BACK WITH REAL NAVs</span>
          <h2 id="historical-calculator-title">What would your investment be worth?</h2>
          <p>Choose when you invested and when you plan to withdraw from {schemeName}. The estimate uses published NAVs and applicable exit-load terms.</p>
        </div>
        <span className="historical-calculator-badge"><i /> AMFI NAV history</span>
      </header>

      <div className="historical-calculator-content">
        <form className="historical-calculator-form" onSubmit={calculate}>
          <div className="investment-mode-tabs" role="group" aria-label="Investment type">
            <button type="button" className={mode === "sip" ? "selected" : ""} aria-pressed={mode === "sip"} onClick={() => { setMode("sip"); clearResult(); }}>Monthly SIP</button>
            <button type="button" className={mode === "lumpsum" ? "selected" : ""} aria-pressed={mode === "lumpsum"} onClick={() => { setMode("lumpsum"); clearResult(); }}>One-time</button>
          </div>

          <label className="investment-input-label" htmlFor="investment-amount">{mode === "sip" ? "Monthly investment" : "Investment amount"}</label>
          <div className="investment-currency-input"><span>₹</span><input id="investment-amount" type="number" min="500" max="10000000" step="500" required value={amount} onChange={(event) => { setAmount(event.target.value); clearResult(); }} /><span>{mode === "sip" ? "/ month" : ""}</span></div>
          <p className="investment-input-hint">Minimum ₹500 · Maximum ₹1 crore {mode === "sip" ? "per month" : ""}</p>

          <label className="investment-input-label investment-date-label" htmlFor="investment-start-date">{mode === "sip" ? "First SIP date" : "Investment date"}</label>
          <input className="investment-date-input" id="investment-start-date" type="date" max={getTodayDate()} required value={startDate} onChange={(event) => { const value = event.target.value; setStartDate(value); if (value > withdrawalDate) setWithdrawalDate(value); clearResult(); }} />
          <p className="investment-input-hint">If markets were closed, the next available NAV is used for the purchase.</p>

          <label className="investment-input-label investment-date-label" htmlFor="investment-withdrawal-date">Withdrawal date</label>
          <input className="investment-date-input" id="investment-withdrawal-date" type="date" min={startDate} max={getTodayDate()} required value={withdrawalDate} onChange={(event) => { setWithdrawalDate(event.target.value); clearResult(); }} />
          <p className="investment-input-hint">The last NAV on or before this date is used to estimate the withdrawal.</p>

          {mode === "sip" && (
            <div className="investment-stepup-row">
              <div><label className="investment-input-label" htmlFor="investment-stepup">Increase SIP each year</label><p className="investment-input-hint">Optional annual step-up</p></div>
              <div className="investment-stepup-input"><input id="investment-stepup" type="number" min="0" max="50" step="1" value={annualStepUp} onChange={(event) => { setAnnualStepUp(event.target.value); clearResult(); }} /><span>%</span></div>
            </div>
          )}

          <button className="investment-calculate-button" type="submit" disabled={loading || !amount || !startDate || !withdrawalDate}>
            {loading ? <><span className="investment-button-spinner" /> Calculating from NAV history…</> : "Calculate withdrawal value"}
            {!loading && <span aria-hidden="true">↗</span>}
          </button>
          {error && <p className="investment-calculator-error" role="alert">{error}</p>}
        </form>

        <div className={`historical-calculator-result${result ? " has-result" : ""}`} aria-live="polite">
          {result ? (
            <>
              <span className="investment-result-kicker">ESTIMATED WITHDRAWAL · NAV AS OF {formatDate(result.asOfDate).toUpperCase()}</span>
              <strong className="investment-result-value">{formatCurrency(result.currentValue)}</strong>
              <span className={`investment-result-gain${result.gain < 0 ? " negative" : ""}`}>{result.gain >= 0 ? "+" : "−"}{formatCurrency(Math.abs(result.gain))} <i>({result.returnPercent >= 0 ? "+" : ""}{result.returnPercent.toFixed(2)}%)</i></span>
              <div className="investment-result-stats">
                <div><span>Total invested</span><strong>{formatCurrency(result.amountInvested)}</strong></div>
                <div><span>Gross value</span><strong>{formatCurrency(result.grossValue)}</strong></div>
                <div><span>Estimated exit load</span><strong>{formatCurrency(result.exitLoadAmount)}</strong></div>
                <div><span>Annualised return</span><strong>{result.annualizedReturnPercent === null ? "—" : `${result.annualizedReturnPercent >= 0 ? "+" : ""}${result.annualizedReturnPercent.toFixed(2)}%`}</strong></div>
                <div><span>{mode === "sip" ? "SIP instalments" : "Units held"}</span><strong>{mode === "sip" ? result.installmentCount : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(result.unitsHeld)}</strong></div>
              </div>
              <p className="investment-exit-load-status">
                {result.exitLoadStatus === "parsed"
                  ? result.exitLoadAppliedInstallments > 0 ? `Exit load estimated on ${result.exitLoadAppliedInstallments} investment${result.exitLoadAppliedInstallments === 1 ? "" : "s"}.` : "Published exit-load terms found; no charge applied to these holding periods."
                  : result.exitLoadStatus === "none" ? "No percentage exit load found; no charge applied." : "Exit-load terms unavailable; no charge assumed."}
              </p>
              {result.exitLoadTerms.length > 0 && <details className="investment-exit-load-terms"><summary>Exit-load terms used</summary>{result.exitLoadTerms.map((term, index) => <p key={`${index}-${term}`}>{term}</p>)}</details>}
              <p className="investment-result-note">First purchase {formatDate(result.firstInvestmentDate)} · Uses the last published NAV on or before your withdrawal date. Estimate excludes tax and other charges. Past performance does not predict future returns.</p>
            </>
          ) : (
            <div className="investment-result-empty">
              <span aria-hidden="true">↗</span>
              <strong>Your history, made tangible.</strong>
              <p>Enter an investment amount and date to see the value based on this scheme’s actual NAVs.</p>
              <small>Historical illustration only. Mutual fund investments are subject to market risks.</small>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
