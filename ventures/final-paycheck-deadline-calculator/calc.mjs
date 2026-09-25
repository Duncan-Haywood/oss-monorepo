// Core arithmetic for the final-paycheck-deadline calculator. No network
// calls: this applies published state final-pay-timing statutes to the
// separation date the user supplies. It is NOT a full wage-and-hour
// determination -- see README "What this does not cover".
//
// Verified 2026-09-25 via WebSearch, cross-checking each state against at
// least two independent sources (a state agency page or statute citation
// plus a payroll-compliance or employment-law explainer):
//
//   - California: fired/laid-off employees must be paid the SAME DAY. A
//     voluntary quit with at least 72 hours' notice is also due on the last
//     day worked; a quit WITHOUT 72 hours' notice is due within 3 CALENDAR
//     DAYS. Accrued unused vacation is treated as wages and must be paid
//     out -- no use-it-or-lose-it forfeiture (Cal. Lab. Code §§ 201-203;
//     Suastez v. Plough).
//   - Colorado: fired/laid-off employees must be paid IMMEDIATELY, at the
//     time of separation. A voluntary quit is due on the next regular
//     payday. Accrued vacation is wages and cannot be forfeited (Colo. Rev.
//     Stat. § 8-4-109).
//   - Massachusetts: fired/laid-off employees must be paid IN FULL ON THE
//     DAY OF DISCHARGE. A voluntary quit is due on the next regular payday
//     (or the following Saturday if there is none). Accrued vacation is
//     wages under the Wage Act (Mass. Gen. Laws ch. 149, § 148).
//   - Montana: the default for a fired/laid-off employee is IMMEDIATE
//     payment (within 4 hours or by the end of the business day), but a
//     written employer policy may extend that to the next regular payday
//     or 15 CALENDAR DAYS, whichever is sooner -- so the applicable
//     deadline is the earlier of those. A voluntary quit is due on the next
//     payday or within 15 days, whichever is sooner. Accrued vacation is
//     treated as wages, with no use-it-or-lose-it forfeiture (Mont. Code
//     Ann. § 39-3-205; ARM 24.16.7521).
//   - Illinois: both a firing/layoff and a voluntary quit are due at
//     separation if possible, and no later than the NEXT REGULARLY
//     SCHEDULED PAYDAY. Accrued vacation must be paid out regardless of
//     employer policy -- one of the few states requiring this no matter
//     what the handbook says (820 ILCS 115/5).
//   - Minnesota: a fired/laid-off employee's wages become due upon a
//     written DEMAND, and the employer then has 24 HOURS from that demand
//     to pay before being in default; without a demand, wages are due on
//     the next regularly scheduled payday. A voluntary quit is due on the
//     next regular payday. Vacation payout is governed by employer policy,
//     not a state mandate (Minn. Stat. §§ 181.13-181.14).
//   - Arizona: a fired/laid-off employee must be paid within 7 WORKING DAYS
//     or by the next regular payday, whichever is SOONER. A voluntary quit
//     is due on the next regular payday. Vacation payout is governed by
//     employer policy (Ariz. Rev. Stat. § 23-353).
//   - Texas: a fired/laid-off employee must be paid within 6 CALENDAR DAYS.
//     A voluntary quit is due on the next regularly scheduled payday.
//     Vacation payout is governed by employer policy/contract, not a state
//     mandate (Tex. Lab. Code § 61.014).
//   - New York: both a firing/layoff and a voluntary quit are due on the
//     next regular payday -- New York sets no shorter deadline for either.
//     Vacation payout is governed entirely by employer policy or contract
//     (N.Y. Lab. Law § 191).
//   - Washington: both a firing/layoff and a voluntary quit are due on or
//     before the next regularly scheduled payday -- unlike California,
//     Colorado, or Massachusetts, Washington sets no same-day requirement.
//     Vacation payout is governed by employer policy (Wash. Rev. Code
//     § 49.48.010).
//   - Nevada: a fired/laid-off employee must be paid IMMEDIATELY (or the
//     next business day if the deadline falls when the business is
//     normally closed). A voluntary quit is due on the EARLIER of the next
//     regular payday or 7 CALENDAR DAYS after resignation. Vacation payout
//     is governed by employer policy (Nev. Rev. Stat. §§ 608.020-608.030).
//   - Every other state (and DC): no state-specific final-paycheck-timing
//     statute was found in this pass. The FLSA sets no deadline of its own,
//     and the general practice most sources describe for a state with no
//     specific statute is the next regularly scheduled payday. Vacation
//     payout is governed by employer policy/contract everywhere a state
//     does not require it -- this tool flags only the states above as
//     requiring it.
//
// This module does not verify which state's law actually governs a given
// employee (usually the state where the work was performed, which can
// differ from where the employer is headquartered), does not model city or
// county ordinances that can be stricter than state law, and does not model
// any state's separate rules for commissions, bonuses, or final expense
// reimbursement. See README "What this does not cover".

