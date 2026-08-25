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
