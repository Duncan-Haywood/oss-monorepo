// Profit and loss against an earlier period: which accounts moved, by how much,
// and which are new or gone. Defaults to the latest month in the books against
// the month before it; `period` and `against` are {from, to} (ISO dates) for
// anything else (a quarter against the quarter before, a year against a year).
// Integer cents. Pure; nothing is posted. Lines still in review are not in the
// journal, so they are not in either period; `partial` says so.

import { journal } from "./engine.mjs";
import { profitAndLoss } from "./ledger.mjs";

const monthOf = (d) => d.slice(0, 7);
const lastDay = (m) => { const [y, mo] = m.split("-").map(Number); return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, "0")}`; };
const prevMonth = (m) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 2, 1)); return d.toISOString().slice(0, 7); };
const monthRange = (m) => ({ from: `${m}-01`, to: lastDay(m) });

// The period of equal length that ends the day before `period` starts (what a
// page with only From and To dates compares against).
export function precedingPeriod({ from, to }) {
  const day = 86400000, a = Date.parse(from), b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  const days = Math.round((b - a) / day) + 1;
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  return { from: iso(a - days * day), to: iso(a - day) };
}

export function compareProfit(books, { period = null, against = null, minChange = 0 } = {}) {
  const entries = journal(books);
  const months = [...new Set(entries.map((e) => monthOf(e.date)))].sort();
  if (!period) {
    if (!months.length) return null;
    const latest = months[months.length - 1];
    period = monthRange(latest);
    against ??= monthRange(prevMonth(latest));
  }
  if (!against) return null;
  const take = (r) => profitAndLoss(entries, books.accounts, r);
  const now = take(period), then = take(against);
  const rows = new Map();
  for (const [side, pl] of [["now", now], ["then", then]]) for (const type of ["income", "expense"]) for (const l of pl[type]) {
    const r = rows.get(l.code) ?? { code: l.code, name: l.name, type, now: 0, then: 0 };
    r[side] = l.total;
    rows.set(l.code, r);
  }
  const accounts = [...rows.values()].map((r) => {
    const change = r.now - r.then;
    // "bad" is the direction that lowers profit: income down, expense up
    const bad = r.type === "income" ? change < 0 : change > 0;
    return { ...r, change, pct: r.then ? change / Math.abs(r.then) : null, status: !r.then && r.now ? "new" : r.then && !r.now ? "gone" : "changed", hurtsProfit: change !== 0 && bad };
  }).filter((r) => Math.abs(r.change) >= minChange).sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || a.code.localeCompare(b.code));
  const review = books.transactions.filter((t) => t.status === "review" || t.status === "new").length;
  return {
    period, against,
    income: { now: now.totalIncome, then: then.totalIncome },
    expense: { now: now.totalExpense, then: then.totalExpense },
    net: { now: now.net, then: then.net, change: now.net - then.net },
    accounts,
    partial: review > 0 ? `${review} line${review === 1 ? "" : "s"} still in review are in neither period` : null,
    empty: !now.income.length && !now.expense.length ? "nothing is posted in the period" : !then.income.length && !then.expense.length ? "nothing is posted in the period compared against" : null,
  };
}
