// Core date arithmetic for the mechanics-lien deadline calculator. No network
// calls: this applies published state preliminary-notice and lien-filing
// timing rules to the dates the user supplies. It is NOT legal advice and
// not a full lien analysis -- see README "What this does not cover".
//
// Figures verified 2026-09-30 via WebSearch against lien-service explainers
// and law-firm guides that agree with each other for each state (Levelset,
// Siteline, Sunray, mechanicslien.com, Florida Hard Hat Law, Stone LLP and
// others), for a subcontractor or material supplier who contracts with the
// general contractor (a first-tier claimant); the tier split below was
// added 2026-11-16 from the same kind of sources (statute hosts were not
// reachable from the session that added it):
//
//   - California: preliminary notice within 20 days after first furnishing
//     labor or materials. Claim of lien recorded within 90 days after
//     completion of the work of improvement, or within 30 days after the
//     owner records a notice of completion, whichever applies first
//     (Cal. Civ. Code §§ 8204, 8414; corrected 2026-11-25, see below).
//   - Texas (original contracts from 2022-01-01, HB 2237): commercial
//     (non-residential) -- a "notice of claim for unpaid labor or
//     materials" to owner and original contractor by the 15th day of the
//     3rd month after each month work was performed and unpaid, the same for
//     every tier; lien
//     affidavit by the 15th day of the 4th month after the month the
//     claimant last furnished. Residential -- notice by the 15th day of the
//     2nd month; lien affidavit by the 15th day of the 3rd month
//     (Tex. Prop. Code ch. 53).
//   - Florida: Notice to Owner within 45 days after first furnishing (and in
//     any case before the owner's final payment to the contractor); claim of
//     lien within 90 days after the claimant's last furnishing
//     (Fla. Stat. §§ 713.06, 713.08).
//   - Arizona: preliminary 20-day notice within 20 days after first
//     furnishing; lien recorded within 120 days after completion of the
//     project as a whole, or within 60 days after a recorded notice of
//     completion (Ariz. Rev. Stat. §§ 33-992.01, 33-993).
//   - Georgia (added 2026-11-03; law-firm and lien-service explainers agree,
//     statute text not opened): notice to contractor, required only of a
//     claimant without privity with the contractor, within 30 days of the
//     later of first furnishing and the notice of commencement (modeled from
//     first furnishing, the earlier and safe reading); claim of lien within
//     90 days after last furnishing (O.C.G.A. §§ 44-14-361.1, 44-14-361.5).
//     Utah and Nevada were searched the same day and left out: sources
//     conflicted on residential and notice-of-completion timing.
//   - Washington: preliminary notice within 60 days after first furnishing
//     on commercial work, 10 days on new single-family residential work;
//     claim of lien within 90 days after last furnishing
//     (Wash. Rev. Code §§ 60.04.031, 60.04.091).
//
// Statute check, 2026-11-25. Each state's timing was compared with the
// statute text on the legislature's own site (or Justia's copy of the code
// for Georgia and Colorado), read through search results limited to those
// domains because the session could not load the hosts directly. Matched as
// written: Texas (HB 2237 enrolled text), Florida 713.06 and 713.08(5),
// Arizona 33-992.01 and 33-993, Georgia 44-14-361.1 and 44-14-361.5,
// Colorado 38-22-109. Changed:
//   - California: the lien clock for a subcontractor or supplier is § 8414
//     (claimants other than a direct contractor), not § 8412 (direct
//     contractors, whose notice-of-completion window is 60 days, not 30).
//     The 90/30-day dates were right; the citation was not.
//   - Washington: RCW 60.04.031(2)(c) exempts a subcontractor who contracts
//     directly with the prime contractor from the notice, except on repair,
//     alteration or remodel of an existing owner-occupied single-family home
//     or garage (subsection (3)(b)). The tool asked every tier for a notice.
//   - Late notices: California (§ 8204), Arizona (33-992.01) and Washington
//     (60.04.031) let a notice be given late; it then protects only work
//     furnished in the 20 (CA, AZ) or 60 (WA; 10 on a new single-family
//     home) days before it was given, and everything after. Florida says a
//     missing or late Notice to Owner is a complete defense to the lien
//     (713.06(2)(a)). The result now says which, and for the look-back
//     states gives the earliest work date a notice served today still
//     covers.
//
// Where a rule runs from project completion and the user does not supply it,
// the claimant's own last furnishing date is used instead. Completion can
// only be the same or later, so that yields the same or an EARLIER date --
// the safe direction for a deadline. The result says when it did this.
//
// Claimant tier (added 2026-11-16, quality fix): first tier contracts with the
// general contractor, second tier with a subcontractor or supplier. Of the
// modeled states Georgia's notice turns on it (required only without
// privity with the contractor), and since the 2026-11-25 statute check so
// does Washington's (RCW 60.04.031(2)(c)); Ohio's turns on privity with the
// owner and is shown as a caveat; California, Arizona, Florida and
// Colorado give the same clocks to both tiers, and Texas does too for
// original contracts signed from 2022-01-01 (HB 2237 removed the old
// second-tier 2nd-month notice). Texas notices are listed month by month.
//
// Not modeled: third-tier claimants (often no lien rights at all), residential homestead variations beyond the two
// Texas/Washington splits, public-project bond-claim rules, retainage,
// weekend and holiday extensions, contractual notice requirements, notice
// content and delivery method, lien foreclosure / suit deadlines, and
// anything enacted after the verification date above.