export const STATE_RULES = {
  CA: {
    name: "California",
    citation: "Cal. Lab. Code §§ 201-203",
    involuntary: { type: "same_day" },
    voluntaryNoticeGiven: { type: "same_day" },
    voluntaryNoNotice: { type: "calendar_days", days: 3 },
    ptoPayout: "required",
  },
  CO: {
    name: "Colorado",
    citation: "Colo. Rev. Stat. § 8-4-109",
    involuntary: { type: "same_day" },
    voluntary: { type: "next_payday" },
    ptoPayout: "required",
  },
  MA: {
    name: "Massachusetts",
    citation: "Mass. Gen. Laws ch. 149, § 148",
    involuntary: { type: "same_day" },
    voluntary: { type: "next_payday", note: "or the following Saturday if there is no regular payday" },
    ptoPayout: "required",
  },
  MT: {
    name: "Montana",
    citation: "Mont. Code Ann. § 39-3-205; ARM 24.16.7521",
    involuntary: {
      type: "earlier_of",
      options: [{ type: "same_day" }, { type: "next_payday" }, { type: "calendar_days", days: 15 }],
      note: "immediate by default; a written employer policy may extend this to the next payday or 15 days, whichever is sooner",
    },
    voluntary: {
      type: "earlier_of",
      options: [{ type: "next_payday" }, { type: "calendar_days", days: 15 }],
    },
    ptoPayout: "required",
  },
  IL: {
    name: "Illinois",
    citation: "820 ILCS 115/5",
    involuntary: { type: "next_payday", note: "at separation if possible, no later than the next regularly scheduled payday" },
    voluntary: { type: "next_payday", note: "at separation if possible, no later than the next regularly scheduled payday" },
    ptoPayout: "required",
  },
  MN: {
    name: "Minnesota",
    citation: "Minn. Stat. §§ 181.13-181.14",
    involuntaryDemand: { type: "hours_from_demand", hours: 24 },
    involuntaryNoDemand: { type: "next_payday" },
    voluntary: { type: "next_payday" },
    ptoPayout: "policy",
  },
  AZ: {
    name: "Arizona",
    citation: "Ariz. Rev. Stat. § 23-353",
    involuntary: {
      type: "earlier_of",
      options: [{ type: "business_days", days: 7 }, { type: "next_payday" }],
    },
    voluntary: { type: "next_payday" },
    ptoPayout: "policy",
  },
  TX: {
    name: "Texas",
    citation: "Tex. Lab. Code § 61.014",
    involuntary: { type: "calendar_days", days: 6 },
    voluntary: { type: "next_payday" },
    ptoPayout: "policy",
  },
  NY: {
    name: "New York",
    citation: "N.Y. Lab. Law § 191",
    involuntary: { type: "next_payday" },
    voluntary: { type: "next_payday" },
    ptoPayout: "policy",
  },
  WA: {
    name: "Washington",
    citation: "Wash. Rev. Code § 49.48.010",
    involuntary: { type: "next_payday" },
    voluntary: { type: "next_payday" },
    ptoPayout: "policy",
  },
  NV: {
    name: "Nevada",
    citation: "Nev. Rev. Stat. §§ 608.020-608.030",
    involuntary: { type: "same_day", note: "or the next business day if the deadline falls when the business is normally closed" },
    voluntary: {
      type: "earlier_of",
      options: [{ type: "next_payday" }, { type: "calendar_days", days: 7 }],
    },
    ptoPayout: "policy",
  },
};

