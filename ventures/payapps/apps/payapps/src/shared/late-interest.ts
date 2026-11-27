// Interest on a late pay application. Pure: the job carries the rate (from the subcontract's
// late-payment clause or a prompt payment statute the contractor picks), the cash report supplies the
// due date and the payments, and this works out what has accrued on the unpaid balance.
//
// Simple interest, no compounding, from the day after the due date to the report date. Each payment
// received after the due date lowers the balance from the day it came in; payments on or before the
// due date are taken off before anything accrues. A "month" is 30 days and a year 365: the statutes
// read do not define either (the same assumption ventures/pay-app-guides/prompt-payment-laws.html
// states), and a contract that does can be followed by entering the equivalent rate.
//
// Two ways to count, as the statutes word them:
// - "prorata": the rate times the days late over 30 (or 365), on each day's balance.
// - "fraction": "per month or a fraction thereof" (North Carolina, G.S. 22C-5): each 30-day month,
//   whole or started, counts in full, on the highest balance owed during that month.
//
// Nothing here says a statute applies to a job (public or private work, the tier, the contract's own
// clause and any waiver all matter): the presets only fill in a rate the contractor chooses, with
// its citation, and the page says to check it.

/** How the rate is stated. */
export const LATE_INTEREST_PERIODS = ["month", "year"] as const;
export type LateInterestPer = (typeof LATE_INTEREST_PERIODS)[number];
export const LATE_INTEREST_METHODS = ["prorata", "fraction"] as const;
export type LateInterestMethod = (typeof LATE_INTEREST_METHODS)[number];

/** The most a rate may be, in basis points per period: a typo guard, not a usury rule. */
export const MAX_LATE_INTEREST_BPS: Record<LateInterestPer, number> = { month: 500, year: 6000 };
/** The longest citation or clause text kept on a job. */
export const MAX_LATE_INTEREST_SOURCE = 200;

export interface LateInterestTerms {
  /** The rate in basis points per period: 150 is 1.5%. */
  bps: number;
  per: LateInterestPer;
  method: LateInterestMethod;
  /** Where the rate comes from, in the contractor's words ("Subcontract § 5.3", a statute); or null. */
  source: string | null;
}

export interface LateInterestPreset {
  key: string;
  state: string;
  law: string;
  /** Days after the GC is paid that the statute gives it to pay a sub. */
  days: number;
  bps: number;
  per: LateInterestPer;
  method: LateInterestMethod;
  url: string;
  /** What the contractor should check before relying on it. */
  scope: string;
}

/**
 * Statutory rates read from the legislatures' own text on 2026-11-25 (the rows of
 * ventures/pay-app-guides/calc.mjs PROMPT_PAY with a confirmed rate; California, Pennsylvania and
 * Florida are left out there and here because the text read did not confirm a figure).
 */
export const LATE_INTEREST_PRESETS: readonly LateInterestPreset[] = [
  {
    key: "tx",
    state: "Texas",
    law: "Tex. Prop. Code § 28.004",
    days: 7,
    bps: 150,
    per: "month",
    method: "prorata",
    url: "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.28.htm",
    scope: "private work; 7 days after the contractor receives payment (§ 28.002(b))",
  },
  {
    key: "il",
    state: "Illinois",
    law: "815 ILCS 603/10",
    days: 15,
    bps: 1000,
    per: "year",
    method: "prorata",
    url: "https://www.ilga.gov/legislation/ilcs/ilcs3.asp?ActID=2941&ChapterID=67",
    scope:
      "private work under the Contractor Prompt Payment Act; 15 days after the contractor is paid",
  },
  {
    key: "nc",
    state: "North Carolina",
    law: "N.C. Gen. Stat. §§ 22C-2, 22C-5",
    days: 7,
    bps: 100,
    per: "month",
    method: "fraction",
    url: "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/ByChapter/Chapter_22C.html",
    scope: "private work; 7 days after the contractor receives payment; each month or part counts",
  },
  {
    key: "va",
    state: "Virginia",
    law: "Va. Code § 2.2-4354",
    days: 7,
    bps: 100,
    per: "month",
    method: "prorata",
    url: "https://law.lis.virginia.gov/vacode/title2.2/chapter43/section2.2-4354/",
    scope: "public work for a state agency; 7 days after the contractor receives payment",
  },
];

