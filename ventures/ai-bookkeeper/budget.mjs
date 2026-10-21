// Budget against actual. A budget is a monthly amount per income or expense
// account, kept in books.budget ({ "6130": 20000 }, integer cents). The report
// multiplies each by the whole calendar months the period covers and sets it
// beside what was posted: variance, percent, and whether it helps profit.
// Pure except setBudget, which returns new books. Lines still in review are not
// in the journal, so they are in neither side; `partial` says so.

import { journal } from "./engine.mjs";
import { profitAndLoss, accountMap } from "./ledger.mjs";

export function setBudget(books, code, cents) {
  const a = accountMap(books.accounts).get(code);
  if (!a || (a.type !== "income" && a.type !== "expense")) throw new Error(`${code} is not an income or expense account`);
  if (!Number.isInteger(cents) || cents < 0) throw new Error("budget must be a whole number of cents, zero or more");
  const budget = { ...(books.budget ?? {}) };
  if (cents === 0) delete budget[code]; else budget[code] = cents;
  return { ...books, budget };
}

const monthsIn = (from, to) => {
  const [fy, fm] = from.slice(0, 7).split("-").map(Number), [ty, tm] = to.slice(0, 7).split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
};

export function budgetVsActual(books, { from = null, to = null } = {}) {
  const budget = books.budget ?? {};
  const entries = journal(books);
  if (!from || !to) {
    const dates = entries.map((e) => e.date).sort();
    if (!dates.length) return null;
    from ??= `${dates[dates.length - 1].slice(0, 7)}-01`;
    to ??= dates[dates.length - 1];
  }
  const n = monthsIn(from, to);
  if (n < 1) throw new Error("--to is before --from");
  const pl = profitAndLoss(entries, books.accounts, { from, to });
  const map = accountMap(books.accounts);
  const actual = new Map([...pl.income, ...pl.expense].map((l) => [l.code, l.total]));
  const codes = new Set([...actual.keys(), ...Object.keys(budget)]);
  const rows = [...codes].filter((c) => map.has(c)).sort().map((code) => {
    const a = map.get(code), act = actual.get(code) ?? 0, bud = (budget[code] ?? 0) * n;
    const variance = act - bud;
    // over budget helps profit on income, hurts it on expense
    const helps = a.type === "income" ? variance > 0 : variance < 0;
    return { code, name: a.name, type: a.type, budget: bud, actual: act, variance, pct: bud ? variance / bud : null,
      status: !budgetHas(budget, code) ? "unbudgeted" : variance === 0 ? "on budget" : helps ? "better" : "worse" };
  });
  const sum = (type, k) => rows.filter((r) => r.type === type).reduce((s, r) => s + r[k], 0);
  const net = { budget: sum("income", "budget") - sum("expense", "budget"), actual: sum("income", "actual") - sum("expense", "actual") };
  net.variance = net.actual - net.budget;
  const review = books.transactions.filter((t) => t.status === "review" || t.status === "new").length;
  return {
    from, to, months: n, rows,
    income: { budget: sum("income", "budget"), actual: sum("income", "actual") },
    expense: { budget: sum("expense", "budget"), actual: sum("expense", "actual") },
    net,
    partial: review > 0 ? `${review} line${review === 1 ? "" : "s"} still in review are not counted` : null,
    empty: !Object.keys(budget).length ? "no budget set; use `budget CODE AMOUNT`" : null,
  };
}
const budgetHas = (b, c) => Object.prototype.hasOwnProperty.call(b, c);
