// The last day to record (or file) a mechanics lien on a job, for a subcontractor or supplier, in the
// thirty states whose filing clock PayApps carries. The money a sub is owed is only as safe as
// its lien rights, and those end on a date most subs never write down: the job page shows it and the
// cash page and weekly email name it when money is still owed and the date is near.
//
// Rules ported from ventures/mechanics-lien-deadline-calculator/calc.mjs (the free front door), whose
// timing was checked against each state's statute text on 2026-11-25 (see that file's header for how
// each was read). Michigan, Minnesota, Nevada, Oregon, Utah and Virginia were added 2026-11-27 from
// the statute text on each legislature's own site (MCL 570.1111, Minn. Stat. 514.08, NRS 108.226,
// ORS 87.035 and 87.010, Utah Code 38-1a-502, Va. Code 43-4), read whole that day. Missouri was read
// and left out: § 429.080 counts six months from when "the indebtedness shall have accrued", a date
// PayApps does not hold. Delaware, Idaho, Kansas, Maryland, Montana, Nebraska, North Dakota,
// South Carolina and South Dakota were added 2026-11-28, each from the section's text on the state's
// own code site that day (Del. C. tit. 25 § 2711(b), Idaho Code § 45-507, K.S.A. 60-1102 and
// 60-1103, Md. Code, Real Prop. §§ 9-104 and 9-105, MCA 71-3-535, Neb. Rev. Stat. § 52-137,
// N.D.C.C. 35-27-13, S.C. Code § 29-5-90, SDCL 44-9-15); excerpts and URLs are in
// ventures/mechanics-lien-deadline-calculator/sources/2026-11-28-nine-states.md. Iowa was read and
// left out: § 572.9 gives two years and ninety days to post, and what a lien posted that late still
// reaches is set by other sections not read here. Alabama, Alaska, Maine, Rhode Island and Wyoming
// were added later the same day, the same way (Ala. Code § 35-11-215, AS 34.35.068, 10 M.R.S.
// § 3255, R.I. Gen. Laws § 34-28-4, W.S. 29-2-106; excerpts in sources/2026-11-28-five-states.md
// of the same calculator); Vermont was read and left out, since 9 V.S.A. § 1921(c) counts from when
// payment for the last work became due, a date PayApps does not hold. Only the lien-filing clock is here; preliminary notices have their own panels
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

import { isCalendarDate } from "./calendar-date";
import {
  MILLER_CITATION,
  type MillerTier,
  millerDates,
  millerNotes,
  type PublicOwner,
  type StateBondCheck,
} from "./public-jobs";

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
  "AK",
  "AL",
  "AZ",
  "CA",
  "CO",
  "DE",
  "FL",
  "GA",
  "ID",
  "KS",
  "MD",
  "ME",
  "MI",
  "MN",
  "MT",
  "NC",
  "ND",
  "NE",
  "NV",
  "NY",
  "OH",
  "OR",
  "RI",
  "SC",
  "SD",
  "TX",
  "UT",
  "VA",
  "WA",
  "WY",
] as const;
export type LienDeadlineState = (typeof LIEN_DEADLINE_STATES)[number];

export const isLienDeadlineState = (s: string | null | undefined): s is LienDeadlineState =>
  !!s && (LIEN_DEADLINE_STATES as readonly string[]).includes(s);

