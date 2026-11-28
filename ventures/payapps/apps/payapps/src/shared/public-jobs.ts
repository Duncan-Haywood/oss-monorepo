// Public jobs: what changes when the owner is a government body rather than a private one.
//
// 1. No lien. Public property cannot be liened, so a sub's security on a public job is the prime's
//    payment bond. On a federal job that bond is the Miller Act's (40 U.S.C. 3131-3134), whose two
//    dates PayApps counts here: the 90-day notice a second-tier claimant gives the prime, and the
//    one-year limit on the suit. They take the lien deadline's place on the job page, the cash page
//    and the weekly email. State and local jobs have each state's own bond law ("little Miller
//    Act"): there it shows no lien date, and lists the bond claim steps in the thirty-four states
//    and the District of Columbia of STATE_BOND_RULES (stateBondClaim, at the end of this file) on
//    the job page.
// 2. Retainage caps. Many states cap the retainage a public owner may hold. The job's rates are
//    checked against the cap in the 26 states the public guide lists.
//
// Sources. Miller Act rules ported from ventures/pay-app-guides/millerbond.mjs (40 U.S.C. 3131 and
// 3133 read on govinfo.gov and law.cornell.edu on 2026-11-25; J.W. Bateson Co. v. United States,
// 434 U.S. 586 (1978)). Retainage caps from the table in
// ventures/pay-app-guides/retainage-explained.html ("Retainage caps on public construction, 23
// states"), read on each legislature's own site on 2026-11-24, 2026-11-25 and 2026-11-28 (the last
// seven rows' text kept in ventures/pay-app-guides/sources/retainage-caps.txt); that page says which
// rows were re-read from the statute page itself. Statutes change and have exceptions not modeled
// here: every result carries its citation and link, and the panel says it is not legal advice.
//
// Day counting (as the public calculator): 90 calendar days starting the day after the last day,
// and a year as the same calendar date a year later (29 February to 28 February, the earlier
// date). A date on a weekend or an observed federal holiday moves back to the business day before,
// the same safe side the lien deadline takes. Pure functions, no I/O.

import { actByOnOrBefore } from "./federal-holidays";

// Small date helpers kept here (not imported from lien-deadline.ts, which imports this file).
const DAY_MS = 86_400_000;
const addDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const businessDayOnOrBefore = (iso: string) => actByOnOrBefore(iso).on;

export const PUBLIC_OWNERS = ["federal", "state_local"] as const;
export type PublicOwner = (typeof PUBLIC_OWNERS)[number];

/** Who the company contracted with, for the Miller Act (who must give the 90-day notice). */
export const MILLER_TIERS = ["first", "second", "remote"] as const;
export type MillerTier = (typeof MILLER_TIERS)[number];

export const MILLER_TIER_LABELS: Record<MillerTier, string> = {
  first: "Directly with the prime contractor",
  second: "With one of the prime's subcontractors",
  remote: "With a sub-subcontractor or further down",
};

export const MILLER_CITATION = "40 U.S.C. § 3133(b)";

/** Same calendar date a year later; 29 February becomes 28 February (the earlier date). */
export function addOneYear(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y + 1, m, 0)).getUTCDate();
  return new Date(Date.UTC(y + 1, m - 1, Math.min(d, last))).toISOString().slice(0, 10);
}

export interface MillerDates {
  /** Second tier (or tier not given): the 90-day notice to the prime, statute's date. Null for first tier. */
  noticeOn: string | null;
  /** The notice date, or the business day before it on a weekend or federal holiday. */
  noticeDueOn: string | null;
  /** The first day a suit may be filed: day 91 (§ 3133(b)(1)). */
  suitFromOn: string;
  /** The one-year limit on the suit (§ 3133(b)(4)), statute's date. */
  suitByOn: string;
  /** The suit limit, or the business day before it on a weekend or federal holiday. */
  suitDueOn: string;
}

/** The Miller Act dates counted from the last day of labor or material. */
export function millerDates(lastOn: string, tier: MillerTier | null): MillerDates {
  const noticeOn = tier === "first" ? null : addDays(lastOn, 90);
  const suitByOn = addOneYear(lastOn);
  return {
    noticeOn,
    noticeDueOn: noticeOn ? businessDayOnOrBefore(noticeOn) : null,
    suitFromOn: addDays(lastOn, 91),
    suitByOn,
    suitDueOn: businessDayOnOrBefore(suitByOn),
  };
}

/** Notes shown under the Miller Act date, by tier. */
export function millerNotes(tier: MillerTier | null, dates: MillerDates): string[] {
  const notes: string[] = [];
  if (tier === null) {
    notes.push(
      "Who did you contract with? The 90-day notice is needed only if you contracted with one of the prime's subcontractors; PayApps shows it until you say, since sending it never hurts.",
    );
  }
  if (dates.noticeOn) {
    notes.push(
      "The notice goes to the prime contractor in writing, by a method with third-party verification of delivery (certified mail with a return receipt, or a courier that records a signature), and states the amount claimed with substantial accuracy and who you furnished the labor or material to (§ 3133(b)(2)).",
    );
  }
  if (tier === "first") {
    notes.push(
      "You contracted with the prime, so the statute asks for no 90-day notice before a suit. A written demand to the prime and its surety is still the usual first step.",
    );
  }
  notes.push(
    `A suit on the bond may be filed from ${dates.suitFromOn} if you are still not paid in full, and must be brought by ${dates.suitDueOn}, one year after your last day (§ 3133(b)(1), (b)(4)), in the federal district court where the contract was performed.`,
    "Ask the contracting agency for a certified copy of the payment bond (§ 3133(a)): it names the surety, who pays the claim. Bonds are required on federal construction contracts above $150,000 (FAR 28.102-1).",
    "Punch-list, warranty and correction work usually does not move the last day later. Courts have not all counted the days alike: act well before either date.",
  );
  return notes;
}

// ---------------------------------------------------------------------------------------------
// Retainage caps on public work

export interface RetainageCap {
  name: string;
  citation: string;
  url: string;
  /** The cap in the statute's terms, as the guide's table words it. */
  cap: string;
  /** The highest rate the general rule allows, basis points. */
  capBps: number;
  /** A higher rate allowed only in a stated case (New York without bonds). */
  exceptionBps?: number;
  exception?: string;
  /** A lower rate that applies in a stated case (after 50% complete, a larger contract). */
  lowerBps?: number;
  lowerWhen?: string;
  /** The statute says the same limit applies to what the prime holds from its subcontractors. */
  flowsDown: boolean;
  notes: string;
}

