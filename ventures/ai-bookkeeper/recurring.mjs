// Recurring payments and a cash forecast. Bank feeds repeat themselves: rent,
// software, insurance, payroll, a retainer client. This finds the payees whose
// lines come at a steady interval, says what each costs per year, what is due
// next, and flags the ones that went missing or changed amount (a price rise, a
// double charge, a client who stopped paying). It then rolls the bank balance
// forward with those items and the open invoices and bills.
//
// Integer cents throughout. Pure functions; nothing here posts to the books.
// A heuristic on your own history: a payee with fewer than `minCount` lines, or
// with irregular gaps, is not reported, and one-off lump sums are never guessed.

import { payeeKey } from "./categorize.mjs";
import { aging } from "./engine.mjs";

// Interval classes in days: [name, nominal days, tolerance in days]
const CLASSES = [["weekly", 7, 1], ["every two weeks", 14, 2], ["monthly", 30.44, 4], ["quarterly", 91.3, 7], ["yearly", 365.25, 12]];
const PER_YEAR = { weekly: 52, "every two weeks": 26, monthly: 12, quarterly: 4, yearly: 1 };

const day = (d) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000);
const iso = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

// Next date one interval after `date`: month classes keep the day of month.
function step(date, cls) {
  if (cls === "weekly") return iso(day(date) + 7);
  if (cls === "every two weeks") return iso(day(date) + 14);
  const add = cls === "monthly" ? 1 : cls === "quarterly" ? 3 : 12;
  const y = +date.slice(0, 4), m = +date.slice(5, 7) - 1, d = +date.slice(8, 10);
  const t = y * 12 + m + add, ny = Math.floor(t / 12), nm = t % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${String(ny).padStart(4, "0")}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

// Recurring series on the bank and card lines. Returns
// [{ payee, direction: "out"|"in", cadence, count, typical (cents, median),
//    perYear (cents, signed), last: {date, cents}, next (date), status, note }]
// status: "on track" | "overdue" (next date passed by more than the tolerance and
// nothing since) | "amount changed" (latest line differs from the median by over
// 10%) | "lapsed" (more than two intervals with nothing).
export function detectRecurring(books, { asOf = null, minCount = 3 } = {}) {
  const bank = new Set(books.accounts.filter((a) => a.bank).map((a) => a.code));
  const end = asOf ?? (books.transactions.map((t) => t.date).sort().at(-1) ?? null);
  if (!end) return [];
  const groups = new Map();
  for (const t of books.transactions) {
    if (!bank.has(t.account) || t.status === "transfer" || !t.cents) continue;
    const key = `${t.cents < 0 ? "out" : "in"}|${payeeKey(t.desc)}`;
    if (!key.endsWith("|")) (groups.get(key) ?? groups.set(key, []).get(key)).push(t);
  }
  const out = [];
  for (const [key, list] of groups) {
    if (list.length < minCount) continue;
    list.sort((a, b) => a.date.localeCompare(b.date));
    const days = list.map((t) => day(t.date));
    const gaps = days.slice(1).map((d, i) => d - days[i]).filter((g) => g > 0);
    if (gaps.length < minCount - 1) continue;
    const mg = median(gaps);
    const cls = CLASSES.find(([, n, tol]) => Math.abs(mg - n) <= tol);
    if (!cls) continue;
    const [name, nominal, tol] = cls;
    // most gaps must sit near the nominal interval (a few skipped or doubled are fine)
    const fit = gaps.filter((g) => Math.abs(g - nominal) <= tol + 2).length / gaps.length;
    if (fit < 0.7) continue;
    const amounts = list.map((t) => Math.abs(t.cents));
    const typical = median(amounts);
    const last = list.at(-1);
    const next = step(last.date, name);
    const late = day(end) - day(next);
    const changed = Math.abs(Math.abs(last.cents) - typical) > typical * 0.1;
    let status = "on track", note = "";
    if (late > nominal * 2) { status = "lapsed"; note = `nothing since ${last.date}`; }
    else if (late > tol) { status = "overdue"; note = `expected ${next}, ${late} days ago`; }
    else if (changed) { status = "amount changed"; note = `latest ${(Math.abs(last.cents) / 100).toFixed(2)} against a usual ${(typical / 100).toFixed(2)}`; }
    const dir = key.startsWith("out") ? -1 : 1;
    out.push({ payee: key.slice(key.indexOf("|") + 1), direction: dir < 0 ? "out" : "in", cadence: name, count: list.length, typical: dir * typical, perYear: dir * typical * PER_YEAR[name], last: { date: last.date, cents: last.cents }, next, status, note });
  }
  return out.sort((a, b) => Math.abs(b.perYear) - Math.abs(a.perYear));
}

// Cash on hand: for each asset-type bank account the running balance on its latest
// line when the statement gave one, else the sum of its lines.
export function cashOnHand(books) {
  let total = 0;
  for (const a of books.accounts.filter((x) => x.bank && x.type === "asset")) {
    const lines = books.transactions.filter((t) => t.account === a.code).sort((x, y) => x.date.localeCompare(y.date));
    if (!lines.length) continue;
    const lastBal = [...lines].reverse().find((t) => Number.isInteger(t.balance));
    total += lastBal ? lastBal.balance : lines.reduce((s, t) => s + t.cents, 0);
  }
  return total;
}

// Day-by-day expected cash for `days` days after `asOf`: starts from the bank
// balance, adds each recurring item at its next dates (lapsed series are left out)
// and open invoices at their due date (bills likewise, a day-30 default when the
// bill has none). Returns { start, end, lowest: {date, cents}, items: [...], points: [{date, cents}] }.
export function forecastCash(books, { asOf = null, days = 90 } = {}) {
  const rec = detectRecurring(books, { asOf });
  const from = asOf ?? (books.transactions.map((t) => t.date).sort().at(-1) ?? "1970-01-01");
  const to = iso(day(from) + days);
  const items = [];
  for (const r of rec) {
    if (r.status === "lapsed") continue;
    let d = r.next;
    // an overdue series is assumed to land tomorrow rather than in the past
    if (d <= from) d = iso(day(from) + 1);
    for (let guard = 0; d <= to && guard < 400; guard++) { items.push({ date: d, cents: r.typical, label: `${r.payee} (${r.cadence})`, source: "recurring" }); d = step(d, r.cadence); }
  }
  if (books.documents?.length) {
    for (const o of aging(books, from).open) {
      if (o.credit) continue;
      const due = o.due ?? iso(day(o.date) + 30);
      const when = due <= from ? iso(day(from) + 1) : due;
      if (when <= to) items.push({ date: when, cents: o.kind === "invoice" ? o.total : -o.total, label: `${o.kind} ${o.id} ${o.party}`, source: "document" });
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  const start = cashOnHand(books);
  let bal = start, lowest = { date: from, cents: start };
  const points = [{ date: from, cents: start }];
  for (const it of items) {
    bal += it.cents;
    points.push({ date: it.date, cents: bal });
    if (bal < lowest.cents) lowest = { date: it.date, cents: bal };
  }
  return { asOf: from, to, start, end: bal, lowest, items, points, runwayDays: daysUntilNegative(points, from) };
}

// Days from `from` until the balance first drops below zero (0 if it already is); null if it never does.
function daysUntilNegative(points, from) {
  const p = points.find((x) => x.cents < 0);
  return p ? day(p.date) - day(from) : null;
}