export const presetSource = (p: LateInterestPreset) => `${p.law} (${p.state})`;

const DAY = 86_400_000;
const parse = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const between = (from: string, to: string) => Math.round((parse(to) - parse(from)) / DAY);

export interface InterestPayment {
  amountCents: number;
  receivedOn: string; // YYYY-MM-DD
}

export interface LateInterest {
  /** Accrued interest in cents, rounded once at the end. */
  interestCents: number;
  /** Days from the due date to the report date (0 when not yet late). */
  daysLate: number;
}

/**
 * Interest accrued on one application by `asOf`: `expectedCents` was due on `dueOn`, `payments` came
 * in against it. Null when the job has no rate or the application has no due date.
 */
export function lateInterest(
  terms: LateInterestTerms | null,
  dueOn: string | null,
  expectedCents: number,
  payments: readonly InterestPayment[],
  asOf: string,
): LateInterest | null {
  if (!terms || dueOn === null) return null;
  const daysLate = Math.max(0, between(dueOn, asOf));
  if (daysLate === 0 || terms.bps <= 0) return { interestCents: 0, daysLate };
  const rate = terms.bps / 10_000;
  // The balance as a step function of days late. Payments on or before the due date come off the
  // opening balance; each later one (before asOf) starts a new step on the day it came in.
  const segments: { from: number; to: number; cents: number }[] = [];
  let from = 0;
  let cents = expectedCents;
  for (const p of [...payments].sort((a, b) => (a.receivedOn < b.receivedOn ? -1 : 1))) {
    const day = Math.max(0, between(dueOn, p.receivedOn));
    if (day >= daysLate) break;
    if (day > from) {
      segments.push({ from, to: day, cents });
      from = day;
    }
    cents = Math.max(0, cents - p.amountCents);
  }
  segments.push({ from, to: daysLate, cents });

  let raw = 0;
  if (terms.method === "fraction" && terms.per === "month") {
    const months = Math.ceil(daysLate / 30);
    for (let m = 0; m < months; m++) {
      const lo = m * 30;
      const hi = lo + 30;
      let high = 0;
      for (const s of segments) if (s.from < hi && s.to > lo && s.cents > high) high = s.cents;
      raw += high * rate;
    }
  } else {
    const len = terms.per === "year" ? 365 : 30;
    for (const s of segments) raw += (s.cents * rate * (s.to - s.from)) / len;
  }
  return { interestCents: Math.round(raw), daysLate };
}

/** "1.5% a month", "10% a year", "1% a month or part of a month". */
export function rateLabel(terms: Pick<LateInterestTerms, "bps" | "per" | "method">): string {
  const pct = `${(terms.bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
  if (terms.per === "year") return `${pct} a year`;
  return terms.method === "fraction" ? `${pct} a month or part of a month` : `${pct} a month`;
}

/**
 * The rate typed as a percent ("1.5", "1.5%") as basis points: undefined when it cannot be read or is
 * above the cap, null when blank (clears the rate).
 */
export function parseRatePct(text: string, per: LateInterestPer): number | null | undefined {
  const t = text.trim().replace(/%$/, "").trim();
  if (t === "") return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return undefined;
  const bps = Math.round(Number(t) * 100);
  if (bps <= 0 || bps > MAX_LATE_INTEREST_BPS[per]) return undefined;
  return bps;
}

/** Terms from a job's saved columns, or null when no rate is set. */
export function lateInterestTermsOf(p: {
  lateInterestBps?: number | null;
  lateInterestPer?: LateInterestPer | null;
  lateInterestMethod?: LateInterestMethod | null;
  lateInterestSource?: string | null;
}): LateInterestTerms | null {
  if (!p.lateInterestBps) return null;
  const per = p.lateInterestPer ?? "month";
  return {
    bps: p.lateInterestBps,
    per,
    method: per === "month" ? (p.lateInterestMethod ?? "prorata") : "prorata",
    source: p.lateInterestSource ?? null,
  };
}
