// The last day to record (or file) a mechanics lien on a job, for a subcontractor or supplier, in the
// ten states whose filing clock PayApps carries. The money a sub is owed is only as safe as its lien
// rights, and those end on a date most subs never write down: the job page shows it and the cash page
// and weekly email name it when money is still owed and the date is near.
//
// Rules ported from ventures/mechanics-lien-deadline-calculator/calc.mjs (the free front door), whose
// timing was checked against each state's statute text on 2026-11-25 (see that file's header for how
// each was read). Only the lien-filing clock is here; preliminary notices have their own panels
// (California, Florida, Texas, packages/lien-waivers).
//
// Safe side, always. Where a statute counts from completion of the whole project (California,
// Arizona) and no completion date is entered, the claimant's own last furnishing is used: completion
// can only be the same or later, so the date can only be the same or earlier. Where no last-furnished
// date is entered, the start of the latest billing period with work billed is used: the last day of
// work was on or after it, so again the date can only be early. A date on a weekend moves back to the
// Friday before. Holidays are not modeled. Not modeled at all: public jobs (payment bond claims, not
// liens), third-tier claimants, Texas retainage claims and contracts before 2022, laborers' special
// rules, contract terms, and the service or suit deadlines that follow a recorded lien.

const DAY_MS = 86_400_000;

