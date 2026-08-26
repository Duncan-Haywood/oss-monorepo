/**
 * Billing schedules: what a *project* costs you before it is paid for.
 *
 * The rest of this venture prices one invoice — when it is due, what a late
 * rate adds, whether a 2/10 discount beats waiting. None of that answers the
 * question a freelancer faces before the work starts: how the project should
 * be *split* into invoices.
 *
 * Splitting changes two things the single-invoice arithmetic cannot see:
 *
 *   1. How much of the client's project you are financing out of your own
 *      pocket, and for how long.
 *   2. How much finished, delivered work is sitting unpaid at the moment you
 *      hand it over — the amount you actually lose if the client never pays.
 *
 * Billing once at the end maximises both. A deposit reduces both. This module
 * puts numbers on that trade instead of leaving it to nerve.
 *
 * Arithmetic only. It does not tell anyone to demand a deposit, and it is not
 * a prediction that any particular client will pay or default.
 */

function finiteNumber(value, label, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    const parsedFallback = Number(fallback);
    if (!Number.isFinite(parsedFallback)) throw new Error(`${label} must be a number`);
    return parsedFallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number`);
  return parsed;
}

/**
 * A schedule is a list of milestones. `atPct` is the point in the project's
 * duration at which that invoice is *issued* — 0 is kickoff, 100 is handover.
 * `pct` is the share of the project value it bills.
 */
export const SCHEDULE_PRESETS = [
  {
    id: "on-completion",
    label: "Bill once at the end",
    note: "One invoice at handover. You fund the whole project, and the whole project is at risk on delivery day.",
    milestones: [{ label: "Final invoice", pct: 100, atPct: 100 }],
  },
  {
    id: "half-deposit",
    label: "50% deposit, 50% on completion",
    note: "The common freelance split. Halves what is unpaid at handover.",
    milestones: [
      { label: "Deposit", pct: 50, atPct: 0 },
      { label: "Balance on completion", pct: 50, atPct: 100 },
    ],
  },
  {
    id: "thirds",
    label: "Thirds: deposit, midpoint, completion",
    note: "A progress bill in the middle keeps the unpaid balance from building up while the work is longest.",
    milestones: [
      { label: "Deposit", pct: 34, atPct: 0 },
      { label: "Midpoint progress bill", pct: 33, atPct: 50 },
      { label: "Balance on completion", pct: 33, atPct: 100 },
    ],
  },
];

/**
 * The schedule driven by the deposit input, so a reader can put their own
 * number next to the presets rather than accepting one of three.
 */
export function depositSchedule(depositPct) {
  const share = finiteNumber(depositPct, "Deposit share", 0);
  if (share < 0 || share > 100) throw new Error("Deposit share must be between 0 and 100");
  return {
    id: "your-deposit",
    label: `Your deposit: ${round2(share)}% up front`,
    note: "Your own split — deposit at kickoff, balance on completion.",
    milestones: [
      { label: "Deposit", pct: share, atPct: 0 },
      { label: "Balance on completion", pct: 100 - share, atPct: 100 },
    ],
  };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function readShared(shared) {
  if (!shared || typeof shared !== "object") throw new Error("Enter project details.");
  const projectValue = finiteNumber(shared.projectValue, "Project value", 0);
  if (projectValue <= 0) throw new Error("Project value must be greater than zero");
  const projectDays = Math.round(finiteNumber(shared.projectDays, "Project length", 30));
  if (projectDays <= 0) throw new Error("Project length must be more than zero days");
  const termsDays = Math.round(finiteNumber(shared.termsDays, "Payment terms", 30));
  if (termsDays < 0) throw new Error("Payment terms must be zero or more days");
  const avgDaysLate = Math.round(finiteNumber(shared.avgDaysLate, "Average days paid late", 0));
  if (avgDaysLate < 0) throw new Error("Average days paid late must be zero or more");
  const annualCarryRate = finiteNumber(shared.annualCarryRate, "Annual carrying-cost rate", 24);
  if (annualCarryRate < 0) throw new Error("Annual carrying-cost rate must be non-negative");
  if (annualCarryRate >= 1000) throw new Error("Annual carrying-cost rate must be below 1000%");
  // A kickoff invoice is not collected on the same cycle as the rest. It is
  // normally paid before anyone starts, which is the entire reason a deposit
  // protects anything — so it gets its own, separate collection time. Set it
  // equal to the ordinary cycle to see what a deposit is worth when the client
  // treats it like every other invoice: on a short project, nothing.
  const depositCollectionDays = Math.round(
    finiteNumber(shared.depositCollectionDays, "Days to collect the deposit", 5),
  );
  if (depositCollectionDays < 0) throw new Error("Days to collect the deposit must be zero or more");
  return { projectValue, projectDays, termsDays, avgDaysLate, annualCarryRate, depositCollectionDays };
}

/**
 * Area under `max(exposure, 0)` for a segment on which exposure moves
 * linearly from `start` to `end` over `length` days.
 *
 * Only unpaid work is financed. A client who has prepaid is not lending you
 * money back at your carrying rate, so the negative part is dropped rather
 * than credited — the conservative reading, and the one that does not let a
 * large deposit manufacture a fictional gain.
 */
function positiveArea(start, end, length) {
  if (length <= 0) return 0;
  if (start >= 0 && end >= 0) return ((start + end) / 2) * length;
  if (start <= 0 && end <= 0) return 0;
  // One crossing. The positive part is a triangle on the positive side.
  const positive = start > 0 ? start : end;
  const crossFraction = Math.abs(positive) / Math.abs(start - end);
  return (positive * crossFraction * length) / 2;
}

/**
 * What one schedule costs and exposes.
 *
 * Every invoice — the deposit included — is treated the same way: issued on
 * its milestone day and paid `termsDays + avgDaysLate` afterwards. Freelancers
 * who require the deposit to clear *before* starting are better off than this
 * model says, which is the direction an assumption should err in a tool about
 * risk.
 *
 * Delivered value is spread evenly across the project's days. That is an
 * assumption, not a measurement, and front-loaded work makes the real exposure
 * worse than shown.
 */
export function scheduleOutcome(schedule, shared) {
  if (!schedule || !Array.isArray(schedule.milestones) || schedule.milestones.length === 0) {
    throw new Error("A billing schedule needs at least one milestone");
  }
  const { projectValue, projectDays, termsDays, avgDaysLate, annualCarryRate, depositCollectionDays } =
    readShared(shared);

  const totalPct = schedule.milestones.reduce((sum, m) => sum + finiteNumber(m.pct, "Milestone share"), 0);
  if (Math.abs(totalPct - 100) > 0.01) {
    throw new Error(`Milestones must add up to 100% of the project (this schedule adds up to ${round2(totalPct)}%)`);
  }

  const collectionDays = termsDays + avgDaysLate;
  const milestones = schedule.milestones
    .map((milestone) => {
      const share = finiteNumber(milestone.pct, "Milestone share");
      if (share < 0) throw new Error("A milestone cannot bill a negative share");
      const atPct = finiteNumber(milestone.atPct, "Milestone timing", 100);
      if (atPct < 0 || atPct > 100) throw new Error("Milestone timing must be between 0% and 100% of the project");
      const invoiceDay = Math.round((atPct / 100) * projectDays);
      const collectDays = atPct === 0 ? depositCollectionDays : collectionDays;
      return {
        label: milestone.label ?? "Invoice",
        pct: share,
        amount: (projectValue * share) / 100,
        invoiceDay,
        collectDays,
        paidDay: invoiceDay + collectDays,
      };
    })
    .sort((a, b) => a.paidDay - b.paidDay);

  const fullyPaidDay = milestones[milestones.length - 1].paidDay;
  const deliveredAt = (day) => (projectValue * Math.min(Math.max(day, 0), projectDays)) / projectDays;
  const receivedAt = (day) =>
    milestones.reduce((sum, m) => (m.paidDay <= day ? sum + m.amount : sum), 0);
  // Exposure the instant *before* a payment lands, which is where a peak sits.
  const receivedBefore = (day) =>
    milestones.reduce((sum, m) => (m.paidDay < day ? sum + m.amount : sum), 0);

  // Exposure is piecewise linear: it ramps while work is delivered and steps
  // down when cash arrives. Integrating the segments exactly avoids the
  // sampling error a day-by-day loop would hide.
  const breakpoints = [...new Set([0, projectDays, fullyPaidDay, ...milestones.map((m) => m.paidDay)])]
    .filter((day) => day >= 0 && day <= fullyPaidDay)
    .sort((a, b) => a - b);

  let exposureDayDollars = 0;
  let peakExposure = 0;
  for (let i = 0; i < breakpoints.length; i += 1) {
    const day = breakpoints[i];
    // The peak can occur just before a payment clears, so both sides count.
    peakExposure = Math.max(peakExposure, deliveredAt(day) - receivedBefore(day), deliveredAt(day) - receivedAt(day));
    if (i === breakpoints.length - 1) break;
    const next = breakpoints[i + 1];
    const cashOverSegment = receivedAt(day);
    exposureDayDollars += positiveArea(
      deliveredAt(day) - cashOverSegment,
      deliveredAt(next) - cashOverSegment,
      next - day,
    );
  }

  const fundingCost = (exposureDayDollars * (annualCarryRate / 100)) / 365;
  // Only money that has cleared *strictly before* handover is protection
  // against a client who disappears on delivery day. The completion invoice
  // itself never counts: on zero-day terms it lands the same day, and money
  // arriving the instant you let go of the work is not money you held.
  const cashBeforeHandover = receivedBefore(projectDays);
  const unpaidAtHandover = Math.max(0, projectValue - cashBeforeHandover);
  const weightedDaysToCash = milestones.reduce(
    (sum, m) => sum + (m.amount / projectValue) * m.paidDay,
    0,
  );

  return {
    id: schedule.id ?? null,
    label: schedule.label ?? "Schedule",
    note: schedule.note ?? "",
    milestones,
    projectValue,
    projectDays,
    termsDays,
    avgDaysLate,
    annualCarryRate,
    collectionDays,
    depositCollectionDays,
    fullyPaidDay,
    /** Days between handing the work over and holding all the money. */
    daysUnpaidAfterHandover: Math.max(0, fullyPaidDay - projectDays),
    weightedDaysToCash,
    /** Most delivered-but-unpaid work outstanding at any point. */
    peakExposure,
    /** Value of finished work still unpaid on delivery day — what a ghosting client keeps. */
    unpaidAtHandover,
    cashBeforeHandover,
    /** Dollar-days of unpaid work, the quantity the carrying rate is charged on. */
    exposureDayDollars,
    fundingCost,
    netAfterFunding: projectValue - fundingCost,
  };
}

/**
 * Every schedule side by side, ranked by what is still unpaid when the work
 * is handed over — the number a freelancer who has been burned once actually
 * ranks on. Cash timing is reported next to it rather than folded in, because
 * the two do not always agree and the disagreement is worth seeing.
 */
export function compareSchedules(schedules, shared) {
  if (!Array.isArray(schedules) || schedules.length === 0) {
    throw new Error("Compare at least one billing schedule");
  }
  const outcomes = schedules.map((schedule) => scheduleOutcome(schedule, shared));
  const billOnce = outcomes.find((o) => o.id === "on-completion") ?? null;
  const ranked = [...outcomes].sort(
    (a, b) => a.unpaidAtHandover - b.unpaidAtHandover || a.fundingCost - b.fundingCost,
  );
  const fastest = [...outcomes].sort((a, b) => a.weightedDaysToCash - b.weightedDaysToCash)[0];
  return {
    outcomes,
    ranked,
    safest: ranked[0],
    fastest,
    billOnce,
    /** True when the schedule that risks least is also the one paid soonest. */
    agree: ranked[0] === fastest,
  };
}

/**
 * The deposit share that holds peak exposure at or below `ceiling`, for a
 * deposit-plus-balance split.
 *
 * There is a floor this cannot get under: until the deposit invoice clears you
 * have delivered `collectionDays` worth of work and been paid nothing, so no
 * deposit percentage — not even 100% — pushes the peak below that. Returning
 * `null` there is the honest answer, and it is the finding: on long collection
 * cycles a deposit alone cannot cap your exposure, and the fix is a shorter
 * cycle or a progress bill, not a bigger number on the same schedule.
 */
export function depositForPeakExposure(ceiling, shared) {
  const { projectValue, projectDays, depositCollectionDays } = readShared(shared);
  const wanted = finiteNumber(ceiling, "Exposure ceiling");
  if (wanted < 0) throw new Error("Exposure ceiling must be zero or more");
  // Work delivered before the deposit arrives — the unavoidable floor.
  const floorExposure = (projectValue * Math.min(depositCollectionDays, projectDays)) / projectDays;
  if (wanted < floorExposure) return null;
  if (wanted >= projectValue) return 0;
  return round2((1 - wanted / projectValue) * 100);
}

function money(value) {
  const sign = value < 0 ? "-" : "";
  const [whole, frac] = Math.abs(value).toFixed(2).split(".");
  return `${sign}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
}

