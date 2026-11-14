// Deferred (unearned) revenue: a customer pays up front for service you deliver
// later. An annual software plan, a six-month retainer, a 10-class pass, a year of
// maintenance. The money is in the bank but has not been earned yet, so the
// receipt is filed to Unearned revenue (2400), a balance sheet liability, and this
// register moves it to income as the service is delivered. It is the mirror of the
// prepaid register (prepaid.mjs), on the other side of the balance sheet.
//
// Books keep `books.deferrals`:
//   { id: "DR-1", name, customer, received, start, end, cents, method, incomeAccount,
//     cancelled?: { date, keep } }
// `start` and `end` are the service period, both days included.
//
// Two ways to spread it:
//   daily   (default): by days of service. A plan running 15 Jan to 14 Jan earns
//           17/365 in January and 31/365 in February. Through any month end the
//           amount earned is floor(cents * days served / days in period), so the
//           last month closes the amount exactly and no cent is lost.
//   monthly: an equal share per calendar month the period touches, whatever day it
//           starts, the way many small firms book a retainer.
// Each month's share is one journal entry dated at the month end (or the service
// end, when that comes first), debit 2400 and credit the income account.
//
// Cancellation: `cancelDeferral` stops earning on a date. What is unearned then
// either stays in 2400 as a refund you owe (file the refund payment to 2400), or,
// with keep, is earned that day (a non-refundable plan).
//
// The waterfall (`deferredWaterfall`) is the schedule a subscription business,
// its lender or its buyer asks for: what is still to be earned, month by month,
// and how much of it falls in the next twelve months (a current liability) or
// later (long term).
//
// Pure functions, no DOM, no network. Not accounting advice: ASC 606 and IFRS 15
// have more to say about bundles, set-up fees and variable pricing than a straight
// line does, and a cash-method tax filer counts the receipt when it arrives.

import { parseCents, parseDate, parseCsv, MAX_CENTS } from "./bank.mjs";

export const DEFERRED_ACCOUNT = "2400", DEFAULT_INCOME = "4000";

const pad = (n, w = 2) => String(n).padStart(w, "0");
const iso = (y, m, d) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const monthEnd = (date) => iso(+date.slice(0, 4), +date.slice(5, 7), lastDay(+date.slice(0, 4), +date.slice(5, 7)));
const dayNo = (date) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86400000;
const fromDayNo = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const nextMonth = (date) => { const y = +date.slice(0, 4), m = +date.slice(5, 7); return m === 12 ? iso(y + 1, 1, 1) : iso(y, m + 1, 1); };
const monthIndex = (date) => +date.slice(0, 4) * 12 + (+date.slice(5, 7) - 1);
const clone = (x) => JSON.parse(JSON.stringify(x));
const isIso = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? "") && !!parseDate(d) && fromDayNo(dayNo(d)) === d;

// The last day of service for `months` months from `start`: 15 Jan + 12 months -> 14 Jan.
export function endAfterMonths(start, months) {
  const y = +start.slice(0, 4), m = +start.slice(5, 7), d = +start.slice(8, 10);
  const t = y * 12 + (m - 1) + months, ny = Math.floor(t / 12), nm = (t % 12) + 1;
  return fromDayNo(dayNo(iso(ny, nm, Math.min(d, lastDay(ny, nm)))) - 1);
}

// Amount earned (cumulative cents) by the end of `date`, ignoring cancellation.
function earnedBy(r, date) {
  if (date < r.start) return 0;
  if (date >= r.end) return r.cents;
  if (r.method === "monthly") {
    const total = monthIndex(r.end) - monthIndex(r.start) + 1;
    // A month's share is earned at its end; the month the period ends in closes it.
    const done = date >= monthEnd(date) ? monthIndex(date) - monthIndex(r.start) + 1 : monthIndex(date) - monthIndex(r.start);
    return Math.floor((r.cents * done) / total);
  }
  const total = dayNo(r.end) - dayNo(r.start) + 1, served = dayNo(date) - dayNo(r.start) + 1;
  return Math.floor((r.cents * served) / total);
}

