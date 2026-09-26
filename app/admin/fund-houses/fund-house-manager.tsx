"use client";

import { useEffect, useMemo, useState } from "react";

type FundHouse = {
  id: string;
  sourceKey: string;
  amfiId: string | null;
  amfiName: string;
  rtaType: string | null;
  rtaCode: string | null;
  isActive: boolean;
};

type FundHouseDraft = Pick<FundHouse, "amfiId" | "rtaType" | "rtaCode">;

async function readResponse(response: Response) {
  const body = await response.json().catch(() => ({})) as {
    error?: string;
    fundHouses?: FundHouse[];
    fundHouse?: FundHouse;
    schemes?: number;
    navDate?: string;
  };
  if (!response.ok) throw new Error(body.error ?? "The request could not be completed.");
  return body;
}

export function FundHouseManager() {
  const [fundHouses, setFundHouses] = useState<FundHouse[]>([]);
  const [drafts, setDrafts] = useState<Record<string, FundHouseDraft>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let current = true;
    void fetch("/api/admin/fund-houses", { cache: "no-store" })
      .then(readResponse)
      .then((body) => {
        if (!current) return;
        const rows = body.fundHouses ?? [];
        setError("");
        setFundHouses(rows);
        setDrafts(Object.fromEntries(rows.map((house) => [house.id, {
          amfiId: house.amfiId ?? "",
          rtaType: house.rtaType ?? "",
          rtaCode: house.rtaCode ?? "",
        }])));
      })
      .catch((cause: unknown) => {
        if (current) setError(cause instanceof Error ? cause.message : "Fund houses could not be loaded.");
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [reloadKey]);

  const visibleFundHouses = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("en-IN");
    if (!needle) return fundHouses;
    return fundHouses.filter((house) => `${house.amfiName} ${house.amfiId ?? ""} ${house.rtaType ?? ""} ${house.rtaCode ?? ""}`
      .toLocaleLowerCase("en-IN").includes(needle));
  }, [fundHouses, search]);

  const enabledCount = useMemo(() => fundHouses.filter((house) => house.isActive).length, [fundHouses]);

  function reloadList() {
    setLoading(true);
    setError("");
    setNotice("");
    setReloadKey((value) => value + 1);
  }

  async function syncAmfiData() {
    setSyncing(true);
    setError("");
    setNotice("");
    try {
      const body = await readResponse(await fetch("/api/admin/fund-houses/sync", { method: "POST" }));
      const count = new Intl.NumberFormat("en-IN").format(body.schemes ?? 0);
      setNotice(`${count} direct-growth schemes and their latest NAVs were saved${body.navDate ? ` through ${body.navDate}` : ""}.`);
      setLoading(true);
      setReloadKey((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AMFI data could not be synced.");
    } finally {
      setSyncing(false);
    }
  }

  async function updateFundHouse(house: FundHouse, patch: Partial<FundHouseDraft> & { isActive?: boolean }, action: string) {
    setBusy(`${action}:${house.id}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/fund-houses/${house.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await readResponse(response);
      if (!body.fundHouse) throw new Error("The fund-house update was not returned.");
      const updated = body.fundHouse;
      setFundHouses((current) => current.map((item) => item.id === updated.id ? updated : item));
      setDrafts((current) => ({ ...current, [updated.id]: {
        amfiId: updated.amfiId ?? "",
        rtaType: updated.rtaType ?? "",
        rtaCode: updated.rtaCode ?? "",
      } }));
      setNotice(`${updated.amfiName} ${action === "visibility" ? (updated.isActive ? "is visible on" : "is hidden from") : "details saved for"} the public directory.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The fund-house update could not be saved.");
    } finally {
      setBusy("");
    }
  }

  function draftFor(house: FundHouse): FundHouseDraft {
    return drafts[house.id] ?? { amfiId: house.amfiId ?? "", rtaType: house.rtaType ?? "", rtaCode: house.rtaCode ?? "" };
  }

  function isDirty(house: FundHouse) {
    const draft = draftFor(house);
    return (draft.amfiId ?? "") !== (house.amfiId ?? "")
      || (draft.rtaType ?? "") !== (house.rtaType ?? "")
      || (draft.rtaCode ?? "") !== (house.rtaCode ?? "");
  }

  return (
    <div className="admin-content fund-houses-content">
      <div className="admin-page-heading">
        <div><div className="eyebrow">PUBLIC DIRECTORY CONTROL</div><h1>Fund houses</h1><p>Choose which AMFI fund houses and their schemes appear in the public directory.</p></div>
        <div className="admin-secure-pill"><span className="status-dot" /> {enabledCount} of {fundHouses.length} visible</div>
      </div>

      <section className="fund-house-panel" aria-label="Fund house management">
        <div className="fund-house-toolbar">
          <div><h2>AMFI fund-house list</h2><p>Names sync from AMFI. AMFI ID and RTA details can be entered here.</p></div>
          <div className="fund-house-toolbar-actions">
            <label className="fund-house-search"><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search fund houses" aria-label="Search fund houses" /></label>
            <button className="fund-house-sync" type="button" onClick={syncAmfiData} disabled={loading || syncing || Boolean(busy)}>{syncing ? "Syncing schemes…" : "Sync AMFI data"}</button>
            <button className="fund-house-refresh" type="button" onClick={reloadList} disabled={loading || syncing || Boolean(busy)}>{loading ? "Loading…" : "Refresh list"}</button>
          </div>
        </div>

        {error && <div className="fund-house-message error" role="alert"><span>{error}</span><button type="button" onClick={reloadList}>Try again</button></div>}
        {notice && !error && <div className="fund-house-message success" role="status">{notice}</div>}

        {loading ? <div className="fund-house-loading"><span className="loading-ring" /> Loading the AMFI fund-house list…</div> : error ? null : visibleFundHouses.length === 0 ? (
          <div className="fund-house-empty">{fundHouses.length ? "No fund houses match your search." : "AMFI did not return any fund houses."}</div>
        ) : (
          <div className="fund-house-table-scroll">
            <table className="fund-house-table">
              <thead><tr><th scope="col">Fund house</th><th scope="col">AMFI ID</th><th scope="col">RTA type</th><th scope="col">RTA code</th><th scope="col">Public visibility</th><th scope="col"><span className="visually-hidden">Save details</span></th></tr></thead>
              <tbody>{visibleFundHouses.map((house) => {
                const draft = draftFor(house);
                const savingDetails = busy === `details:${house.id}`;
                const savingVisibility = busy === `visibility:${house.id}`;
                return <tr key={house.id} className={!house.isActive ? "is-hidden" : undefined}>
                  <th scope="row"><div className="fund-house-name">{house.amfiName}</div><div className="fund-house-state"><span className={house.isActive ? "status-dot" : "status-dot muted"} />{house.isActive ? "Visible to everyone" : "Hidden from public"}</div></th>
                  <td><input aria-label={`${house.amfiName} AMFI ID`} maxLength={64} value={draft.amfiId ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [house.id]: { ...draft, amfiId: event.target.value } }))} placeholder="Add ID" disabled={Boolean(busy) || syncing} /></td>
                  <td><input aria-label={`${house.amfiName} RTA type`} maxLength={40} value={draft.rtaType ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [house.id]: { ...draft, rtaType: event.target.value } }))} placeholder="e.g. CAMS" disabled={Boolean(busy) || syncing} /></td>
                  <td><input aria-label={`${house.amfiName} RTA code`} maxLength={64} value={draft.rtaCode ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [house.id]: { ...draft, rtaCode: event.target.value } }))} placeholder="Add code" disabled={Boolean(busy) || syncing} /></td>
                  <td><button type="button" className={`fund-house-toggle${house.isActive ? "" : " disabled"}`} aria-pressed={house.isActive} aria-label={`${house.isActive ? "Hide" : "Show"} ${house.amfiName} ${house.isActive ? "from" : "on"} the public directory`} onClick={() => void updateFundHouse(house, { isActive: !house.isActive }, "visibility")} disabled={Boolean(busy) || syncing}><span className="fund-house-switch" aria-hidden="true"><i /></span><span>{house.isActive ? "Shown" : "Hidden"}</span>{savingVisibility && <small>Saving…</small>}</button></td>
                  <td><button type="button" className="fund-house-save" onClick={() => void updateFundHouse(house, draft, "details")} disabled={!isDirty(house) || Boolean(busy) || syncing}>{savingDetails ? "Saving…" : "Save"}</button></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
        <div className="fund-house-footer"><span>Disabling a fund house hides its schemes and performance from the public site. Its records remain available to re-enable.</span><span>{loading ? "" : `${visibleFundHouses.length} shown`}</span></div>
      </section>
    </div>
  );
}