export const RETAINAGE_CAPS: Record<string, RetainageCap> = {
  AL: {
    name: "Alabama",
    citation: "Ala. Code \u00a7 39-2-12(c)",
    url: "https://alison.legislature.state.al.us/code-of-alabama?section=39-2-12",
    cap: "5% of the work done and materials stored, and none withheld once the job is 50% complete",
    capBps: 500,
    lowerBps: 0,
    lowerWhen:
      "once the job is 50% complete: no further retainage is withheld, and what was held stays until final completion and acceptance",
    flowsDown: false,
    notes:
      "No retainage at all on Alabama Department of Transportation highway, bridge and road contracts. An escrow account or deposited securities may replace retainage where the contract allows (\u00a7 39-2-12(e)-(g)).",
  },
  AZ: {
    name: "Arizona",
    citation: "A.R.S. § 34-221",
    url: "https://www.azleg.gov/ars/34/00221.htm",
    cap: "10% of each progress estimate",
    capBps: 1000,
    lowerBps: 500,
    lowerWhen:
      "once the job is 50% complete, if progress is satisfactory (half the retained amount is payable on request, and later payments may be held at 5%)",
    flowsDown: false,
    notes: "State agency contracts: A.R.S. § 41-2576.",
  },
  CA: {
    name: "California",
    citation: "Cal. Pub. Cont. Code § 7201",
    url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=PCC&sectionNum=7201",
    cap: "5% of each payment, and 5% of the contract price in total",
    capBps: 500,
    flowsDown: true,
    notes:
      'A higher rate is allowed only if the project is first found "substantially complex" (at a public hearing for local agencies).',
  },
  DE: {
    name: "Delaware",
    citation: "29 Del. C. \u00a7 6962(d)(5)",
    url: "https://delcode.delaware.gov/title29/c069/sc04/index.html",
    cap: "5% of the value of the work completed",
    capBps: 500,
    flowsDown: false,
    notes:
      "State agencies' large public works contracts. On completion the agency may release 60% of what it holds; the rest waits for the contract's reports, payment of the subs in trades listed on the bid form and final payment.",
  },
  FL: {
    name: "Florida",
    citation: "Fla. Stat. § 255.078",
    url: "https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0200-0299%2F0255%2FSections%2F0255.078.html",
    cap: "5% of each progress payment",
    capBps: 500,
    flowsDown: false,
    notes:
      "Retainage paid for sub or supplier work must be passed down promptly. Federally funded work can differ.",
  },
  IA: {
    name: "Iowa",
    citation: "Iowa Code \u00a7 573.12",
    url: "https://www.legis.iowa.gov/docs/code/573.12.pdf",
    cap: "3% of each monthly payment",
    capBps: 300,
    flowsDown: true,
    notes:
      "The prime may hold from a sub no more than the lesser of 3% and the subcontract's rate. Subs are paid within 7 days after the prime is paid for their work.",
  },
  ID: {
    name: "Idaho",
    citation: "Idaho Code \u00a7 54-1926(3)",
    url: "https://legislature.idaho.gov/statutesrules/idstat/Title54/T54CH19/SECT54-1926/",
    cap: "5% of the total amount payable",
    capBps: 500,
    flowsDown: true,
    notes:
      "Applies where the public body requires a performance or payment bond over 50% of the contract. The prime pays a sub's retainage within 30 days after the subcontract is complete.",
  },
  IL: {
    name: "Illinois",
    citation: "30 ILCS 550/1",
    url: "https://www.ilga.gov/Legislation/ILCS/Articles?ActID=541&ChapterID=7",
    cap: "10% before 50% complete, then reduced so no more than 5% is held",
    capBps: 1000,
    lowerBps: 500,
    lowerWhen: "once the job is 50% complete",
    flowsDown: false,
    notes:
      "IDOT is excluded. Private jobs: the Contractor Prompt Payment Act, 815 ILCS 603/20, sets the same 10%/5% pattern.",
  },
  KS: {
    name: "Kansas",
    citation: "K.S.A. 16-1904",
    url: "https://ksrevisor.org/statutes/chapters/ch16/016_019_0004.html",
    cap: "5%, or up to 10% where a higher rate is needed to ensure performance",
    capBps: 500,
    exceptionBps: 1000,
    exception:
      "only where the owner or contractor determines a higher rate is needed to ensure performance, or the work is behind schedule or poor (K.S.A. 16-1904(a), (b))",
    flowsDown: true,
    notes:
      "Roads, highways and bridges are outside the act (K.S.A. 16-1902), and its rights cannot be waived by contract (K.S.A. 16-1901). Remaining retainage on undisputed payments is released within 30 days after substantial completion.",
  },
  MA: {
    name: "Massachusetts",
    citation: "M.G.L. c. 30 § 39G",
    url: "https://malegislature.gov/Laws/GeneralLaws/PartI/TitleIII/Chapter30/Section39G",
    cap: "5% of each periodic payment",
    capBps: 500,
    lowerBps: 100,
    lowerWhen: "at substantial completion",
    flowsDown: false,
    notes:
      "Private jobs: Acts of 2014, chapter 276, caps retainage at 5% of each progress payment.",
  },
  ME: {
    name: "Maine",
    citation: "5 M.R.S. \u00a7 1746",
    url: "https://legislature.maine.gov/statutes/5/title5sec1746.html",
    cap: "5% of the money due, held until the State accepts the project",
    capBps: 500,
    flowsDown: false,
    notes:
      "State contracts for public improvements. The State may reduce the amount held once the contract is substantially complete, on request; securities deposited with the Treasurer of State can replace cash retainage.",
  },
  MI: {
    name: "Michigan",
    citation: "MCL 125.1563",
    url: "https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-125-1563",
    cap: "10% until 50% complete, then no more",
    capBps: 1000,
    lowerBps: 0,
    lowerWhen:
      "on work after the job is 50% complete (up to 10% only if progress is unsatisfactory)",
    flowsDown: false,
    notes: "Retained funds go in an interest-bearing account.",
  },
  MN: {
    name: "Minnesota",
    citation: "Minn. Stat. § 15.72",
    url: "https://www.revisor.mn.gov/statutes/cite/15.72",
    cap: "5% of each progress payment",
    capBps: 500,
    flowsDown: false,
    notes:
      "If the agency reduces retainage, the contractor must reduce subs' retainage at the same rate, and must pay subs their retainage within 10 days of receiving it unless their work is disputed. All of it is released within 60 days of substantial completion.",
  },
  MO: {
    name: "Missouri",
    citation: "RSMo \u00a7 8.960",
    url: "https://revisor.mo.gov/main/OneSection.aspx?section=8.960",
    cap: "5% of the value of the contract or subcontract",
    capBps: 500,
    exceptionBps: 1000,
    exception:
      "only where no bond is required because the contract is not estimated to exceed $50,000",
    flowsDown: true,
    notes: "Formerly RSMo 34.057 (transferred 2022).",
  },
  NC: {
    name: "North Carolina",
    citation: "N.C. Gen. Stat. § 143-134.1",
    url: "https://www.ncleg.gov/EnactedLegislation/Statutes/PDF/BySection/Chapter_143/GS_143-134.1.pdf",
    cap: "5% of each periodic payment",
    capBps: 500,
    flowsDown: false,
    notes:
      "Limits on further retainage once the project is 50% complete. Small projects carry no retainage: the text read says under $150,000, and a 2025 session bill (H1123) changes that threshold, so check the current section.",
  },
  ND: {
    name: "North Dakota",
    citation: "N.D. Cent. Code \u00a7 48-01.2-13",
    url: "https://ndlegis.gov/cencode/t48c01-2.pdf",
    cap: "10% of each estimate until 50% complete, then no more",
    capBps: 1000,
    lowerBps: 0,
    lowerWhen:
      "on estimates after the project is 50% complete (unless unsatisfactory progress or performance is documented)",
    flowsDown: false,
    notes:
      "At 95% complete the governing body may pay up to 95% of what it has retained; the rest is paid when the architect or engineer approves. Retained money may be invested for the contractor's benefit. An estimate unpaid more than 30 days after approval earns interest (\u00a7 48-01.2-14).",
  },
  NV: {
    name: "Nevada",
    citation: "NRS 338.515",
    url: "https://www.leg.state.nv.us/NRS/NRS-338.html#NRS338Sec515",
    cap: "5% until 50% complete",
    capBps: 500,
    flowsDown: false,
    notes:
      "After 50% the public body may stop withholding if progress is satisfactory. Interest accrues on retainage (NRS 338.460). Department of Transportation contracts are excluded (NRS 338.480).",
  },
  NY: {
    name: "New York",
    citation: "N.Y. Gen. Mun. Law § 106-b",
    url: "https://www.nysenate.gov/legislation/laws/GMU/106-B",
    cap: "5% of each progress payment",
    capBps: 500,
    exceptionBps: 1000,
    exception: "only if the public owner does not require full performance and payment bonds",
    flowsDown: true,
    notes: "The same 5% rule applies from contractor to subcontractor.",
  },
  OH: {
    name: "Ohio",
    citation: "Ohio Rev. Code \u00a7 153.12",
    url: "https://codes.ohio.gov/ohio-revised-code/section-153.12",
    cap: "Labor paid at no less than 96% of the approved estimate (4% held); materials delivered but not yet installed paid at 92% of invoice (\u00a7 153.14)",
    capBps: 400,
    exceptionBps: 800,
    exception:
      "on materials delivered but not yet installed, which are paid at 92% of invoice (Ohio Rev. Code \u00a7 153.14)",
    flowsDown: true,
    notes:
      "No subcontract may be paid at a lower rate than the contractor. Since 30 September 2025, \u00a7 153.13 no longer stops retainage at 50% complete; the substantially completed portion's retainage is paid within 30 days, the rest within 30 days of final completion.",
  },
  OR: {
    name: "Oregon",
    citation: "ORS 279C.570(7)",
    url: "https://www.oregonlegislature.gov/bills_laws/ors/ors279C.html",
    cap: "5% of each progress payment",
    capBps: 500,
    flowsDown: false,
    notes:
      "Bonds or securities can stand in for cash retainage (ORS 279C.560). Retainage a contractor holds from its subs follows ORS 701.420 (ORS 279C.555).",
  },
  PA: {
    name: "Pennsylvania",
    citation: "62 Pa.C.S. § 3921",
    url: "https://www.palegis.us/statutes/consolidated/view-statute?txtType=HTM&ttl=62&div=0&chpt=39&sctn=21&subsctn=0",
    cap: "10% until 50% complete, then 5%",
    capBps: 1000,
    lowerBps: 500,
    lowerWhen: "once the job is 50% complete (half the retained amount is returned then)",
    flowsDown: false,
    notes: "Department of General Services contracts: 6%, then 3%.",
  },
  SC: {
    name: "South Carolina",
    citation: "S.C. Code \u00a7 11-35-3030(4)",
    url: "https://www.scstatehouse.gov/code/t11c035.php",
    cap: "3.5% of each progress payment",
    capBps: 350,
    flowsDown: true,
    notes:
      "The State Consolidated Procurement Code; it applies the same 3.5% to what a general contractor holds in a subcontract. On a state job, each contractor's or sub's work is its own division: its retainage is released when that division is certified complete, and the prime pays the sub within ten days of receiving it.",
  },
  TX: {
    name: "Texas",
    citation: "Tex. Gov't Code § 2252.032",
    url: "https://statutes.capitol.texas.gov/Docs/GV/htm/GV.2252.htm",
    cap: "10% if the contract is under $5 million; 5% at $5 million or more",
    capBps: 1000,
    lowerBps: 500,
    lowerWhen: "on a prime contract of $5 million or more",
    flowsDown: true,
    notes:
      "Dam contracts stay at 10%. A prime may not hold more from a sub than the owner holds from the prime. No retainage after the prime's work is complete.",
  },
  UT: {
    name: "Utah",
    citation: "Utah Code § 13-8-5",
    url: "https://le.utah.gov/xcode/Title13/Chapter8/13-8-S5.html",
    cap: "5% of each payment, and 5% of the total construction price",
    capBps: 500,
    flowsDown: true,
    notes:
      "Covers private nonresidential work too. Retainage sits in an interest-bearing account and is released within 45 days of the later of the billing, the certificate of occupancy or final acceptance.",
  },
  VA: {
    name: "Virginia",
    citation: "Va. Code § 2.2-4333",
    url: "https://law.lis.virginia.gov/vacode/title2.2/chapter43/section2.2-4333/",
    cap: "5% (the contractor is paid at least 95% of the earned sum)",
    capBps: 500,
    flowsDown: true,
    notes:
      "Applies to subcontracts with progress payments on public projects. Localities offer an escrow option on contracts of $200,000 or more.",
  },
  WA: {
    name: "Washington",
    citation: "RCW 60.28.011",
    url: "https://app.leg.wa.gov/rcw/default.aspx?cite=60.28.011",
    cap: "5% of moneys earned",
    capBps: 500,
    flowsDown: true,
    notes:
      "A bond can replace cash retainage. Release 60 days after completion, subject to claims and tax liens.",
  },
};