export const STATE_RULES = {
  CA: {
    name: "California",
    citation: "Cal. Civ. Code §§ 8204, 8414",
    sources: [
      { label: "Civ. Code § 8204 (preliminary notice)", url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=8204." },
      { label: "Civ. Code § 8414 (claimant other than a direct contractor)", url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=8414." },
    ],
    prelim: { type: "days_after_first", days: 20, lookback: true },
    lien: {
      type: "earlier_of_completion",
      completionDays: 90,
      noticeOfCompletionDays: 30,
    },
    lienLabel: "record a claim of lien",
    prelimLabel: "preliminary notice",
  },
  TX: {
    name: "Texas",
    citation: "Tex. Prop. Code ch. 53",
    sources: [
      { label: "Property Code ch. 53", url: "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.53.htm" },
      { label: "HB 2237 (2021), enrolled text", url: "https://capitol.texas.gov/tlodocs/87R/billtext/pdf/HB02237F.pdf" },
    ],
    prelimByProject: {
      commercial: { type: "month_day15", monthsAfter: 3 },
      residential: { type: "month_day15", monthsAfter: 2 },
    },
    lienByProject: {
      commercial: { type: "month_day15_from_last", monthsAfter: 4 },
      residential: { type: "month_day15_from_last", monthsAfter: 3 },
    },
    lienLabel: "file a lien affidavit",
    prelimLabel: "notice of claim for unpaid labor or materials",
    monthlyNotice: true,
  },
  FL: {
    name: "Florida",
    citation: "Fla. Stat. §§ 713.06, 713.08",
    sources: [
      { label: "§ 713.06 (Notice to Owner)", url: "https://www.flsenate.gov/Laws/Statutes/2025/713.06" },
      { label: "§ 713.08 (claim of lien)", url: "https://www.flsenate.gov/Laws/Statutes/2025/713.08" },
    ],
    prelim: { type: "days_after_first", days: 45, lateFatal: "Florida makes a missing or late Notice to Owner a complete defense to enforcement of the lien (Fla. Stat. § 713.06(2)(a))." },
    lien: { type: "days_after_last", days: 90 },
    lienLabel: "record a claim of lien",
    prelimLabel: "Notice to Owner",
    prelimExtra: "Also must go out before the owner makes final payment to the contractor, which can be earlier than this date.",
  },
  AZ: {
    name: "Arizona",
    citation: "Ariz. Rev. Stat. §§ 33-992.01, 33-993",
    sources: [
      { label: "§ 33-992.01 (preliminary twenty day notice)", url: "https://www.azleg.gov/ars/33/00992-01.htm" },
      { label: "§ 33-993 (notice and claim of lien)", url: "https://www.azleg.gov/ars/33/00993.htm" },
    ],
    prelim: { type: "days_after_first", days: 20, lookback: true },
    lien: {
      type: "earlier_of_completion",
      completionDays: 120,
      noticeOfCompletionDays: 60,
    },
    lienLabel: "record a lien",
    prelimLabel: "20-day preliminary notice",
  },
  GA: {
    name: "Georgia",
    citation: "O.C.G.A. §§ 44-14-361.1, 44-14-361.5",
    sources: [
      { label: "§ 44-14-361.1 (claim of lien), Justia copy", url: "https://law.justia.com/codes/georgia/title-44/chapter-14/article-8/part-3/section-44-14-361-1/" },
      { label: "§ 44-14-361.5 (notice to contractor), Justia copy", url: "https://law.justia.com/codes/georgia/title-44/chapter-14/article-8/part-3/section-44-14-361-5/" },
    ],
    prelimByTier: {
      // A Notice to Contractor is required only of a claimant without privity
      // with the contractor (e.g. a sub-subcontractor or a supplier to a
      // subcontractor), and only where a notice of commencement was filed
      // (O.C.G.A. § 44-14-361.5; checked 2026-11-16 against secondary
      // sources, statute host not reachable from the session).
      first: { type: "not_required", reason: "Georgia requires a Notice to Contractor only from claimants who do not contract directly with the general contractor (sub-subcontractors and suppliers to subcontractors). You contract with the general contractor, so no Notice to Contractor is required of you; the lien date below still applies." },
      second: { type: "days_after_first", days: 30 },
    },
    lien: { type: "days_after_last", days: 90 },
    lienLabel: "record a claim of lien",
    prelimLabel: "Notice to Contractor",
    prelimExtraTier: "second",
    prelimExtra: "The statute counts 30 days from the later of first furnishing and the owner's recorded notice of commencement, so the true date can be later than this one; this date is the safe, earlier reading. The recorded lien must also be served on the owner within 2 business days, and suit filed within 365 days of recording. No Notice to Contractor is needed at all on a project where no notice of commencement was filed.",
  },
  WA: {
    name: "Washington",
    citation: "Wash. Rev. Code §§ 60.04.031, 60.04.091",
    sources: [
      { label: "RCW 60.04.031 (notice of right to claim a lien)", url: "https://app.leg.wa.gov/RCW/default.aspx?cite=60.04.031" },
      { label: "RCW 60.04.091 (recording the claim)", url: "https://app.leg.wa.gov/RCW/default.aspx?cite=60.04.091" },
    ],
    // RCW 60.04.031(2)(c): no notice is owed by a subcontractor who contracts
    // directly with the prime contractor, except on repair, alteration or
    // remodel of an existing owner-occupied single-family home or garage
    // ((3)(b)). The notice may be given at any time but protects only work
    // supplied in the 60 days before it (10 on new single-family homes).
    prelimByTierProject: {
      first: {
        commercial: { type: "not_required", reason: "Washington does not require a notice of right to claim a lien from a subcontractor who contracts directly with the prime contractor (RCW 60.04.031(2)(c)). The one exception is repair, alteration or remodel of an existing owner-occupied single-family home or its garage (subsection (3)(b)); if that is this job, choose residential. The lien date below still applies." },
        residential: { type: "days_after_first", days: 60, lookback: true, note: "Hired by the prime contractor, you owe this notice only if the job is repair, alteration or remodel of an existing owner-occupied single-family home or its garage (RCW 60.04.031(2)(c) and (3)(b)); on new construction you owe none. On such a remodel the notice protects work supplied in the 60 days before it was given." },
      },
      second: {
        commercial: { type: "days_after_first", days: 60, lookback: true },
        residential: { type: "days_after_first", days: 10, lookback: true },
      },
    },
    lien: { type: "days_after_last", days: 90 },
    lienLabel: "record a claim of lien",
    prelimLabel: "preliminary notice",
    residentialNote: "10 days applies to new single-family residential construction; other residential work follows the 60-day rule -- confirm which applies.",
    residentialNoteTier: "second",
  },
};

STATE_RULES.CO = {
  name: "Colorado",
  citation: "Colo. Rev. Stat. § 38-22-109",
  sources: [
    { label: "§ 38-22-109 (lien statement), Justia copy", url: "https://law.justia.com/codes/colorado/title-38/liens/article-22/section-38-22-109/" },
  ],
  // Colorado has no early preliminary notice for private work. The step
  // before filing is a notice of intent to lien, served at least 10 days
  // before the lien statement is filed; it is modeled as that date.
  prelim: { type: "days_before_lien", days: 10 },
  lien: { type: "months_after_last", months: 4 },
  lienLabel: "record a lien statement",
  prelimLabel: "notice of intent to lien",
  prelimExtra: "Colorado has no early preliminary notice on private work; the date shown is the last day to serve the notice of intent (10 days before the lien deadline). Two other clocks can apply: a claim for labor only, paid by the day or piece, must be recorded within 2 months after completion (§ 38-22-109(4)), and a lien recorded more than 2 months after completion of a one- or two-family home does not bind a later good-faith buyer (§ 38-22-125). A notice of completion or extension under § 38-22-109(10) can also change the date; confirm with the statute.",
};

// Added 2026-11-25. Each rule was read in the state legislature's own text,
// through web-search results limited to the official site (the session's
// network policy blocked direct page loads of ncleg.gov, nysenate.gov and
// codes.ohio.gov):
//   - North Carolina, G.S. 44A-12(b): claim of lien "not later than 120 days
//     after the last furnishing of labor or materials at the site of the
//     improvement by the person claiming the lien". G.S. 44A-11.2(l): on an
//     improvement subject to G.S. 44A-11.1 (one with a designated lien agent),
//     the claimant may perfect a lien only if the lien agent received a Notice
//     to Lien Agent no later than 15 days after first furnishing, or before a
//     later mortgage, deed of trust or sale was recorded.
//   - New York, Lien Law § 10(1): notice of lien during the work or "within
//     eight months after the completion of the contract, or the final
//     performance of the work, or the final furnishing of the materials";
//     four months where the improvement is a single family dwelling. New York
//     has no preliminary notice on private work. A bill to lengthen both
//     periods (A10348, 2026) was only in committee when read.
//   - Ohio, R.C. 1311.06(B): affidavit within 60 days of the claimant's last
//     labor or materials for a one- or two-family dwelling or a residential
//     condominium unit, 75 days otherwise. R.C. 1311.05: a subcontractor or
//     supplier without privity with the owner serves a notice of furnishing
//     within 21 days of first furnishing where a notice of commencement was
//     recorded; it does not apply under a home construction contract.
STATE_RULES.NC = {
  name: "North Carolina",
  citation: "N.C. Gen. Stat. §§ 44A-11.2, 44A-12",
  sources: [
    { label: "G.S. 44A-11.2 (Notice to Lien Agent)", url: "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_44A/GS_44A-11.2.html" },
    { label: "G.S. 44A-12 (claim of lien)", url: "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_44A/GS_44A-12.html" },
  ],
  prelim: { type: "days_after_first", days: 15 },
  lien: { type: "days_after_last", days: 120 },
  lienLabel: "file a claim of lien on real property",
  prelimLabel: "Notice to Lien Agent",
  prelimExtra: "The 15-day Notice to Lien Agent is needed only on a project that has a designated lien agent (G.S. 44A-11.1). Notice after 15 days can still protect the lien if the lien agent receives it before a later mortgage, deed of trust or sale is recorded, so a late notice is worth sending, but the 15-day date is the safe one. Enforcement suit is due within 180 days after your last furnishing.",
};

STATE_RULES.NY = {
  name: "New York",
  citation: "N.Y. Lien Law § 10",
  sources: [
    { label: "Lien Law § 10 (filing of notice of lien)", url: "https://www.nysenate.gov/legislation/laws/LIE/10" },
  ],
  prelim: { type: "not_required", reason: "New York has no preliminary notice on private projects; the notice of lien below is the only filing deadline this tool shows." },
  lienByProject: {
    commercial: { type: "months_after_last", months: 8 },
    residential: { type: "months_after_last", months: 4 },
  },
  lienLabel: "file a notice of lien",
  prelimLabel: "preliminary notice",
  residentialNote: "The 4-month period applies to an improvement to a single family dwelling (not a unit a developer still holds in a filed subdivision); other residential work, such as apartment buildings, has 8 months. The statute counts from completion of the contract or your final performance or furnishing; this tool uses your last furnishing date.",
};

STATE_RULES.OH = {
  name: "Ohio",
  citation: "Ohio Rev. Code §§ 1311.05, 1311.06",
  sources: [
    { label: "R.C. 1311.05 (notice of furnishing)", url: "https://codes.ohio.gov/ohio-revised-code/section-1311.05" },
    { label: "R.C. 1311.06 (affidavit of lien)", url: "https://codes.ohio.gov/ohio-revised-code/section-1311.06" },
  ],
  prelim: { type: "days_after_first", days: 21, lookback: true },
  lienByProject: {
    commercial: { type: "days_after_last", days: 75 },
    residential: { type: "days_after_last", days: 60 },
  },
  lienLabel: "record an affidavit of lien",
  prelimLabel: "notice of furnishing",
  prelimExtra: "The notice of furnishing is required only where the owner recorded a notice of commencement, only from a subcontractor or supplier without a direct contract with the owner, and not under a home construction contract. If the notice of commencement was recorded or served late, the 21 days run from then. A late notice still protects work done from 21 days before it was served onward.",
  residentialNote: "60 days applies to a one- or two-family dwelling or a residential condominium unit; other residential work, such as apartment buildings, has 75 days.",
};

export const PROJECT_TYPES = ["commercial", "residential"];
// "first": you contract with the general (original) contractor.
// "second": you contract with a subcontractor or a supplier (sub-sub or
// supplier to a sub). Georgia's and Washington's notices depend on it among
// the modeled states; Texas (contracts from 2022-01-01) gives every tier the same clocks.
export const TIERS = ["first", "second"];
export const MAX_SCHEDULE_MONTHS = 36;

export function parseDate(value) {
  if (!value || typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const da = Number(m[3]);
  const d = new Date(Date.UTC(y, mo, da));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo || d.getUTCDate() !== da) return null;
  return d;
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// 15th day of the Nth month after the month containing `date`.
function day15MonthsAfter(date, months) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 15));
}

