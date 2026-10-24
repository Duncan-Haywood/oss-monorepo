// Prepaid expenses: a year of insurance, software or rent paid up front. The bank
// line is filed to Prepaid expenses (1400), a balance sheet asset; this register
// moves it to the expense account one month at a time, so each month's profit
// carries its own share and the balance sheet shows what is still paid ahead.
//
// Books keep `books.prepaids`:
//   { id: "PP-1", name, date (first month covered), cents, months, expenseAccount }
// Month k carries floor(cents*k/months) less the months before it, so the last month
// closes the amount exactly. Pure functions.

import { parseCents, parseDate } from "./bank.mjs";

export const PREPAID_ACCOUNT = "1400", DEFAULT_EXPENSE = "6030";

const monthEnd = (y, m) => { const d = new Date(Date.UTC(y, m, 0)).getUTCDate(); return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`; };
const addMonths = (date, n) => { const t = +date.slice(0, 4) * 12 + (+date.slice(5, 7) - 1) + n; return { y: Math.floor(t / 12), m: (t % 12) + 1 }; };
const clone = (x) => JSON.parse(JSON.stringify(x));

// [{ date (month end), cents, accumulated }] from the first month through `through`.
export function prepaidSchedule(p, through = null) {
  const out = [];
  let prev = 0;
  for (let k = 1; k <= p.months; k++) {
    const at = addMonths(p.date, k - 1), date = monthEnd(at.y, at.m);
    if (through && date > monthEnd(+through.slice(0, 4), +through.slice(5, 7))) break;
    const cum = Math.floor((p.cents * k) / p.months);
    if (cum !== prev) out.push({ date, cents: cum - prev, accumulated: cum });
    prev = cum;
  }
  return out;
}

// Booked through the end of the latest month that has a transaction or document.
export function prepaidThrough(books) {
  return [...(books.transactions ?? []).map((t) => t.date), ...(books.documents ?? []).map((d) => d.date), ...(books.prepaids ?? []).map((p) => p.date)].sort().at(-1) ?? null;
}

export function prepaidEntries(books) {
  const through = prepaidThrough(books);
  const out = [];
  for (const p of books.prepaids ?? [])
    for (const r of prepaidSchedule(p, through))
      out.push({ id: `${p.id}-${r.date.slice(0, 7)}`, date: r.date, memo: `Prepaid, ${p.name}`, source: "prepaid", lines: [{ account: p.expenseAccount, debit: r.cents, credit: 0 }, { account: PREPAID_ACCOUNT, debit: 0, credit: r.cents }] });
  return out;
}

// addPrepaid(books, { name, date, amount, months, expenseAccount }) -> { books, prepaid } or throws.
export function addPrepaid(booksIn, { name, date, amount, months = 12, expenseAccount = DEFAULT_EXPENSE } = {}) {
  const books = clone(booksIn);
  const cents = typeof amount === "number" ? Math.round(amount * 100) : parseCents(String(amount ?? ""));
  if (!name?.trim()) throw new Error("A prepaid item needs a name.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !parseDate(date)) throw new Error(`Date ${date} is not a YYYY-MM-DD date.`);
  if (!Number.isFinite(cents) || cents <= 0) throw new Error("Amount must be a positive amount.");
  months = Number(months);
  if (!Number.isInteger(months) || months < 2 || months > 60) throw new Error("Months must be a whole number, 2 to 60.");
  if (!books.accounts.some((a) => a.code === expenseAccount && a.type === "expense")) throw new Error(`${expenseAccount} is not an expense account in the chart.`);
  if (books.lockedThrough && date <= books.lockedThrough) throw new Error(`${date} is in the period locked through ${books.lockedThrough}. Unlock it first.`);
  books.prepaids ??= [];
  const id = `PP-${books.prepaids.length + 1}`;
  const prepaid = { id, name: name.trim(), date, cents, months, expenseAccount };
  books.prepaids.push(prepaid);
  if (!books.accounts.some((a) => a.code === PREPAID_ACCOUNT)) {
    books.accounts.push({ code: PREPAID_ACCOUNT, name: "Prepaid expenses", type: "asset" });
    books.accounts.sort((a, b) => a.code.localeCompare(b.code));
  }
  return { books, prepaid };
}

// Rows with the amount used up and still paid ahead as of a date, plus totals.
export function prepaidRegister(books, asOf = null) {
  const at = asOf ?? prepaidThrough(books);
  const rows = (books.prepaids ?? []).map((p) => {
    const used = at ? (prepaidSchedule(p, at).at(-1)?.accumulated ?? 0) : 0;
    return { id: p.id, name: p.name, date: p.date, months: p.months, expenseAccount: p.expenseAccount, cents: p.cents, expensed: used, remaining: p.cents - used };
  });
  return { asOf: at, rows, cents: rows.reduce((s, r) => s + r.cents, 0), remaining: rows.reduce((s, r) => s + r.remaining, 0) };
}