export const RETAINAGE_CAP_STATES = Object.keys(RETAINAGE_CAPS).sort();

export type RetainageCapCheck =
  | { kind: "unsupported"; state: string }
  | {
      kind: "checked";
      state: string;
      rule: RetainageCap;
      /** The highest rate this job holds (work, stored materials, or a line's own rate), bps. */
      jobBps: number;
      /**
       * over: above any rate the statute allows. exception: above the general cap, allowed only in
       * the statute's stated case. lower: within the cap, but above a lower rate that applies in a
       * stated case. within: at or under every rate in the rule.
       */
      verdict: "over" | "exception" | "lower" | "within";
      /** One sentence for the panel. */
      text: string;
    };

const pct = (bps: number) => `${Number((bps / 100).toFixed(2))}%`;

/**
 * The job's retainage against the state's cap on public work. `rates` are every rate the job holds
 * at: the work and stored-materials rates in force, and any line's own rate.
 */
export function retainageCapCheck(
  state: string | null | undefined,
  rates: readonly number[],
): RetainageCapCheck | null {
  const s = state?.trim().toUpperCase();
  if (!s) return null;
  const rule = RETAINAGE_CAPS[s];
  if (!rule) return { kind: "unsupported", state: s };
  const jobBps = Math.max(0, ...rates);
  const top = rule.exceptionBps ?? rule.capBps;
  const verdict =
    jobBps > top
      ? "over"
      : jobBps > rule.capBps
        ? "exception"
        : rule.lowerBps !== undefined && jobBps > rule.lowerBps
          ? "lower"
          : "within";
  const who = rule.flowsDown
    ? "The statute applies the same limit to what the prime holds from its subcontractors."
    : "This statute limits what the public owner holds from the prime; whether it also limits what your GC holds from you turns on the state's other rules and your subcontract.";
  const held = `This job holds ${pct(jobBps)}`;
  const text =
    verdict === "over"
      ? `${held}, above the ${pct(top)} ${rule.name} allows on public work (${rule.citation}). ${who}`
      : verdict === "exception"
        ? `${held}, above ${rule.name}'s ${pct(rule.capBps)} cap on public work (${rule.citation}); more is allowed ${rule.exception}. ${who}`
        : verdict === "lower"
          ? `${held}, within ${rule.name}'s ${pct(rule.capBps)} cap on public work (${rule.citation}), but the rate drops to ${pct(rule.lowerBps ?? 0)} ${rule.lowerWhen}. ${who}`
          : `${held}, within ${rule.name}'s cap on public work (${rule.citation}).`;
  return { kind: "checked", state: s, rule, jobBps, verdict, text };
}

// ---------------------------------------------------------------------------------------------
// State payment bond claims on state and local public work ("little Miller Acts")
//
// Each state's bond statute, read on the legislature's own site on 2026-11-27 (texts kept in
// ventures/pay-app-guides/sources/state-bond-claims.txt). Only the dates a statute states in
// days, months or years from a day PayApps knows (the last day of labor or material, or the day
// the public body accepted the work) are dated; the rest are listed with the day they wait for.
// A date on a weekend or an observed federal holiday moves back to the business day before (the safe
// side); state-only holidays are not modeled.

/** One step of a state bond claim. */
export interface BondClaimStep {
  /** Who must take it: everyone the bond covers, or only those not in contract with the prime. */
  who: "all" | "not-prime";
  /** What to do, starting with a verb. */
  act: string;
  citation: string;
  /** How the date is counted, in words. */
  rule: string;
  /** The statute's date, or null when it waits on a day not entered (see waitsFor). */
  statutoryOn: string | null;
  /** statutoryOn, or the business day before it on a weekend or federal holiday. */
  dueOn: string | null;
  /** The day the date is counted from, when it is not entered or not knowable here. */
  waitsFor: string | null;
}

export interface StateBondRule {
  name: string;
  /** The statute's name and sections, for the panel heading. */
  law: string;
  url: string;
  /** Read on the legislature's own site. */
  checkedOn: string;
  notes: string[];
  /**
   * The statute's own words when it reaches claimants at any tier below a subcontractor
   * (Oklahoma's "regardless of tier"), so the remote-tier caution is replaced by them.
   */
  anyTier?: string;
}

interface BondDays {
  lastOn: string | null;
  acceptedOn: string | null;
}

/** The 15th day of the nth month after the month of `iso` (Texas Gov't Code ch. 2253). */
function day15MonthsAfter(iso: string, months: number): string {
  const [y, m] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1 + months, 15)).toISOString().slice(0, 10);
}

/** The same day `n` calendar months later; a day the month lacks becomes its last day (the earlier date). */
function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, m + n, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
}

const LAST = "your last day of labor or material";
const ACCEPTED = "the day the public body accepted the work";

function step(
  s: Omit<BondClaimStep, "statutoryOn" | "dueOn" | "waitsFor">,
  from: string | null,
  count: ((from: string) => string) | null,
  waitsFor: string,
): BondClaimStep {
  if (!count || !from) return { ...s, statutoryOn: null, dueOn: null, waitsFor };
  const on = count(from);
  return { ...s, statutoryOn: on, dueOn: businessDayOnOrBefore(on), waitsFor: null };
}

const days = (n: number) => (iso: string) => addDays(iso, n);