// Earned through `date` with the cancellation applied.
export function earnedThrough(r, date) {
  const c = r.cancelled;
  if (!c || date < c.date) return earnedBy(r, date);
  return c.keep ? r.cents : earnedDaily(r, c.date);
}
// A cancellation stops earning on its own day, even on a monthly row (a part month
// is earned by its days, the fair reading of "they used it until the 10th").
function earnedDaily(r, date) {
  if (r.method !== "monthly") return earnedBy(r, date);
  const before = earnedBy(r, fromDayNo(dayNo(date.slice(0, 8) + "01") - 1));
  const monthShare = earnedBy(r, monthEnd(date) < r.end ? monthEnd(date) : r.end) - before;
  const from = date.slice(0, 8) + "01" < r.start ? r.start : date.slice(0, 8) + "01";
  const to = monthEnd(date) < r.end ? monthEnd(date) : r.end;
  const days = dayNo(to) - dayNo(from) + 1, served = Math.min(days, dayNo(date) - dayNo(from) + 1);
  return before + Math.floor((monthShare * served) / days);
}

// [{ date, cents, earned }] per month from the start through `through` (or the end).
export function deferralSchedule(r, through = null) {
  const out = [];
  let prev = 0;
  const stop = r.cancelled?.date && r.cancelled.date < r.end ? r.cancelled.date : r.end;
  for (let m = r.start.slice(0, 8) + "01"; m <= stop; m = nextMonth(m)) {
    let date = monthEnd(m);
    if (date > stop) date = stop;
    if (through && date > monthEnd(through)) break;
    const cum = earnedThrough(r, date);
    if (cum !== prev) out.push({ date, cents: cum - prev, earned: cum });
    prev = cum;
  }
  return out;
}

// Booked through the end of the latest month that has a transaction or document,
// as the prepaid register does, so a quiet month does not run the books ahead.
export function deferralsThrough(books) {
  return [...(books.transactions ?? []).map((t) => t.date), ...(books.documents ?? []).map((d) => d.date), ...(books.deferrals ?? []).map((p) => p.received)].sort().at(-1) ?? null;
}

export function deferralEntries(books) {
  const through = deferralsThrough(books);
  const out = [];
  for (const r of books.deferrals ?? [])
    for (const s of deferralSchedule(r, through))
      out.push({ id: `${r.id}-${s.date}`, date: s.date, memo: `Earned, ${r.name}${r.customer ? ` (${r.customer})` : ""}`, source: "deferred", lines: [{ account: DEFERRED_ACCOUNT, debit: s.cents, credit: 0 }, { account: r.incomeAccount, debit: 0, credit: s.cents }] });
  return out;
}

function ensureAccount(books) {
  if (!books.accounts.some((a) => a.code === DEFERRED_ACCOUNT)) {
    books.accounts.push({ code: DEFERRED_ACCOUNT, name: "Unearned revenue", type: "liability" });
    books.accounts.sort((a, b) => a.code.localeCompare(b.code));
  }
}

