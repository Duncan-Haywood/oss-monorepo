// Loans: a fixed-rate instalment loan's schedule, and its bank payments split into
// interest (6040) and principal (2200) without typing the split each month.
//
// Books keep `books.loans`:
//   { id: "LN-1", name, cents (amount borrowed), rateBp (annual rate, basis points),
//     months, first (date of the first payment), payment (cents) }
// Interest each month is round(balance * rate / 12). The payment is the level
// annuity amount rounded to the cent; the last one is whatever clears the balance.
// Pure functions. Only fixed-rate, monthly, equal-payment loans: no balloon,
// interest-only period, variable rate or day-count interest.

import { parseCents, parseDate } from "./bank.mjs";
import { confirm } from "./engine.mjs";

export const LOAN_ACCOUNT = "2200", INTEREST_ACCOUNT = "6040";

const clone = (x) => JSON.parse(JSON.stringify(x));
const addMonths = (date, n) => {
  const t = +date.slice(0, 4) * 12 + (+date.slice(5, 7) - 1) + n, y = Math.floor(t / 12), m = (t % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(), d = Math.min(+date.slice(8, 10), last);
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};
const dayGap = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 864e5);

export function levelPayment(cents, rateBp, months) {
  if (rateBp === 0) return Math.round(cents / months);
  const r = rateBp / 10000 / 12;
  return Math.round((cents * r) / (1 - Math.pow(1 + r, -months)));
}