export const GENERAL_DEFAULT = {
  name: "Other / not listed (general rule)",
  citation: "No state-specific statute found in this pass; the FLSA sets no deadline of its own.",
  involuntary: { type: "next_payday" },
  voluntary: { type: "next_payday" },
  ptoPayout: "policy",
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value) {
  if (!value || typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function addCalendarDays(date, days) {
  if (!date) return null;
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addBusinessDays(date, days) {
  if (!date) return null;
  const d = new Date(date.getTime());
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return d;
}

function addHours(date, hours) {
  if (!date) return null;
  return new Date(date.getTime() + hours * 3_600_000);
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

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) =>
    `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

function resolveRule(rule, ctx) {
  if (!rule) return { date: null, description: "no rule modeled" };
  switch (rule.type) {
    case "same_day":
      return {
        date: ctx.separationDate,
        description: `the day of separation${rule.note ? ` (${rule.note})` : ""}`,
      };
    case "calendar_days":
      return {
        date: addCalendarDays(ctx.separationDate, rule.days),
        description: `${rule.days} calendar day${rule.days === 1 ? "" : "s"} after separation`,
      };
    case "business_days":
      return {
        date: addBusinessDays(ctx.separationDate, rule.days),
        description: `${rule.days} business day${rule.days === 1 ? "" : "s"} after separation`,
      };
    case "next_payday":
      return {
        date: ctx.nextPaydayDate,
        description: `the next regularly scheduled payday${rule.note ? ` (${rule.note})` : ""}`,
      };
    case "hours_from_demand":
      return {
        date: addHours(ctx.demandDate, rule.hours),
        description: `${rule.hours} hours after a written demand for payment`,
      };
    case "earlier_of": {
      const subs = rule.options.map((o) => resolveRule(o, ctx));
      const dated = subs.filter((s) => s.date);
      const date = dated.length ? new Date(Math.min(...dated.map((s) => s.date.getTime()))) : null;
      return {
        date,
        description: `the earlier of: ${subs.map((s) => s.description).join("; or ")}`,
      };
    }
    default:
      return { date: null, description: "unrecognized rule" };
  }
}

/**
 * Computes the applicable final-paycheck deadline for a state and
 * separation type, given a separation date and (where the rule needs one)
 * a next scheduled payday or a demand date. Does NOT determine which
 * state's law actually governs, and does NOT model city/county ordinances,
 * commissions, or expense reimbursement -- see the module docstring.
 */
export function finalPaycheckDeadline({
  state = "OTHER",
  separationType = "involuntary",
  separationDate = "",
  nextPaydayDate = "",
  demandDate = "",
  noticeGiven = false,
  demandMade = false,
  accruedPtoHours = 0,
  hourlyRate = 0,
} = {}) {
  const stateInfo = STATE_RULES[state] || null;
  const info = stateInfo || GENERAL_DEFAULT;
  const isOther = !stateInfo;

  const sepDate = parseDate(separationDate);
  const paydayDate = parseDate(nextPaydayDate);
  const demDate = parseDate(demandDate);
  const ctx = { separationDate: sepDate, nextPaydayDate: paydayDate, demandDate: demDate };

  let rule;
  let ruleLabel;
  let usesMinnesotaDemand = false;
  let usesCaliforniaNotice = false;

  if (state === "CA" && separationType === "voluntary") {
    usesCaliforniaNotice = true;
    rule = noticeGiven ? stateInfo.voluntaryNoticeGiven : stateInfo.voluntaryNoNotice;
    ruleLabel = noticeGiven ? "quit with at least 72 hours' notice" : "quit without 72 hours' notice";
  } else if (state === "MN" && separationType === "involuntary") {
    usesMinnesotaDemand = true;
    rule = demandMade ? stateInfo.involuntaryDemand : stateInfo.involuntaryNoDemand;
    ruleLabel = demandMade ? "fired or laid off, written demand already made" : "fired or laid off, no demand made yet";
  } else {
    rule = separationType === "involuntary" ? info.involuntary : info.voluntary;
    ruleLabel = separationType === "involuntary" ? "fired or laid off" : "quit or resigned";
  }

  const resolved = resolveRule(rule, ctx);
  const accruedHours = Math.max(0, num(accruedPtoHours));
  const rate = Math.max(0, num(hourlyRate));
  const ptoPayoutAmount = info.ptoPayout === "required" ? accruedHours * rate : 0;

  const findings = [];

  if (!sepDate) {
    findings.push({
      severity: "info",
      title: "Enter a separation date to compute the actual deadline date",
      detail: "Without a separation date, only the rule itself is described -- no calendar date can be computed.",
    });
  }

  if (rule && (rule.type === "next_payday" || (rule.type === "earlier_of" && rule.options.some((o) => o.type === "next_payday"))) && !paydayDate) {
    findings.push({
      severity: "info",
      title: "Enter the next scheduled payday to compute this next-payday-based deadline",
      detail: "This state's rule depends on the employer's own regular pay schedule, which this tool cannot infer -- enter the next scheduled payday to see the exact date.",
    });
  }

  if (usesMinnesotaDemand && demandMade && !demDate) {
    findings.push({
      severity: "info",
      title: "Enter the date the written demand was made to compute the 24-hour deadline",
      detail: "Minnesota's 24-hour clock starts from the employee's written demand for payment, not from the separation date itself.",
    });
  }

  if (usesCaliforniaNotice) {
    findings.push({
      severity: "info",
      title: noticeGiven
        ? "California treats 72+ hours' notice as due on the last day worked"
        : "California gives 3 calendar days when no notice was given",
      detail: noticeGiven
        ? "An employee who gives at least 72 hours' notice before quitting must be paid on their last day worked, the same as a firing."
        : "An employee who quits without giving at least 72 hours' notice must be paid within 3 calendar days of quitting.",
    });
  }

  if (info.ptoPayout === "required") {
    findings.push({
      severity: "high",
      title: `${info.name} requires accrued unused vacation/PTO to be paid out as wages`,
      detail: `Accrued, unused vacation is treated as earned wages in ${info.name} and cannot be forfeited by a use-it-or-lose-it policy. It is due on the same deadline as the rest of the final paycheck.${ptoPayoutAmount > 0 ? ` At the hours and rate entered, that is ${money(ptoPayoutAmount)}.` : ""}`,
    });
  } else {
    findings.push({
      severity: "info",
      title: `${info.name} leaves vacation/PTO payout to employer policy`,
      detail: `${info.name} does not require accrued unused vacation to be paid out at separation. Whether it is owed depends entirely on the employer's written policy or the employment contract -- check that document rather than assuming either way.`,
    });
  }

  findings.push({
    severity: "info",
    title: "This is a deadline lookup, not a full wage-and-hour determination",
    detail: "This tool applies a published state statute to the dates you enter. It does not determine which state's law actually governs (usually the state where the work was performed), does not model city or county ordinances that can be stricter, and does not cover commissions, bonuses, or expense reimbursement rules.",
  });

  return {
    state,
    stateName: info.name,
    isOther,
    citation: info.citation,
    separationType,
    ruleLabel,
    deadlineDate: resolved.date,
    deadlineDescription: resolved.description,
    ptoPayoutRequired: info.ptoPayout === "required",
    ptoPayoutAmount,
    accruedHours,
    hourlyRate: rate,
    usesMinnesotaDemand,
    usesCaliforniaNotice,
    findings,
  };
}