/** `iso` (YYYY-MM-DD) plus `days` calendar days, UTC. */
export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Signed whole days from `from` to `to` (negative once `to` has passed). */
export function daysUntil(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export const LIEN_DEADLINE_STATES = [
  "AZ",
  "CA",
  "CO",
  "FL",
  "GA",
  "NC",
  "NY",
  "OH",
  "TX",
  "WA",
] as const;
export type LienDeadlineState = (typeof LIEN_DEADLINE_STATES)[number];

export const isLienDeadlineState = (s: string | null | undefined): s is LienDeadlineState =>
  !!s && (LIEN_DEADLINE_STATES as readonly string[]).includes(s);

type Rule =
  | { type: "days_after_last"; days: number }
  | { type: "months_after_last"; months: number }
  | { type: "day15_months_after_last"; months: number }
  | { type: "completion"; completionDays: number; nocDays: number };

interface StateRule {
  name: string;
  citation: string;
  /** What the claimant does by the date, in the statute's own terms. */
  act: string;
  commercial: Rule;
  /** When the state shortens the clock for a home; else the commercial rule applies. */
  residential?: Rule;
  /** What "residential" means there, when the state has a residential rule. */
  residentialMeaning?: string;
  notes: string[];
}

export const LIEN_DEADLINE_RULES: Record<LienDeadlineState, StateRule> = {
  AZ: {
    name: "Arizona",
    citation: "Ariz. Rev. Stat. § 33-993",
    act: "record a notice and claim of lien",
    commercial: { type: "completion", completionDays: 120, nocDays: 60 },
    notes: ["The lien also needs the 20-day preliminary notice (§ 33-992.01) to have been given."],
  },
  CA: {
    name: "California",
    citation: "Cal. Civ. Code § 8414",
    act: "record a claim of lien",
    commercial: { type: "completion", completionDays: 90, nocDays: 30 },
    notes: [
      "A lien also needs the 20-day preliminary notice (§ 8200) to have been given, and the claim must be served on the owner (§ 8416). An action to enforce it is due within 90 days after recording (§ 8460).",
    ],
  },
  CO: {
    name: "Colorado",
    citation: "Colo. Rev. Stat. § 38-22-109",
    act: "record a lien statement",
    commercial: { type: "months_after_last", months: 4 },
    notes: [
      "A notice of intent to file must be served at least 10 days before the lien statement is recorded, so serve it by 10 days before this date (§ 38-22-109). A labor-only claim paid by the day or piece has 2 months after completion (§ 38-22-109(4)).",
    ],
  },
  FL: {
    name: "Florida",
    citation: "Fla. Stat. § 713.08(5)",
    act: "record a claim of lien",
    commercial: { type: "days_after_last", days: 90 },
    notes: [
      "A sub-subcontractor or supplier also needs a Notice to Owner served on time (§ 713.06(2)(a)); without it the lien cannot be enforced.",
    ],
  },
  GA: {
    name: "Georgia",
    citation: "O.C.G.A. § 44-14-361.1",
    act: "record a claim of lien",
    commercial: { type: "days_after_last", days: 90 },
    notes: [
      "The recorded claim must also be served on the owner within 2 business days, and suit filed within 365 days after recording (§ 44-14-361.1).",
    ],
  },
  NC: {
    name: "North Carolina",
    citation: "N.C. Gen. Stat. § 44A-12(b)",
    act: "file a claim of lien on real property",
    commercial: { type: "days_after_last", days: 120 },
    notes: [
      "On a job with a designated lien agent, a Notice to Lien Agent is also needed (§ 44A-11.2). Suit to enforce is due within 180 days after your last furnishing (§ 44A-13).",
    ],
  },
  NY: {
    name: "New York",
    citation: "N.Y. Lien Law § 10",
    act: "file a notice of lien",
    commercial: { type: "months_after_last", months: 8 },
    residential: { type: "months_after_last", months: 4 },
    residentialMeaning: "an improvement to a single family dwelling",
    notes: [
      "The statute counts from completion of the contract or your final performance or furnishing; PayApps uses your last furnishing, the earlier of those.",
    ],
  },
  OH: {
    name: "Ohio",
    citation: "Ohio Rev. Code § 1311.06(B)",
    act: "record an affidavit of lien",
    commercial: { type: "days_after_last", days: 75 },
    residential: { type: "days_after_last", days: 60 },
    residentialMeaning: "a one- or two-family dwelling or a residential condominium unit",
    notes: [
      "Where the owner recorded a notice of commencement, a sub or supplier without a contract with the owner also needs a notice of furnishing within 21 days of first furnishing (§ 1311.05).",
    ],
  },
  TX: {
    name: "Texas",
    citation: "Tex. Prop. Code § 53.052",
    act: "file a lien affidavit",
    commercial: { type: "day15_months_after_last", months: 4 },
    residential: { type: "day15_months_after_last", months: 3 },
    residentialMeaning: "a residential construction project (§ 53.001(10))",
    notes: [
      "These are the clocks for original contracts signed on or after 1 January 2022 (H.B. 2237). The lien also needs a notice of claim for each unpaid month (§ 53.056, on the job's preliminary notice panel); claims for retainage have their own dates (§ 53.057).",
    ],
  },
  WA: {
    name: "Washington",
    citation: "Wash. Rev. Code § 60.04.091",
    act: "record a claim of lien",
    commercial: { type: "days_after_last", days: 90 },
    notes: [
      "The recorded claim must be served on the owner within 14 days after recording, and suit brought within 8 calendar months after recording (§§ 60.04.091, 60.04.141).",
    ],
  },
};

/** Same day of the month N months later, clamped to the month's last day. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}

/** The 15th day of the Nth month after the month containing `iso`. */
export function day15MonthsAfter(iso: string, months: number): string {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + months, 15)).toISOString().slice(0, 10);
}

const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** The date itself, or the Friday before when it falls on a weekend. */
export function businessDayOnOrBefore(iso: string): string {
  const d = weekday(iso);
  return d === 6 ? addDays(iso, -1) : d === 0 ? addDays(iso, -2) : iso;
}

/** What PayApps knows about the job's billing, for the last-furnished floor. */
export interface LienBillingApp {
  number: number;
  status: string;
  periodFrom: string;
  periodTo: string;
  /** Work completed this period across the lines (column E); stored materials are left out. */
  workThisPeriodCents: number;
}

/**
 * The earliest the last day of work can be, read from the job's billing: the start of the latest
 * application (sent or not) that bills work this period. Work billed in a period was done in it, so
 * the last day of work is on or after that day. Null when no application bills work.
 */
