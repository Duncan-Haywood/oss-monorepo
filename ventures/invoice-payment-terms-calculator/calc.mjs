const DAY = 86400000;

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function calculateTerms(input) {
  if (!input || typeof input !== 'object') throw new Error('Enter invoice details.');
  const amount = Math.max(0, number(input.amount));
  const termsDays = Math.max(0, Math.round(number(input.termsDays, 30)));
  const annualLateRate = Math.max(0, number(input.annualLateRate));
  const graceDays = Math.max(0, Math.round(number(input.graceDays)));
  const monthlyBurn = Math.max(0, number(input.monthlyBurn));
  const outstanding = Math.max(0, Math.round(number(input.outstanding)));
  const invoiceDate = new Date(`${input.invoiceDate}T00:00:00Z`);
  const dateParts = typeof input.invoiceDate === 'string' && input.invoiceDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const validDate = dateParts && !Number.isNaN(invoiceDate.getTime())
    && invoiceDate.getUTCFullYear() === Number(dateParts[1])
    && invoiceDate.getUTCMonth() + 1 === Number(dateParts[2])
    && invoiceDate.getUTCDate() === Number(dateParts[3]);
  if (!validDate) throw new Error('Enter a valid invoice date.');

  const due = new Date(invoiceDate.getTime() + termsDays * DAY);
  const feeAt = daysLate => amount * (annualLateRate / 100) * (Math.max(0, daysLate - graceDays) / 365);
  const exposure = amount * outstanding;
  return {
    dueDate: due.toISOString().slice(0, 10),
    amount,
    termsDays,
    annualLateRate,
    graceDays,
    monthlyBurn,
    outstanding,
    exposure,
    runwayDays: monthlyBurn ? (exposure / monthlyBurn) * 30 : 0,
    fees: [30, 60, 90].map(days => ({ days, fee: feeAt(days), total: amount + feeAt(days) })),
  };
}

export function termsCopy(result) {
  const fee = result.annualLateRate ? `Overdue balances may incur ${result.annualLateRate}% annual interest after a ${result.graceDays}-day grace period, calculated where permitted.` : 'Please contact us promptly if you expect payment to be delayed.';
  return `Payment is due ${result.termsDays === 0 ? 'on receipt' : `within ${result.termsDays} days of the invoice date`} (due ${result.dueDate}). ${fee} The customer remains responsible for reviewing these terms and any applicable agreement.`;
}

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

function carryingCost(amount, annualRatePercent, days) {
  return amount * (annualRatePercent / 100) * (days / 365);
}

