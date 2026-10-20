// UK statutory late-payment interest for business-to-business invoices under
// the Late Payment of Commercial Debts (Interest) Act 1998: interest at 8%
// over the Bank of England reference rate, plus fixed compensation by debt
// size. Arithmetic only. The reference rate is typed in by the user because it
// is reset every six months and a stale hardcoded value would be wrong.

const DAY = 86400000;
export const STATUTORY_MARGIN_PCT = 8;

function parseDate(value, label) {
  const m = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m && new Date(`${value}T00:00:00Z`);
  if (!d || Number.isNaN(d.getTime()) || d.getUTCFullYear() !== Number(m[1])
    || d.getUTCMonth() + 1 !== Number(m[2]) || d.getUTCDate() !== Number(m[3])) {
    throw new Error(`Enter a valid ${label}.`);
  }
  return d;
}

function amountOf(value, label, { allowZero = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) throw new Error(`${label} must be ${allowZero ? 'zero or more' : 'greater than zero'}.`);
  return n;
}

/** Fixed compensation per late invoice, by the size of the debt (GBP). */
export function fixedCompensation(debt) {
  if (debt < 1000) return 40;
  if (debt < 10000) return 70;
  return 100;
}

export function statutoryLateInterest(input = {}) {
  if (!input || typeof input !== 'object') throw new Error('Enter invoice details.');
  const debt = amountOf(input.amount, 'Amount unpaid');
  const baseRatePct = amountOf(input.baseRatePct, 'Reference rate', { allowZero: true });
  if (baseRatePct >= 50) throw new Error('Reference rate must be below 50%.');
  const due = parseDate(input.dueDate, 'due date');
  const asOf = parseDate(input.asOfDate, 'date of calculation');
  const daysLate = Math.max(0, Math.round((asOf - due) / DAY));
  const annualRatePct = baseRatePct + STATUTORY_MARGIN_PCT;
  const interest = debt * (annualRatePct / 100) * (daysLate / 365);
  const compensation = daysLate > 0 ? fixedCompensation(debt) : 0;
  return {
    debt, baseRatePct, annualRatePct, daysLate,
    interest, perDay: debt * (annualRatePct / 100) / 365,
    compensation, total: debt + interest + compensation,
    claimable: interest + compensation,
  };
}

export function statutoryNote(r) {
  const gbp = n => `£${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  if (r.daysLate === 0) return 'Not late yet, so no statutory interest or fixed compensation has accrued.';
  return `On ${gbp(r.debt)} that is ${r.daysLate} days late, interest at ${r.annualRatePct}% a year is ${gbp(r.interest)} (${gbp(r.perDay)} a day), plus ${gbp(r.compensation)} fixed compensation: ${gbp(r.claimable)} on top of the invoice, if the Act applies to this contract.`;
}