export function lastFurnishedFloor(
  apps: readonly LienBillingApp[],
): { on: string; payAppNumber: number } | null {
  let best: LienBillingApp | null = null;
  for (const a of apps) {
    if (a.workThisPeriodCents <= 0) continue;
    if (!best || a.periodFrom > best.periodFrom) best = a;
  }
  return best ? { on: best.periodFrom, payAppNumber: best.number } : null;
}

export interface LienDeadlineInput {
  state: string | null | undefined;
  residential?: boolean | null;
  /** The day this company last furnished labor or materials (entered). */
  lastFurnishedOn?: string | null;
  /** Completion of the whole project (California, Arizona). */
  completedOn?: string | null;
  /** The day the owner recorded a notice of completion (California, Arizona). */
  noticeOfCompletionOn?: string | null;
  apps?: readonly LienBillingApp[];
}

export interface LienDeadline {
  state: LienDeadlineState;
  stateName: string;
  citation: string;
  act: string;
  /** The statute's date, before the weekend move. */
  statutoryOn: string;
  /** The date to act by: statutoryOn, or the Friday before it on a weekend. */
  dueOn: string;
  /** How the date is counted, in words. */
  rule: string;
  /** "entered": from the last-furnished date; "estimated": from the latest billing period with work. */
  basis: "entered" | "estimated";
  /** The day the count runs from (the entered date, or the floor read from billing). */
  fromOn: string;
  /** With basis "estimated": the application whose period start was used. */
  fromPayAppNumber: number | null;
  /** Completion-based states counted from last furnishing because no completion date was entered. */
  usedLastFurnishingAsCompletion: boolean;
  /** The state has a residential rule and the job is marked residential. */
  residentialRule: boolean;
  notes: string[];
}

export type LienDeadlineResult =
  | { kind: "deadline"; deadline: LienDeadline }
  | { kind: "no-state" }
  | { kind: "unsupported"; state: string }
  | { kind: "no-dates"; state: LienDeadlineState; stateName: string };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const ORD: Record<number, string> = { 3: "3rd", 4: "4th" };

export function lienDeadline(input: LienDeadlineInput): LienDeadlineResult {
  const state = input.state?.trim().toUpperCase() || null;
  if (!state) return { kind: "no-state" };
  if (!isLienDeadlineState(state)) return { kind: "unsupported", state };
  const info = LIEN_DEADLINE_RULES[state];
  const floor = input.lastFurnishedOn ? null : lastFurnishedFloor(input.apps ?? []);
  const fromOn = input.lastFurnishedOn ?? floor?.on ?? null;
  if (!fromOn) return { kind: "no-dates", state, stateName: info.name };
  const residentialRule = !!input.residential && !!info.residential;
  const rule = residentialRule && info.residential ? info.residential : info.commercial;
  const from = input.lastFurnishedOn
    ? "your last furnishing of labor or materials"
    : "your last day of work";
  let statutoryOn: string;
  let words: string;
  let usedLast = false;
  switch (rule.type) {
    case "days_after_last":
      statutoryOn = addDays(fromOn, rule.days);
      words = `${plural(rule.days, "day")} after ${from}`;
      break;
    case "months_after_last":
      statutoryOn = addMonths(fromOn, rule.months);
      words = `${plural(rule.months, "month")} after ${from}`;
      break;
    case "day15_months_after_last":
      statutoryOn = day15MonthsAfter(fromOn, rule.months);
      words = `the 15th day of the ${ORD[rule.months] ?? `${rule.months}th`} month after the month of ${from}`;
      break;
    case "completion": {
      const completed = input.completedOn && input.completedOn >= fromOn ? input.completedOn : null;
      usedLast = !completed;
      const byCompletion = addDays(completed ?? fromOn, rule.completionDays);
      const noc = input.noticeOfCompletionOn ?? null;
      const byNoc = noc ? addDays(noc, rule.nocDays) : null;
      const completionWords = `${plural(rule.completionDays, "day")} after completion of the work of improvement${completed ? "" : ` (counted from ${from}, which cannot be later than completion)`}`;
      if (byNoc && byNoc < byCompletion) {
        statutoryOn = byNoc;
        words = `${plural(rule.nocDays, "day")} after the owner recorded a notice of completion (earlier than ${completionWords})`;
      } else {
        statutoryOn = byCompletion;
        words = completionWords;
      }
      break;
    }
  }
  const notes = [...info.notes];
  if (rule.type === "completion" && !input.noticeOfCompletionOn) {
    notes.unshift(
      `If the owner records a notice of completion (or cessation), the time is shorter: ${plural((rule as { nocDays: number }).nocDays, "day")} after it is recorded. Check with the county recorder and enter its date here.`,
    );
  }
  if (info.residential && !residentialRule) {
    notes.push(
      `On ${info.residentialMeaning} the time is shorter; mark the job residential if it is one.`,
    );
  }
  const dueOn = businessDayOnOrBefore(statutoryOn);
  return {
    kind: "deadline",
    deadline: {
      state,
      stateName: info.name,
      citation: info.citation,
      act: info.act,
      statutoryOn,
      dueOn,
      rule: words,
      basis: input.lastFurnishedOn ? "entered" : "estimated",
      fromOn,
      fromPayAppNumber: floor?.payAppNumber ?? null,
      usedLastFurnishingAsCompletion: usedLast,
      residentialRule,
      notes,
    },
  };
}