export const STATE_BOND_RULES: Record<string, StateBondRule> = {
  DC: {
    name: "District of Columbia",
    law: "D.C. Code §§ 2-201.01 to 2-201.03",
    url: "https://code.dccouncil.gov/us/dc/council/code/sections/2-201.02",
    checkedOn: "2026-11-28",
    notes: [
      "A suit may be brought once you are unpaid 90 days after your last day (§ 2-201.02(a)).",
      "The notice goes by registered mail to the contractor at any place it keeps an office or does business, or its residence, or is served as the U.S. Marshal serves a summons, and states with substantial accuracy the amount claimed and who you worked for (§ 2-201.02(a)).",
      "The suit is brought in the name of the District of Columbia for your use, in the Superior Court, within one year after your last day (§ 2-201.02(b)).",
      "Payment bonds are required on District public works contracts over $25,000 and cover one-half of a contract up to $1,000,000, 40% up to $5,000,000 and $2,500,000 above that (§ 2-201.01(a)), and the Mayor may waive them (§ 2-201.01(b)): ask for the bond. A claimant who says it was not paid gets a certified copy of the bond and contract (§ 2-201.03).",
    ],
  },
  OK: {
    name: "Oklahoma",
    law: "61 O.S. §§ 1, 2",
    url: "https://www.oscn.net/applications/oscn/DeliverDocument.asp?CiteID=85198",
    checkedOn: "2026-11-28",
    anyTier:
      'Oklahoma\'s notice reaches anyone in contract with a subcontractor "regardless of tier" (61 O.S. § 2(B)(1)), so the bond covers you if you give it.',
    notes: [
      "A claimant in contract with a subcontractor, at any tier, gives written notice to the contractor and the surety within 90 days after its last day, by registered or certified mail to the contractor at any place it keeps an office or does business, with a copy to the surety, stating with substantial accuracy the amount claimed and who you worked for (61 O.S. § 2(B)(1)).",
      "The suit limit is one year from your last day, or two years if you filed a claim within that first year (61 O.S. § 2(A)). PayApps dates both; the second applies only once a claim is filed.",
      "The bond is filed with the public body that let the contract, which gives a copy to anyone claiming under it (61 O.S. § 2(A)). Bonds are required on contracts over $100,000 (61 O.S. § 1(A)).",
      "On an at-risk construction management contract, only those in direct contract with the party that furnished the bond may claim on it (61 O.S. § 2(B)(2)).",
    ],
  },
  AL: {
    name: "Alabama",
    law: "Ala. Code \u00a7 39-1-1",
    url: "https://alison.legislature.state.al.us/code-of-alabama?section=39-1-1",
    checkedOn: "2026-11-28",
    notes: [
      "Alabama asks no notice to the contractor from anyone. The one notice is to the surety, of the amount claimed and the nature of the claim; registered or certified mail to any of its offices is enough, and the suit may not be filed until 45 days after it (\u00a7 39-1-1(b)). Send it as soon as payment is clearly late.",
      "If the surety or contractor does not pay in full within 45 days of the mailing, you may also recover a reasonable attorney fee and interest from the date of the notice (\u00a7 39-1-1(b)).",
      "The suit limit runs from the final settlement of the contract, a day PayApps does not know. After completion the contractor must publish a notice of completion for at least three weeks (a county newspaper, its website, or the awarding authority's notice website), and final settlement cannot come until 30 days after that notice ends (\u00a7 39-1-1(f)): watch for it, and ask the awarding authority for the settlement date.",
      "The payment bond is required on contracts of $100,000 or more (\u00a7 39-1-1(e)). On written application saying you supplied work and were not paid, the authority gives you a certified copy of the bond and contract (\u00a7 39-1-1(c)).",
    ],
  },
  AK: {
    name: "Alaska",
    law: "AS 36.25.010, 36.25.020",
    url: "https://www.akleg.gov/basis/statutes.asp#36.25.020",
    checkedOn: "2026-11-28",
    notes: [
      "A suit may be brought once you are unpaid 90 days after your last day (AS 36.25.020(a)).",
      "The notice goes by registered mail to the contractor's office, place of business or residence (or is served as a summons may be), and states with substantial accuracy the amount claimed and who you worked for (AS 36.25.020(b)).",
      "The suit limit is one year after the date of final settlement of the contract (AS 36.25.020(c)), a day PayApps does not know: ask the public body for it. The suit is brought in the name of the state or political subdivision for your use, and is subject to the contractor registration rule of AS 08.18.151.",
      "Payment bonds are required on contracts over $100,000 and cover one-half of a contract up to $1,000,000, 40% up to $5,000,000 and $2,500,000 above that (AS 36.25.010(a)(2)): on a large job the bond may not cover every claim. A municipality may exempt some contractors on projects up to $400,000 (AS 36.25.025).",
    ],
  },
  AZ: {
    name: "Arizona",
    law: "A.R.S. § 34-223",
    url: "https://www.azleg.gov/ars/34/00223.htm",
    checkedOn: "2026-11-27",
    notes: [
      "A suit may be brought once you are unpaid 90 days after your last day (§ 34-223(A)).",
      "The 90-day notice may go by any means with written third-party verification of delivery, to the contractor's office, place of business or residence, and states the amount claimed and who you worked for.",
      "The contracting body must give a certified copy of the bond and contract on written request (§ 34-223(C)).",
    ],
  },
  CA: {
    name: "California",
    law: "Cal. Civ. Code §§ 9100-9566",
    url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=9558",
    checkedOn: "2026-11-28",
    notes: [
      "Every date here counts from acceptance as if the public body recorded its notice of completion that same day, the earliest the deadlines can fall. If a notice of completion, acceptance or cessation is recorded later (it may be up to 15 days after completion, § 9204), the stop payment notice is due 30 days after that recording; if none is recorded, 90 days after completion (§ 9356(b)), and the two suits move with it. Ask the public body whether and when it recorded one.",
      "Completion is the earlier of acceptance and 60 days in a row with no labor on the whole project (§ 9200; the 60 days do not apply to State Contract Act contracts). If work stopped for 60 days before acceptance, the dates run from then.",
      "The stop payment notice is signed and verified, states the amount due for work through its date (§ 9352), and goes to the public body's disbursing officer, or for a state contract to the director of the department that awarded it (§ 9354). Pay the public body $10 with it and it must tell you the deadline to sue (§ 9362).",
      "A claimant who missed the preliminary notice can still claim on the bond with written notice to the surety and the bond principal within 15 days after a notice of completion is recorded, or 75 days after completion if none is (§ 9560(b), (c)).",
      "A payment bond is required on a public works contract over $25,000 (§ 9550(a)); § 9550 does not cover a state entity's contract, which Public Contract Code § 7103 bonds. A direct contractor (the prime) has no stop payment notice or bond claim (§ 9100(b)). The prevailing party in a bond suit gets a reasonable attorney's fee (§ 9564(c)).",
      "Read from california.public.law, which republishes the official text; leginfo.legislature.ca.gov refused this session's connection.",
    ],
  },
  CO: {
    name: "Colorado",
    law: "C.R.S. §§ 38-26-105 to 38-26-107",
    url: "https://leg.colorado.gov/sites/default/files/images/olls/crs2024-title-38.pdf",
    checkedOn: "2026-11-28",
    notes: [
      "Both steps count from the final settlement date the public body fixes and publishes, at least ten days ahead, on a contract over $150,000 (§ 38-26-107(1)): watch for the notice, or ask the public body for the date.",
      "A filed claim keeps the public body withholding funds only for 90 days after the published settlement date, unless you sue in that time and file a notice of lis pendens with it (§ 38-26-107(2)).",
      "On a county, city or school district contract over $50,000, § 38-26-105(1) also says an action on its bond must be brought within six months after the completion of the work, a day PayApps does not know.",
      "Bonds are required on local contracts over $50,000 and state contracts over $150,000 (§ 38-26-106(3)); the surety owes 8% a year interest on what it pays (§ 38-26-106(2)). Read from the 2024 printout of the Colorado Revised Statutes, the latest the General Assembly's site serves.",
    ],
  },
  FL: {
    name: "Florida",
    law: "Fla. Stat. § 255.05",
    url: "https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0200-0299/0255/Sections/0255.05.html",
    checkedOn: "2026-11-27",
    notes: [
      "Laborers are exempt from the notice to contractor. Notices are served as § 713.18 provides.",
      "A notice of nonpayment that includes retainage must say how much of the claim is retainage, and a willfully exaggerated one forfeits the claim.",
      "A suit for retainage has the same one-year limit but may not be brought until the conditions in § 255.05(10) are met (for example, the public entity paid the retainage to the contractor and the time to pass it on ran out).",
      "The contractor can shorten the time to sue to 60 days by recording and serving a notice of contest of your claim (§ 255.05(2)(a)1).",
    ],
  },
  ID: {
    name: "Idaho",
    law: "Idaho Code § 54-1927",
    url: "https://legislature.idaho.gov/statutesrules/idstat/Title54/T54CH19/SECT54-1927/",
    checkedOn: "2026-11-27",
    notes: [
      "A suit may be brought once you are unpaid 90 days after your last day. The notice goes by registered or certified mail to the contractor's office, place of business or residence, and states the amount claimed and who you worked for.",
      "A subcontractor of the contractor sues within one year from the day final payment under its subcontract became due, a day PayApps does not know; PayApps shows one year from your last day, usually the earlier one.",
      "The contracting body gives a certified copy of the bond and the contract to anyone who submits an affidavit that they are unpaid.",
    ],
  },
  IA: {
    name: "Iowa",
    law: "Iowa Code ch. 573",
    url: "https://www.legis.iowa.gov/docs/code/573.pdf",
    checkedOn: "2026-11-28",
    notes: [
      "The claim is against the retained fund and the bond together: file an itemized, sworn, written statement with the officer, board or commission that let the contract (a county highway job: the county auditor, § 573.8). A claim filed after the 30 days still counts while the public body has not paid the full contract price and no action is pending (§ 573.10(2)).",
      "The action is brought in equity in the county of the improvement, not before 30 days after completion and final acceptance (§ 573.16(1)). If the contractor serves you a written demand to sue, sue within 30 days or the funds are released (§ 573.16(2)).",
      "Where the public body releases retained funds at 95% completion, the same 30 and 60 days count from the day 95% of the contract was completed instead (§ 573.15A). Ask the public body which it used.",
      "A supplier furnishing only materials to a subcontractor who furnishes only materials has no claim (§ 573.7(2)). The start-of-work notice does not apply to highway, bridge or culvert projects (§ 573.15(2)).",
    ],
  },
  LA: {
    name: "Louisiana",
    law: "La. R.S. 38:2241 to 38:2247",
    url: "https://legis.la.gov/legis/Law.aspx?d=94967",
    checkedOn: "2026-11-28",
    notes: [
      "Louisiana counts from the recordation of the public body's acceptance of the work (or of its notice of the contractor's default) in the parish mortgage records, not from your last day. Enter the day the acceptance was recorded as the acceptance date; the parish clerk of court can confirm it.",
      "The sworn statement is both filed with the public body and recorded with the recorder of mortgages of the parish where the work is (§ 38:2242(B)); a claimant who skipped it has no action on the bond (§ 38:2247(A)). The notice to the contractor goes by registered or certified mail to any office it keeps in Louisiana.",
      "A material supplier has a second route: a notice of nonpayment to the general contractor, the surety and the owner no sooner than 45 days after delivery, then a payment notice once unpaid 90 days after delivery; the surety pays within ten days (§ 38:2247(B), (C)). A supplier to a sub on a recorded contract also sends notice of nonpayment within 75 days from the last day of the month of delivery to keep its privilege (§ 38:2242(F)).",
      "A claimant who recovers the full sworn claim after amicable demand and 30 days unpaid is allowed 10% attorney's fees (§ 38:2246). The payment bond is required on contracts over $25,000 per project, for at least half the contract price (§ 38:2241(A)(2)).",
    ],
  },
  MA: {
    name: "Massachusetts",
    law: "Mass. Gen. Laws ch. 149, § 29",
    url: "https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXXI/Chapter149/Section29",
    checkedOn: "2026-11-27",
    notes: [
      "The claim is enforced by a petition in equity in the superior court. A claimant in contract with the prime may file once unpaid 65 days after the amount was due; no decree is entered before the 70th day after your last day (§ 29, second and fifth paragraphs).",
      "The 65-day notice goes by registered or certified mail to the contractor's office, place of business or residence, or as civil process may be served, and states the amount claimed and who you worked for.",
      "Specially fabricated material is covered only if the sub's supplier tells the contractor of the order and its amount within 20 days after the written final approval to use it.",
      "The bond is required on public works contracts over $25,000. A decree for a claimant includes reasonable legal fees.",
    ],
  },
  MD: {
    name: "Maryland",
    law: "Md. Code, State Fin. & Proc. §§ 17-108, 17-109",
    url: "https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gsf&section=17-108&enactments=false",
    checkedOn: "2026-11-27",
    notes: [
      "A suit may be brought once you are unpaid 90 days after your last day (§ 17-108(a)).",
      "The notice goes by certified mail to the contractor's residence or a place where it has an office or does business, and states with substantial accuracy the amount claimed and who you worked for (§ 17-108(b)(2)).",
      "A contract term that waives the right to sue on the bond, or makes it wait on the public body paying, is void (§ 17-108(d)).",
      "These sections govern payment security on contracts subject to the subtitle. A county or city job's bond may rest on local law: read the bond.",
    ],
  },
  ME: {
    name: "Maine",
    law: "14 M.R.S. § 871",
    url: "https://legislature.maine.gov/statutes/14/title14sec871.html",
    checkedOn: "2026-11-28",
    notes: [
      "A suit may be brought once you are unpaid 90 days after your last day, in the county where the work is (§ 871(4), (6)).",
      "The notice goes by registered or certified mail to any place the contractor keeps an office or does business, or its residence, and states with substantial accuracy the amount claimed and who you worked for.",
      "A material supplier whose claim cannot be worked out until the public body sets the final quantity estimates has 90 days, and one year to sue, from that determination instead (§ 871(4)).",
      "The payment bond is required on contracts over $125,000, and the contracting body gives a certified copy of the bond and contract to an unpaid claimant who asks in writing.",
    ],
  },
  MO: {
    name: "Missouri",
    law: "Mo. Rev. Stat. § 107.170",
    url: "https://revisor.mo.gov/main/OneSection.aspx?section=107.170",
    checkedOn: "2026-11-27",
    notes: [
      "Only a remote supplier gives a notice: a material supplier in contract with a second-tier or lower subcontractor, or with another supplier (§ 107.170.2). Subcontractors at any tier give none.",
      "This section states no suit deadline; read the bond and ask a construction attorney.",
      "The bond is required on public works estimated to cost more than $50,000 (§ 107.170.2).",
    ],
  },
  MI: {
    name: "Michigan",
    law: "MCL 129.207, 129.209",
    url: "https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-129-207",
    checkedOn: "2026-11-27",
    notes: [
      "A suit may be brought once you are unpaid 90 days after your last day (MCL 129.207).",
      "Both notices go by certified mail to the principal contractor (and the 90-day notice to the governmental unit too), at any place where it keeps a business or residence.",
      "The suit limit runs from the day final payment was made to the principal contractor (MCL 129.209), a day PayApps does not know: ask the public body when it paid the prime.",
    ],
  },
  MN: {
    name: "Minnesota",
    law: "Minn. Stat. § 574.31",
    url: "https://www.revisor.mn.gov/statutes/cite/574.31",
    checkedOn: "2026-11-27",
    notes: [
      "Everyone furnishing labor and materials gives the notice, first-tier subs included, personally or by certified mail to the surety and the contractor at the addresses stated in the bond. The statute sets out a sworn form for it (§ 574.31, subd. 2(a)).",
      "If the contractor's bond fails to state both its and the surety's addresses (§ 574.28), no notice is needed (subd. 2(b)).",
      "The one-year suit limit can be extended by a written stipulation with the surety, or by a certified-mail notice to the surety 90 days before the limit that it does not object to within 30 days (subd. 2(d)).",
    ],
  },
  NV: {
    name: "Nevada",
    law: "NRS 339.035, 339.055",
    url: "https://www.leg.state.nv.us/NRS/NRS-339.html",
    checkedOn: "2026-11-27",
    notes: [
      "A suit may be brought once you are unpaid 90 days after your last day (NRS 339.035(1)).",
      "Both notices go by registered or certified mail to the contractor's office, place of business or residence, and state the amount claimed and who you worked for (NRS 339.035(2)).",
      "Payment bonds are required on public work contracts over $100,000, other than the highway contracts of NRS chapter 408 (NRS 339.025).",
    ],
  },
  OR: {
    name: "Oregon",
    law: "ORS 279C.600-279C.610",
    url: "https://www.oregonlegislature.gov/bills_laws/ors/ors279C.html",
    checkedOn: "2026-11-27",
    notes: [
      "Everyone gives the notice of claim, first-tier subs included, to the contractor and the contracting agency, by registered or certified mail or by hand, in the form ORS 279C.605(3) sets out, signed.",
      "A claim for an employee benefit fund contribution has 200 days instead of 180 (ORS 279C.605(2)).",
    ],
  },
  NC: {
    name: "North Carolina",
    law: "N.C. Gen. Stat. §§ 44A-27, 44A-28",
    url: "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_44A/GS_44A-27.html",
    checkedOn: "2026-11-27",
    notes: [
      "A suit may be brought once you are unpaid 90 days after your last day (§ 44A-27(a)).",
      "The suit limit is the longer of one year from your last day and one year from final settlement with the contractor (§ 44A-28(b)); PayApps shows the first, the earlier one.",
      "Notices go by certified mail or USPS signature confirmation to the contractor's office, or to the agent named in the contractor's project statement (§ 44A-27(c)).",
      "On a claim over $20,000, the part above $20,000 covers only labor and material from 75 days before you served the notice of public subcontract, unless the contractor did not send the bond copy you asked for (§ 44A-27(b), (e)).",
    ],
  },
  NY: {
    name: "New York",
    law: "N.Y. State Fin. Law § 137",
    url: "https://www.nysenate.gov/legislation/laws/STF/137",
    checkedOn: "2026-11-27",
    notes: [
      "A suit may be brought once you are unpaid 90 days after your last day (§ 137(3)).",
      "The notice is delivered personally or by registered mail to the contractor's office, place of business or residence; a notice the contractor actually receives another way also counts.",
      "This section governs bonds furnished under it. A city, county or authority job's bond may rest on another statute: read the bond.",
    ],
  },
  OH: {
    name: "Ohio",
    law: "Ohio Rev. Code § 153.56",
    url: "https://codes.ohio.gov/ohio-revised-code/section-153.56",
    checkedOn: "2026-11-27",
    notes: [
      "The suit may not be brought until 60 days after you furnish the statement (§ 153.56(B)).",
      "A sub or supplier not in contract with the principal contractor, on labor or materials costing more than $30,000, recovers only for work from 21 days before it served the notice of furnishing (§ 153.56(C), (D)); serve it when you start.",
    ],
  },
  TX: {
    name: "Texas",
    law: "Tex. Gov't Code ch. 2253",
    url: "https://statutes.capitol.texas.gov/Docs/GV/htm/GV.2253.htm",
    checkedOn: "2026-11-27",
    notes: [
      "Every month of unpaid work has its own notice date: PayApps dates the month of your last day, and the notices for earlier unpaid months were due sooner.",
      "A sub of a sub whose contract provides for retainage must also tell the prime so by the 15th day of the 2nd month after it starts work (§ 2253.047(b)).",
      "A suit may be brought if the claim is unpaid on the 61st day after the notice is mailed (§ 2253.073).",
      "Payment bonds are required on contracts over $25,000, or over $50,000 for a municipality (§ 2253.021).",
    ],
  },
  UT: {
    name: "Utah",
    law: "Utah Code §§ 63G-6a-1103, 38-1b-202",
    url: "https://le.utah.gov/xcode/Title63G/Chapter6a/63G-6a-S1103.html",
    checkedOn: "2026-11-27",
    notes: [
      "A suit may be brought once you are unpaid 90 days after your last day, in a county where the contract was to be performed; the prevailing party gets reasonable attorney fees (§ 63G-6a-1103(4)).",
      "The preliminary notice is filed with the State Construction Registry, not mailed, and is required of every subcontractor except one in contract with the owner and a laborer paid wages. Filed late, it covers only work from five days after filing (§ 38-1b-202(4), (5)).",
      "Since 6 May 2026 the Division of Facilities Construction and Management need not take a payment bond on contracts it administers (§ 63G-6a-1103(5)): ask whether there is one.",
    ],
  },
  DE: {
    name: "Delaware",
    law: "29 Del. C. § 6962(d)(9)",
    url: "https://delcode.delaware.gov/title29/c069/sc04/index.html",
    checkedOn: "2026-11-28",
    notes: [
      "Delaware's statute asks for no notice: every firm furnishing material or labor under the contract may sue on the bond in the agency's name (§ 6962(d)(9)d).",
      "Both limits count from the prime contractor's day, not yours: three years after the last work was done on the contract, or one year after the contractor ceased work if the bond says so. Read the bond. A suit within a year of your own last day is inside either limit.",
      "This section covers large public works contracts let by a Delaware agency; a limit the section does not provide for, written into the bond, cannot be raised as a defense (§ 6962(d)(9)e).",
    ],
  },
  KS: {
    name: "Kansas",
    law: "K.S.A. 60-1111",
    url: "https://www.ksrevisor.gov/statutes/chapters/ch60/060_011_0011.html",
    checkedOn: "2026-11-28",
    notes: [
      "The statute asks for no notice before suit; the one limit is six months from completion of the public improvement, a day PayApps does not know. Ask the public body when the project was complete, and do not wait for acceptance.",
      "The bond is required on contracts over $100,000 and is filed with the clerk of the district court of the county where the work is (K.S.A. 60-1111(a), (b)): ask the clerk for a copy.",
      "A state contract secured by a certificate of deposit instead of a bond takes a claim with the director of purchases under K.S.A. 60-1112 (K.S.A. 60-1111(c)).",
    ],
  },
  NE: {
    name: "Nebraska",
    law: "Neb. Rev. Stat. §§ 52-118 to 52-118.02",
    url: "https://nebraskalegislature.gov/laws/statutes.php?statute=52-118.01",
    checkedOn: "2026-11-28",
    notes: [
      "A suit may be brought once you are unpaid 90 days after your last day (§ 52-118.01).",
      "The notice goes by registered or certified mail to the contractor's office, place of business or residence, and states the amount claimed and who you worked for (§ 52-118.01).",
      "The suit limit runs from the final settlement of the prime contract (§ 52-118.02), which the Nebraska Supreme Court reads as the public body's recorded finding that the contract is complete and final payment is due: ask the public body for that date.",
      "Bonds are required on state projects over $15,000 and local ones over $10,000 (§ 52-118(2)).",
    ],
  },
  RI: {
    name: "Rhode Island",
    law: "R.I. Gen. Laws §§ 37-12-2, 37-12-5",
    url: "https://webserver.rilegislature.gov/Statutes/TITLE37/37-12/37-12-2.htm",
    checkedOn: "2026-11-28",
    notes: [
      "A suit may be brought once you are unpaid 90 days after your last day (§ 37-12-2).",
      "The notice goes by certified mail to the contractor's office, place of business or residence, and states the amount claimed and who you worked for (§ 37-12-2).",
      "The suit limit is two years, or the bond's own limit if that is longer (§ 37-12-5); PayApps shows the two years.",
    ],
  },
  MT: {
    name: "Montana",
    law: "Mont. Code Ann. §§ 18-2-204, 18-2-206",
    url: "https://mca.legmt.gov/bills/mca/title_0180/chapter_0020/part_0020/section_0040/0180-0020-0020-0040.html",
    checkedOn: "2026-11-28",
    notes: [
      "Everyone the bond covers, first-tier subs included, files the written notice of claim with the public body (not the contractor) within 90 days after the contract is complete and the body accepts the work by affirmative action (§ 18-2-204). The statute gives the form: the public body's name, yours, the amount, the principal and surety, and the work.",
      "A supplier of materials or supplies to a subcontractor also gives the contractor a notice of a right of action on the security, personally or by certified mail, within 30 days after the first delivery (§ 18-2-206); no other kind of notice counts. It does not apply to labor.",
      "Part 2 of Title 18, chapter 2 sets no suit limit of its own; ask a Montana construction attorney which limit applies. Attorney fees go to the prevailing party, but not for a suit brought within 30 days of the notice (§ 18-2-207).",
    ],
  },
  ND: {
    name: "North Dakota",
    law: "N.D. Cent. Code §§ 48-01.2-11, 48-01.2-12",
    url: "https://www.ndlegis.gov/cencode/t48c01-2.pdf",
    checkedOn: "2026-11-28",
    notes: [
      "A suit may be brought once you are unpaid 90 days after your last day (§ 48-01.2-11).",
      "The notice goes by registered mail to the contractor's office, place of business or residence, and states the amount claimed and who you worked for (§ 48-01.2-11).",
      "Bonds are required on public improvements over $250,000 (§ 48-01.2-10). The governing body gives a certified copy of the bond and contract to a claimant who files an affidavit of nonpayment (§ 48-01.2-11).",
    ],
  },
  SC: {
    name: "South Carolina",
    law: "S.C. Code § 11-35-3030(2)(c), (d)",
    url: "https://www.scstatehouse.gov/code/t11c035.php",
    checkedOn: "2026-11-28",
    notes: [
      "A suit may be brought once you are unpaid 90 days after your last day (§ 11-35-3030(2)(c)).",
      "A remote claimant (in contract with a sub or supplier of the bonded contractor) serves the notice personally or by registered or certified mail at the contractor's permanent office or its address on the Department of Labor, Licensing and Regulation's records, stating the amount and who you worked for.",
      "A remote claimant's claim is capped at what the contractor owes the party you worked for, unless you sent the contractor a notice of furnishing (in the form of § 29-5-20(B)) earlier: send one when you start.",
      "This is the State Procurement Code, for state agencies' construction; a county, city or school district with its own procurement code may set its own bond terms. Ask for the bond.",
    ],
  },
  SD: {
    name: "South Dakota",
    law: "S.D. Codified Laws §§ 5-21-1 to 5-21-7",
    url: "https://sdlegislature.gov/Statutes/5-21-6",
    checkedOn: "2026-11-28",
    notes: [
      "South Dakota's statute asks for no notice to the contractor. To sue, apply to the public body with an affidavit that you supplied labor or material and were not paid, and it furnishes a certified copy of the contract and bond (§ 5-21-6).",
      "The suit is brought in the public body's name in the circuit court of the county where the work is, and not until six months after complete performance and final settlement of the contract (unless the public body itself sues sooner); it must then be brought within one year. Only one action is brought: others join it within a year from completion of the work. Ask the public body for its final settlement date.",
      "If the public body took no bond, it is liable itself, but the action must be brought within 90 days from its acceptance of the work (§ 5-21-2).",
    ],
  },
  VA: {
    name: "Virginia",
    law: "Va. Code § 2.2-4341",
    url: "https://law.lis.virginia.gov/vacode/title2.2/chapter43/section2.2-4341/",
    checkedOn: "2026-11-27",
    notes: [
      "A suit may be brought once you are unpaid 90 days after your last day (§ 2.2-4341(A)).",
      "The notice goes by registered or certified mail to the contractor's office. Retainage claims are not subject to the 90-day notice limit (§ 2.2-4341(B)).",
      "A waiver of the right to sue on the bond is void unless written, signed and made after you performed (§ 2.2-4341(D)).",
    ],
  },
  WA: {
    name: "Washington",
    law: "RCW 39.08.030, 39.08.065",
    url: "https://app.leg.wa.gov/rcw/default.aspx?cite=39.08.030",
    checkedOn: "2026-11-27",
    notes: [
      "The notice is filed with the public body, not the contractor, in the form RCW 39.08.030 sets out, and becomes a public record.",
      "Attorney fees are not allowed in a suit brought before 30 days after the notice is filed.",
      "This section states no suit deadline; read the bond and ask a construction attorney.",
    ],
  },
  WY: {
    name: "Wyoming",
    law: "W.S. 16-6-112 to 16-6-117",
    url: "https://wyoleg.gov/statutes/compress/title16.pdf",
    checkedOn: "2026-11-28",
    notes: [
      "The statute asks for no notice before suit, from any tier. When you sue, notify the obligee named in the bond (the public entity) of the action, the parties, the bond and the amount and nature of your claim; no judgment is entered for 30 days after that notice (W.S. 16-6-113).",
      "The suit limit is one year after the date of final completion, which the public entity posts on the state procurement website or its own (W.S. 16-6-115, 16-6-116(a)(iv)): look it up there.",
      "Watch for the notice of substantial completion the public entity publishes for two weeks: on the forty-first day after it the GC is paid its retainage (W.S. 16-6-116(a)(ii), (iii)), so raise an unpaid balance before then.",
      "Before that payment the contractor files a sworn statement that every claim is paid or disputed; a disputed claim may be filed as a claim against the contractor's surety bond (W.S. 16-6-117).",
      "Bonds are required on contracts over $150,000; smaller contracts may carry another guarantee the public entity approves (W.S. 16-6-112(a)).",
    ],
  },
};

