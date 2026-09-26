import type { NavObservation } from "@/lib/funds/types";

export type InvestmentMode = "sip" | "lumpsum";

export type HistoricalInvestmentInput = {
  mode: InvestmentMode;
  amount: number;
  startDate: string;
  withdrawalDate: string;
  annualStepUp: number;
};

export type ExitLoadRule = {
  ratePercent: number;
  maxHoldingDays: number;
};

export type ExitLoadSchedule = {
  rules: ExitLoadRule[];
  status: "parsed" | "none" | "unavailable";
  terms: string[];
};

export type HistoricalInvestmentResult = {
  mode: InvestmentMode;
  amountInvested: number;
  grossValue: number;
  currentValue: number;
  gain: number;
  exitLoadAmount: number;
  exitLoadAppliedInstallments: number;
  exitLoadStatus: ExitLoadSchedule["status"];
  exitLoadTerms: string[];
  returnPercent: number;
  annualizedReturnPercent: number | null;
  unitsHeld: number;
  installmentCount: number;
  firstInvestmentDate: string;
  firstInvestmentNav: number;
  asOfDate: string;
  latestNav: number;
};

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function dateAtMonthOffset(startDate: string, monthOffset: number): string {
  const [year, month, day] = startDate.split("-").map(Number);
  const monthIndex = year * 12 + month - 1 + monthOffset;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex % 12;
  const finalDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDate = new Date(Date.UTC(targetYear, targetMonth, Math.min(day, finalDay)));
  return targetDate.toISOString().slice(0, 10);
}

function findObservationOnOrAfter(observations: NavObservation[], date: string): NavObservation | null {
  let low = 0;
  let high = observations.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (observations[middle].date < date) low = middle + 1;
    else high = middle;
  }

  return observations[low] ?? null;
}

function findObservationOnOrBefore(observations: NavObservation[], date: string): NavObservation | null {
  let low = 0;
  let high = observations.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (observations[middle].date <= date) low = middle + 1;
    else high = middle;
  }

  return observations[low - 1] ?? null;
}

function durationInDays(text: string): number | null {
  const numberWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, six: 6, nine: 9, twelve: 12 };
  const matches = [...text.matchAll(/\b(\d+(?:\.\d+)?|one|two|three|four|six|nine|twelve)\s*(days?|weeks?|months?|years?)\b/gi)];
  if (!matches.length) return null;

  const days = matches.map((match) => {
    const amount = Number(match[1]) || numberWords[match[1].toLowerCase()];
    const unit = match[2].toLowerCase();
    const factor = unit.startsWith("week") ? 7 : unit.startsWith("month") ? 30.4375 : unit.startsWith("year") ? 365.25 : 1;
    return Math.max(1, Math.round(amount * factor));
  });

  return /\bbetween\b/i.test(text) ? Math.max(...days) : days[0];
}

