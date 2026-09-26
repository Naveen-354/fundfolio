import "server-only";

import { getPostgresPool, isDatabaseConfigured } from "@/lib/funds/postgres-repository";

export type SchemePortalRef = {
  schemeCode: string;
  name: string;
  fundHouse: string;
  mfId: string;
  sdId: string;
};

export async function getSchemePortalRef(schemeCode: string): Promise<SchemePortalRef | null> {
  if (!isDatabaseConfigured()) return null;

  const result = await getPostgresPool().query(
    `SELECT s.amfi_scheme_code AS "schemeCode", s.scheme_name AS name, h.amfi_name AS "fundHouse",
            h.amfi_id AS "mfId", s.amfi_portal_scheme_id AS "sdId"
     FROM schemes s
     JOIN fund_houses h ON h.id = s.fund_house_id
     WHERE s.amfi_scheme_code = $1 AND s.is_active = TRUE AND h.is_active = TRUE`,
    [schemeCode],
  );

  const row = result.rows[0] as SchemePortalRef | undefined;
  if (!row || !row.mfId || !row.sdId) return null;
  return row;
}

export type AmfiSchemeDetails = {
  MF_Name: string;
  Scheme_Name: string;
  Scheme_Objective: string;
  SchemeType_Desc: string;
  SchemeCat_Desc: string;
  Launch_Date: string;
  Scheme_load: string;
  Scheme_min_amt: string;
  AMC_Website: string;
};

export type AmfiSchemeNavRow = {
  Scheme_NAV_Name: string;
  Scheme_Name: string;
  ISIN_Div_Payout_ISIN_Growth: string;
  ISIN_Div_Reinvestment: string;
  Net_Asset_Value: string;
  Date: string;
  Plan: string;
  Option: string;
};

export type AmfiSchemeAumRow = {
  Scheme_NAV_Name: string;
  Average_AUM_For_The_Quarter: number;
  As_At_The_End_Of: string;
  Plan: string;
  Option: string;
};

const requestHeaders = {
  Accept: "application/json",
  Referer: "https://www.amfiindia.com/",
  "User-Agent": "Fundfolio/1.0 (public AMFI scheme detail viewer)",
};

async function getAmfiJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: requestHeaders, next: { revalidate: 3600 } });
  if (!response.ok) throw new Error(`AMFI returned ${response.status}`);
  return response.json() as Promise<T>;
}

export async function fetchAmfiSchemeDetails(mfId: string, sdId: string): Promise<AmfiSchemeDetails | null> {
  const url = `https://www.amfiindia.com/api/scheme-details?MF_ID=${encodeURIComponent(mfId)}&scheme_id=${encodeURIComponent(sdId)}`;
  const body = await getAmfiJson<{ data?: AmfiSchemeDetails[]; message?: string }>(url);
  return body.data?.[0] ?? null;
}

function extractExitLoadClause(schemeLoad: string): string | null {
  const match = schemeLoad.match(/\bexit[\s-]*load\b\s*[:\-]?/i);
  if (match?.index !== undefined) {
    const remainder = schemeLoad.slice(match.index + match[0].length);
    const nextSection = remainder.search(/\b(?:entry\s*load|stamp\s*duty|scheme\s*objective)\b/i);
    const clause = (nextSection >= 0 ? remainder.slice(0, nextSection) : remainder).trim();
    return clause ? `Exit load: ${clause}` : null;
  }

  return /\b(?:redeem(?:ed|ption)?|withdraw(?:al|n)?|switch\s*out)\b/i.test(schemeLoad)
    ? `Exit load: ${schemeLoad.trim()}`
    : null;
}

export async function getAmfiSchemeExitLoadTerms(schemeCode: string): Promise<string[]> {
  const ref = await getSchemePortalRef(schemeCode);
  if (!ref) return [];

  const details = await fetchAmfiSchemeDetails(ref.mfId, ref.sdId).catch(() => null);
  const detailClause = details?.Scheme_load ? extractExitLoadClause(details.Scheme_load) : null;
  if (detailClause && /\d+(?:\.\d+)?\s*%|\b(?:nil|none|not\s+applicable|not\s+charged|no\s+(?:exit\s+)?load)\b/i.test(detailClause)) {
    return [detailClause];
  }

  const summary = await fetchAmfiSchemeSummary(ref.sdId).catch(() => null);
  const summaryTerms = (summary?.fields ?? [])
    .filter((field) => /exit[_\s-]*load/i.test(`${field.key} ${field.label}`))
    .map((field) => field.value.trim())
    .filter(Boolean);
  return [...new Set([...(detailClause ? [detailClause] : []), ...summaryTerms])];
}