export const STATE_BOND_STATES = Object.keys(STATE_BOND_RULES).sort();

function stateBondSteps(state: string, d: BondDays): BondClaimStep[] {
  const L = d.lastOn;
  const A = d.acceptedOn;
  switch (state) {
    case "DC":
      return [
        step(
          {
            who: "not-prime",
            act: "Give the contractor written notice of your claim by registered mail",
            citation: "D.C. Code § 2-201.02(a)",
            rule: `within 90 days from ${LAST}`,
          },
          L,
          days(90),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the payment bond in the name of the District, in the Superior Court",
            citation: "D.C. Code § 2-201.02(b)",
            rule: `within one year after ${LAST}`,
          },
          L,
          addOneYear,
          LAST,
        ),
      ];
    case "OK":
      return [
        step(
          {
            who: "not-prime",
            act: "Give the contractor and the surety written notice of your claim by registered or certified mail",
            citation: "61 O.S. § 2(B)(1)",
            rule: `within 90 days from ${LAST}`,
          },
          L,
          days(90),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "File a claim on the bond, or bring suit on it",
            citation: "61 O.S. § 2(A)",
            rule: `within one year from ${LAST}`,
          },
          L,
          addOneYear,
          LAST,
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the bond, if you filed a claim within the first year",
            citation: "61 O.S. § 2(A), claim filed",
            rule: `within two years from ${LAST}`,
          },
          L,
          (from) => addOneYear(addOneYear(from)),
          LAST,
        ),
      ];
    case "AL":
      return [
        step(
          {
            who: "all",
            act: "Give the surety written notice of the amount and nature of your claim, then bring suit on the payment bond",
            citation: "Ala. Code \u00a7 39-1-1(b)",
            rule: "the suit not until 45 days after the notice to the surety, and within one year from the date of final settlement of the contract",
          },
          null,
          null,
          "the date of final settlement of the contract",
        ),
      ];
    case "AK":
      return [
        step(
          {
            who: "not-prime",
            act: "Give the contractor written notice of your claim by registered mail",
            citation: "AS 36.25.020(b)",
            rule: `within 90 days from ${LAST}`,
          },
          L,
          days(90),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the payment bond in the name of the state or political subdivision",
            citation: "AS 36.25.020(c)",
            rule: "within one year after the date of final settlement of the contract",
          },
          null,
          null,
          "the final settlement of the prime contract",
        ),
      ];
    case "WY":
      return [
        step(
          {
            who: "all",
            act: "Bring suit on the bond, and notify the public entity named in it of the action",
            citation: "W.S. 16-6-113, 16-6-115",
            rule: "within one year after the date of final completion the public entity posts",
          },
          null,
          null,
          "the final completion date the public entity posts",
        ),
      ];
    case "AZ":
      return [
        step(
          {
            who: "not-prime",
            act: "Give the contractor the preliminary twenty-day notice",
            citation: "A.R.S. § 34-223(A)(1), § 33-992.01",
            rule: "as § 33-992.01 provides, at the start of your work",
          },
          null,
          null,
          "the day you first furnished",
        ),
        step(
          {
            who: "not-prime",
            act: "Give the contractor the ninety-day notice",
            citation: "A.R.S. § 34-223(A)(2)",
            rule: `within 90 days after ${LAST}`,
          },
          L,
          days(90),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the payment bond",
            citation: "A.R.S. § 34-223(B)",
            rule: `within one year after ${LAST}`,
          },
          L,
          addOneYear,
          LAST,
        ),
      ];
    case "FL":
      return [
        step(
          {
            who: "not-prime",
            act: "Serve the contractor written notice that you will look to the bond",
            citation: "Fla. Stat. § 255.05(2)(a)2",
            rule: "before, or within 45 days after, you first furnish",
          },
          null,
          null,
          "the day you first furnished",
        ),
        step(
          {
            who: "not-prime",
            act: "Serve a sworn notice of nonpayment on the contractor, with a copy to the surety",
            citation: "Fla. Stat. § 255.05(2)(a)2",
            rule: `no later than 90 days after ${LAST} (and no earlier than 45 days after you first furnished)`,
          },
          L,
          days(90),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "Bring suit against the contractor or the surety",
            citation: "Fla. Stat. § 255.05(10)",
            rule: `within 1 year after ${LAST}`,
          },
          L,
          addOneYear,
          LAST,
        ),
      ];
    case "LA":
      return [
        step(
          {
            who: "all",
            act: "File a sworn statement of the amount due with the public body and record it with the parish recorder of mortgages",
            citation: "La. R.S. 38:2242(B)",
            rule: "after your claim is due and within 45 days after the recordation of the acceptance of the work (or of the notice of default)",
          },
          A,
          days(45),
          ACCEPTED,
        ),
        step(
          {
            who: "not-prime",
            act: "Give the contractor written notice of the amount claimed and who you worked for",
            citation: "La. R.S. 38:2247(A)",
            rule: "within 45 days from the recordation of the notice of acceptance (or of default)",
          },
          A,
          days(45),
          ACCEPTED,
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the payment bond against the surety, the contractor or both",
            citation: "La. R.S. 38:2247(A)",
            rule: "within one year from the registry of acceptance of the work (or of the notice of default)",
          },
          A,
          addOneYear,
          ACCEPTED,
        ),
      ];
    case "MA":
      return [
        step(
          {
            who: "not-prime",
            act: "Give the contractor written notice of your claim",
            citation: "Mass. Gen. Laws ch. 149, § 29, par. 3",
            rule: `within 65 days after ${LAST}`,
          },
          L,
          days(65),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "File a petition in equity to enforce the claim on the bond",
            citation: "Mass. Gen. Laws ch. 149, § 29, par. 2(a)",
            rule: `within one year after ${LAST}`,
          },
          L,
          addOneYear,
          LAST,
        ),
      ];
    case "ID":
      return [
        step(
          {
            who: "not-prime",
            act: "Give the contractor written notice of your claim",
            citation: "Idaho Code § 54-1927",
            rule: `within 90 days from ${LAST}`,
          },
          L,
          days(90),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the payment bond",
            citation: "Idaho Code § 54-1927 (limitation)",
            rule: `within one year from ${LAST} (a sub of the prime: from the day final payment under the subcontract became due)`,
          },
          L,
          addOneYear,
          LAST,
        ),
      ];
    case "CA": {
      // § 9356(a): 30 days after a recorded notice of completion, which may be recorded the day of
      // completion: the earliest the stop payment notice period can end, counted from acceptance.
      const spnEnds = A ? addDays(A, 30) : null;
      const PERIOD =
        "the end of the stop payment notice period (30 days after acceptance at the earliest)";
      return [
        step(
          {
            who: "not-prime",
            act: "Give the preliminary notice to the public body and the direct contractor",
            citation: "Cal. Civ. Code §§ 9300, 9304",
            rule: "when you start: a stop payment notice or bond claim covers only work provided within 20 days before it is given and after",
          },
          null,
          null,
          "the day you first furnished",
        ),
        step(
          {
            who: "all",
            act: "Give the public body a stop payment notice",
            citation: "Cal. Civ. Code § 9356",
            rule: `within 30 days after a notice of completion is recorded, or 90 days after completion if none is; dated from ${ACCEPTED}, the earliest`,
          },
          A,
          days(30),
          ACCEPTED,
        ),
        step(
          {
            who: "all",
            act: "Sue the public body and the direct contractor to enforce the stop payment notice",
            citation: "Cal. Civ. Code § 9502(a), (b)",
            rule: "at least 10 days after giving the notice, and not later than 90 days after the stop payment notice period ends",
          },
          spnEnds,
          days(90),
          PERIOD,
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the payment bond",
            citation: "Cal. Civ. Code § 9558",
            rule: "any time after you stop providing work, and not later than six months after the stop payment notice period ends",
          },
          spnEnds,
          (iso) => addMonths(iso, 6),
          PERIOD,
        ),
      ];
    }
    case "CO": {
      const SETTLED = "the final settlement date the public body publishes";
      return [
        step(
          {
            who: "all",
            act: "File a verified statement of the amount due with the public body that awarded the contract",
            citation: "C.R.S. § 38-26-107(1)",
            rule: "at any time up to and including the time of final settlement",
          },
          null,
          null,
          SETTLED,
        ),
        step(
          {
            who: "all",
            act: "Bring suit against the surety on the bond, and file a notice of lis pendens with the public body",
            citation: "C.R.S. § 38-26-107(2), (3)",
            rule: "within 90 days following the date fixed for final settlement as published",
          },
          null,
          null,
          SETTLED,
        ),
      ];
    }
    case "IA":
      return [
        step(
          {
            who: "not-prime",
            act: "Give the principal contractor a one-time written notice of your name, mailing address and telephone number and the subcontractor you work for",
            citation: "Iowa Code § 573.15(1)",
            rule: "within 30 days of first performing labor or furnishing material",
          },
          null,
          null,
          "your first day of labor or material",
        ),
        step(
          {
            who: "all",
            act: "File an itemized, sworn, written statement of your claim with the officer or board that let the contract",
            citation: "Iowa Code § 573.10(1)",
            rule: "before the end of the 30 days immediately following completion and final acceptance of the improvement",
          },
          A,
          days(30),
          ACCEPTED,
        ),
        step(
          {
            who: "all",
            act: "Bring an action in equity to adjudicate the retained fund or enforce the bond",
            citation: "Iowa Code § 573.16(1)",
            rule: "after 30 and not later than 60 days following completion and final acceptance of the improvement",
          },
          A,
          days(60),
          ACCEPTED,
        ),
      ];
    case "ME":
      return [
        step(
          {
            who: "not-prime",
            act: "Give the contractor written notice of your claim",
            citation: "14 M.R.S. § 871(4)",
            rule: `within 90 days from ${LAST}`,
          },
          L,
          days(90),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the payment bond",
            citation: "14 M.R.S. § 871(4)",
            rule: `not after one year from ${LAST}`,
          },
          L,
          addOneYear,
          LAST,
        ),
      ];
    case "MD":
      return [
        step(
          {
            who: "not-prime",
            act: "Give the contractor written notice of your claim",
            citation: "Md. Code, State Fin. & Proc. § 17-108(b)",
            rule: `within 90 days after ${LAST}`,
          },
          L,
          days(90),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the payment bond",
            citation: "Md. Code, State Fin. & Proc. § 17-109(b)",
            rule: "within 1 year after the public body finally accepts the work",
          },
          A,
          addOneYear,
          ACCEPTED,
        ),
      ];
    case "MO":
      return [
        step(
          {
            who: "not-prime",
            act: "Remote material suppliers: give the contractor written notice that you have not been paid",
            citation: "Mo. Rev. Stat. § 107.170.2",
            rule: `within ninety days of ${LAST}`,
          },
          L,
          days(90),
          LAST,
        ),
      ];
    case "MI":
      return [
        step(
          {
            who: "not-prime",
            act: "Serve the principal contractor a notice of what you furnish, for whom, and where",
            citation: "MCL 129.207(a)",
            rule: "within 30 days after you first furnished",
          },
          null,
          null,
          "the day you first furnished",
        ),
        step(
          {
            who: "not-prime",
            act: "Give the principal contractor and the governmental unit written notice of your claim",
            citation: "MCL 129.207(b)",
            rule: `within 90 days from ${LAST}`,
          },
          L,
          days(90),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the payment bond",
            citation: "MCL 129.209",
            rule: "within one year from the day final payment was made to the principal contractor",
          },
          null,
          null,
          "the day the public body made final payment to the prime",
        ),
      ];
    case "MN":
      return [
        step(
          {
            who: "all",
            act: "Serve the surety and the contractor a written notice of claim on the payment bond",
            citation: "Minn. Stat. § 574.31, subd. 2(a)",
            rule: `within 120 days after ${LAST}`,
          },
          L,
          days(120),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "Bring suit against the surety on the bond",
            citation: "Minn. Stat. § 574.31, subd. 2(c)",
            rule: `within one year from ${LAST}`,
          },
          L,
          addOneYear,
          LAST,
        ),
      ];
    case "NV":
      return [
        step(
          {
            who: "not-prime",
            act: "Serve the contractor a notice of what you furnish, for whom, and where",
            citation: "NRS 339.035(2)(a)",
            rule: "within 30 days after you first furnished",
          },
          null,
          null,
          "the day you first furnished",
        ),
        step(
          {
            who: "not-prime",
            act: "Give the contractor written notice of your claim",
            citation: "NRS 339.035(2)(b)",
            rule: `within 90 days from ${LAST}`,
          },
          L,
          days(90),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the payment bond",
            citation: "NRS 339.055(2)",
            rule: `within one year from ${LAST}`,
          },
          L,
          addOneYear,
          LAST,
        ),
      ];
    case "OR":
      return [
        step(
          {
            who: "all",
            act: "Give the contractor and the contracting agency written notice of claim",
            citation: "ORS 279C.600(1)(b), 279C.605(1)",
            rule: `no later than 180 days after ${LAST}`,
          },
          L,
          days(180),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the payment bond",
            citation: "ORS 279C.610(3)",
            rule: `no later than two years after ${LAST}`,
          },
          L,
          (from) => addOneYear(addOneYear(from)),
          LAST,
        ),
      ];
    case "NC":
      return [
        step(
          {
            who: "not-prime",
            act: "Serve the contractor a notice of public subcontract (needed for the part of a claim over $20,000)",
            citation: "N.C. Gen. Stat. § 44A-27(b), (d), (e)",
            rule: "as early as you can: that part of the claim reaches back only 75 days before it is served",
          },
          null,
          null,
          "the day you first furnished",
        ),
        step(
          {
            who: "not-prime",
            act: "Give the contractor written notice of claim on the payment bond",
            citation: "N.C. Gen. Stat. § 44A-27(b)",
            rule: `within 120 days from ${LAST}`,
          },
          L,
          days(120),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the payment bond",
            citation: "N.C. Gen. Stat. § 44A-28(b)",
            rule: `one year from ${LAST} (or from final settlement with the contractor, if later)`,
          },
          L,
          addOneYear,
          LAST,
        ),
      ];
    case "NY":
      return [
        step(
          {
            who: "not-prime",
            act: "Give the contractor written notice of your claim",
            citation: "N.Y. State Fin. Law § 137(3)",
            rule: `within 120 days from ${LAST}`,
          },
          L,
          days(120),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the payment bond",
            citation: "N.Y. State Fin. Law § 137(4)(b)",
            rule: "within one year from the day the public improvement was completed and accepted by the public owner",
          },
          A,
          addOneYear,
          ACCEPTED,
        ),
      ];
    case "OH":
      return [
        step(
          {
            who: "not-prime",
            act: "Serve the principal contractor a notice of furnishing (labor or materials over $30,000)",
            citation: "Ohio Rev. Code § 153.56(C), § 1311.261",
            rule: "when you start: recovery reaches back only 21 days before it is served",
          },
          null,
          null,
          "the day you first furnished",
        ),
        step(
          {
            who: "all",
            act: "Furnish the sureties a statement of the amount due",
            citation: "Ohio Rev. Code § 153.56(A)",
            rule: "not later than 90 days after the contract's completion and the public improvement's acceptance",
          },
          A,
          days(90),
          ACCEPTED,
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the bond",
            citation: "Ohio Rev. Code § 153.56(B)",
            rule: "not later than one year from the public improvement's acceptance",
          },
          A,
          addOneYear,
          ACCEPTED,
        ),
      ];
    case "TX":
      return [
        step(
          {
            who: "not-prime",
            act: "Mail the prime contractor written notice of the unpaid claim",
            citation: "Tex. Gov't Code § 2253.047(c)",
            rule: `the 15th day of the 2nd month after the month of ${LAST}`,
          },
          L,
          (from) => day15MonthsAfter(from, 2),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "Mail the prime contractor and the surety notice of the claim with a sworn statement of account",
            citation: "Tex. Gov't Code § 2253.041",
            rule: `the 15th day of the 3rd month after the month of ${LAST}`,
          },
          L,
          (from) => day15MonthsAfter(from, 3),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "Mail the prime contractor and the surety notice of a retainage claim",
            citation: "Tex. Gov't Code § 2253.046",
            rule: "on or before the 90th day after final completion of the public work contract (not needed if a prior claim included it)",
          },
          A,
          days(90),
          "the day the public work contract was finally completed",
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the payment bond",
            citation: "Tex. Gov't Code § 2253.078(b)",
            rule: "before the first anniversary of the day the notice of claim was mailed",
          },
          null,
          null,
          "the day you mail the notice",
        ),
      ];
    case "UT":
      return [
        step(
          {
            who: "all",
            act: "File a preliminary notice with the State Construction Registry",
            citation: "Utah Code § 38-1b-202(1)",
            rule: "by the later of 20 days after you start work and 20 days after the notice of commencement is filed",
          },
          null,
          null,
          "the day you started work",
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the payment bond",
            citation: "Utah Code § 63G-6a-1103(4)(c)",
            rule: `within one year after ${LAST}`,
          },
          L,
          addOneYear,
          LAST,
        ),
      ];
    case "DE":
      return [
        step(
          {
            who: "all",
            act: "Bring suit on the payment bond in the agency's name",
            citation: "29 Del. C. § 6962(d)(9)d",
            rule: "within 3 years after the last work was done on the contract (1 year after the contractor ceased work, if the bond provides it)",
          },
          null,
          null,
          "the last day of work on the prime contract",
        ),
      ];
    case "KS":
      return [
        step(
          {
            who: "all",
            act: "Bring suit on the bond",
            citation: "K.S.A. 60-1111(b)",
            rule: "no later than six months from the completion of the public improvement",
          },
          null,
          null,
          "the day the public improvement was completed",
        ),
      ];
    case "NE":
      return [
        step(
          {
            who: "not-prime",
            act: "Give the contractor written notice of your claim",
            citation: "Neb. Rev. Stat. § 52-118.01",
            rule: `within four months from ${LAST}`,
          },
          L,
          (from) => addMonths(from, 4),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the payment bond",
            citation: "Neb. Rev. Stat. § 52-118.02",
            rule: "within one year after the date of final settlement of the principal contract",
          },
          null,
          null,
          "the final settlement of the prime contract",
        ),
      ];
    case "RI":
      return [
        step(
          {
            who: "not-prime",
            act: "Give the contractor written notice of your claim",
            citation: "R.I. Gen. Laws § 37-12-2",
            rule: `within 90 days from ${LAST}`,
          },
          L,
          days(90),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the payment bond",
            citation: "R.I. Gen. Laws § 37-12-5",
            rule: `within two years after ${LAST} (or the bond's limit, if longer)`,
          },
          L,
          (from) => addOneYear(addOneYear(from)),
          LAST,
        ),
      ];
    case "MT":
      return [
        step(
          {
            who: "not-prime",
            act: "Give the contractor a notice of a right of action on the security (material suppliers to a sub)",
            citation: "Mont. Code Ann. § 18-2-206",
            rule: "not later than 30 days after your first delivery to the subcontractor, personally or by certified mail",
          },
          null,
          null,
          "the day you first furnished",
        ),
        step(
          {
            who: "all",
            act: "File a written notice of your claim with the public body",
            citation: "Mont. Code Ann. § 18-2-204",
            rule: "within 90 days after completion of the contract with the public body's acceptance of the work",
          },
          A,
          days(90),
          ACCEPTED,
        ),
      ];
    case "ND":
      return [
        step(
          {
            who: "not-prime",
            act: "Give the contractor written notice of your claim",
            citation: "N.D. Cent. Code § 48-01.2-11",
            rule: `within 90 days from ${LAST}, by registered mail`,
          },
          L,
          days(90),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the bond",
            citation: "N.D. Cent. Code § 48-01.2-12",
            rule: "within one year after completion and acceptance of the project",
          },
          A,
          addOneYear,
          ACCEPTED,
        ),
      ];
    case "SC":
      return [
        step(
          {
            who: "not-prime",
            act: "Give the contractor written notice of the amount unpaid and who you worked for",
            citation: "S.C. Code § 11-35-3030(2)(c)",
            rule: `within 90 days from ${LAST}`,
          },
          L,
          days(90),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the payment bond",
            citation: "S.C. Code § 11-35-3030(2)(d)",
            rule: `within one year after ${LAST}`,
          },
          L,
          addOneYear,
          LAST,
        ),
      ];
    case "SD":
      return [
        step(
          {
            who: "all",
            act: "Bring suit on the bond in the public body's name, after asking it for a certified copy",
            citation: "S.D. Codified Laws § 5-21-6",
            rule: "not before six months after complete performance and final settlement of the contract, and within one year after that",
          },
          null,
          null,
          "the final settlement of the prime contract",
        ),
      ];
    case "VA":
      return [
        step(
          {
            who: "not-prime",
            act: "Give the contractor written notice of your claim",
            citation: "Va. Code § 2.2-4341(B)",
            rule: `within 90 days from ${LAST}`,
          },
          L,
          days(90),
          LAST,
        ),
        step(
          {
            who: "all",
            act: "Bring suit on the payment bond",
            citation: "Va. Code § 2.2-4341(C)",
            rule: `within one year after ${LAST}`,
          },
          L,
          addOneYear,
          LAST,
        ),
      ];
    case "WA":
      return [
        step(
          {
            who: "not-prime",
            act: "Material suppliers to a subcontractor: notify the contractor that you have started to deliver and will hold its bond",
            citation: "RCW 39.08.065",
            rule: "not later than 10 days after your first delivery",
          },
          null,
          null,
          "the day of your first delivery",
        ),
        step(
          {
            who: "all",
            act: "File a notice of claim with the public body",
            citation: "RCW 39.08.030(1)",
            rule: "within 30 days after completion of the contract with acceptance of the work by the public body",
          },
          A,
          days(30),
          ACCEPTED,
        ),
      ];
    default:
      return [];
  }
}

