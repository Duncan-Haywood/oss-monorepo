// Foreign-currency bank accounts in books kept in one currency. A EUR account in
// US books is marked with `fx account 1020 EUR`; exchange rates are typed or
// pasted in (no network, no rate feed). Then:
//   - an imported line keeps its own amount (`foreign`) and enters the ledger at
//     the rate on its date (the latest rate on or before it); a line with no
//     rate yet is left out and named, never guessed;
//   - each month end the account is remeasured: its foreign balance at that
//     month's rate against the base-currency amount the ledger carries, and the
//     difference is booked to Foreign exchange gain or loss (6190). A gain is a
//     credit there, so a loss shows as an expense. Remeasuring from the foreign
//     balance each time, not from deltas, means the entries cannot drift;
//   - the statement's closing balance is checked in the account's own currency.
// Books keep `books.fx = { rates: { EUR: [[date, rate], ...] }, accounts: { "1020": "EUR" },
// opening: { "1020": foreignCents } }`. A rate is base units per one foreign unit
// (1.0850 USD per EUR). Amounts are integer cents; the rate is rounded to six
// decimals and the product by BigInt, so a conversion is exact.
// A transfer between a foreign and a base account pairs when the sides are within 3%
// (engine.pairTransfers); the difference is realized gain or loss in 6190.
// Open foreign invoices and bills are revalued at month ends too (docRevals).
// Not modelled: a per-lot realized gain, tax
// rules on foreign gains. Not accounting advice.

import { parseDate } from "./bank.mjs";

export const FX_ACCOUNT = "6190";
const clone = (x) => JSON.parse(JSON.stringify(x));
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? "") && !!parseDate(d);
const monthEnd = (y, m) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;

// foreign cents x rate -> base cents, half away from zero.
export function convertCents(cents, rate) {
  const r = BigInt(Math.round(rate * 1e6)), a = BigInt(Math.abs(cents));
  const v = Number((a * r + 500000n) / 1000000n);
  return cents < 0 ? -v : v;
}

// "2026-03-01,EUR,1.0850" per line (a header row and # comments are skipped).
export function parseRates(text) {
  const rates = [], problems = [];
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [date, cur, rate] = line.split(/\s*[,\t;]\s*/);
    if (/^date$/i.test(date)) continue;
    const n = Number(rate);
    if (!isDate(date) || !/^[A-Za-z]{3}$/.test(cur ?? "") || !Number.isFinite(n) || n <= 0 || n > 1e6) { problems.push(`Line ${i + 1}: needs YYYY-MM-DD, a three-letter currency and a rate above zero.`); continue; }
    rates.push({ date, currency: cur.toUpperCase(), rate: n });
  }
  return { rates, problems };
}

export function setRates(booksIn, rows) {
  const books = clone(booksIn);
  books.fx ??= { rates: {}, accounts: {}, opening: {} };
  for (const { date, currency, rate } of rows) {
    const list = (books.fx.rates[currency] ??= []);
    const at = list.findIndex((x) => x[0] === date);
    if (at >= 0) list[at][1] = rate; else list.push([date, rate]);
    list.sort((a, b) => a[0].localeCompare(b[0]));
  }
  return books;
}

// The latest rate on or before `date`, or null.
export function rateOn(books, currency, date) {
  let found = null;
  for (const [d, r] of books.fx?.rates?.[currency] ?? []) { if (d <= date) found = r; else break; }
  return found;
}

export const fxCurrency = (books, code) => books.fx?.accounts?.[code] ?? null;

export function addFxAccount(booksIn, { code, currency }) {
  const books = clone(booksIn);
  const a = books.accounts.find((x) => x.code === code);
  if (!a || a.type !== "asset" || !a.bank) throw new Error(`${code} is not a bank account (an asset marked as a bank account) in the chart.`);
  if (!/^[A-Za-z]{3}$/.test(currency ?? "")) throw new Error("Currency is a three-letter code such as EUR.");
  const cur = currency.toUpperCase();
  if (cur === String(books.currency ?? "USD").toUpperCase()) throw new Error(`${cur} is the books' own currency; nothing to convert.`);
  if (books.transactions.some((t) => t.account === code && !t.foreign)) throw new Error(`${code} already has lines in ${books.currency ?? "USD"}. Mark the account before importing into it.`);
  books.fx ??= { rates: {}, accounts: {}, opening: {} };
  books.fx.accounts[code] = cur;
  if (!books.accounts.some((x) => x.code === FX_ACCOUNT)) {
    books.accounts.push({ code: FX_ACCOUNT, name: "Foreign exchange gain or loss", type: "expense" });
    books.accounts.sort((x, y) => x.code.localeCompare(y.code));
  }
  return books;
}

// Used by importStatement: a row in the account's currency -> { cents, foreign },
// or null when no rate covers its date.
export function convertRow(books, code, row) {
  const cur = fxCurrency(books, code);
  if (!cur) return { cents: row.cents };
  const rate = rateOn(books, cur, row.date);
  if (rate === null) return null;
  return { cents: convertCents(row.cents, rate), foreign: { currency: cur, cents: row.cents, rate } };
}

const counted = (t) => t.posted && t.status !== "review" && t.status !== "new";