export function parseExitLoadSchedule(terms: string[]): ExitLoadSchedule {
  const normalizedTerms = terms.map((term) => term.trim()).filter(Boolean);
  if (!normalizedTerms.length) return { rules: [], status: "unavailable", terms: [] };

  const normalized = normalizedTerms.join("; ").replace(/\r?\n/g, "; ");
  const rates = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*%/g)];
  const rules: ExitLoadRule[] = [];

  for (let index = 0; index < rates.length; index += 1) {
    const rate = rates[index];
    const ratePercent = Number(rate[1]);
    if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) continue;

    const rateStart = rate.index ?? 0;
    const previousRateEnd = index > 0 ? (rates[index - 1].index ?? 0) + rates[index - 1][0].length : 0;
    const nextRateStart = rates[index + 1]?.index ?? normalized.length;
    const before = normalized.slice(previousRateEnd, rateStart);
    const after = normalized.slice(rateStart + rate[0].length, nextRateStart);
    const followingDurations = [...after.matchAll(/\b(?:\d+(?:\.\d+)?|one|two|three|four|six|nine|twelve)\s*(?:days?|weeks?|months?|years?)\b/gi)];
    const precedingDurations = [...before.matchAll(/\b(?:\d+(?:\.\d+)?|one|two|three|four|six|nine|twelve)\s*(?:days?|weeks?|months?|years?)\b/gi)];
    const lowerBoundInAfter = after.match(/\b(?:thereafter|beyond|more\s+than|over|after\s+(?:\d+(?:\.\d+)?|one|two|three|four|six|nine|twelve)\s*(?:days?|weeks?|months?|years?))\b/i);
    const freeTermBeforeLowerBound = lowerBoundInAfter?.index !== undefined
      && /\b(?:nil|none|not\s+applicable|no\s+(?:exit\s+)?load)\b/i.test(after.slice(0, lowerBoundInAfter.index));
    const isLowerBoundRate = Boolean((lowerBoundInAfter && !freeTermBeforeLowerBound)
      || /\b(?:thereafter|beyond|more\s+than|over|after\s+(?:\d+(?:\.\d+)?|one|two|three|four|six|nine|twelve)\s*(?:days?|weeks?|months?|years?))\b/i.test(before));
    let maxHoldingDays: number;

    if (isLowerBoundRate) {
      maxHoldingDays = Number.POSITIVE_INFINITY;
    } else if (followingDurations.length) {
      maxHoldingDays = durationInDays(followingDurations[followingDurations.length - 1][0]) ?? Number.POSITIVE_INFINITY;
    } else if (precedingDurations.length) {
      maxHoldingDays = durationInDays(precedingDurations[precedingDurations.length - 1][0]) ?? Number.POSITIVE_INFINITY;
    } else {
      maxHoldingDays = Number.POSITIVE_INFINITY;
    }

    rules.push({ ratePercent, maxHoldingDays });
  }

  const uniqueRules = [...new Map(rules.map((rule) => [`${rule.ratePercent}:${rule.maxHoldingDays}`, rule])).values()]
    .sort((left, right) => left.maxHoldingDays - right.maxHoldingDays);

  return { rules: uniqueRules, status: uniqueRules.length ? "parsed" : "none", terms: normalizedTerms };
}

function exitLoadRateFor(holdingDays: number, rules: ExitLoadRule[]): number {
  return rules
    .filter((rule) => holdingDays <= rule.maxHoldingDays)
    .sort((left, right) => left.maxHoldingDays - right.maxHoldingDays)[0]?.ratePercent ?? 0;
}

function calculateAnnualizedReturn(
  contributions: Array<{ date: string; amount: number }>,
  currentValue: number,
  asOfDate: string,
): number | null {
  const startTime = Date.parse(`${contributions[0].date}T00:00:00.000Z`);
  const endTime = Date.parse(`${asOfDate}T00:00:00.000Z`);
  if (endTime <= startTime) return null;

  const flows = contributions.map((contribution) => ({
    time: Date.parse(`${contribution.date}T00:00:00.000Z`),
    amount: -contribution.amount,
  }));
  flows.push({ time: endTime, amount: currentValue });

  const valueAtRate = (rate: number) => flows.reduce((total, flow) => {
    const years = (flow.time - startTime) / (365.25 * 86_400_000);
    return total + flow.amount / Math.pow(1 + rate, years);
  }, 0);

  let low = -0.9999;
  let high = 10;
  let lowValue = valueAtRate(low);
  let highValue = valueAtRate(high);
  while (Math.sign(lowValue) === Math.sign(highValue) && high < 1_000_000) {
    high = high * 2 + 1;
    highValue = valueAtRate(high);
  }
  if (Math.sign(lowValue) === Math.sign(highValue)) return null;

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const middle = (low + high) / 2;
    const middleValue = valueAtRate(middle);
    if (Math.abs(middleValue) < 0.000001) return middle * 100;
    if (Math.sign(middleValue) === Math.sign(lowValue)) {
      low = middle;
      lowValue = middleValue;
    } else {
      high = middle;
      highValue = middleValue;
    }
  }

  return ((low + high) / 2) * 100;
}