// [{ n, date, payment, interest, principal, balance, extra }] for every payment.
// `loan.extras` ([{ date, cents }], extra principal paid on top of the schedule) is taken
// off the balance after the last instalment dated on or before it, so the same payment
// then clears the loan early: the schedule ends in fewer than `months` rows.
export function loanSchedule(loan) {
  const out = [], extras = [...(loan.extras ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  let bal = loan.cents;
  for (const e of extras) if (e.date < loan.first) bal = Math.max(0, bal - e.cents);
  for (let n = 1; n <= loan.months && bal > 0; n++) {
    const date = addMonths(loan.first, n - 1);
    let extra = 0;
    const interest = Math.round((bal * loan.rateBp) / 120000);
    const principal = n === loan.months ? bal : Math.min(bal, loan.payment - interest);
    bal -= principal;
    // extras dated from this instalment up to (not including) the next one reduce what is left
    const next = addMonths(loan.first, n);
    for (const e of extras) if (e.date >= date && e.date < next && bal > 0) { const x = Math.min(bal, e.cents); extra += x; bal -= x; }
    out.push({ n, date, payment: principal + interest, interest, principal, balance: bal, extra });
  }
  return out;
}

// addLoan(books, { name, amount, rate (percent, e.g. "6.5"), months, first, payment? }) -> { books, loan } or throws.
export function addLoan(booksIn, { name, amount, rate, months, first, payment } = {}) {
  const books = clone(booksIn);
  const cents = typeof amount === "number" ? Math.round(amount * 100) : parseCents(String(amount ?? ""));
  if (!name?.trim()) throw new Error("A loan needs a name.");
  if (!Number.isFinite(cents) || cents <= 0) throw new Error("Amount must be a positive amount.");
  const pct = Number(rate);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error("Rate is an annual percentage, 0 to 100.");
  months = Number(months);
  if (!Number.isInteger(months) || months < 1 || months > 600) throw new Error("Months must be a whole number, 1 to 600.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first ?? "") || !parseDate(first)) throw new Error(`First payment date ${first} is not a YYYY-MM-DD date.`);
  const rateBp = Math.round(pct * 100);
  let pay = levelPayment(cents, rateBp, months);
  if (payment !== undefined && payment !== null) {
    pay = typeof payment === "number" ? Math.round(payment * 100) : parseCents(String(payment));
    if (!Number.isFinite(pay) || pay <= 0) throw new Error("Payment must be a positive amount.");
  }
  books.loans ??= [];
  const loan = { id: `LN-${books.loans.length + 1}`, name: name.trim(), cents, rateBp, months, first, payment: pay };
  if (loanSchedule(loan).at(-1).payment > pay * 1.5 + 100) throw new Error(`Payment ${(pay / 100).toFixed(2)} is too small to pay off the loan in ${months} months.`);
  books.loans.push(loan);
  for (const [code, nm, type] of [[LOAN_ACCOUNT, "Loan payable", "liability"], [INTEREST_ACCOUNT, "Interest and finance charges", "expense"]])
    if (!books.accounts.some((a) => a.code === code)) books.accounts.push({ code, name: nm, type });
  books.accounts.sort((a, b) => a.code.localeCompare(b.code));
  return { books, loan };
}

// addLoanExtra(books, loanId, { amount, date }) -> { books, loan }: record extra principal paid
// on top of the schedule. The schedule shortens; `loan apply` then files the matching bank line.
export function addLoanExtra(booksIn, loanId, { amount, date } = {}) {
  const books = clone(booksIn), loan = (books.loans ?? []).find((l) => l.id === loanId);
  if (!loan) throw new Error(`No loan ${loanId}.`);
  const cents = typeof amount === "number" ? Math.round(amount * 100) : parseCents(String(amount ?? ""));
  if (!Number.isFinite(cents) || cents <= 0) throw new Error("Extra payment must be a positive amount.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !parseDate(date)) throw new Error(`Date ${date} is not a YYYY-MM-DD date.`);
  loan.extras = [...(loan.extras ?? []), { date, cents }];
  return { books, loan };
}

// Split the bank lines that are this loan's scheduled payments: an outflow in the
// account(s) the books hold, exactly the scheduled amount, within `window` days of the
// due date, not yet filed. Each pays the next unmatched instalment. Returns
// { books, matched: [{ id, n, date, interest, principal }], skipped }.
export function applyLoanPayments(booksIn, loanId, { window = 5 } = {}) {
  const loan = (booksIn.loans ?? []).find((l) => l.id === loanId);
  if (!loan) throw new Error(`No loan ${loanId}.`);
  const sched = loanSchedule(loan);
  const used = new Set(booksIn.transactions.filter((t) => t.loan?.id === loanId && t.loan.n).map((t) => t.loan.n));
  const choices = {}, matched = [];
  const open = booksIn.transactions.filter((t) => t.cents < 0 && ["new", "review", "auto"].includes(t.status)).sort((a, b) => a.date.localeCompare(b.date));
  for (const t of open) {
    const row = sched.find((r) => !used.has(r.n) && r.payment === -t.cents && dayGap(r.date, t.date) <= window);
    if (!row) continue;
    used.add(row.n);
    choices[t.id] = [{ account: INTEREST_ACCOUNT, cents: -row.interest }, { account: LOAN_ACCOUNT, cents: -row.principal }].filter((p) => p.cents !== 0);
    matched.push({ id: t.id, n: row.n, date: t.date, interest: row.interest, principal: row.principal });
  }
  // Recorded extra principal payments: an unfiled outflow of that amount near its date goes to 2200.
  const usedExtra = new Set(booksIn.transactions.filter((t) => t.loan?.id === loanId && t.loan.extra !== undefined).map((t) => t.loan.extra));
  (loan.extras ?? []).forEach((e, i) => {
    if (usedExtra.has(i)) return;
    const t = open.find((x) => !choices[x.id] && x.cents === -e.cents && dayGap(e.date, x.date) <= window);
    if (!t) return;
    choices[t.id] = LOAN_ACCOUNT;
    matched.push({ id: t.id, extra: i, date: t.date, interest: 0, principal: e.cents });
  });
  // A payment with no interest part (a 0% loan) is filed plainly to the loan account.
  for (const k of Object.keys(choices)) if (choices[k].length === 1) choices[k] = LOAN_ACCOUNT;
  const books = matched.length ? confirm(booksIn, choices) : clone(booksIn);
  for (const m of matched) books.transactions.find((t) => t.id === m.id).loan = m.extra === undefined ? { id: loanId, n: m.n } : { id: loanId, extra: m.extra };
  return { books, matched };
}

// Per loan: next payment, balance by schedule after the payments matched, interest this far.
export function loanRegister(books) {
  const rows = (books.loans ?? []).map((loan) => {
    const sched = loanSchedule(loan);
    const paid = new Set(books.transactions.filter((t) => t.loan?.id === loan.id && t.loan.n).map((t) => t.loan.n));
    const extraPaid = books.transactions.filter((t) => t.loan?.id === loan.id && t.loan.extra !== undefined).reduce((s, t) => s - t.cents, 0);
    const done = sched.filter((r) => paid.has(r.n));
    const next = sched.find((r) => !paid.has(r.n)) ?? null;
    return {
      id: loan.id, name: loan.name, cents: loan.cents, rate: loan.rateBp / 100, months: sched.length, payment: loan.payment,
      paid: done.length, interestPaid: done.reduce((s, r) => s + r.interest, 0), principalPaid: done.reduce((s, r) => s + r.principal, 0),
      extraPaid, balance: loan.cents - extraPaid - done.reduce((s, r) => s + r.principal, 0), next: next && { n: next.n, date: next.date, payment: next.payment, interest: next.interest },
      totalInterest: sched.reduce((s, r) => s + r.interest, 0),
    };
  });
  return { rows, balance: rows.reduce((s, r) => s + r.balance, 0) };
}