// Check one row's fields; returns the normalised row or throws a sentence.
function normalise(books, { name, customer = "", received, start, end, months, amount, method = "daily", incomeAccount = DEFAULT_INCOME }) {
  if (!String(name ?? "").trim()) throw new Error("A deferral needs a name (the plan, retainer or pass).");
  if (!isIso(start)) throw new Error(`Start ${start} is not a YYYY-MM-DD date.`);
  if (months != null && String(months).trim() !== "") {
    const n = Number(months);
    if (typeof months === "boolean" || !Number.isInteger(n) || n < 1 || n > 120) throw new Error("Months must be a whole number, 1 to 120.");
    if (end) throw new Error("Give an end date or a number of months, not both.");
    end = endAfterMonths(start, n);
  }
  if (!isIso(end)) throw new Error(end ? `End ${end} is not a YYYY-MM-DD date.` : "Give the last day of service (--end) or a number of months (--months).");
  if (end < start) throw new Error(`The service period ends (${end}) before it starts (${start}).`);
  if (dayNo(end) - dayNo(start) > 3660) throw new Error("A service period of more than ten years is not a deferral this register handles.");
  received = received ? received : start;
  if (!isIso(received)) throw new Error(`Received date ${received} is not a YYYY-MM-DD date.`);
  const cents = typeof amount === "number" ? Math.round(amount * 100) : parseCents(String(amount ?? ""));
  if (!Number.isFinite(cents) || cents <= 0 || cents > MAX_CENTS) throw new Error("Amount must be a positive amount of at most 100 billion.");
  if (method !== "daily" && method !== "monthly") throw new Error(`Method ${method} is not daily or monthly.`);
  if (!books.accounts.some((a) => a.code === incomeAccount && a.type === "income")) throw new Error(`${incomeAccount} is not an income account in the chart.`);
  const firstEarn = monthEnd(start) < end ? monthEnd(start) : end;
  if (books.lockedThrough && firstEarn <= books.lockedThrough) throw new Error(`Income would be earned on ${firstEarn}, in the period locked through ${books.lockedThrough}. Unlock it first.`);
  return { name: String(name).trim(), customer: String(customer ?? "").trim(), received, start, end, cents, method, incomeAccount };
}

// addDeferral(books, { name, customer, received, start, end | months, amount, method, incomeAccount })
//   -> { books, deferral } or throws.
export function addDeferral(booksIn, fields = {}) {
  const books = clone(booksIn);
  const row = normalise(books, fields);
  books.deferrals ??= [];
  const id = `DR-${books.deferrals.reduce((n, r) => Math.max(n, +r.id.slice(3) || 0), 0) + 1}`;
  const deferral = { id, ...row };
  books.deferrals.push(deferral);
  ensureAccount(books);
  return { books, deferral };
}

// cancelDeferral(books, id, { date, keep }) -> { books, deferral, refund } (refund in cents).
export function cancelDeferral(booksIn, id, { date, keep = false } = {}) {
  const books = clone(booksIn);
  const r = (books.deferrals ?? []).find((x) => x.id === id);
  if (!r) throw new Error(`No deferral ${id}.`);
  if (r.cancelled) throw new Error(`${id} was already cancelled on ${r.cancelled.date}.`);
  if (!isIso(date)) throw new Error(`Date ${date} is not a YYYY-MM-DD date.`);
  if (date < r.start) throw new Error(`${date} is before the service starts (${r.start}); remove the row instead.`);
  if (date >= r.end) throw new Error(`${date} is on or after the last day of service (${r.end}); nothing is left to cancel.`);
  if (books.lockedThrough && monthEnd(date) <= books.lockedThrough) throw new Error(`${date} is in the period locked through ${books.lockedThrough}. Unlock it first.`);
  r.cancelled = { date, keep: !!keep };
  return { books, deferral: r, refund: keep ? 0 : r.cents - earnedThrough(r, date) };
}

// markRefunded(books, id, { date }): the refund of a cancelled row was paid on `date`
// (the bank line filed to 2400), so from then on nothing is owed back.
export function markRefunded(booksIn, id, { date } = {}) {
  const books = clone(booksIn);
  const r = (books.deferrals ?? []).find((x) => x.id === id);
  if (!r) throw new Error(`No deferral ${id}.`);
  if (!r.cancelled || r.cancelled.keep) throw new Error(`${id} has no refund owed (it is not cancelled, or was kept).`);
  if (!isIso(date)) throw new Error(`Date ${date} is not a YYYY-MM-DD date.`);
  if (date < r.cancelled.date) throw new Error(`${date} is before the cancellation (${r.cancelled.date}).`);
  r.cancelled.refunded = date;
  return { books, deferral: r };
}

export function removeDeferral(booksIn, id) {
  const books = clone(booksIn);
  const i = (books.deferrals ?? []).findIndex((x) => x.id === id);
  if (i === -1) throw new Error(`No deferral ${id}.`);
  const r = books.deferrals[i];
  if (books.lockedThrough && deferralSchedule(r, books.lockedThrough).length) throw new Error(`${id} has income booked in the period locked through ${books.lockedThrough}. Unlock it first.`);
  books.deferrals.splice(i, 1);
  return { books };
}

