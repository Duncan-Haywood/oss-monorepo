// Year-end close. Closing a calendar year moves that year's income and expense
// balances into retained earnings (3900) with one dated entry (YYYY-12-31,
// source "closing"), and locks the books through that date. The entry is worked
// out from the journal each time it is read, never stored, so it always equals
// what the year really posted. It is left out of journal(books) on purpose:
// the profit and loss, cash flow, budget and tax worksheets keep seeing the
// year's income and expense. journal(books, { withClosing: true }) adds it, and
// the balance sheet, the QuickBooks/Xero/IIF exports and `yearEndReport` use that.
// Option `draws`: also close owner draws (3100) and contributions (3010) into
// retained earnings, as a sole proprietor's books are often closed. Calendar
// years by default. A fiscal year is named for the calendar year it ends in and
// closes with option `month` (1-12, the month it ends in): month 6 and year 2026
// is 2025-07-01 to 2026-06-30, dated 2026-06-30. The month is kept on the
// books.yearEnd row, so every later read agrees with the close.
// Integer cents. Not tax or accounting advice.

import { journal, lockPeriod } from "./engine.mjs";
import { accountMap, balances, natural, validateEntry } from "./ledger.mjs";

export const RETAINED = "3900";
const DRAW_CODES = ["3100", "3010"];

const pad = (n) => String(n).padStart(2, "0");
// -> { from, to } for a year ending in month `month` (default December).
export function fiscalSpan(year, month = 12) {
  year = Number(year); month = Number(month);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${pad(month)}-${pad(last)}`;
  const from = month === 12 ? `${year}-01-01` : `${year - 1}-${pad(month + 1)}-01`;
  return { from, to };
}
const rowSpan = (y) => fiscalSpan(y.year, y.month ?? 12);

// -> closing entries for the years in books.yearEnd, from entries that do not
// include any closing entry.
export function closingEntries(books, entries) {
  const map = accountMap(books.accounts);
  const out = [];
  for (const y of books.yearEnd ?? []) {
    const { from, to } = rowSpan(y);
    const b = balances(entries, { from, to });
    const lines = [];
    let net = 0; // credit-positive: profit
    for (const [code, v] of [...b].sort((p, q) => p[0].localeCompare(q[0]))) {
      const a = map.get(code);
      if (!v || !a) continue;
      const closes = a.type === "income" || a.type === "expense" || (y.draws && DRAW_CODES.includes(code));
      if (!closes) continue;
      lines.push({ account: code, debit: v < 0 ? -v : 0, credit: v > 0 ? v : 0 });
      net -= v;
    }
    if (!lines.length) continue;
    lines.push({ account: RETAINED, debit: net < 0 ? -net : 0, credit: net > 0 ? net : 0 });
    out.push({ id: `CLOSE-${y.year}`, date: to, memo: `Close ${y.year} to retained earnings`, source: "closing", closing: true, lines });
  }
  return out;
}

export function closeYear(booksIn, year, { draws = false, month = 12 } = {}) {
  year = Number(year); month = Number(month);
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error(`Year-end month ${month} must be 1 to 12.`);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new Error(`Year ${year} is not a four-digit year.`);
  if (!accountMap(booksIn.accounts).has(RETAINED)) throw new Error(`No retained earnings account (${RETAINED}) in the chart of accounts.`);
  const done = booksIn.yearEnd ?? [];
  if (done.some((y) => y.year === year)) throw new Error(`${year} is already closed.`);
  if (done.some((y) => y.year > year)) throw new Error(`A later year is already closed; reopen it first.`);
  const date = fiscalSpan(year, month).to;
  const prev = done.at(-1);
  if (prev && (prev.month ?? 12) !== month) throw new Error(`${prev.year} was closed with a year ending in month ${prev.month ?? 12}; keep the same year-end month.`);
  const locked = lockPeriod(booksIn, date); // refuses while lines dated in the year still need an account
  const books = { ...locked, yearEnd: [...done, { year, draws: !!draws, ...(month === 12 ? {} : { month }), priorLock: booksIn.lockedThrough ?? null }] };
  const entry = closingEntries(books, journal(books)).find((e) => e.id === `CLOSE-${year}`);
  if (entry) { const p = validateEntry(entry, books.accounts); if (p.length) throw new Error(`Closing entry does not balance: ${p.join("; ")}`); }
  return books;
}

// Undo the latest close and put the lock back where it was before it.
export function reopenYear(booksIn, year) {
  year = Number(year);
  const done = booksIn.yearEnd ?? [];
  const last = done[done.length - 1];
  if (!last || last.year !== year) throw new Error(done.length ? `Only the latest closed year (${last.year}) can be reopened.` : `No year is closed.`);
  const books = { ...booksIn, yearEnd: done.slice(0, -1) };
  if (!books.yearEnd.length) delete books.yearEnd;
  if (last.priorLock) books.lockedThrough = last.priorLock; else delete books.lockedThrough;
  return books;
}

// What closing a year did: profit moved, the entry, retained earnings before and after.
export function yearEndReport(books, year) {
  year = Number(year);
  const map = accountMap(books.accounts);
  const all = journal(books);
  const withClosing = journal(books, { withClosing: true });
  const closing = withClosing.find((e) => e.id === `CLOSE-${year}`) ?? null;
  const re = (entries, to) => natural(map.get(RETAINED) ?? { type: "equity" }, balances(entries, { to }).get(RETAINED) ?? 0) + 0 || 0;
  const row = (books.yearEnd ?? []).find((y) => y.year === year);
  const span = fiscalSpan(year, row?.month ?? 12), start = new Date(span.from + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() - 1);
  const before = re(all, start.toISOString().slice(0, 10));
  const toRetained = closing ? closing.lines.find((l) => l.account === RETAINED) : null;
  const moved = toRetained ? toRetained.credit - toRetained.debit : 0;
  return { year, closed: !!(books.yearEnd ?? []).some((y) => y.year === year), entry: closing, netToRetained: moved, retainedBefore: before, retainedAfter: closing ? re(withClosing, span.to) : before };
}