type Rule =
  | { type: "days_after_last"; days: number }
  | { type: "months_after_last"; months: number }
  | { type: "day15_months_after_last"; months: number }
  | {
      type: "completion";
      completionDays: number;
      nocDays: number;
      /** What completes, in the statute's words (default: the work of improvement). */
      completionWhat?: string;
      /**
       * The statute counts from the LATER of completion and the claimant's own last furnishing
       * (Nevada), so a completion entered before the last day is not used. Elsewhere an entered
       * completion is used whatever its order: an earlier one gives an earlier date (safe side).
       */
      latestOfOwn?: boolean;
    }
  /**
   * The earlier of a count from the claimant's own last furnishing (from the last day of that month
   * when `monthEnd`) and a count from completion of the building, whichever comes first (Oregon,
   * Virginia). Completion can come before a sub's last day (punch work after it), so an entered
   * completion date is used whatever its order.
   */
  | {
      type: "earlier_of_completion";
      days: number;
      monthEnd: boolean;
      completionDays: number;
      completionWhat: string;
    };

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
  MI: {
    name: "Michigan",
    citation: "Mich. Comp. Laws § 570.1111(1)",
    act: "record a claim of lien with the register of deeds",
    commercial: { type: "days_after_last", days: 90 },
    notes: [
      "The claim of lien is recorded in each county where the property is, and is valid only for the property in that county (§ 570.1111(1)).",
    ],
  },
  MN: {
    name: "Minnesota",
    citation: "Minn. Stat. § 514.08, subd. 1",
    act: "file a statement of the claim for record and serve a copy on the owner",
    commercial: { type: "days_after_last", days: 120 },
    notes: [
      "Both steps are due within the 120 days: the statement filed with the county recorder (or registrar of titles for registered land), and a copy served personally or by certified mail on the owner, the owner's agent or the person who contracted with the contractor (§ 514.08, subd. 1).",
    ],
  },
  NV: {
    name: "Nevada",
    citation: "Nev. Rev. Stat. § 108.226(1)",
    act: "record a notice of lien",
    commercial: { type: "completion", completionDays: 90, nocDays: 40, latestOfOwn: true },
    notes: [
      "The statute counts 90 days from the latest of completion of the work of improvement and your own last furnishing or work, or 40 days after a valid notice of completion is recorded and served (§§ 108.226(1), 108.228).",
    ],
  },
  OR: {
    name: "Oregon",
    citation: "Or. Rev. Stat. § 87.035(1)",
    act: "file a claim of lien with the county recording officer",
    commercial: {
      type: "earlier_of_completion",
      days: 75,
      monthEnd: false,
      completionDays: 75,
      completionWhat: "completion of construction",
    },
    notes: [
      "This is the clock for labor, materials or rented equipment on the improvement (§ 87.010(1) and (2)): 75 days after you stopped providing them or 75 days after completion of construction, whichever is earlier.",
    ],
  },
  UT: {
    name: "Utah",
    citation: "Utah Code § 38-1a-502(1)",
    act: "submit a notice of construction lien for recording with the county recorder",
    commercial: {
      type: "completion",
      completionDays: 180,
      nocDays: 90,
      completionWhat: "final completion of the original contract",
    },
    notes: [
      "With a notice of completion filed (§ 38-1a-507) the time is 90 days after it, and never later than 180 days after final completion. A subcontractor who does substantial work after the certificate of occupancy or final inspection has 180 days after its own final work (§ 38-1a-502(1)(b)).",
    ],
  },
  VA: {
    name: "Virginia",
    citation: "Va. Code § 43-4",
    act: "file a memorandum of lien in the clerk's office",
    commercial: {
      type: "earlier_of_completion",
      days: 90,
      monthEnd: true,
      completionDays: 90,
      completionWhat: "completion of the building, or the work on it otherwise terminated",
    },
    notes: [
      "The same deadline applies to the general contractor and to subcontractors and suppliers (§§ 43-4, 43-7): 90 days from the last day of the month you last furnished, and in no event later than 90 days after the building is completed or the work otherwise terminated.",
    ],
  },
  DE: {
    name: "Delaware",
    citation: "Del. Code tit. 25, § 2711(b)",
    act: "file a statement of claim in the Superior Court",
    commercial: { type: "days_after_last", days: 120 },
    notes: [
      "This is the clock for subcontractors and suppliers: 120 days from the completion of your labor or your last delivery of materials. A claim is also timely within 120 days of the date your final payment, retainage included, is due, or of final payment to the general contractor, which can only be later (§ 2711(b)). A general contractor with a direct contract with the owner has 180 days after completion of the structure (§ 2711(a)).",
    ],
  },
  ID: {
    name: "Idaho",
    citation: "Idaho Code § 45-507(2)",
    act: "file a claim of lien for record with the county recorder",
    commercial: { type: "days_after_last", days: 90 },
    notes: [
      "The statute counts 90 days after the completion of your labor or services, or your last furnishing of materials (§ 45-507(2)), for every claimant. The claim is recorded in the county where the property, or part of it, is.",
    ],
  },
  KS: {
    name: "Kansas",
    citation: "Kan. Stat. §§ 60-1102, 60-1103(a)",
    act: "file a lien statement with the clerk of the district court",
    commercial: { type: "months_after_last", months: 3 },
    notes: [
      "This is the subcontractor and supplier clock, 3 months after your last furnishing (§ 60-1103(a)(1)); a contractor with the owner has 4 months (§ 60-1102(a)). On property other than residential property, a notice of extension filed within the 3 months gives 5 months. A sub's lien statement needs the contractor's name and, where a warning statement was required (§ 60-1103a), the affidavit that it was given.",
    ],
  },
  MD: {
    name: "Maryland",
    citation: "Md. Code, Real Prop. §§ 9-104, 9-105(a)",
    act: "file a petition to establish the mechanic's lien in the circuit court",
    commercial: { type: "days_after_last", days: 180 },
    notes: [
      "A subcontractor also has to give the owner written notice of an intention to claim a lien within 120 days after doing the work or furnishing the materials (§ 9-104(a)), so that date, 60 days before this one, is the first to keep. On a single family dwelling the owner is building as a residence, the lien also fails if the owner paid the contractor in full before the notice (§ 9-104(a)(2)).",
    ],
  },
  MT: {
    name: "Montana",
    citation: "Mont. Code § 71-3-535(1)",
    act: "file a lien with the county clerk and recorder",
    commercial: { type: "days_after_last", days: 90 },
    notes: [
      "The statute also counts 90 days after the owner files a notice of completion (§ 71-3-533): if one was filed before your last day of work, count from it, which is earlier. The filing certifies that a copy was served on the owner of record, and the lien must declare that a notice of a right to claim a lien was given, or why none was needed (§ 71-3-535(2), (3)).",
    ],
  },
  NE: {
    name: "Nebraska",
    citation: "Neb. Rev. Stat. § 52-137(1)",
    act: "record a lien",
    commercial: { type: "days_after_last", days: 120 },
    notes: [
      "The statute counts 120 days after your final furnishing of services or materials (§ 52-137(1)).",
    ],
  },
  ND: {
    name: "North Dakota",
    citation: "N.D. Cent. Code § 35-27-13",
    act: "record a lien with the county recorder",
    commercial: { type: "days_after_last", days: 90 },
    notes: [
      "The statute counts 90 days after all your contribution is done; the recorded lien states the dates of your first and last contribution and who you contracted with (§ 35-27-13).",
    ],
  },
  SC: {
    name: "South Carolina",
    citation: "S.C. Code § 29-5-90",
    act: "serve the owner and file a statement of account with the register of deeds or clerk of court",
    commercial: { type: "days_after_last", days: 90 },
    notes: [
      "Both steps are due within the 90 days: the sworn statement served on the owner (or the person in possession) and filed in the county (§ 29-5-90). Suit to enforce, with a notice of pendency, is due within six months after your last day of work (§ 29-5-120(A)).",
    ],
  },
  SD: {
    name: "South Dakota",
    citation: "S.D. Codified Laws § 44-9-15",
    act: "file a statement of the claim with the register of deeds",
    commercial: { type: "days_after_last", days: 120 },
    notes: [
      "The lien ceases 120 days after your last work or last item furnished unless the statement is filed in the county where the property is (§ 44-9-15).",
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
  AL: {
    name: "Alabama",
    citation: "Ala. Code § 35-11-215",
    act: "file a verified statement with the judge of probate",
    commercial: { type: "months_after_last", months: 4 },
    notes: [
      "This is the clock for subcontractors and suppliers: four months after your last work or material (§ 35-11-215); an original contractor has six months, a journeyman or day laborer 30 days. Before filing, give the owner written notice of the lien claimed, the amount, for what and from whom it is owed (§ 35-11-218). The action to enforce is due within six months after the whole debt matures (§ 35-11-221).",
    ],
  },
  AK: {
    name: "Alaska",
    citation: "Alaska Stat. § 34.35.068",
    act: "record a claim of lien",
    commercial: { type: "days_after_last", days: 120 },
    notes: [
      "This is the clock when the owner has recorded no notice of completion: 120 days after you complete your contract or stop furnishing (§ 34.35.068(a)). If the owner records one, a claimant who gave no notice of right to lien, or who was told in advance the date it would be recorded, has only 15 days after the recording (§ 34.35.068(b)(1)). Ask the owner whether one was recorded.",
    ],
  },
  ME: {
    name: "Maine",
    citation: "Me. Rev. Stat. tit. 10, § 3255(1)",
    act: "file an action to enforce the lien in the Superior Court or District Court",
    commercial: { type: "days_after_last", days: 120 },
    notes: [
      "Maine preserves the lien by suing: the action is filed in the county where the property is within 120 days after your last labor, materials or services (§ 3255(1)). Without a contract with the owner, the complaint may not be served on the owner until 30 days after it is filed. A buyer for value takes free of the lien unless a notice was recorded first (§ 3255(2)).",
    ],
  },
  RI: {
    name: "Rhode Island",
    citation: "R.I. Gen. Laws § 34-28-4(a)",
    act: "mail the notice of intention to the owner and file a copy in the land evidence records",
    commercial: { type: "days_after_last", days: 200 },
    notes: [
      "Both are due within 200 days after the work: the notice mailed by registered or certified mail, return receipt requested, to the owner of record, and a copy filed in the land evidence records of the city or town (§ 34-28-4(a)). The lien reaches only the work and materials of the 200 days before the filing, so on a long job file earlier than this date to keep the early work covered.",
    ],
  },
  WY: {
    name: "Wyoming",
    citation: "Wyo. Stat. § 29-2-106(a)",
    act: "file a lien statement",
    commercial: {
      type: "earlier_of_completion",
      days: 120,
      monthEnd: false,
      completionDays: 120,
      completionWhat: "substantial completion of the project",
    },
    notes: [
      "This is the clock for everyone but the contractor with the owner (150 days): 120 days after the earlier of your last day of work and substantial completion of the project (W.S. 29-2-106(a)). If the owner recorded a notice of substantial completion, its recording date is presumed to be substantial completion: enter it as the completion date. Send the record owner a notice of intention, with the amount and who owes it, at least 20 days before filing (W.S. 29-2-107).",
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

/** The last day of the month containing `iso`. */
export function monthEnd(iso: string): string {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Which of the completion dates the job's panel asks for in a state. */
export function lienDateFields(state: string | null | undefined): {
  completion: boolean;
  noticeOfCompletion: boolean;
} {
  const s = state?.trim().toUpperCase();
  if (!isLienDeadlineState(s)) return { completion: false, noticeOfCompletion: false };
  const t = LIEN_DEADLINE_RULES[s].commercial.type;
  return {
    completion: t === "completion" || t === "earlier_of_completion",
    noticeOfCompletion: t === "completion",
  };
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
    if (a.workThisPeriodCents <= 0 || !isCalendarDate(a.periodFrom)) continue;
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
  /** A public job (src/shared/public-jobs.ts): no lien; a federal job counts the Miller Act instead. */
  publicOwner?: PublicOwner | null;
  /** Federal job: who the company contracted with (null: not said, the notice is shown). */
  millerTier?: MillerTier | null;
}

export interface LienDeadline {
  /** The lien state, or "US" for a federal job's Miller Act bond claim. */
  state: LienDeadlineState | "US";
  /** What the date is called: "lien deadline", "Miller Act notice deadline" or "Miller Act suit deadline". */
  label: string;
  /** Federal jobs: the Miller Act's one-year suit limit (weekend-adjusted); null on a lien. */
  bondSuitDueOn: string | null;
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
  | { kind: "no-dates"; state: LienDeadlineState | "US"; stateName: string }
  /** A state or local public job: no lien, and the state's bond-claim dates are not counted. */
  | { kind: "public"; state: string | null }
  /** A federal job and a claimant below the second tier: the Miller Act bond does not cover it. */
  | { kind: "not-covered" };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const ORD: Record<number, string> = { 3: "3rd", 4: "4th" };

/** A federal job: the Miller Act's 90-day notice (second tier) or one-year suit limit (first tier). */
function millerDeadline(input: LienDeadlineInput): LienDeadlineResult {
  const tier = input.millerTier ?? null;
  if (tier === "remote") return { kind: "not-covered" };
  const floor = input.lastFurnishedOn ? null : lastFurnishedFloor(input.apps ?? []);
  const fromOn = input.lastFurnishedOn ?? floor?.on ?? null;
  if (!fromOn) return { kind: "no-dates", state: "US", stateName: "Federal" };
  const dates = millerDates(fromOn, tier);
  const from = input.lastFurnishedOn
    ? "your last furnishing of labor or materials"
    : "your last day of work";
  const notice = dates.noticeOn !== null && dates.noticeDueOn !== null;
  return {
    kind: "deadline",
    deadline: {
      state: "US",
      label: notice ? "Miller Act notice deadline" : "Miller Act suit deadline",
      stateName: "Federal",
      citation: notice ? `${MILLER_CITATION}(2)` : `${MILLER_CITATION}(4)`,
      act: notice
        ? "give the prime contractor written notice of your payment bond claim"
        : "bring suit on the payment bond",
      statutoryOn: notice ? (dates.noticeOn as string) : dates.suitByOn,
      dueOn: notice ? (dates.noticeDueOn as string) : dates.suitDueOn,
      rule: notice ? `90 days after ${from}` : `one year after ${from}`,
      basis: input.lastFurnishedOn ? "entered" : "estimated",
      fromOn,
      fromPayAppNumber: floor?.payAppNumber ?? null,
      usedLastFurnishingAsCompletion: false,
      residentialRule: false,
      bondSuitDueOn: dates.suitDueOn,
      notes: millerNotes(tier, dates),
    },
  };
}

export function lienDeadline(raw: LienDeadlineInput): LienDeadlineResult {
  // A stored date that is not a calendar day (the API checked only the shape before 2026-11-27) is
  // read as not entered: the date math would throw on it and take the cash page down with it.
  const date = (d: string | null | undefined) => (isCalendarDate(d) ? d : null);
  const input: LienDeadlineInput = {
    ...raw,
    lastFurnishedOn: date(raw.lastFurnishedOn),
    completedOn: date(raw.completedOn),
    noticeOfCompletionOn: date(raw.noticeOfCompletionOn),
  };
  if (input.publicOwner === "federal") return millerDeadline(input);
  if (input.publicOwner === "state_local") {
    return { kind: "public", state: input.state?.trim().toUpperCase() || null };
  }
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
      const completed =
        input.completedOn && (!rule.latestOfOwn || input.completedOn >= fromOn)
          ? input.completedOn
          : null;
      usedLast = !completed;
      const byCompletion = addDays(completed ?? fromOn, rule.completionDays);
      const noc = input.noticeOfCompletionOn ?? null;
      const byNoc = noc ? addDays(noc, rule.nocDays) : null;
      const what = rule.completionWhat ?? "completion of the work of improvement";
      const completionWords = `${plural(rule.completionDays, "day")} after ${what}${completed ? "" : ` (counted from ${from}, which cannot be later than completion)`}`;
      if (byNoc && byNoc < byCompletion) {
        statutoryOn = byNoc;
        words = `${plural(rule.nocDays, "day")} after the owner recorded a notice of completion (earlier than ${completionWords})`;
      } else {
        statutoryOn = byCompletion;
        words = completionWords;
      }
      break;
    }
    case "earlier_of_completion": {
      const own = rule.monthEnd ? monthEnd(fromOn) : fromOn;
      const byOwn = addDays(own, rule.days);
      const ownWords = rule.monthEnd
        ? `${plural(rule.days, "day")} from the last day of the month of ${from}`
        : `${plural(rule.days, "day")} after ${from}`;
      const completed = input.completedOn ?? null;
      // No completion entered: completion is on or after the last day of work (else the panel asks
      // for it), so counting completion's days from the last day of work can only be early.
      usedLast = !completed;
      const byCompletion = addDays(completed ?? fromOn, rule.completionDays);
      if (byCompletion < byOwn) {
        statutoryOn = byCompletion;
        words = completed
          ? `${plural(rule.completionDays, "day")} after ${rule.completionWhat} (earlier than ${ownWords})`
          : `${plural(rule.completionDays, "day")} after ${from}, the earliest ${rule.completionWhat} can be (earlier than ${ownWords})`;
      } else {
        statutoryOn = byOwn;
        words = ownWords;
      }
      break;
    }
  }
  const notes = [...info.notes];
  if (rule.type === "earlier_of_completion" && !input.completedOn) {
    notes.unshift(
      `If ${rule.completionWhat} came before your last day of work, enter its date: the ${plural(rule.completionDays, "day")} then count from it and the date is earlier.`,
    );
  }
  if (rule.type === "completion" && !input.noticeOfCompletionOn) {
    notes.unshift(
      `If the owner records a notice of completion${state === "CA" ? " (or cessation)" : ""}, the time is shorter: ${plural((rule as { nocDays: number }).nocDays, "day")} after it is recorded. Check with the county recorder and enter its date here.`,
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
      label: "lien deadline",
      bondSuitDueOn: null,
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
  if (d.state === "US") {
    if (left < 0) {
      return `Federal ${d.label} passed on ${d.dueOn} (${d.rule}, ${d.citation}) and ${what}. ${d.bondSuitDueOn && d.bondSuitDueOn !== d.dueOn ? `A suit on the payment bond must still be brought by ${d.bondSuitDueOn}; a late notice can still count if the prime had written notice of the claim earlier. ` : ""}Ask a construction attorney what is left.${basis}`;
    }
    const soon = left === 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`;
    return `Federal ${d.label} ${soon}: ${d.act} by ${d.dueOn} (${d.rule}, ${d.citation}) and ${what}. Send it by a method with proof of delivery (certified mail, return receipt) and ask a construction attorney if payment is not certain.${basis}`;
  }
  if (left < 0) {
    return `${d.stateName} lien deadline passed on ${d.dueOn} (${d.rule}, ${d.citation}) and ${what}. Ask a construction attorney what is left (a late lien, a payment bond claim, or suing on the contract); if a lien was recorded, mark the last-furnished date or clear the state on the job.${basis}`;
  }
  const when = left === 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`;
  return `${d.stateName} lien deadline ${when}: ${d.act} by ${d.dueOn} (${d.rule}, ${d.citation}) and ${what}. If payment is not certain before then, talk to a construction attorney or a lien service now; a lien takes days to prepare and record.${basis}`;
}

/**
 * The cash page's (and weekly email's) line about a state or local public job's payment bond claim
 * (stateBondClaim in src/shared/public-jobs.ts), the state counterpart of the federal Miller Act
 * line above. Null unless money is owed and a dated step is due within LIEN_REMIND_DAYS or passed in
 * the last LIEN_PASSED_DAYS. Every dated step rests on a day the contractor entered (the last day of
 * labor or material, or the public body's acceptance), never on billing, so it does not nag a job
 * still being billed. A step passed recently leads (with the next one still ahead, if any); else the
 * next step ahead. Steps listed for those not in contract with the prime say so when the company has
 * not said who it contracted with.
 */
export function stateBondText(
  bond: StateBondCheck | null | undefined,
  owed: { outstandingCents: number; retainageHeldCents: number },
  asOf: string,
  tier: MillerTier | null = null,
): string | null {
  if (bond?.kind !== "checked") return null;
  const owedCents = owed.outstandingCents + owed.retainageHeldCents;
  if (owedCents <= 0) return null;
  const left = (x: { dueOn: string | null }) => daysUntil(asOf, x.dueOn as string);
  const next = bond.dated.find((x) => left(x) >= 0);
  const passed = bond.dated.filter((x) => left(x) < 0 && left(x) >= -LIEN_PASSED_DAYS).at(-1);
  const what =
    owed.retainageHeldCents > 0 && owed.outstandingCents > 0
      ? `${money(owedCents)} is still owed on this job (retainage included)`
      : owed.retainageHeldCents > 0
        ? `${money(owedCents)} of retainage is still held on this job`
        : `${money(owedCents)} is still owed on this job`;
  const who = (x: { who: "all" | "not-prime" }) =>
    x.who === "not-prime" && tier === null
      ? " (needed if you contracted with a subcontractor rather than the prime)"
      : "";
  const weekend = (x: { dueOn: string | null; statutoryOn: string | null }) =>
    x.statutoryOn && x.statutoryOn !== x.dueOn
      ? `; the statute's date, ${x.statutoryOn}, is a weekend, so PayApps shows the Friday before`
      : "";
  const name = bond.rule.name;
  if (passed) {
    const after =
      next && left(next) <= 366
        ? ` The next step still open: ${next.act.charAt(0).toLowerCase()}${next.act.slice(1)} by ${next.dueOn} (${next.rule}, ${next.citation}).`
        : "";
    return `${name} payment bond step passed on ${passed.dueOn}: ${passed.act}${who(passed)} (${passed.rule}, ${passed.citation}), and ${what}.${after} Ask a construction attorney what is left on the bond.`;
  }
  if (!next || left(next) > LIEN_REMIND_DAYS) return null;
  const n = left(next);
  const when = n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
  return `${name} payment bond claim ${when}: ${next.act}${who(next)} by ${next.dueOn} (${next.rule}, ${next.citation}${weekend(next)}), and ${what}. There is no lien on public work, so the bond is the security: send it by a method with proof of delivery (certified mail, return receipt) and ask a construction attorney if payment is not certain.`;
}