/** Days before the date at which the cash page and the weekly email start naming it. */
export const LIEN_REMIND_DAYS = 45;
/** Days after the date it stays on the cash page (then the job's own panel still shows it). */
export const LIEN_PASSED_DAYS = 30;

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The cash page's (and weekly email's) line about the lien deadline on a job that still owes money.
 * Null unless money is owed, the date is within LIEN_REMIND_DAYS (or passed in the last
 * LIEN_PASSED_DAYS), and the date rests on something final: the last-furnished date entered, or the
 * work complete. On a job still billing work each month the estimated date moves with every period,
 * so naming it would only nag.
 */
export function lienDeadlineText(
  d: LienDeadline | null | undefined,
  owed: { outstandingCents: number; retainageHeldCents: number; workComplete: boolean },
  asOf: string,
): string | null {
  if (!d) return null;
  const owedCents = owed.outstandingCents + owed.retainageHeldCents;
  if (owedCents <= 0) return null;
  if (d.basis === "estimated" && !owed.workComplete) return null;
  const left = daysUntil(asOf, d.dueOn);
  if (left > LIEN_REMIND_DAYS || left < -LIEN_PASSED_DAYS) return null;
  const what =
    owed.retainageHeldCents > 0 && owed.outstandingCents > 0
      ? `${money(owedCents)} is still owed on this job (retainage included)`
      : owed.retainageHeldCents > 0
        ? `${money(owedCents)} of retainage is still held on this job`
        : `${money(owedCents)} is still owed on this job`;
  const basis =
    d.basis === "entered"
      ? ""
      : ` PayApps dated it from the start of Pay App #${d.fromPayAppNumber}'s period (${d.fromOn}), the earliest your last day of work can be; enter your last day on the job for the exact date.`;
  if (left < 0) {
    return `${d.stateName} lien deadline passed on ${d.dueOn} (${d.rule}, ${d.citation}) and ${what}. Ask a construction attorney what is left (a late lien, a payment bond claim, or suing on the contract); if a lien was recorded, mark the last-furnished date or clear the state on the job.${basis}`;
  }
  const when = left === 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`;
  return `${d.stateName} lien deadline ${when}: ${d.act} by ${d.dueOn} (${d.rule}, ${d.citation}) and ${what}. If payment is not certain before then, talk to a construction attorney or a lien service now; a lien takes days to prepare and record.${basis}`;
}
