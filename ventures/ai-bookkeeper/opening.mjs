// Opening balances from a trial balance: the step that lets someone already
// keeping books elsewhere (a spreadsheet, QuickBooks, an accountant's year-end
// trial balance) start here mid-stream with the receivable, the loan, the
// equipment and the prior years' earnings they already have.
//
// The input is CSV, one account per line. Either `code,amount` where the amount
// is what the account holds in its natural sign (an asset you own, a loan you
// owe, equity, profit so far: positive), or `code,debit,credit` when the first
// line's header names those columns. Whatever does not balance goes to account
// 3000, Opening balance equity, and is reported so it can be chased.
//
// Stored as books.openingTB = { date, lines: [{ account, cents }] } with cents
// debit-positive; engine.journal() turns it into one dated entry.

import { parseCsv, parseCents } from "./bank.mjs";
import { accountMap, DEBIT_NORMAL } from "./ledger.mjs";

export const OPENING_EQUITY = "3000";

// -> { books, lines, plug, problems, before }; throws on a bad date or a locked period.
// `plug` is the cents added to 3000 to make the list balance (debit-positive).
export function setOpeningBalances(booksIn, text, { date, decimalComma = false } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || Number.isNaN(Date.parse(date))) throw new Error(`Opening balance date ${date} is not a YYYY-MM-DD date.`);
  if (booksIn.lockedThrough && date <= booksIn.lockedThrough) throw new Error(`The books are locked through ${booksIn.lockedThrough}; unlock first.`);
  const books = JSON.parse(JSON.stringify(booksIn));
  const map = accountMap(books.accounts);
  const problems = [];
  const rows = parseCsv(text).filter((r) => r.some((c) => String(c).trim() !== ""));
  const head = rows[0]?.map((c) => String(c).trim().toLowerCase()) ?? [];
  const hasHeader = head.some((h) => /^(code|account|debit|credit|amount|balance)$/.test(h));
  const body = hasHeader ? rows.slice(1) : rows;
  const dcols = head.includes("debit") && head.includes("credit") ? { d: head.indexOf("debit"), c: head.indexOf("credit") } : null;
  const total = new Map();
  body.forEach((r, i) => {
    const line = i + 1 + (hasHeader ? 1 : 0);
    const code = String(r[0] ?? "").trim();
    const a = map.get(code);
    if (!a) { problems.push(`Line ${line}: no account ${code || "(blank)"} in the chart.`); return; }
    let cents;
    if (dcols) {
      cents = (parseCents(r[dcols.d] ?? "", decimalComma) || 0) - (parseCents(r[dcols.c] ?? "", decimalComma) || 0);
    } else {
      const v = parseCents(r[1] ?? "", decimalComma);
      if (v === null || v === undefined || Number.isNaN(v)) { problems.push(`Line ${line}: ${code} has no readable amount.`); return; }
      cents = DEBIT_NORMAL.has(a.type) ? v : -v;
    }
    if (cents) total.set(code, (total.get(code) ?? 0) + cents);
  });
  if (problems.length) return { books: booksIn, lines: [], plug: 0, problems, before: 0 };
  const lines = [...total].map(([account, cents]) => ({ account, cents }));
  const sum = lines.reduce((s, l) => s + l.cents, 0);
  const before = books.transactions.filter((t) => t.date <= date).length;
  if (sum !== 0) {
    const eq = lines.find((l) => l.account === OPENING_EQUITY);
    if (eq) eq.cents -= sum; else lines.push({ account: OPENING_EQUITY, cents: -sum });
  }
  const kept = lines.filter((l) => l.cents !== 0).sort((x, y) => x.account.localeCompare(y.account));
  if (!kept.length) return { books: booksIn, lines: [], plug: 0, problems: ["Nothing to set: every amount was zero."], before };
  books.openingTB = { date, lines: kept };
  if (before) problems.push(`${before} imported line${before === 1 ? " is" : "s are"} dated on or before ${date}; the opening balances already include them, so they would count twice. Re-import from the next day.`);
  return { books, lines: kept, plug: sum === 0 ? 0 : -sum, problems, before };
}

// The journal entry for the stored opening balances, or null.
export function openingEntry(books) {
  const tb = books.openingTB;
  if (!tb?.lines?.length) return null;
  return { id: "OPEN-TB", date: tb.date, memo: "Opening balances", source: "opening", lines: tb.lines.map((l) => ({ account: l.account, debit: Math.max(l.cents, 0), credit: Math.max(-l.cents, 0) })) };
}

export function clearOpeningBalances(booksIn) {
  const books = JSON.parse(JSON.stringify(booksIn));
  delete books.openingTB;
  return books;
}
