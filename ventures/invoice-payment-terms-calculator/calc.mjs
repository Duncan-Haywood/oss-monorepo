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
