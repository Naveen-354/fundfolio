"use client";

import { useEffect, useMemo, useState } from "react";
import {
  defaultPublicTypography,
  typographyFonts,
  type PublicTypographySettings,
  type TypographyFont,
} from "@/lib/site/typography-shared";

const fontChoices = Object.entries(typographyFonts) as [TypographyFont, (typeof typographyFonts)[TypographyFont]][];

async function readSettings(response: Response) {
  const body = await response.json().catch(() => ({})) as { settings?: PublicTypographySettings; error?: string };
  if (!response.ok) throw new Error(body.error ?? "Typography settings could not be loaded.");
  if (!body.settings) throw new Error("Typography settings were not returned.");
  return body.settings;
}

export function TypographyEditor() {
  const [saved, setSaved] = useState<PublicTypographySettings>(defaultPublicTypography);
  const [draft, setDraft] = useState<PublicTypographySettings>(defaultPublicTypography);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let current = true;
    void fetch("/api/admin/typography", { cache: "no-store" })
      .then(readSettings)
      .then((settings) => {
        if (!current) return;
        setSaved(settings);
        setDraft(settings);
        setError("");
      })
      .catch((cause: unknown) => {
        if (current) setError(cause instanceof Error ? cause.message : "Typography settings could not be loaded.");
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);

  const dirty = useMemo(() => draft.bodyFont !== saved.bodyFont
    || draft.displayFont !== saved.displayFont || draft.fontScale !== saved.fontScale
    || draft.schemeListScale !== saved.schemeListScale, [draft, saved]);

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const settings = await readSettings(await fetch("/api/admin/typography", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      }));
      setSaved(settings);
      setDraft(settings);
      setNotice("Typography saved. The public page will use these settings on its next load.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Typography could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setDraft(defaultPublicTypography);
    setNotice("");
    setError("");
  }

  const bodyStack = typographyFonts[draft.bodyFont].stack;
  const displayStack = typographyFonts[draft.displayFont].stack;

  return (
    <div className="admin-content typography-content">
      <div className="admin-page-heading">
        <div><div className="eyebrow">PUBLIC SITE SETTINGS</div><h1>Typography</h1><p>Adjust the typefaces and size used across all text on the public page.</p></div>
        <div className="admin-secure-pill"><span className="status-dot" /> Applies to public site</div>
      </div>

      <section className="typography-panel" aria-label="Public typography editor">
        <div className="typography-panel-heading"><div><h2>Font editor</h2><p>Preview changes here, then save to publish them to the public page.</p></div></div>
        {error && <div className="typography-message error" role="alert">{error}</div>}
        {notice && !error && <div className="typography-message success" role="status">{notice}</div>}

        {loading ? <div className="typography-loading"><span className="loading-ring" /> Loading saved settings…</div> : (
          <div className="typography-editor-grid">
            <div className="typography-controls">
              <label className="typography-field"><span>Body font</span><small>Used across navigation, controls, labels, and paragraphs.</small><select value={draft.bodyFont} onChange={(event) => setDraft((value) => ({ ...value, bodyFont: event.target.value as TypographyFont }))}>{fontChoices.map(([key, font]) => <option key={key} value={key}>{font.label}</option>)}</select></label>
              <label className="typography-field"><span>Heading and accent font</span><small>Used for display headings and accent text.</small><select value={draft.displayFont} onChange={(event) => setDraft((value) => ({ ...value, displayFont: event.target.value as TypographyFont }))}>{fontChoices.map(([key, font]) => <option key={key} value={key}>{font.label}</option>)}</select></label>
              <div className="typography-field typography-size-field"><div><span>Overall text size</span><strong>{draft.fontScale}%</strong></div><small>Scales all public page text, including the Explore list.</small><input type="range" min="80" max="125" step="5" value={draft.fontScale} onChange={(event) => setDraft((value) => ({ ...value, fontScale: Number(event.target.value) }))} aria-label="Overall public text size" /><div className="typography-range-labels"><span>80%</span><span>100%</span><span>125%</span></div></div>
              <div className="typography-field typography-size-field"><div><span>Explore schemes list size</span><strong>{draft.schemeListScale}%</strong></div><small>Extra size adjustment for filters, scheme rows, NAV values, and performance details.</small><input type="range" min="80" max="125" step="5" value={draft.schemeListScale} onChange={(event) => setDraft((value) => ({ ...value, schemeListScale: Number(event.target.value) }))} aria-label="Explore schemes list text size" /><div className="typography-range-labels"><span>80%</span><span>100%</span><span>125%</span></div></div>
              <div className="typography-actions"><button className="typography-reset" type="button" onClick={reset} disabled={saving || loading}>Reset defaults</button><button className="typography-save" type="button" onClick={save} disabled={!dirty || saving || loading || Boolean(error)}>{saving ? "Saving…" : "Save typography"}</button></div>
            </div>

            <div className="typography-preview" style={{ fontFamily: bodyStack, fontSize: `${draft.fontScale}%` }}>
              <div className="typography-preview-kicker">PUBLIC PAGE PREVIEW</div>
              <h2 style={{ fontFamily: displayStack }}>Find the fund behind the numbers.</h2>
              <p>Explore mutual funds with clear scheme details and the latest NAV reported to AMFI India.</p>
              <div className="typography-preview-control"><span>Equity schemes</span><strong>1,234</strong><button type="button" tabIndex={-1}>Explore funds ↗</button></div>
              <div className="typography-preview-list" style={{ fontSize: `${draft.schemeListScale}%` }}><strong>Abakkus Flexi Cap Fund</strong><span>Equity · Direct Growth</span><b>₹42.16</b></div>
              <small>Overall size scales the page; the scheme-list setting adds a separate adjustment to its list text.</small>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