export function formatDate(date) {
  if (!date) return null;
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function daysBetween(from, to) {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function isWeekend(date) {
  const d = date.getUTCDay();
  return d === 0 || d === 6;
}

// Last business day on or before `date` (holidays not modeled).
function previousBusinessDay(date) {
  let d = date;
  while (isWeekend(d)) d = addDays(d, -1);
  return d;
}

function describeDays(n) {
  return `${n} day${n === 1 ? "" : "s"}`;
}

// Same day-of-month N months later, clamped to the month's last day.
function addMonths(date, months) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(date.getUTCDate(), last)));
}

function resolveLien(rule, ctx) {
  switch (rule.type) {
    case "months_after_last":
      return {
        date: addMonths(ctx.last, rule.months),
        description: `${rule.months} months after the claimant's last furnishing of labor or materials`,
      };
    case "days_after_last":
      return {
        date: addDays(ctx.last, rule.days),
        description: `${describeDays(rule.days)} after the claimant's last furnishing of labor or materials`,
      };
    case "month_day15_from_last":
      return {
        date: day15MonthsAfter(ctx.last, rule.monthsAfter),
        description: `the 15th day of the ${ordinal(rule.monthsAfter)} month after the month the claimant last furnished labor or materials`,
      };
    case "earlier_of_completion": {
      const basis = ctx.completion || ctx.last;
      const candidates = [
        {
          date: addDays(basis, rule.completionDays),
          description: `${describeDays(rule.completionDays)} after completion of the project${ctx.completion ? "" : " (using your last furnishing date, which can only be the same or earlier than completion, so this is the safe side)"}`,
        },
      ];
      if (ctx.noticeOfCompletion) {
        candidates.push({
          date: addDays(ctx.noticeOfCompletion, rule.noticeOfCompletionDays),
          description: `${describeDays(rule.noticeOfCompletionDays)} after the owner recorded a notice of completion`,
        });
      }
      candidates.sort((a, b) => a.date - b.date);
      const first = candidates[0];
      return {
        date: first.date,
        description:
          candidates.length > 1
            ? `the earlier of: ${candidates.map((c) => c.description).join("; or ")}`
            : first.description,
        usedLastFurnishingAsCompletion: !ctx.completion,
      };
    }
    default:
      return { date: null, description: "unrecognized rule" };
  }
}

