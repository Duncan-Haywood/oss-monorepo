// Payroll tax deposit penalty estimator (IRC 6656 failure-to-deposit tiers).
// Pure functions, no I/O, no network. The interest rate and the trust-fund
// share are the visitor's own assumptions; this is an estimator, not advice.

const DAY = 86400000;
const parseDay = (s, name) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) throw new Error(`${name} must be a date (YYYY-MM-DD)`);
  const t = Date.parse(`${s}T00:00:00Z`);
  if (!Number.isFinite(t)) throw new Error(`${name} is not a valid date`);
  return t;
};
const num = (v, name, { min = 0, max = Infinity } = {}) => {
  const n = Number(v);
  if (v === "" || v == null || !Number.isFinite(n)) throw new Error(`${name} must be a number`);
  if (n < min || n > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return n;
};
const cents = (n) => Math.round((n + Number.EPSILON) * 100) / 100 + 0;

// Percent of the late deposit charged, by days late.
export function tierPct(daysLate, daysAfterNotice = null) {
  if (daysLate <= 0) return 0;
  if (daysAfterNotice != null && daysAfterNotice > 10) return 15;
  if (daysLate <= 5) return 2;
  if (daysLate <= 15) return 5;
  return 10;
}

// Days from `daysLate` until the next tier steps up (null at the top tier).
export function daysToNextTier(daysLate) {
  if (daysLate <= 0) return 1;
  if (daysLate <= 5) return 6 - daysLate;
  if (daysLate <= 15) return 16 - daysLate;
  return null;
}

export function estimate(input) {
  const asOf = parseDay(input.asOf, "As-of date");
  const rate = num(input.ratePct ?? 7, "Interest rate %", { max: 30 }) / 100;
  const trust = num(input.trustSharePct ?? 75, "Trust-fund share %", { max: 100 }) / 100;
  const notice = input.noticeDate ? parseDay(input.noticeDate, "IRS notice date") : null;
  if (!Array.isArray(input.deposits) || input.deposits.length === 0) throw new Error("Add at least one deposit");

  const lines = input.deposits.map((d, i) => {
    const label = d.label || `Deposit ${i + 1}`;
    const amount = num(d.amount, `${label} amount`);
    const due = parseDay(d.due, `${label} due date`);
    const paid = d.paid ? parseDay(d.paid, `${label} paid date`) : null;
    if (paid != null && paid > asOf) throw new Error(`${label} paid date is after the as-of date`);
    const end = paid ?? asOf;
    const daysLate = Math.max(0, Math.round((end - due) / DAY));
    const afterNotice = notice != null ? Math.round((end - notice) / DAY) : null;
    const pct = tierPct(daysLate, afterNotice);
    const penalty = amount * (pct / 100);
    const interest = amount * (Math.pow(1 + rate / 365, daysLate) - 1);
    const unpaid = paid == null && daysLate > 0;
    return {
      label, amount: cents(amount), daysLate, penaltyPct: pct, penalty: cents(penalty),
      interest: cents(interest), total: cents(penalty + interest), unpaid,
      trustFundAtRisk: unpaid ? cents(amount * trust) : 0,
      daysToNextTier: unpaid ? daysToNextTier(daysLate) : null,
    };
  });

  const sum = (k) => cents(lines.reduce((a, l) => a + l[k], 0));
  return {
    lines,
    lateAmount: cents(lines.filter((l) => l.daysLate > 0).reduce((a, l) => a + l.amount, 0)),
    totalPenalty: sum("penalty"),
    totalInterest: sum("interest"),
    totalCost: cents(sum("penalty") + sum("interest")),
    unpaidAmount: cents(lines.filter((l) => l.unpaid).reduce((a, l) => a + l.amount, 0)),
    trustFundAtRisk: sum("trustFundAtRisk"),
  };
}

// What waiting `days` more days costs on the deposits still unpaid today.
export function costOfWaiting(input, days) {
  const asOf = parseDay(input.asOf, "As-of date") + days * DAY;
  const later = new Date(asOf).toISOString().slice(0, 10);
  const now = estimate(input);
  const then = estimate({ ...input, asOf: later });
  return { asOf: later, extra: cents(then.totalCost - now.totalCost), totalCost: then.totalCost };
}

export const EXAMPLE = {
  asOf: "2026-10-12", ratePct: 7, trustSharePct: 75, noticeDate: "",
  deposits: [
    { label: "Sept 12 deposit", amount: 6400, due: "2026-09-15", paid: "2026-09-18" },
    { label: "Sept 26 deposit", amount: 6900, due: "2026-09-30", paid: "" },
    { label: "Oct 9 deposit", amount: 7200, due: "2026-10-09", paid: "" },
  ],
};

export function renderText(r) {
  const m = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return [
    ...r.lines.map((l) => `${l.label}: ${l.daysLate} days late, ${l.penaltyPct}% penalty ${m(l.penalty)}, interest ${m(l.interest)}${l.unpaid ? " (still unpaid)" : ""}`),
    `Penalty ${m(r.totalPenalty)} + interest ${m(r.totalInterest)} = ${m(r.totalCost)}`,
    `Still unpaid ${m(r.unpaidAmount)}; trust-fund portion personally at risk ~${m(r.trustFundAtRisk)}`,
  ].join("\n");
}