export async function fetchAmfiSchemeNav(mfId: string, sdId: string): Promise<AmfiSchemeNavRow[]> {
  const url = `https://www.amfiindia.com/api/scheme-data?strMFId=${encodeURIComponent(mfId)}&strSDId=${encodeURIComponent(sdId)}&strOption=NAV`;
  const body = await getAmfiJson<AmfiSchemeNavRow[] | { message?: string }>(url);
  return Array.isArray(body) ? body : [];
}

export async function fetchAmfiSchemeAum(mfId: string, sdId: string): Promise<AmfiSchemeAumRow[]> {
  const url = `https://www.amfiindia.com/api/scheme-data?strMFId=${encodeURIComponent(mfId)}&strSDId=${encodeURIComponent(sdId)}&strOption=AUM`;
  const body = await getAmfiJson<AmfiSchemeAumRow[] | { message?: string }>(url);
  return Array.isArray(body) ? body : [];
}

export type AmfiSchemeDocumentUrls = {
  infoDocumentUrl: string | null;
  summaryPdfUrl: string | null;
  summaryXlsUrl: string | null;
  summaryXmlUrl: string | null;
};

export type SchemeSummaryOption = {
  name: string;
  isin: string;
  rtaCode: string;
  amfiCode: string;
};

export type SchemeSummaryFieldGroup = "transaction" | "general";
export type SchemeSummaryField = { key: string; label: string; value: string; group: SchemeSummaryFieldGroup };

export type SchemeSummary = {
  fields: SchemeSummaryField[];
  sipSwpStp: SipSwpStpSummary;
  riskometer: { current: string | null; atLaunch: string | null };
  // Keyed by ISIN, and by "<plan>|<growth|idcw>" for the two family-level maps — see
  // buildSchemeOptions, which is the only place these are meant to be read from.
  isinToRtaCode: Record<string, string>;
  rtaCodeByFamily: Record<string, string>;
  amfiCodeByFamily: Record<string, string>;
  documentUrls: AmfiSchemeDocumentUrls;
};