// Foreign balance (debit-positive, in the account's own cents) at a date: the
// opening typed or read from the statement plus every posted line.
export function foreignBalance(books, code, to = null) {
  let v = books.fx?.opening?.[code] ?? 0;
  for (const t of books.transactions) if (t.account === code && counted(t) && (!to || t.date <= to)) v += t.foreign ? t.foreign.cents : t.cents;
  return v;
}
const baseBalance = (books, code, to) => {
  let v = books.opening?.[code] ?? 0;
  for (const t of books.transactions) if (t.account === code && counted(t) && t.date <= to) v += t.cents;
  return v;
};

// Month-end remeasurement entries from the account's first line through the
// month of the latest line in the books.
export function fxEntries(books) {
  const out = [];
  const through = [...books.transactions.map((t) => t.date), ...(books.documents ?? []).map((d) => d.date)].sort().at(-1);
  if (!through) return out;
  for (const [code, cur] of Object.entries(books.fx?.accounts ?? {})) {
    const dates = books.transactions.filter((t) => t.account === code && counted(t)).map((t) => t.date).sort();
    if (!dates.length) continue;
    let y = +dates[0].slice(0, 4), m = +dates[0].slice(5, 7), prev = 0;
    for (;;) {
      const end = monthEnd(y, m);
      if (end.slice(0, 7) > through.slice(0, 7)) break;
      const rate = rateOn(books, cur, end);
      if (rate !== null) {
        const cum = convertCents(foreignBalance(books, code, end), rate) - baseBalance(books, code, end);
        const delta = cum - prev;
        if (delta !== 0) out.push({ id: `FX-${code}-${end.slice(0, 7)}`, date: end, memo: `${cur} remeasured at ${rate}`, source: "fx", lines: [{ account: code, debit: Math.max(delta, 0), credit: Math.max(-delta, 0) }, { account: FX_ACCOUNT, debit: Math.max(-delta, 0), credit: Math.max(delta, 0) }] });
        prev = cum;
      }
      if (++m > 12) { m = 1; y++; }
    }
  }
  return out;
}

// Month-end revaluation of foreign invoices and bills. A document with a currency
// and no credit, write-off or part-payment is carried at its booked base amount until
// paid; each month end its foreign total is converted at that month's rate and the
// change is booked to 6190 against receivable (an invoice) or payable (a bill). A
// settled document is revalued only at month ends before its payment date, and the
// realized difference at payment (accruals.fxSettleEntries) is taken from the
// revalued carrying amount, so gain and loss are never counted twice.
// Returns [{ date, rate, cum }] for the document: cum is the carrying amount less the
// booked total, in base cents.
export function docRevals(books, d, through = null) {
  if (!d.currency || d.credit || d.credited || d.writtenOff || (d.payments ?? []).length > 1 || d.paidForeign || d.foreignTotal == null) return [];
  const paidOn = d.settledBy ? books.transactions.find((t) => t.id === d.settledBy)?.date : null;
  const last = through ?? [...books.transactions.map((t) => t.date), ...(books.documents ?? []).map((x) => x.date)].sort().at(-1);
  if (!last) return [];
  const out = [];
  let y = +d.date.slice(0, 4), m = +d.date.slice(5, 7);
  for (;;) {
    const end = monthEnd(y, m);
    if (end.slice(0, 7) > last.slice(0, 7) || (paidOn && end >= paidOn)) break;
    const rate = rateOn(books, d.currency, end);
    if (rate !== null && end >= d.date) out.push({ date: end, rate, cum: convertCents(d.foreignTotal, rate) - d.total });
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

export function docRevalEntries(books) {
  const out = [];
  for (const d of books.documents ?? []) {
    let prev = 0;
    const bill = d.kind !== "invoice";
    for (const r of docRevals(books, d)) {
      const delta = r.cum - prev;
      prev = r.cum;
      if (!delta) continue;
      const n = Math.abs(delta), up = delta > 0; // carrying amount rose
      out.push({ id: `FXR-${d.id}-${r.date.slice(0, 7)}`, date: r.date, memo: `${d.currency} ${bill ? "bill" : "invoice"} ${d.number}, ${d.party}, revalued at ${r.rate}`, source: "fx", lines: [
        { account: bill ? "2050" : "1100", debit: bill ? (up ? 0 : n) : (up ? n : 0), credit: bill ? (up ? n : 0) : (up ? 0 : n) },
        { account: FX_ACCOUNT, debit: bill ? (up ? n : 0) : (up ? 0 : n), credit: bill ? (up ? 0 : n) : (up ? n : 0) }] });
    }
  }
  return out;
}

// One row per foreign account at `asOf` (default: the latest line): its balance in
// its own currency, the rate, what the ledger carries and the gain or loss booked.
export function fxRegister(books, entries, asOf = null) {
  const at = asOf ?? books.transactions.map((t) => t.date).sort().at(-1) ?? null;
  const rows = Object.entries(books.fx?.accounts ?? {}).map(([code, currency]) => {
    const foreign = at ? foreignBalance(books, code, at) : 0, rate = at ? rateOn(books, currency, at) : null;
    const carried = entries.filter((e) => e.date <= at).flatMap((e) => e.lines).filter((l) => l.account === code).reduce((s, l) => s + l.debit - l.credit, 0);
    const gain = entries.filter((e) => e.source === "fx" && e.date <= at).flatMap((e) => e.lines).filter((l) => l.account === FX_ACCOUNT).reduce((s, l) => s + l.credit - l.debit, 0);
    return { code, currency, foreign, rate, carried, atRate: rate === null ? null : convertCents(foreign, rate), gain };
  });
  return { asOf: at, rows, gain: rows.reduce((s, r) => s + r.gain, 0) };
}