export function calculateHistoricalInvestment(
  input: HistoricalInvestmentInput,
  observations: NavObservation[],
  exitLoadSchedule: ExitLoadSchedule = parseExitLoadSchedule([]),
): HistoricalInvestmentResult {
  if (!isIsoDate(input.startDate)) throw new Error("Choose a valid investment date.");
  if (!isIsoDate(input.withdrawalDate)) throw new Error("Choose a valid withdrawal date.");
  if (input.withdrawalDate < input.startDate) throw new Error("Withdrawal date must be on or after the investment date.");
  if (!Number.isFinite(input.amount) || input.amount < 500 || input.amount > 10_000_000) {
    throw new Error("Enter an investment amount between ₹500 and ₹1 crore.");
  }
  if (!Number.isFinite(input.annualStepUp) || input.annualStepUp < 0 || input.annualStepUp > 50) {
    throw new Error("Choose an annual SIP increase between 0% and 50%.");
  }
  if (observations.length < 2) throw new Error("NAV history is not available for this scheme yet.");

  const historyStart = observations[0].date;
  const latestAvailable = observations[observations.length - 1];
  const latest = findObservationOnOrBefore(observations, input.withdrawalDate);
  if (!latest) throw new Error("No NAV was available on or before your withdrawal date.");
  if (input.startDate < historyStart) {
    throw new Error(`NAV history for this scheme starts on ${historyStart}. Choose a later date.`);
  }
  if (input.startDate > latestAvailable.date) throw new Error("Choose an investment date on or before the latest NAV date.");
  if (input.startDate > latest.date) throw new Error("No purchase NAV is available between your investment and withdrawal dates.");

  const contributions: Array<{ date: string; amount: number }> = [];
  let unitsHeld = 0;
  let amountInvested = 0;
  let grossValue = 0;
  let exitLoadAmount = 0;
  let exitLoadAppliedInstallments = 0;
  let installmentCount = 0;
  let firstInvestment: NavObservation | null = null;

  const monthsToInvest = input.mode === "sip" ? 12 * 100 : 1;
  for (let month = 0; month < monthsToInvest; month += 1) {
    const scheduledDate = input.mode === "sip" ? dateAtMonthOffset(input.startDate, month) : input.startDate;
    if (scheduledDate > input.withdrawalDate) break;

    const observation = findObservationOnOrAfter(observations, scheduledDate);
    if (!observation || observation.date > latest.date) break;

    const contributionAmount = input.mode === "sip"
      ? input.amount * Math.pow(1 + input.annualStepUp / 100, Math.floor(month / 12))
      : input.amount;
    const units = contributionAmount / observation.nav;
    const redemptionValue = units * latest.nav;
    const holdingDays = Math.max(0, Math.round((Date.parse(`${latest.date}T00:00:00Z`) - Date.parse(`${observation.date}T00:00:00Z`)) / 86_400_000));
    const exitLoadRate = exitLoadRateFor(holdingDays, exitLoadSchedule.rules);
    const exitLoad = redemptionValue * exitLoadRate / 100;

    contributions.push({ date: observation.date, amount: contributionAmount });
    unitsHeld += units;
    amountInvested += contributionAmount;
    grossValue += redemptionValue;
    exitLoadAmount += exitLoad;
    if (exitLoad > 0) exitLoadAppliedInstallments += 1;
    installmentCount += 1;
    firstInvestment ??= observation;

    if (input.mode === "lumpsum") break;
  }

  if (!firstInvestment || installmentCount === 0) {
    throw new Error("No NAV was available on or after your investment date.");
  }

  const currentValue = Math.max(0, grossValue - exitLoadAmount);
  const gain = currentValue - amountInvested;

  return {
    mode: input.mode,
    amountInvested,
    grossValue,
    currentValue,
    gain,
    exitLoadAmount,
    exitLoadAppliedInstallments,
    exitLoadStatus: exitLoadSchedule.status,
    exitLoadTerms: exitLoadSchedule.terms,
    returnPercent: amountInvested > 0 ? (gain / amountInvested) * 100 : 0,
    annualizedReturnPercent: calculateAnnualizedReturn(contributions, currentValue, latest.date),
    unitsHeld,
    installmentCount,
    firstInvestmentDate: firstInvestment.date,
    firstInvestmentNav: firstInvestment.nav,
    asOfDate: latest.date,
    latestNav: latest.nav,
  };
}