/**
 * One-sentence readout comparing a chosen schedule with billing once at the
 * end. Reports the difference; it does not tell anyone which to use.
 */
export function scheduleNote(comparison, chosenId = "your-deposit") {
  const chosen = comparison.outcomes.find((o) => o.id === chosenId) ?? comparison.safest;
  const once = comparison.billOnce;
  if (!once || once === chosen) {
    return (
      `${chosen.label} leaves ${money(chosen.unpaidAtHandover)} of finished work unpaid on ` +
      `handover day and costs ${money(chosen.fundingCost)} to finance, with the last payment ` +
      `landing ${chosen.daysUnpaidAfterHandover} days after you deliver.`
    );
  }
  const riskCut = once.unpaidAtHandover - chosen.unpaidAtHandover;
  const costCut = once.fundingCost - chosen.fundingCost;
  // The case worth naming loudly: a split that moves money earlier on average
  // but still lands every dollar after the work is finished. It reads like
  // protection on the invoice and is none, and the reason is the collection
  // cycle, not the percentage.
  if (riskCut <= 0) {
    const stillExposed =
      `${chosen.label} does not reduce what is unpaid on handover day — both leave ` +
      `${money(once.unpaidAtHandover)} of finished work outstanding, because nothing on this ` +
      `schedule clears inside a ${chosen.projectDays}-day project: the deposit takes ` +
      `${chosen.depositCollectionDays} days to collect and every later invoice takes ` +
      `${chosen.collectionDays}.`;
    if (costCut <= 0) {
      return `${stillExposed} It does not reduce the financing cost either.`;
    }
    return (
      `${stillExposed} It does cut financing cost by ${money(costCut)}, but shortening the ` +
      `collection cycle is the only thing that moves the exposure.`
    );
  }
  return (
    `${chosen.label} leaves ${money(chosen.unpaidAtHandover)} of finished work unpaid on ` +
    `handover day instead of ${money(once.unpaidAtHandover)} — ${money(riskCut)} less of your ` +
    `work in someone else's hands. At ${round2(once.annualCarryRate)}% money it also costs ` +
    `${money(chosen.fundingCost)} to finance instead of ${money(once.fundingCost)}, a ` +
    `${money(costCut)} difference. The financing gap is the small number here; the ` +
    `${money(riskCut)} you are no longer lending an unpaid client is the reason to care.`
  );
}

/**
 * Contract wording for the schedule, in the same copy-and-paste shape as the
 * payment-terms sentence. Describes the schedule the reader built; it makes no
 * claim that any term is enforceable.
 */
export function scheduleCopy(outcome) {
  const lines = outcome.milestones.map((m) => {
    const when =
      m.invoiceDay === 0
        ? "on acceptance of this proposal"
        : m.invoiceDay >= outcome.projectDays
          ? "on completion"
          : `at the ${round2((m.invoiceDay / outcome.projectDays) * 100)}% progress point`;
    return `- ${m.label}: ${round2(m.pct)}% of the project fee (${money(m.amount)}), invoiced ${when}.`;
  });
  const payable =
    outcome.termsDays === 0
      ? "Each invoice is payable on receipt."
      : `Each invoice is payable within ${outcome.termsDays} days of its invoice date.`;
  return (
    `Payment schedule for a ${money(outcome.projectValue)} project:\n${lines.join("\n")}\n` +
    `${payable} Work on the next stage begins once the preceding invoice is settled. ` +
    `The client remains responsible for reviewing this schedule and any applicable agreement.`
  );
}