// Rows with what is earned and still owed as of a date, plus totals.
// A cancelled row's unearned remainder is `refundDue`: owed back, not to be earned.
export function deferredRegister(books, asOf = null) {
  const at = asOf ?? deferralsThrough(books);
  const atBook = at ? monthEnd(at) : null; // entries are dated at month ends
  const rows = (books.deferrals ?? []).filter((r) => !at || r.received <= at).map((r) => {
    const earned = atBook ? (deferralSchedule(r, at).at(-1)?.earned ?? 0) : 0;
    const cancelledBy = r.cancelled && atBook && r.cancelled.date <= atBook;
    const refunded = cancelledBy && r.cancelled.refunded && r.cancelled.refunded <= at;
    const remaining = refunded ? 0 : r.cents - earned;
    return { id: r.id, name: r.name, customer: r.customer, received: r.received, start: r.start, end: r.end, method: r.method, incomeAccount: r.incomeAccount, cents: r.cents, earned, unearned: cancelledBy ? 0 : remaining, refundDue: cancelledBy ? remaining : 0, cancelled: r.cancelled ?? null };
  });
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  return { asOf: at, rows, cents: sum("cents"), earned: sum("earned"), unearned: sum("unearned"), refundDue: sum("refundDue"), balance: sum("unearned") + sum("refundDue") };
}

// What is still to be earned, month by month after `asOf`:
//   { asOf, months: ["2026-09", ...], rows: [{ id, name, byMonth: [cents...], later }],
//     totals: [cents...], later, current, longTerm, unearned, refund }
// `refund` is what cancelled rows leave owed back rather than earned.
// `current` is what will be earned in the twelve months after asOf (a current
// liability), `longTerm` the rest. `horizon` months are listed (default 12);
// anything after them is in `later`.
export function deferredWaterfall(books, { asOf = null, horizon = 12 } = {}) {
  const at = asOf ?? deferralsThrough(books);
  if (!at) return { asOf: null, months: [], rows: [], totals: [], later: 0, current: 0, longTerm: 0, unearned: 0, refund: 0 };
  const h = Math.max(1, Math.min(120, Math.floor(Number(horizon) || 12)));
  const base = monthEnd(at);
  const months = [];
  for (let m = nextMonth(base), i = 0; i < h; i++, m = nextMonth(m)) months.push(m.slice(0, 7));
  const twelve = (() => { let m = base; for (let i = 0; i < 12; i++) m = monthEnd(nextMonth(m)); return m; })();
  const reg = deferredRegister(books, at);
  const rows = [];
  let current = 0, longTerm = 0;
  for (const r of books.deferrals ?? []) {
    const g = reg.rows.find((x) => x.id === r.id);
    if (!g || (!g.unearned && !g.refundDue)) continue;
    const byMonth = months.map(() => 0);
    let later = 0, toEarn = 0;
    for (const s of deferralSchedule(r)) {
      if (s.date <= base) continue;
      const i = months.indexOf(s.date.slice(0, 7));
      if (i >= 0) byMonth[i] += s.cents; else later += s.cents;
      if (s.date <= twelve) current += s.cents; else longTerm += s.cents;
      toEarn += s.cents;
    }
    // A cancellation dated after asOf: what it leaves unearned is owed back, not earned.
    if (!toEarn && g.unearned === toEarn) continue; // only a refund owed: counted in the total below
    rows.push({ id: r.id, name: r.name, customer: r.customer, byMonth, later, unearned: toEarn, refund: g.unearned - toEarn });
  }
  const totals = months.map((_, i) => rows.reduce((s, r) => s + r.byMonth[i], 0));
  return { asOf: at, months, rows, totals, later: rows.reduce((s, r) => s + r.later, 0), current, longTerm, unearned: current + longTerm, refund: rows.reduce((s, r) => s + r.refund, 0) + reg.refundDue };
}