function resolvePrelim(rule, ctx) {
  switch (rule.type) {
    case "days_before_lien":
      if (!ctx.lienDate) return { date: null, description: "needs your last furnishing date" };
      return {
        date: addDays(ctx.lienDate, -rule.days),
        description: `${describeDays(rule.days)} before the lien-filing deadline (counted from the last business day on or before it)`,
      };
    case "days_after_first":
      return {
        date: addDays(ctx.first, rule.days),
        description: `${describeDays(rule.days)} after the claimant first furnished labor or materials`,
      };
    case "month_day15":
      return {
        date: day15MonthsAfter(ctx.first, rule.monthsAfter),
        description: `the 15th day of the ${ordinal(rule.monthsAfter)} month after the month the unpaid work was performed (shown for the first month of work; later months each have their own date)`,
      };
    default:
      return { date: null, description: "unrecognized rule" };
  }
}

function ordinal(n) {
  return { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" }[n] || `${n}th`;
}

function status(date, today) {
  if (!date || !today) return { status: "unknown", daysLeft: null };
  const daysLeft = daysBetween(today, date);
  if (daysLeft < 0) return { status: "passed", daysLeft };
  if (daysLeft === 0) return { status: "today", daysLeft };
  if (daysLeft <= 7) return { status: "soon", daysLeft };
  return { status: "open", daysLeft };
}

function decorate(resolved, today) {
  const { date } = resolved;
  const weekend = date ? isWeekend(date) : false;
  const safe = date ? (weekend ? previousBusinessDay(date) : date) : null;
  return {
    ...resolved,
    weekend,
    safeDate: safe,
    ...status(safe, today),
  };
}

// Texas: one notice date per calendar month of unpaid work, from the month of
// first furnishing to the month of last furnishing.
export function monthlyNoticeSchedule(first, last, monthsAfter, today) {
  const rows = [];
  let y = first.getUTCFullYear();
  let m = first.getUTCMonth();
  const endKey = last.getUTCFullYear() * 12 + last.getUTCMonth();
  while (y * 12 + m <= endKey && rows.length < MAX_SCHEDULE_MONTHS) {
    const monthStart = new Date(Date.UTC(y, m, 1));
    const resolved = {
      workMonth: monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
      date: day15MonthsAfter(monthStart, monthsAfter),
    };
    rows.push(decorate(resolved, today));
    m += 1;
    if (m === 12) { m = 0; y += 1; }
  }
  return { rows, truncated: y * 12 + m <= endKey };
}

/**
 * Computes the preliminary-notice deadline and the lien-filing deadline for a
 * subcontractor or supplier from its first and last furnishing dates.
 * `today` (YYYY-MM-DD) is optional and only used to report days remaining.
 * Does NOT advise, does not model third-tier claimants, public projects, or
 * holidays -- see the module docstring.
 */
export function lienDeadlines({
  state = "CA",
  projectType = "commercial",
  tier = "first",
  firstFurnishing = "",
  lastFurnishing = "",
  completionDate = "",
  noticeOfCompletionDate = "",
  today = "",
} = {}) {
  const info = STATE_RULES[state];
  if (!info) throw new Error(`unsupported state: ${state}`);
  const pt = projectType === "residential" ? "residential" : "commercial";
  const tr = tier === "second" ? "second" : "first";

  const first = parseDate(firstFurnishing);
  const last = parseDate(lastFurnishing);
  const completion = parseDate(completionDate);
  const noc = parseDate(noticeOfCompletionDate);
  const now = parseDate(today);

  const findings = [];
  const add = (severity, title, detail) => findings.push({ severity, title, detail });

  let inputsOk = true;
  if (!first) {
    add("info", "Enter the date you first furnished labor or materials", "The preliminary-notice deadline runs from your first day on the job or first delivery. Without it, only the rule is described.");
  }
  if (!last) {
    add("info", "Enter the date you last furnished labor or materials", "The lien-filing deadline runs from your last day of work or last delivery (or from project completion in some states). Enter it to compute the date.");
  }
  if (first && last && last < first) {
    inputsOk = false;
    add("high", "Last furnishing is before first furnishing", "Check the two dates -- a last-furnished date cannot come before the first-furnished date, so no deadline is computed.");
  }

  let prelim = null;
  let lien = null;
  let noticeSchedule = null;
  let prelimNotRequired = null;
  let prelimRule = null;
  let lateNoticeReach = null;

  if (inputsOk) {
    prelimRule = info.prelimByTierProject
      ? info.prelimByTierProject[tr][pt]
      : info.prelimByTier
      ? info.prelimByTier[tr]
      : info.prelimByProject ? info.prelimByProject[pt] : info.prelim;
    const lienRule = info.lienByProject ? info.lienByProject[pt] : info.lien;

    if (last) {
      lien = decorate(
        resolveLien(lienRule, { last, completion, noticeOfCompletion: noc }),
        now,
      );
    }
    if (prelimRule.type === "not_required") {
      prelimNotRequired = prelimRule.reason;
    } else if (prelimRule.type === "days_before_lien") {
      // Count back from the safe (business-day) filing date the page tells the
      // user to file on, so serving the notice on its shown date and filing on
      // the shown safe date still leaves the full notice period.
      if (lien) prelim = decorate(resolvePrelim(prelimRule, { lienDate: lien.safeDate }), now);
    } else if (first) prelim = decorate(resolvePrelim(prelimRule, { first }), now);
    if (info.monthlyNotice && first && last && prelimRule.type === "month_day15") {
      noticeSchedule = monthlyNoticeSchedule(first, last, prelimRule.monthsAfter, now);
    }
  }

  for (const [kind, d, label] of [
    [noticeSchedule && noticeSchedule.rows.length > 1 ? "first month's notice" : "preliminary notice", prelim, info.prelimLabel],
    ["lien filing", lien, info.lienLabel],
  ]) {
    if (!d) continue;
    if (d.status === "passed") {
      const isPrelim = d === prelim;
      if (isPrelim && prelimRule && prelimRule.lookback && now) {
        lateNoticeReach = addDays(now, -prelimRule.days);
        add("high", `The ${kind} date has already passed`, `The date to cover all your work was ${formatDate(d.date)}. ${info.name} still lets you give the ${label} late, but it then protects only work furnished in the ${describeDays(prelimRule.days)} before it is given, and everything after (${info.citation}). A notice served today, ${formatDate(now)}, would cover work from ${formatDate(lateNoticeReach)} on; work before that loses lien protection. Each day of delay drops another day of work, so serve it now and ask a construction attorney about the rest.`);
      } else if (isPrelim && prelimRule && prelimRule.lateFatal) {
        add("high", `The ${kind} date has already passed`, `The statutory date for this step was ${formatDate(d.date)}. ${prelimRule.lateFatal} Speak to a construction attorney promptly; other remedies (a payment bond claim, suing on the contract) may still exist.`);
      } else {
        add("high", `The ${kind} date has already passed`, `The statutory date for this step was ${formatDate(d.date)}. Some states still protect part of a claim after a late notice and some do not -- speak to a construction attorney promptly rather than assuming either way.`);
      }
    } else if (d.status === "today" || d.status === "soon") {
      add("high", `The ${kind} date is ${d.status === "today" ? "today" : `${d.daysLeft} day${d.daysLeft === 1 ? "" : "s"} away`}`, `Do not leave delivery to the last hour: ${label} has to be properly served or filed, not just started.`);
    }
    if (d.weekend) {
      add("medium", `The ${kind} date falls on a weekend`, `Whether a weekend deadline rolls to the next business day depends on the state and the filing method, and this tool does not model it. The safe date shown is the last business day before it (${formatDate(d.safeDate)}); holidays are not modeled either.`);
    }
  }

  if (noticeSchedule) {
    const rows = noticeSchedule.rows;
    const passed = rows.filter((r) => r.status === "passed");
    const next = rows.find((r) => r.status !== "passed" && r.status !== "unknown");
    if (rows.length > 1) {
      add("high", `Texas: ${rows.length} monthly notices, one per month of unpaid work`, `Each month you furnished unpaid labor or materials (${rows[0].workMonth} to ${rows[rows.length - 1].workMonth}) has its own notice date, the 15th day of the ${ordinal(pt === "residential" ? 2 : 3)} month after that month. Send a notice for every month still unpaid; a missed month loses the lien for that month's work only. The full list is in the schedule below.`);
    }
    if (passed.length && passed.length < rows.length && next) {
      add("medium", `${passed.length} of ${rows.length} monthly notice dates have passed`, `The earliest still open is for ${next.workMonth} work, due ${formatDate(next.safeDate)}. Months whose date has passed may no longer be protected by a lien; ask a construction attorney before assuming either way.`);
    }
    if (noticeSchedule.truncated) {
      add("medium", `Schedule shows the first ${MAX_SCHEDULE_MONTHS} months only`, "Your first and last dates span more months than the schedule lists. Later months follow the same rule.");
    }
  }
  if (prelimNotRequired && info.prelimByTier) add("info", `${info.name}: no ${info.prelimLabel} for a first-tier claimant`, prelimNotRequired + " If you are actually hired by a subcontractor or supply one, choose the second-tier option.");
  else if (prelimNotRequired) add("info", `${info.name}: no ${info.prelimLabel} required`, prelimNotRequired);
  if (info.prelimExtra && (!info.prelimExtraTier || info.prelimExtraTier === tr)) add("medium", `${info.name}: an earlier cutoff also applies`, info.prelimExtra);
  if (prelimRule && prelimRule.note) add("medium", `${info.name}: who owes this notice`, prelimRule.note);
  if (info.residentialNote && pt === "residential" && (!info.residentialNoteTier || info.residentialNoteTier === tr)) add("medium", `${info.name}: confirm the residential category`, info.residentialNote);
  if (lien && lien.usedLastFurnishingAsCompletion) {
    add("info", "Completion date not entered: used your last furnishing date", "This state measures the lien deadline from completion of the whole project. Your own last furnishing date can only be the same as or earlier than completion, so the date shown is the cautious one -- entering the real completion date can only move it later, and only rely on that after confirming the completion date with an attorney.");
  }
  if (state === "TX") {
    add("info", "Texas: rules for original contracts signed on or after 1 January 2022", "These are the clocks set by the 2021 amendments (HB 2237), which apply when the owner's contract with the general contractor was signed on or after 2022-01-01, and they are the same for a subcontractor or supplier at any tier. Older projects follow the earlier rules, where second-tier claimants also had a 2nd-month notice to the general contractor. Retainage has its own notice and filing dates, not shown here.");
  }
  if (prelim && prelimRule && prelimRule.lookback && prelim.status !== "passed") {
    add("info", `${info.name}: a late notice still counts, for recent work only`, `If you miss ${formatDate(prelim.date)}, the ${info.prelimLabel} can still be given, but it then covers only work furnished in the ${describeDays(prelimRule.days)} before it is given (${info.citation}). Serving it on your first day costs nothing and covers the whole job.`);
  }
  add("info", "This is a date lookup, not legal advice", "It applies a simplified reading of each state's timing rules for a subcontractor or supplier to the dates you enter. It does not model laborers' special rules, third-tier claimants (who often have no lien rights at all), public projects, contractual notice terms, required notice content or delivery method, or foreclosure deadlines. Lien rights are lost by missing a deadline, so confirm with a construction attorney or your state's statute before relying on any date.");

  return {
    state,
    stateName: info.name,
    citation: info.citation,
    sources: info.sources || [],
    lateNoticeReach,
    projectType: pt,
    tier: tr,
    inputsOk,
    noticeSchedule: noticeSchedule ? noticeSchedule.rows : null,
    prelimNotRequired,
    prelim,
    lien,
    prelimLabel: info.prelimLabel,
    lienLabel: info.lienLabel,
    findings,
  };
}