export type StateBondCheck =
  | { kind: "unsupported"; state: string }
  | {
      kind: "checked";
      state: string;
      rule: StateBondRule;
      /** The steps that apply to this company's tier, in the statute's order. */
      steps: BondClaimStep[];
      /** The dated steps, earliest first (the next one to act on leads). */
      dated: BondClaimStep[];
      notes: string[];
    };

/**
 * The payment bond claim steps on a state or local public job. `tier` is who the company
 * contracted with (the same field as the Miller Act's); null shows the notices, the safe side.
 */
export function stateBondClaim(
  state: string | null | undefined,
  input: { tier: MillerTier | null; lastFurnishedOn: string | null; acceptedOn: string | null },
): StateBondCheck | null {
  const s = state?.trim().toUpperCase();
  if (!s) return null;
  const rule = STATE_BOND_RULES[s];
  if (!rule) return { kind: "unsupported", state: s };
  const all = stateBondSteps(s, { lastOn: input.lastFurnishedOn, acceptedOn: input.acceptedOn });
  const steps = input.tier === "first" ? all.filter((x) => x.who === "all") : all;
  const dated = steps
    .filter((x) => x.dueOn !== null)
    .sort((a, b) => (a.dueOn as string).localeCompare(b.dueOn as string));
  const notes = [...rule.notes];
  if (input.tier === null) {
    notes.unshift(
      "Who did you contract with? The notices marked for those not in contract with the prime apply only if you contracted with a subcontractor; PayApps shows them until you say, since sending them never hurts.",
    );
  }
  if (input.tier === "remote" && rule.anyTier) {
    notes.unshift(rule.anyTier);
  } else if (input.tier === "remote") {
    notes.unshift(
      `${rule.name}'s statute names claimants who contracted with the prime or with a subcontractor. Whether one further down the chain is covered turns on how the state reads "subcontractor": PayApps shows the subcontractor's steps, and a construction attorney can say if the bond reaches you.`,
    );
  }
  return { kind: "checked", state: s, rule, steps, dated, notes };
}
