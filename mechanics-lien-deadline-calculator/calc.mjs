// Core date arithmetic for the mechanics-lien deadline calculator. No network
// calls: this applies published state preliminary-notice and lien-filing
// timing rules to the dates the user supplies. It is NOT legal advice and
// not a full lien analysis -- see README "What this does not cover".
//
// Figures verified 2026-09-30 via WebSearch against lien-service explainers
// and law-firm guides that agree with each other for each state (Levelset,
// Siteline, Sunray, mechanicslien.com, Florida Hard Hat Law, Stone LLP and
// others), for a subcontractor or material supplier who contracts with the
// general contractor (a first-tier claimant):
//
//   - California: preliminary notice within 20 days after first furnishing
//     labor or materials. Claim of lien recorded within 90 days after
//     completion of the work of improvement, or within 30 days after the
//     owner records a notice of completion, whichever applies first
//     (Cal. Civ. Code §§ 8200-8204, 8412).
//   - Texas: commercial (non-residential) -- notice by the 15th day of the
//     3rd month after each month work was performed and unpaid; lien
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
//   - Washington: preliminary notice within 60 days after first furnishing
//     on commercial work, 10 days on new single-family residential work;
//     claim of lien within 90 days after last furnishing
//     (Wash. Rev. Code §§ 60.04.031, 60.04.091).
//
// Where a rule runs from project completion and the user does not supply it,
// the claimant's own last furnishing date is used instead. Completion can
// only be the same or later, so that yields the same or an EARLIER date --
// the safe direction for a deadline. The result says when it did this.
//
// Not modeled: second-tier and lower claimants (several states shorten or
// change their clocks), residential homestead variations beyond the two
// Texas/Washington splits, public-project bond-claim rules, retainage,
// weekend and holiday extensions, contractual notice requirements, notice
// content and delivery method, lien foreclosure / suit deadlines, and
// anything enacted after the verification date above.

export const STATE_RULES = {
  CA: {
    name: "California",
    citation: "Cal. Civ. Code §§ 8200-8204, 8412",
    prelim: { type: "days_after_first", days: 20 },
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
    prelimByProject: {
      commercial: { type: "month_day15", monthsAfter: 3 },
      residential: { type: "month_day15", monthsAfter: 2 },
    },
    lienByProject: {
      commercial: { type: "month_day15_from_last", monthsAfter: 4 },
      residential: { type: "month_day15_from_last", monthsAfter: 3 },
    },
    lienLabel: "file a lien affidavit",
    prelimLabel: "notice of unpaid balance",
  },
  FL: {
    name: "Florida",
    citation: "Fla. Stat. §§ 713.06, 713.08",
    prelim: { type: "days_after_first", days: 45 },
    lien: { type: "days_after_last", days: 90 },
    lienLabel: "record a claim of lien",
    prelimLabel: "Notice to Owner",
    prelimExtra: "Also must go out before the owner makes final payment to the contractor, which can be earlier than this date.",
  },
  AZ: {
    name: "Arizona",
    citation: "Ariz. Rev. Stat. §§ 33-992.01, 33-993",
    prelim: { type: "days_after_first", days: 20 },
    lien: {
      type: "earlier_of_completion",
      completionDays: 120,
      noticeOfCompletionDays: 60,
    },
    lienLabel: "record a lien",
    prelimLabel: "20-day preliminary notice",
  },
  WA: {
    name: "Washington",
    citation: "Wash. Rev. Code §§ 60.04.031, 60.04.091",
    prelimByProject: {
      commercial: { type: "days_after_first", days: 60 },
      residential: { type: "days_after_first", days: 10 },
    },
    lien: { type: "days_after_last", days: 90 },
    lienLabel: "record a claim of lien",
    prelimLabel: "preliminary notice",
    residentialNote: "10 days applies to new single-family residential construction; other residential work follows the 60-day rule -- confirm which applies.",
  },
};

export const PROJECT_TYPES = ["commercial", "residential"];

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

function resolveLien(rule, ctx) {
  switch (rule.type) {
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

/**
 * Computes the preliminary-notice deadline and the lien-filing deadline for a
 * subcontractor or supplier from its first and last furnishing dates.
 * `today` (YYYY-MM-DD) is optional and only used to report days remaining.
 * Does NOT advise, does not model second-tier claimants, public projects, or
 * holidays -- see the module docstring.
 */
export function lienDeadlines({
  state = "CA",
  projectType = "commercial",
  firstFurnishing = "",
  lastFurnishing = "",
  completionDate = "",
  noticeOfCompletionDate = "",
  today = "",
} = {}) {
  const info = STATE_RULES[state];
  if (!info) throw new Error(`unsupported state: ${state}`);
  const pt = projectType === "residential" ? "residential" : "commercial";

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

  if (inputsOk) {
    const prelimRule = info.prelimByProject ? info.prelimByProject[pt] : info.prelim;
    const lienRule = info.lienByProject ? info.lienByProject[pt] : info.lien;

    if (first) prelim = decorate(resolvePrelim(prelimRule, { first }), now);
    if (last) {
      lien = decorate(
        resolveLien(lienRule, { last, completion, noticeOfCompletion: noc }),
        now,
      );
    }
  }

  for (const [kind, d, label] of [
    ["preliminary notice", prelim, info.prelimLabel],
    ["lien filing", lien, info.lienLabel],
  ]) {
    if (!d) continue;
    if (d.status === "passed") {
      add("high", `The ${kind} date has already passed`, `The statutory date for this step was ${formatDate(d.date)}. Some states still protect part of a claim after a late notice and some do not -- speak to a construction attorney promptly rather than assuming either way.`);
    } else if (d.status === "today" || d.status === "soon") {
      add("high", `The ${kind} date is ${d.status === "today" ? "today" : `${d.daysLeft} day${d.daysLeft === 1 ? "" : "s"} away`}`, `Do not leave delivery to the last hour: ${label} has to be properly served or filed, not just started.`);
    }
    if (d.weekend) {
      add("medium", `The ${kind} date falls on a weekend`, `Whether a weekend deadline rolls to the next business day depends on the state and the filing method, and this tool does not model it. The safe date shown is the last business day before it (${formatDate(d.safeDate)}); holidays are not modeled either.`);
    }
  }

  if (info.prelimExtra) add("medium", `${info.name}: an earlier cutoff also applies`, info.prelimExtra);
  if (info.residentialNote && pt === "residential") add("medium", `${info.name}: confirm the residential category`, info.residentialNote);
  if (lien && lien.usedLastFurnishingAsCompletion) {
    add("info", "Completion date not entered: used your last furnishing date", "This state measures the lien deadline from completion of the whole project. Your own last furnishing date can only be the same as or earlier than completion, so the date shown is the cautious one -- entering the real completion date can only move it later, and only rely on that after confirming the completion date with an attorney.");
  }
  if (state === "TX") {
    add("info", "Texas notices run month by month", "The Texas notice date depends on the month each piece of unpaid work was performed. The date shown is for the first month of work; work in later months has later dates.");
  }
  add("info", "This is a date lookup, not legal advice", "It applies a simplified, first-tier subcontractor/supplier reading of each state's timing rules to the dates you enter. It does not model second-tier claimants, public projects, contractual notice terms, required notice content or delivery method, or foreclosure deadlines. Lien rights are lost by missing a deadline, so confirm with a construction attorney or your state's statute before relying on any date.");

  return {
    state,
    stateName: info.name,
    citation: info.citation,
    projectType: pt,
    inputsOk,
    prelim,
    lien,
    prelimLabel: info.prelimLabel,
    lienLabel: info.lienLabel,
    findings,
  };
}