// Rows from a CSV of up-front sales: one per plan, retainer or invoice line.
// Headers are matched by name (any order, any case):
//   name | description | product | plan          (required)
//   amount | total | price                        (required)
//   start | period start | service start          (required)
//   end | period end | service end, or months | term  (one of them)
//   customer | client                             (optional)
//   date | received | paid | invoice date         (optional; defaults to start)
//   account | income account                      (optional; defaults to 4000)
//   method                                        (optional: daily or monthly)
// `endExclusive`: the end column is the first day after the service (Stripe-style
// periods run from one anniversary to the next), so a day is taken off.
// -> { books, added, problems: ["line 3: ..."] }; bad rows are skipped, not guessed.
export function importDeferralsCsv(booksIn, text, { method = "daily", endExclusive = false, dayFirst = false, incomeAccount = DEFAULT_INCOME } = {}) {
  let books = clone(booksIn);
  const rows = parseCsv(text);
  const problems = [];
  if (!rows.length) return { books, added: 0, problems: ["The file is empty."] };
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/\s*\(.*\)\s*$/, "").replace(/[_-]+/g, " "));
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const c = {
    name: col("name", "description", "product", "plan", "item"),
    amount: col("amount", "total", "price", "amount paid"),
    start: col("start", "period start", "service start", "start date"),
    end: col("end", "period end", "service end", "end date"),
    months: col("months", "term", "term months"),
    customer: col("customer", "client", "customer name"),
    received: col("date", "received", "paid", "invoice date", "paid at", "created"),
    account: col("account", "income account"),
    method: col("method"),
  };
  const missing = ["name", "amount", "start"].filter((k) => c[k] < 0);
  if (c.end < 0 && c.months < 0) missing.push("end or months");
  if (missing.length) return { books, added: 0, problems: [`The header has no ${missing.join(", ")} column (found: ${rows[0].join(", ")}).`] };
  const date = (v) => parseDate(String(v ?? "").trim(), dayFirst);
  let added = 0;
  for (const row of rows.slice(1)) {
    const get = (i) => (i >= 0 ? String(row[i] ?? "").trim() : "");
    const where = `line ${row.ln ?? "?"}`;
    try {
      const start = date(get(c.start));
      let end = c.end >= 0 && get(c.end) ? date(get(c.end)) : null;
      if (get(c.start) && !start) throw new Error(`start "${get(c.start)}" is not a date`);
      if (c.end >= 0 && get(c.end) && !end) throw new Error(`end "${get(c.end)}" is not a date`);
      if (end && endExclusive) end = fromDayNo(dayNo(end) - 1);
      const received = get(c.received) ? date(get(c.received)) : null;
      if (get(c.received) && !received) throw new Error(`date "${get(c.received)}" is not a date`);
      const r = addDeferral(books, {
        name: get(c.name), customer: get(c.customer), start, received,
        ...(end ? { end } : { months: get(c.months) }),
        amount: get(c.amount), method: (get(c.method) || method).toLowerCase(), incomeAccount: get(c.account) || incomeAccount,
      });
      books = r.books; added++;
    } catch (e) { problems.push(`${where}: ${e.message.replace(/\.$/, "")}.`); }
  }
  return { books, added, problems };
}

// The waterfall as CSV for a spreadsheet: one row per plan, a total row. Names and
// customers are typed by the user, so a cell starting =, +, -, @, tab or CR gets an
// apostrophe (spreadsheet formula injection).
export function waterfallCsv(w) {
  const cell = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const c = (n) => (n / 100).toFixed(2);
  const lines = [["id", "name", "customer", ...w.months, "later", "unearned"].map(cell).join(",")];
  for (const r of w.rows) lines.push([r.id, r.name, r.customer ?? "", ...r.byMonth.map(c), c(r.later), c(r.unearned)].map(cell).join(","));
  lines.push(["", "Total", "", ...w.totals.map(c), c(w.later), c(w.unearned)].map(cell).join(","));
  return lines.join("\n") + "\n";
}