const optionListFields = ["Option_Names_Regular__Direct", "ISINs", "RTA_Code_To_be_phased_out", "AMFI_Codes_To_be_phased_out"] as const;

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function splitLines(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function labelizeFieldName(key: string): string {
  return key.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

// AMFI's SIP/SWP/STP fields are free-text prose that blends all three transaction
// types into one string per attribute (frequency, minimum amount, etc.), with no
// consistent delimiter: some fields put one type per line, others run SIP/STP/SWP
// together in a single paragraph. Splitting on a fixed character (comma, semicolon,
// newline) breaks on one or the other. Instead, this scans for every occurrence of the
// SIP/STP/SWP keyword itself and treats the text between one occurrence and the next
// as that occurrence's clause — reliable regardless of how the surrounding text is
// punctuated, since the keyword is the one anchor guaranteed to be there.
const sipSwpStpFieldDefinitions = [
  { key: "SIP_SWP__STP_Details_Frequency", label: "Frequency" },
  { key: "SIP_SWP__STP_Details_Minimum_amount", label: "Minimum amount" },
  { key: "SIP_SWP__STP_Details_In_multiple_of", label: "In multiples of" },
  { key: "SIP_SWP__STP_Details_Minimum_Instalments", label: "Minimum instalments" },
  { key: "SIP_SWP__STP_Details_Dates", label: "Transaction dates" },
  { key: "SIP_SWP__STP_Details_Maximum_Amount_if_any", label: "Maximum amount (if any)" },
] as const;

export type SipSwpStpRow = { label: string; SIP: string; STP: string; SWP: string };
export type SipSwpStpSummary = { rows: SipSwpStpRow[]; notes: string[] };

function normalizeClause(text: string): string {
  return text.replace(/,(?=\S)/g, ", ").replace(/\s{2,}/g, " ").replace(/[;,]\s*$/, "").trim();
}

// A SIP/STP/SWP keyword only marks the start of a new clause when it's immediately
// followed by a dash, a colon, or a frequency word ("SIP - 1000", "STP: Under Daily...",
// "STP Weekly - ..."). Without that check, a plain-English backreference later in the
// same clause — e.g. "SIP Weekly - the SIP Days shall be any business day..." — gets
// misread as a second, unrelated SIP clause and the sentence gets torn in half.
const clauseHeaderPattern = /\b(SIP|STP|SWP)\b(?=\s*[-:]|\s+(?:Daily|Weekly|Fortnightly|Monthly|Quarterly)\b)/gi;

// AMCs don't all use the same header convention, and a handful glue words together
// with no separating space at all (a genuine defect in AMFI's source data — e.g.
// "...as per the SWP plan chosen by the investorSTPFor STP -Daily..."). When a clause
// header isn't recognized, its text silently attaches to whatever the PRECEDING
// recognized clause was — so if that clause's own text ends up literally containing a
// *different* category's name anywhere (e.g. an SWP clause whose text contains
// "...installmentsSTP..."), that's proof a real STP header went undetected and bled
// into SWP. This deliberately checks for the substring with no word-boundary
// requirement, since a boundary check has exactly the blind spot that let the glued
// text through in the first place. Rather than show that misattributed content as if
// it were correct, the whole field is discarded in favor of the raw note fallback.
function mentionsOtherCategory(value: string, ownCategory: "SIP" | "STP" | "SWP"): boolean {
  const lower = value.toLowerCase();
  return (["SIP", "STP", "SWP"] as const)
    .filter((category) => category !== ownCategory)
    .some((category) => lower.includes(category.toLowerCase()));
}

function splitByTransactionType(value: string): { SIP: string; STP: string; SWP: string } | null {
  const matches = [...value.matchAll(clauseHeaderPattern)];
  if (matches.length === 0) return null;

  const result = { SIP: "", STP: "", SWP: "" };
  for (let i = 0; i < matches.length; i++) {
    const category = matches[i][0].toUpperCase() as keyof typeof result;
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? value.length : value.length;
    const clause = normalizeClause(value.slice(start, end).replace(/^(SIP|STP|SWP)\s*[-:]?\s*/i, "").replace(/^[,;]\s*/, ""));
    if (!clause) continue;
    result[category] = result[category] ? `${result[category]}; ${clause}` : clause;
  }

  const leaked = (["SIP", "STP", "SWP"] as const).some((category) => result[category] && mentionsOtherCategory(result[category], category));
  return leaked ? null : result;
}

function buildSipSwpStpSummary(fields: Record<string, string>): SipSwpStpSummary {
  const rows: SipSwpStpRow[] = [];
  const notes: string[] = [];

  for (const { key, label } of sipSwpStpFieldDefinitions) {
    const raw = fields[key];
    if (!raw) continue;
    const split = splitByTransactionType(raw);
    if (!split || (!split.SIP && !split.STP && !split.SWP)) {
      notes.push(`${label}: ${raw}`);
      continue;
    }
    rows.push({ label, SIP: split.SIP || "—", STP: split.STP || "—", SWP: split.SWP || "—" });
  }

  return { rows, notes };
}

// Signals that identify a field as describing how an investor transacts with the scheme
// (minimums, switches, SIP/SWP/STP rules, exit load) rather than the scheme's own
// structure (managers, benchmark, dates, service providers). Matched as compound
// substrings against the lowercased field key so a broad word like "maximum" alone
// (e.g. Annual_Expense_Stated_maximum, a fee, not a transaction rule) doesn't misfire.
const transactionFieldSignals = [
  "minimum_application", "minimum_additional", "minimum_redemption", "minimum_balance",
  "minimum_switch", "switch_multiple", "max_switch", "max_investment",
  "swing_pricing", "sidepocketing", "sip_swp", "exit_load",
];

function classifySummaryField(key: string): SchemeSummaryFieldGroup {
  const lower = key.toLowerCase();
  return transactionFieldSignals.some((signal) => lower.includes(signal)) ? "transaction" : "general";
}

type PlanFamily = "direct" | "regular";
type OptionFamily = "growth" | "idcw";

function classifyPlan(text: string): PlanFamily | null {
  const lower = text.toLowerCase();
  if (lower.includes("direct")) return "direct";
  if (lower.includes("regular")) return "regular";
  return null;
}

function classifyOptionFamily(text: string): OptionFamily | null {
  const lower = text.toLowerCase();
  if (lower.includes("idcw") || lower.includes("dividend")) return "idcw";
  if (lower.includes("growth")) return "growth";
  return null;
}

// AMFI_Codes_To_be_phased_out isn't ordered to line up with the option list, and IDCW
// Payout/Reinvestment share one legacy code per plan, so codes are resolved by looking
// up each candidate code's own scheme name rather than by list position.
async function resolveAmfiCodesByFamily(codes: string[]): Promise<Map<string, string>> {
  const lookup = new Map<string, string>();
  await Promise.all(codes.map(async (code) => {
    try {
      const response = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(code)}`, { next: { revalidate: 3600 } });
      if (!response.ok) return;
      const body = await response.json() as { meta?: { scheme_name?: string } };
      const name = body.meta?.scheme_name ?? "";
      const plan = classifyPlan(name);
      const optionFamily = classifyOptionFamily(name);
      if (plan && optionFamily) lookup.set(`${plan}|${optionFamily}`, code);
    } catch {
      // Leave this code unmapped; the option row falls back to "—".
    }
  }));
  return lookup;
}

// Some AMCs (e.g. Abakkus) don't list bare codes at all — each entry already names its
// own plan and option directly ("Abakkus Flexi Cap Fund - Direct Plan - Growth- 154043"),
// comma- and newline-separated interchangeably. When an entry is self-describing like
// that, its plan/option and trailing code can be read directly with no external lookup
// (and no ambiguity, unlike the bare-code path above). Entries that are just a bare
// number (the AMFI-wide convention) are left for resolveAmfiCodesByFamily instead.
function splitAmfiCodeEntries(value: string): string[] {
  return value.split(/[,\r\n]+/).map((entry) => entry.trim()).filter(Boolean);
}

function extractTrailingCode(entry: string): string | null {
  const match = entry.match(/(\d{4,8})\s*$/);
  return match ? match[1] : null;
}

async function resolveAmfiCodeByFamilyFromEntries(entries: string[]): Promise<Record<string, string>> {
  const amfiCodeByFamily: Record<string, string> = {};
  const bareCodes: string[] = [];

  for (const entry of entries) {
    if (/^\d{4,8}$/.test(entry)) {
      bareCodes.push(entry);
      continue;
    }
    const plan = classifyPlan(entry);
    const optionFamily = classifyOptionFamily(entry);
    const code = extractTrailingCode(entry);
    if (plan && optionFamily && code) amfiCodeByFamily[`${plan}|${optionFamily}`] = code;
  }

  if (bareCodes.length) {
    const resolved = await resolveAmfiCodesByFamily(bareCodes);
    for (const [key, value] of resolved) {
      if (!(key in amfiCodeByFamily)) amfiCodeByFamily[key] = value;
    }
  }

  return amfiCodeByFamily;
}

// Mirrors splitAmfiCodeEntries's comma-or-newline entries, but only the ISIN itself is
// kept — Abakkus's ISINs field wraps each one in the same descriptive label as its AMFI
// codes field, while other AMCs list bare ISINs one per line. Matching the ISIN pattern
// directly (rather than trusting the field's structure) handles both uniformly.
function extractIsinTokens(value: string): string[] {
  return [...value.matchAll(/\bIN[A-Z0-9]{10}\b/g)].map((match) => match[0]);
}

// RTA_Code_To_be_phased_out has its own convention split: some AMCs list a bare code per
// line ("IBHRG"), others prefix a descriptive label after a dash ("LMDG - ABAKKUS LARGE
// & MID CAP FUND-DIRECT-GROWTH"). A labeled line's plan/option can be read directly from
// its own label — critically, NOT from list position, since a labeled RTA line's order
// isn't guaranteed to match the ISINs list's order (that mismatch is exactly what caused
// a Direct-plan ISIN to end up paired with a Regular-plan RTA code before this fix).
// Bare lines (no label) are returned separately for the existing position-based zip
// against the ISIN list, unchanged from before.
function splitRtaCodeEntries(value: string | undefined): { byFamily: Record<string, string>; bareCodes: string[] } {
  const byFamily: Record<string, string> = {};
  const bareCodes: string[] = [];

  for (const line of splitLines(value)) {
    const match = line.match(/^([A-Za-z0-9]+)\s*-\s*(.+)$/);
    if (!match) {
      bareCodes.push(line);
      continue;
    }
    const [, code, label] = match;
    const plan = classifyPlan(label);
    const optionFamily = classifyOptionFamily(label);
    if (plan && optionFamily) byFamily[`${plan}|${optionFamily}`] = code.trim();
    else bareCodes.push(code.trim());
  }

  return { byFamily, bareCodes };
}

function parseSchemeSummaryXml(xml: string): Record<string, string> {
  const bodyMatch = xml.match(/<SchemeSummary>([\s\S]*?)<\/SchemeSummary>/);
  if (!bodyMatch) return {};

  const fields: Record<string, string> = {};
  const tagPattern = /<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(bodyMatch[1]))) {
    fields[match[1]] = decodeXmlEntities(match[2]).trim();
  }
  return fields;
}

export async function fetchAmfiSchemeSummary(sdId: string): Promise<SchemeSummary | null> {
  const documentsUrl = `https://www.amfiindia.com/api/schemes/${encodeURIComponent(sdId)}/documents`;
  const documentsBody = await getAmfiJson<{ data?: AmfiSchemeDocumentUrls[] }>(documentsUrl);
  const documentUrls = documentsBody.data?.[0];
  if (!documentUrls?.summaryXmlUrl) return null;

  const xmlResponse = await fetch(documentUrls.summaryXmlUrl, {
    headers: { "User-Agent": requestHeaders["User-Agent"] },
    next: { revalidate: 3600 },
  });
  if (!xmlResponse.ok) return null;
  const fields = parseSchemeSummaryXml(await xmlResponse.text());

  // The XML's Option_Names / ISINs / RTA_Code / AMFI_Codes lists are not guaranteed to
  // share one consistent order (AMFI_Codes in particular does not — see
  // resolveAmfiCodesByFamily), so nothing here is zipped by position unless a code has
  // no plan/option label of its own to identify it by. ISINs and RTA codes are paired
  // directly with each other (a genuine 1:1 fact about a security) only for such bare,
  // unlabeled codes; buildSchemeOptions cross-references that pairing against each
  // option's real identity from the NAV endpoint instead of trusting list order.
  const isins = extractIsinTokens(fields.ISINs ?? "");
  const { byFamily: rtaCodeByFamily, bareCodes: bareRtaCodes } = splitRtaCodeEntries(fields.RTA_Code_To_be_phased_out);
  const isinToRtaCode: Record<string, string> = {};
  if (bareRtaCodes.length === 1 && isins.length > 1) {
    // A single shared registrar code for the whole scheme (some AMCs don't break this
    // down per option) rather than a mismatched, partial zip against the ISIN list.
    for (const isin of isins) isinToRtaCode[isin] = bareRtaCodes[0];
  } else {
    isins.forEach((isin, index) => {
      const rtaCode = bareRtaCodes[index];
      if (isin && rtaCode) isinToRtaCode[isin] = rtaCode;
    });
  }

  const amfiCodeByFamily = await resolveAmfiCodeByFamilyFromEntries(splitAmfiCodeEntries(fields.AMFI_Codes_To_be_phased_out ?? ""));

  const sipSwpStp = buildSipSwpStpSummary(fields);

  const riskometerFieldKeys = ["Riskometer_as_on_Date", "Riskometer_At_the_time_of_Launch"] as const;
  const riskometer = {
    current: fields.Riskometer_as_on_Date || null,
    atLaunch: fields.Riskometer_At_the_time_of_Launch || null,
  };

  const excluded = new Set<string>([...optionListFields, ...sipSwpStpFieldDefinitions.map((field) => field.key), ...riskometerFieldKeys]);
  const remainingFields: SchemeSummaryField[] = Object.entries(fields)
    .filter(([key, value]) => !excluded.has(key) && value)
    .map(([key, value]) => ({ key, label: labelizeFieldName(key), value, group: classifySummaryField(key) }));

  return { fields: remainingFields, sipSwpStp, riskometer, isinToRtaCode, rtaCodeByFamily, amfiCodeByFamily, documentUrls };
}

// A scheme can have more than one NAV row for the same coarse (Plan, Growth/IDCW)
// pairing — e.g. a plain Growth option plus a separate Bonus option, or several IDCW
// payout frequencies (Monthly/Quarterly/Half-Yearly) — each a genuinely distinct ISIN,
// not a duplicate. Scheme_NAV_Name already carries the distinguishing word(s) (e.g.
// "...Regular Plan Bonus", "...Regular Plan Half Yearly Dividend"); this pulls out just
// that tag by taking the text after the row's own Plan mention and stripping the
// generic words ("Option", "Dividend", "Growth", "IDCW") that convey no new information
// once the row is already labeled by plan and option family.
//
// Not every AMC spells the plan out the same way as the `Plan` field itself — AMFI's own
// text says "Direct Plan", but some AMCs' Scheme_NAV_Name only says "Direct" (e.g.
// "Abakkus Flexi Cap Fund - Direct - Growth", no "Plan" at all). Searching for the exact
// "Direct Plan" phrase in the name fails there, and the previous fallback — treating the
// whole name as the tag — showed the entire fund name as a bogus tag on every row. This
// instead matches on just the plan keyword ("Direct"/"Regular") and takes the LAST such
// occurrence, so it still finds the split point regardless of whether "Plan" follows it.
export function extractVariantTag(schemeNavName: string, plan: string): string {
  const planWord = plan.trim().split(/\s+/)[0];
  const matches = planWord ? [...schemeNavName.matchAll(new RegExp(`\\b${planWord}\\b`, "gi"))] : [];
  if (matches.length === 0) return "";
  const lastMatch = matches[matches.length - 1];
  const tail = schemeNavName.slice((lastMatch.index ?? 0) + planWord.length);
  return tail
    .replace(/\bPlan\b/gi, "")
    .replace(/\b(Option|Dividend|Growth|IDCW)\b/gi, "")
    .replace(/^[\s\-–:]+|[\s\-–:]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const planLabels: Record<PlanFamily, string> = { direct: "Direct Plan", regular: "Regular Plan" };

// Builds the individual option rows anchored on the NAV endpoint, which states each
// row's Plan and Option(Growth/IDCW) explicitly rather than relying on any list's
// position. IDCW rows carry both their Payout ISIN (the main field, despite its name)
// and Reinvestment ISIN directly, so no guessing is needed to tell the two sub-options
// apart. Each option's RTA code is looked up by its own ISIN first, falling back to a
// family-level code when only that's available; its AMFI code is looked up by its own
// Plan+Option family — none of this by array position.
export function buildSchemeOptions(
  navRows: AmfiSchemeNavRow[],
  isinToRtaCode: Record<string, string>,
  rtaCodeByFamily: Record<string, string>,
  amfiCodeByFamily: Record<string, string>,
): SchemeSummaryOption[] {
  const options: SchemeSummaryOption[] = [];

  for (const row of navRows) {
    const plan = classifyPlan(row.Plan);
    const optionFamily = classifyOptionFamily(row.Option);
    if (!plan || !optionFamily) continue;
    const familyKey = `${plan}|${optionFamily}`;
    const amfiCode = amfiCodeByFamily[familyKey] ?? "—";
    const rtaCodeForFamily = rtaCodeByFamily[familyKey];
    const payoutIsin = row.ISIN_Div_Payout_ISIN_Growth?.trim();
    const reinvestmentIsin = row.ISIN_Div_Reinvestment?.trim();
    const tag = extractVariantTag(row.Scheme_NAV_Name, row.Plan);
    const suffix = tag ? ` (${tag})` : "";
    const planLabel = planLabels[plan];

    if (optionFamily === "growth") {
      if (payoutIsin) options.push({ name: `${planLabel} - Growth${suffix}`, isin: payoutIsin, rtaCode: isinToRtaCode[payoutIsin] ?? rtaCodeForFamily ?? "—", amfiCode });
      continue;
    }

    if (payoutIsin) options.push({ name: `${planLabel} - IDCW Payout${suffix}`, isin: payoutIsin, rtaCode: isinToRtaCode[payoutIsin] ?? rtaCodeForFamily ?? "—", amfiCode });
    if (reinvestmentIsin) options.push({ name: `${planLabel} - IDCW Reinvestment${suffix}`, isin: reinvestmentIsin, rtaCode: isinToRtaCode[reinvestmentIsin] ?? rtaCodeForFamily ?? "—", amfiCode });
  }

  return options;
}

export async function updateSchemePortalId(schemeCode: string, amfiPortalSchemeId: string | null): Promise<{ schemeCode: string; amfiPortalSchemeId: string | null } | null> {
  const result = await getPostgresPool().query(
    `UPDATE schemes SET amfi_portal_scheme_id = $1, updated_at = NOW()
     WHERE amfi_scheme_code = $2
     RETURNING amfi_scheme_code AS "schemeCode", amfi_portal_scheme_id AS "amfiPortalSchemeId"`,
    [amfiPortalSchemeId, schemeCode],
  );
  return (result.rows[0] as { schemeCode: string; amfiPortalSchemeId: string | null } | undefined) ?? null;
}
