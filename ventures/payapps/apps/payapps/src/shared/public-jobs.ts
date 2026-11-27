// Public jobs: what changes when the owner is a government body rather than a private one.
//
// 1. No lien. Public property cannot be liened, so a sub's security on a public job is the prime's
//    payment bond. On a federal job that bond is the Miller Act's (40 U.S.C. 3131-3134), whose two
//    dates PayApps counts here: the 90-day notice a second-tier claimant gives the prime, and the
//    one-year limit on the suit. They take the lien deadline's place on the job page, the cash page
//    and the weekly email. State and local jobs have each state's own bond law ("little Miller
//    Act"): there it shows no lien date, and lists the bond claim steps in the eight states of
//    STATE_BOND_RULES (stateBondClaim, at the end of this file) on the job page.
// 2. Retainage caps. Many states cap the retainage a public owner may hold. The job's rates are
//    checked against the cap in the 16 states the public guide lists.
//
// Sources. Miller Act rules ported from ventures/pay-app-guides/millerbond.mjs (40 U.S.C. 3131 and
// 3133 read on govinfo.gov and law.cornell.edu on 2026-11-25; J.W. Bateson Co. v. United States,
// 434 U.S. 586 (1978)). Retainage caps from the table in
// ventures/pay-app-guides/retainage-explained.html ("Retainage caps on public construction, 16
// states"), read on each legislature's own site on 2026-11-24 and 2026-11-25; that page says which
// rows were re-read from the statute page itself. Statutes change and have exceptions not modeled
// here: every result carries its citation and link, and the panel says it is not legal advice.
//
// Day counting (as the public calculator): 90 calendar days starting the day after the last day,
// and a year as the same calendar date a year later (29 February to 28 February, the earlier
// date). A date on a weekend moves back to the Friday before, the same safe side the lien deadline
// takes. Pure functions, no I/O.

// Small date helpers kept here (not imported from lien-deadline.ts, which imports this file).
const DAY_MS = 86_400_000;
const addDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
function businessDayOnOrBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 6 ? addDays(iso, -1) : d === 0 ? addDays(iso, -2) : iso;
}

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
  /** The notice date, or the Friday before it on a weekend. */
  noticeDueOn: string | null;
  /** The first day a suit may be filed: day 91 (§ 3133(b)(1)). */
  suitFromOn: string;
  /** The one-year limit on the suit (§ 3133(b)(4)), statute's date. */
  suitByOn: string;
  /** The suit limit, or the Friday before it on a weekend. */
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

const pct = (bps: number) => `${bps % 100 === 0 ? bps / 100 : (bps / 100).toFixed(2)}%`;

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
// A date on a weekend moves back to the Friday before (the safe side); holidays are not modeled.

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
  /** statutoryOn, or the Friday before it on a weekend. */
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
};

export const STATE_BOND_STATES = Object.keys(STATE_BOND_RULES).sort();

function stateBondSteps(state: string, d: BondDays): BondClaimStep[] {
  const L = d.lastOn;
  const A = d.acceptedOn;
  switch (state) {
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
  if (input.tier === "remote") {
    notes.unshift(
      `${rule.name}'s statute names claimants who contracted with the prime or with a subcontractor. Whether one further down the chain is covered turns on how the state reads "subcontractor": PayApps shows the subcontractor's steps, and a construction attorney can say if the bond reaches you.`,
    );
  }
  return { kind: "checked", state: s, rule, steps, dated, notes };
}