function money(value) {
  const sign = value < 0 ? "-" : "";
  const [whole, frac] = Math.abs(value).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${grouped}.${frac}`;
}

/**
 * 2/10 Net 30 (or any early-pay discount) versus waiting for the full
 * invoice. Present-value uses simple carrying cost from the invoice date,
 * the same way Faire next-day payout prices float — an assumption the
 * operator types, not interest they can invoice.
 *
 * Arithmetic only. It does not say to offer or withhold a discount.
 */
export function compareEarlyPay(input = {}) {
  if (!input || typeof input !== "object") throw new Error("Enter invoice details.");
  const amount = finiteNumber(input.amount, "Invoice amount");
  if (amount <= 0) throw new Error("Invoice amount must be greater than zero");
  const termsDays = Math.round(finiteNumber(input.termsDays, "Payment terms", 30));
  if (termsDays < 0) throw new Error("Payment terms must be zero or more days");
  const earlyPayDays = Math.round(finiteNumber(input.earlyPayDays, "Early-pay days", 10));
  if (earlyPayDays < 0) throw new Error("Early-pay days must be zero or more");
  if (earlyPayDays > termsDays) {
    throw new Error("Early-pay days cannot be later than the payment terms");
  }
  const earlyPayDiscountPct = finiteNumber(input.earlyPayDiscountPct, "Early-pay discount", 2);
  if (earlyPayDiscountPct < 0 || earlyPayDiscountPct >= 100) {
    throw new Error("Early-pay discount must be at least 0 and below 100");
  }
  const annualCarryRate = finiteNumber(input.annualCarryRate, "Annual carrying-cost rate", 24);
  if (annualCarryRate < 0) throw new Error("Annual carrying-cost rate must be non-negative");
  if (annualCarryRate >= 1000) throw new Error("Annual carrying-cost rate must be below 1000%");
  const takeRatePct = finiteNumber(input.takeRatePct, "Take rate", 100);
  if (takeRatePct < 0 || takeRatePct > 100) throw new Error("Take rate must be between 0 and 100");

  const earlyCash = amount * (1 - earlyPayDiscountPct / 100);
  const waitCash = amount;
  const discountCost = waitCash - earlyCash;
  const daysSaved = termsDays - earlyPayDays;
  const earlyCarry = carryingCost(earlyCash, annualCarryRate, earlyPayDays);
  const waitCarry = carryingCost(waitCash, annualCarryRate, termsDays);
  const earlyAfterFloat = earlyCash - earlyCarry;
  const waitAfterFloat = waitCash - waitCarry;
  const earlyPremium = earlyAfterFloat - waitAfterFloat;
  const mixedAfterFloat = (takeRatePct / 100) * earlyAfterFloat
    + (1 - takeRatePct / 100) * waitAfterFloat;
  const mixPremium = mixedAfterFloat - waitAfterFloat;

  let breakEvenAnnualRate = null;
  const waitDayValue = waitCash * termsDays;
  const earlyDayValue = earlyCash * earlyPayDays;
  if (waitDayValue !== earlyDayValue) {
    breakEvenAnnualRate = (discountCost * 365) / (waitDayValue - earlyDayValue) * 100;
    if (breakEvenAnnualRate < 0) breakEvenAnnualRate = null;
  }

  let discountApr = null;
  if (earlyCash > 0 && daysSaved > 0) {
    discountApr = (earlyPayDiscountPct / 100) / (1 - earlyPayDiscountPct / 100)
      * 365 / daysSaved * 100;
  }

  return {
    amount,
    termsDays,
    earlyPayDays,
    earlyPayDiscountPct,
    annualCarryRate,
    takeRatePct,
    earlyCash,
    waitCash,
    discountCost,
    daysSaved,
    earlyCarry,
    waitCarry,
    earlyAfterFloat,
    waitAfterFloat,
    earlyPremium,
    earlyBeatsWait: earlyAfterFloat > waitAfterFloat,
    mixedAfterFloat,
    mixPremium,
    breakEvenAnnualRate,
    discountApr,
  };
}

const LATE_DEFAULTS = {
  amount: 1200,
  daysOverdue: 15,
  annualCarryRate: 24,
  waitDays: 30,
  waitRecoveryPct: 70,
  chaseHours: 3,
  hourlyRate: 85,
  chaseDays: 14,
  chaseRecoveryPct: 85,
  settlementDiscountPct: 10,
  settlementDays: 5,
  settlementRecoveryPct: 80,
  collectionCommissionPct: 30,
  collectionDays: 90,
  collectionRecoveryPct: 45,
};

function percent(value, label, fallback) {
  const parsed = finiteNumber(value, label, fallback);
  if (parsed < 0 || parsed > 100) throw new Error(`${label} must be between 0 and 100`);
  return parsed;
}

function days(value, label, fallback) {
  const parsed = Math.round(finiteNumber(value, label, fallback));
  if (parsed < 0) throw new Error(`${label} must be zero or more days`);
  if (parsed > 1095) throw new Error(`${label} must be 1095 days or fewer`);
  return parsed;
}

/**
 * The invoice is already late. Four things the operator can actually do,
 * scored on the same money: keep waiting, chase it themselves, offer a
 * settlement to close it today, or hand it to a collection agency.
 *
 * Each path is expected value, not a promise: the cash it pays if it works,
 * discounted by simple carrying cost over the days until that cash lands,
 * times the share of the time the operator thinks it works — minus the chase
 * labour, which is spent whether or not they ever get paid. That last term is
 * why chasing an invoice yourself so often loses to a discount: the hours are
 * certain and the recovery is not.
 *
 * Carrying cost is the same simple model the rest of this file uses, so at
 * very long horizons with very expensive money it can exceed the invoice.
 * Inputs are bounded (three years, under 1000%) rather than clamped, so the
 * arithmetic the operator sees is the arithmetic they typed.
 *
 * Arithmetic only. It does not tell anyone to settle, to give up, or to send
 * a debt to collections, and it does not model what any of those is allowed
 * to do — collection practices and late fees are regulated and vary.
 */
export function compareLateInvoice(input = {}) {
  if (!input || typeof input !== "object") throw new Error("Enter invoice details.");
  const amount = finiteNumber(input.amount, "Invoice amount", LATE_DEFAULTS.amount);
  if (amount <= 0) throw new Error("Invoice amount must be greater than zero");

  const annualCarryRate = finiteNumber(
    input.annualCarryRate, "Annual carrying-cost rate", LATE_DEFAULTS.annualCarryRate,
  );
  if (annualCarryRate < 0) throw new Error("Annual carrying-cost rate must be non-negative");
  if (annualCarryRate >= 1000) throw new Error("Annual carrying-cost rate must be below 1000%");

  const hourlyRate = finiteNumber(input.hourlyRate, "Your hourly rate", LATE_DEFAULTS.hourlyRate);
  if (hourlyRate < 0) throw new Error("Your hourly rate must be non-negative");
  const chaseHours = finiteNumber(input.chaseHours, "Hours spent chasing", LATE_DEFAULTS.chaseHours);
  if (chaseHours < 0) throw new Error("Hours spent chasing must be non-negative");

  const daysOverdue = days(input.daysOverdue, "Days overdue", LATE_DEFAULTS.daysOverdue);
  const waitDays = days(input.waitDays, "Days to payment if you wait", LATE_DEFAULTS.waitDays);
  const chaseDays = days(input.chaseDays, "Days to payment if you chase", LATE_DEFAULTS.chaseDays);
  const settlementDays = days(input.settlementDays, "Days to settlement payment", LATE_DEFAULTS.settlementDays);
  const collectionDays = days(input.collectionDays, "Days to a collections payout", LATE_DEFAULTS.collectionDays);

  const waitRecoveryPct = percent(input.waitRecoveryPct, "Chance they pay if you wait", LATE_DEFAULTS.waitRecoveryPct);
  const chaseRecoveryPct = percent(input.chaseRecoveryPct, "Chance they pay if you chase", LATE_DEFAULTS.chaseRecoveryPct);
  const settlementRecoveryPct = percent(input.settlementRecoveryPct, "Chance they take the settlement", LATE_DEFAULTS.settlementRecoveryPct);
  const collectionRecoveryPct = percent(input.collectionRecoveryPct, "Chance collections recovers", LATE_DEFAULTS.collectionRecoveryPct);

  const settlementDiscountPct = finiteNumber(
    input.settlementDiscountPct, "Settlement discount", LATE_DEFAULTS.settlementDiscountPct,
  );
  if (settlementDiscountPct < 0 || settlementDiscountPct >= 100) {
    throw new Error("Settlement discount must be at least 0 and below 100");
  }
  const collectionCommissionPct = finiteNumber(
    input.collectionCommissionPct, "Collection commission", LATE_DEFAULTS.collectionCommissionPct,
  );
  if (collectionCommissionPct < 0 || collectionCommissionPct >= 100) {
    throw new Error("Collection commission must be at least 0 and below 100");
  }

  // Cash retained per dollar of invoice once float over `d` days is priced.
  const floatFactor = d => 1 - (annualCarryRate / 100) * (d / 365);
  const chaseCost = chaseHours * hourlyRate;

  const build = (key, label, phrase, cashShare, toCash, recoveryPct, labour) => {
    const cashIfPaid = amount * cashShare;
    const carry = cashIfPaid - cashIfPaid * floatFactor(toCash);
    const netIfPaid = cashIfPaid - carry;
    return {
      key,
      label,
      phrase,
      cashIfPaid,
      daysToCash: toCash,
      recoveryPct,
      carry,
      netIfPaid,
      labourCost: labour,
      expected: (recoveryPct / 100) * netIfPaid - labour,
    };
  };

  const paths = [
    build("wait", "Keep waiting", "waiting it out", 1, waitDays, waitRecoveryPct, 0),
    build("chase", "Chase it yourself", "chasing it yourself", 1, chaseDays, chaseRecoveryPct, chaseCost),
    build("settle", "Offer a settlement", "offering a settlement", 1 - settlementDiscountPct / 100, settlementDays, settlementRecoveryPct, 0),
    build("collections", "Send to collections", "sending it to collections", 1 - collectionCommissionPct / 100, collectionDays, collectionRecoveryPct, 0),
  ];

  const ranked = [...paths].sort((a, b) => b.expected - a.expected);
  const best = ranked[0];
  const runnerUp = ranked[1];
  const bestOther = key => Math.max(...paths.filter(p => p.key !== key).map(p => p.expected));

  // Each break-even is the input value at which that path exactly ties the
  // best of the other three. Null means no value in the input's own legal
  // range gets there — which is a real answer, not a missing one.
  const inRange = (value, min, max) => (
    Number.isFinite(value) && value >= min && value <= max ? value : null
  );
  const settleCeiling = settlementRecoveryPct > 0 && floatFactor(settlementDays) !== 0
    ? (settlementRecoveryPct / 100) * amount * floatFactor(settlementDays)
    : 0;
  const collectCeiling = collectionRecoveryPct > 0 && floatFactor(collectionDays) !== 0
    ? (collectionRecoveryPct / 100) * amount * floatFactor(collectionDays)
    : 0;

  return {
    amount,
    daysOverdue,
    annualCarryRate,
    hourlyRate,
    chaseHours,
    chaseCost,
    settlementDiscountPct,
    collectionCommissionPct,
    // Float already burned while the invoice sat unpaid. Identical in every
    // path, so it never changes the ranking — it is what the delay has
    // already cost, shown so the ranking is not read as the whole bill.
    sunkCarry: amount - amount * floatFactor(daysOverdue),
    paths,
    ranked,
    best,
    runnerUp,
    gapToRunnerUp: best.expected - runnerUp.expected,
    breakEven: {
      chaseHours: hourlyRate > 0
        ? inRange(
          ((chaseRecoveryPct / 100) * amount * floatFactor(chaseDays) - bestOther("chase")) / hourlyRate,
          0, Infinity,
        )
        : null,
      settlementDiscountPct: settleCeiling > 0
        ? inRange(100 * (1 - bestOther("settle") / settleCeiling), 0, 100)
        : null,
      collectionCommissionPct: collectCeiling > 0
        ? inRange(100 * (1 - bestOther("collections") / collectCeiling), 0, 100)
        : null,
      collectionRecoveryPct: (() => {
        const perPoint = amount * (1 - collectionCommissionPct / 100) * floatFactor(collectionDays);
        if (perPoint <= 0) return null;
        return inRange(100 * bestOther("collections") / perPoint, 0, 100);
      })(),
    },
  };
}

/**
 * One-sentence readout of the overdue comparison. Arithmetic only — it does
 * not tell anyone to settle, to escalate, or to walk away.
 */
export function lateInvoiceNote(comparison) {
  const { best, runnerUp, gapToRunnerUp, breakEven } = comparison;
  const hours = breakEven.chaseHours == null ? "" : (
    best.key === "chase"
      ? ` It stops being the best path once chasing takes more than ${breakEven.chaseHours.toFixed(1)} hours at ${money(comparison.hourlyRate)}/hour.`
      : ` Chasing it yourself only gets ahead of that if you close it in under ${breakEven.chaseHours.toFixed(1)} hours at ${money(comparison.hourlyRate)}/hour.`
  );
  const tie = gapToRunnerUp === 0
    ? ` On these numbers ${runnerUp.phrase} is worth exactly the same.`
    : ` That is ${money(gapToRunnerUp)} more than ${runnerUp.phrase} (${money(runnerUp.expected)}).`;
  return (
    `On a ${money(comparison.amount)} invoice ${comparison.daysOverdue} days overdue, ` +
    `${best.phrase} is worth ${money(best.expected)} once you price ` +
    `${best.recoveryPct}% odds, the wait, and any time you spend.${tie}${hours}`
  );
}

/**
 * One-sentence readout. Arithmetic only — it does not tell them to offer
 * 2/10 Net 30 or to wait for the full invoice.
 */
export function earlyPayNote(comparison) {
  const rate = `${comparison.annualCarryRate.toFixed(1)}%`;
  const breakEven = comparison.breakEvenAnnualRate == null
    ? ""
    : ` Early-pay and waiting match at a ${comparison.breakEvenAnnualRate.toFixed(1)}% annual carrying-cost assumption.`;
  if (comparison.earlyBeatsWait) {
    return (
      `On this invoice, a ${comparison.earlyPayDiscountPct}% discount for payment in ` +
      `${comparison.earlyPayDays} days leaves ${money(comparison.earlyAfterFloat)} ` +
      `after ${money(comparison.earlyCarry)} of modeled carrying cost. Waiting ` +
      `${comparison.termsDays} days for the full ${money(comparison.waitCash)} leaves ` +
      `${money(comparison.waitAfterFloat)} — ${money(comparison.earlyPremium)} behind — ` +
      `because ${rate} money for the extra ${comparison.daysSaved} days costs more than ` +
      `the ${money(comparison.discountCost)} discount.${breakEven}`
    );
  }
  return (
    `On this invoice, waiting ${comparison.termsDays} days for the full ` +
    `${money(comparison.waitCash)} still leaves ${money(comparison.waitAfterFloat)} ` +
    `after ${money(comparison.waitCarry)} of modeled carrying cost — ` +
    `${money(-comparison.earlyPremium)} ahead of the ${comparison.earlyPayDiscountPct}% ` +
    `discount for payment in ${comparison.earlyPayDays} days ` +
    `(${money(comparison.earlyAfterFloat)}). At ${rate}, the ` +
    `${money(comparison.discountCost)} you keep by waiting still covers the float.${breakEven}`
  );
}

/* ------------------------------------------------------------------ *
 * When the cash actually lands
 *
 * `calculateTerms` returns the contractual due date: invoice date plus
 * the terms. That is the date the invoice says, and it is the date a
 * late fee would start from — but it is very often not the date money
 * arrives. Accounts-payable departments pay in runs: weekdays only, the
 * 1st and 15th, once a month, one weekday a week. An invoice due on a
 * Saturday, or due the 16th at a client who pays on the 1st and 15th,
 * sits until the next run.
 *
 * Two decisions fall out of that, and neither is visible from the due
 * date alone:
 *   - the drift between "due" and "paid", and what those days cost at
 *     the carrying rate the operator already types in; and
 *   - that a longer term often costs nothing, because Net 45 and Net 30
 *     can land on the very same run.
 *
 * Deterministic calendar arithmetic. It models the client's stated
 * schedule; it does not predict whether a client actually pays on time.
 * ------------------------------------------------------------------ */

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const PAY_RUN_SCHEDULES = [
  { id: 'on-due', label: 'Exactly on the due date' },
  { id: 'weekdays', label: 'Weekdays only (skips weekends)' },
  { id: 'semimonthly', label: 'Twice a month (1st and 15th)' },
  { id: 'monthly', label: 'Once a month, on a set day' },
  { id: 'weekly', label: 'Once a week, on a set weekday' },
];

const SCHEDULE_IDS = PAY_RUN_SCHEDULES.map(s => s.id);

function utcDate(year, month, day) {
  return new Date(Date.UTC(year, month, day));
}

function daysInMonth(year, month) {
  return utcDate(year, month + 1, 0).getUTCDate();
}

function addDays(date, count) {
  return new Date(date.getTime() + count * DAY);
}

function diffDays(later, earlier) {
  return Math.round((later.getTime() - earlier.getTime()) / DAY);
}

function toISO(date) {
  return date.toISOString().slice(0, 10);
}

function parseISO(iso) {
  const parts = typeof iso === 'string' && iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() !== Number(parts[1])) return null;
  if (date.getUTCMonth() + 1 !== Number(parts[2])) return null;
  if (date.getUTCDate() !== Number(parts[3])) return null;
  return date;
}

// A monthly run day is clamped to the end of short months: "the 31st"
// is the 28th or 29th in February, which is what AP systems do.
function monthlyRunDay(year, month, payRunDay) {
  return Math.min(payRunDay, daysInMonth(year, month));
}

function isPayRunDay(date, schedule, payRunDay, payRunWeekday) {
  const weekday = date.getUTCDay();
  if (schedule === 'weekdays') return weekday !== 0 && weekday !== 6;
  if (schedule === 'weekly') return weekday === payRunWeekday;
  if (schedule === 'semimonthly') return date.getUTCDate() === 1 || date.getUTCDate() === 15;
  if (schedule === 'monthly') {
    return date.getUTCDate() === monthlyRunDay(date.getUTCFullYear(), date.getUTCMonth(), payRunDay);
  }
  return true;
}

/** First pay-run date on or after `date`. */
function nextPayRun(date, schedule, payRunDay, payRunWeekday) {
  if (schedule === 'on-due') return date;
  if (schedule === 'semimonthly') {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    for (const candidate of [utcDate(year, month, 1), utcDate(year, month, 15), utcDate(year, month + 1, 1)]) {
      if (candidate.getTime() >= date.getTime()) return candidate;
    }
    return utcDate(year, month + 1, 1);
  }
  if (schedule === 'monthly') {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const thisMonth = utcDate(year, month, monthlyRunDay(year, month, payRunDay));
    if (thisMonth.getTime() >= date.getTime()) return thisMonth;
    return utcDate(year, month + 1, monthlyRunDay(year, month + 1, payRunDay));
  }
  // weekdays and weekly are at most a week out, so stepping is clearest.
  let cursor = date;
  for (let step = 0; step < 8; step += 1) {
    if (isPayRunDay(cursor, schedule, payRunDay, payRunWeekday)) return cursor;
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

/** Latest pay-run date strictly before `date`, or null when every day pays. */
function previousPayRun(date, schedule, payRunDay, payRunWeekday) {
  if (schedule === 'on-due') return null;
  let cursor = addDays(date, -1);
  for (let step = 0; step < 400; step += 1) {
    if (isPayRunDay(cursor, schedule, payRunDay, payRunWeekday)) return cursor;
    cursor = addDays(cursor, -1);
  }
  return null;
}

function readSchedule(input) {
  const schedule = input.payRun === undefined || input.payRun === '' ? 'weekdays' : String(input.payRun);
  if (!SCHEDULE_IDS.includes(schedule)) throw new Error('Choose a payment schedule from the list.');
  const payRunDay = Math.round(finiteNumber(input.payRunDay, 'Pay-run day of month', 1));
  if (schedule === 'monthly' && (payRunDay < 1 || payRunDay > 31)) {
    throw new Error('Pay-run day of month must be between 1 and 31');
  }
  const payRunWeekday = Math.round(finiteNumber(input.payRunWeekday, 'Pay-run weekday', 5));
  if (schedule === 'weekly' && (payRunWeekday < 0 || payRunWeekday > 6)) {
    throw new Error('Pay-run weekday must be between 0 (Sunday) and 6 (Saturday)');
  }
  return { schedule, payRunDay, payRunWeekday };
}

/**
 * Projects the date cash actually lands, given the client's pay-run
 * schedule, and prices the drift at the carrying rate already on the form.
 */
export function projectSettlement(input = {}) {
  if (!input || typeof input !== 'object') throw new Error('Enter invoice details.');
  const invoiceDate = parseISO(input.invoiceDate);
  if (!invoiceDate) throw new Error('Enter a valid invoice date.');
  const amount = Math.max(0, number(input.amount));
  const termsDays = Math.max(0, Math.round(number(input.termsDays, 30)));
  const annualCarryRate = Math.max(0, finiteNumber(input.annualCarryRate, 'Annual carrying-cost rate', 24));
  const { schedule, payRunDay, payRunWeekday } = readSchedule(input);

  const dueDate = addDays(invoiceDate, termsDays);
  const settlement = nextPayRun(dueDate, schedule, payRunDay, payRunWeekday);
  const driftDays = diffDays(settlement, dueDate);
  const totalWaitDays = diffDays(settlement, invoiceDate);
  const driftCarryCost = carryingCost(amount, annualCarryRate, driftDays);

  // Catching the run before this one requires dating the invoice earlier
  // by exactly the gap between the due date and that run.
  const earlier = previousPayRun(settlement, schedule, payRunDay, payRunWeekday);
  let earlierRun = null;
  if (earlier && earlier.getTime() > invoiceDate.getTime()) {
    const sendEarlierDays = diffDays(dueDate, earlier);
    const daysSooner = diffDays(settlement, earlier);
    // Only worth saying when batching gives leverage — moving the invoice
    // earlier buys *more* days than it gives up. On a weekdays-only
    // schedule every shift is 1-for-1, which is not an insight.
    if (sendEarlierDays > 0 && daysSooner > sendEarlierDays) {
      earlierRun = {
        runDate: toISO(earlier),
        sendEarlierDays,
        daysSooner,
        invoiceBy: toISO(addDays(earlier, -termsDays)),
        carryCostSaved: carryingCost(amount, annualCarryRate, daysSooner),
      };
    }
  }

  return {
    schedule,
    scheduleLabel: PAY_RUN_SCHEDULES.find(s => s.id === schedule).label,
    payRunDay,
    payRunWeekday,
    payRunWeekdayName: WEEKDAY_NAMES[((payRunWeekday % 7) + 7) % 7],
    invoiceDate: toISO(invoiceDate),
    dueDate: toISO(dueDate),
    settlementDate: toISO(settlement),
    driftDays,
    totalWaitDays,
    annualCarryRate,
    driftCarryCost,
    landsOnDueDate: driftDays === 0,
    earlierRun,
  };
}

const DEFAULT_TERMS_LADDER = [7, 15, 30, 45, 60];

/**
 * The same invoice under a ladder of payment terms, showing where cash
 * lands for each. Terms that land on the same run as a shorter term cost
 * the operator nothing in cash timing — that is the row worth seeing.
 */
export function compareTermsLandings(input = {}, ladder = DEFAULT_TERMS_LADDER) {
  const own = Math.max(0, Math.round(number(input.termsDays, 30)));
  const termsList = [...new Set([...ladder, own])].sort((a, b) => a - b);
  const rows = termsList.map(termsDays => {
    const projection = projectSettlement({ ...input, termsDays });
    return {
      termsDays,
      dueDate: projection.dueDate,
      settlementDate: projection.settlementDate,
      driftDays: projection.driftDays,
      totalWaitDays: projection.totalWaitDays,
      isCurrent: termsDays === own,
      landsWith: null,
      freeExtraDays: 0,
    };
  });
  // Annotate each row with the shortest term landing on the same day.
  const firstBySettlement = new Map();
  for (const row of rows) {
    if (!firstBySettlement.has(row.settlementDate)) {
      firstBySettlement.set(row.settlementDate, row.termsDays);
      continue;
    }
    const shortest = firstBySettlement.get(row.settlementDate);
    row.landsWith = shortest;
    row.freeExtraDays = row.termsDays - shortest;
  }
  return rows;
}

/** One-sentence readout of the settlement projection. Arithmetic only. */
export function settlementNote(projection) {
  if (projection.schedule === 'on-due') {
    return `Assuming payment exactly on the due date, cash lands ${projection.settlementDate}, ${projection.totalWaitDays} days after you invoice.`;
  }
  const base = projection.landsOnDueDate
    ? `The due date ${projection.dueDate} is itself a pay-run day, so cash lands ${projection.settlementDate} — ${projection.totalWaitDays} days after you invoice.`
    : `The invoice is due ${projection.dueDate}, but the next pay run is ${projection.settlementDate}, so cash lands ${projection.driftDays} day${projection.driftDays === 1 ? '' : 's'} later — ${projection.totalWaitDays} days after you invoice. Those ${projection.driftDays} day${projection.driftDays === 1 ? '' : 's'} cost about ${money(projection.driftCarryCost)} at ${projection.annualCarryRate.toFixed(1)}%.`;
  if (!projection.earlierRun) return base;
  const { sendEarlierDays, daysSooner, invoiceBy, carryCostSaved } = projection.earlierRun;
  return `${base} Dating this invoice ${sendEarlierDays} day${sendEarlierDays === 1 ? '' : 's'} earlier — by ${invoiceBy} — would catch the ${projection.earlierRun.runDate} run and be paid ${daysSooner} day${daysSooner === 1 ? '' : 's'} sooner, worth about ${money(carryCostSaved)} of carrying cost.`;
}

export const FACTOR_DEFAULTS = {
  factorFeePct: 3,
  advancePct: 90,
  reserveDays: 35,
};

/**
 * Invoice factoring versus waiting for the client to pay. Distinct from
 * 2/10 Net 30: that discount is money you give the client. This fee is
 * money you pay a third party to take the receivable. Advance arrives
 * today; the reserve arrives after the client pays. Arithmetic only —
 * it does not say to factor or to wait.
 */
export function compareFactor(input = {}) {
  if (!input || typeof input !== "object") throw new Error("Enter invoice details.");
  const amount = finiteNumber(input.amount, "Invoice amount");
  if (amount <= 0) throw new Error("Invoice amount must be greater than zero");
  const termsDays = Math.round(finiteNumber(input.termsDays, "Payment terms", 30));
  if (termsDays < 0) throw new Error("Payment terms must be zero or more days");
  const factorFeePct = finiteNumber(
    input.factorFeePct,
    "Factor fee",
    FACTOR_DEFAULTS.factorFeePct,
  );
  if (factorFeePct < 0 || factorFeePct >= 100) {
    throw new Error("Factor fee must be at least 0 and below 100");
  }
  const advancePct = finiteNumber(
    input.advancePct,
    "Advance percent",
    FACTOR_DEFAULTS.advancePct,
  );
  if (advancePct <= 0 || advancePct > 100) {
    throw new Error("Advance percent must be above 0 and at most 100");
  }
  const reserveDays = Math.round(finiteNumber(
    input.reserveDays,
    "Reserve days",
    FACTOR_DEFAULTS.reserveDays,
  ));
  if (reserveDays < 0) throw new Error("Reserve days must be zero or more");
  const annualCarryRate = finiteNumber(input.annualCarryRate, "Annual carrying-cost rate", 24);
  if (annualCarryRate < 0) throw new Error("Annual carrying-cost rate must be non-negative");
  if (annualCarryRate >= 1000) throw new Error("Annual carrying-cost rate must be below 1000%");

  const fee = amount * (factorFeePct / 100);
  const advanceFace = amount * (advancePct / 100);
  const advanceNow = advanceFace - fee;
  const reserve = amount - advanceFace;
  const waitCash = amount;
  const waitCarry = carryingCost(waitCash, annualCarryRate, termsDays);
  const waitAfterFloat = waitCash - waitCarry;
  const reserveCarry = carryingCost(reserve, annualCarryRate, reserveDays);
  const factorAfterFloat = advanceNow + reserve - reserveCarry;
  const factorPremium = factorAfterFloat - waitAfterFloat;

  let breakEvenFeePct = null;
  const feeThatMatches = amount - reserveCarry - waitAfterFloat;
  if (amount > 0) {
    breakEvenFeePct = (feeThatMatches / amount) * 100;
    if (breakEvenFeePct < 0) breakEvenFeePct = null;
  }

  let breakEvenAnnualRate = null;
  const waitDayValue = waitCash * termsDays;
  const reserveDayValue = reserve * reserveDays;
  if (waitDayValue !== reserveDayValue) {
    // waitAfter = amount - amount*r*terms/365
    // factorAfter = amount - fee - reserve*r*reserveDays/365
    // set equal: fee = amount*r*(terms - reserveShare*reserveDays)/365
    // r = fee * 365 / (amount*terms - reserve*reserveDays)
    const denom = waitDayValue - reserveDayValue;
    if (denom > 0) {
      breakEvenAnnualRate = (fee * 365) / denom * 100;
      if (breakEvenAnnualRate < 0) breakEvenAnnualRate = null;
    }
  }

  return {
    amount,
    termsDays,
    factorFeePct,
    advancePct,
    reserveDays,
    annualCarryRate,
    fee,
    advanceFace,
    advanceNow,
    reserve,
    waitCash,
    waitCarry,
    waitAfterFloat,
    reserveCarry,
    factorAfterFloat,
    factorPremium,
    factorBeatsWait: factorAfterFloat > waitAfterFloat,
    breakEvenFeePct,
    breakEvenAnnualRate,
  };
}

/**
 * One-sentence readout. Arithmetic only — it does not tell them to
 * factor the invoice or to wait for the client.
 */
export function factorNote(comparison) {
  const rate = `${comparison.annualCarryRate.toFixed(1)}%`;
  const feeLine = comparison.breakEvenFeePct == null
    ? ""
    : ` Factoring and waiting match at a ${comparison.breakEvenFeePct.toFixed(2)}% factor fee.`;
  if (comparison.factorBeatsWait) {
    return (
      `On this invoice, factoring at ${comparison.factorFeePct}% with a ` +
      `${comparison.advancePct}% advance leaves ${money(comparison.factorAfterFloat)} ` +
      `after the ${money(comparison.fee)} fee and ${money(comparison.reserveCarry)} ` +
      `of modeled float on the reserve. Waiting ${comparison.termsDays} days for ` +
      `${money(comparison.waitCash)} leaves ${money(comparison.waitAfterFloat)} — ` +
      `${money(comparison.factorPremium)} behind — because ${rate} money for ` +
      `${comparison.termsDays} days costs more than the factor fee.${feeLine}`
    );
  }
  return (
    `On this invoice, waiting ${comparison.termsDays} days for the full ` +
    `${money(comparison.waitCash)} still leaves ${money(comparison.waitAfterFloat)} ` +
    `after ${money(comparison.waitCarry)} of modeled carrying cost — ` +
    `${money(-comparison.factorPremium)} ahead of factoring at ` +
    `${comparison.factorFeePct}% (${money(comparison.factorAfterFloat)} after the ` +
    `${money(comparison.fee)} fee). At ${rate}, the fee is larger than the float ` +
    `you skip.${feeLine}`
  );
}
