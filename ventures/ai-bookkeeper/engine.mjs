// AI Bookkeeper: a double-entry bookkeeping system that learns. Bank and card
// statements go in; every line gets a suggested account with a confidence and a
// reason; the ones it is sure of post themselves, the rest wait in a review
// queue, and every choice you confirm teaches it the next statement. Transfers
// between your own accounts (a card payment from checking) are paired into one
// entry instead of being counted as income and expense. Out come a trial
// balance, profit and loss, balance sheet, close checks and journals for
// QuickBooks Online, Xero or any ledger.
//
// The books are one JSON object the caller keeps (the page keeps it in this
// browser and in a file you download). Pure functions, no DOM, no network: the
// same input gives the same output in the page, the CLI and
// platform/agents/tools.mjs.

import { readStatement, splitOfx, splitQif, sniffFormat, rowIds, checkRunningBalance, parseCents } from "./bank.mjs";
import { DEFAULT_ACCOUNTS, accountMap, validateEntry, trialBalance, profitAndLoss, balanceSheet, cashFlow, cashFlowByMonth, ratios, breakEven, daysOutstanding, balances, natural, fmt, dollars } from "./ledger.mjs";
import { suggest, trainClassifier, buildMemory, parseRules, historyRecord, payeeKey } from "./categorize.mjs";
import { addDocuments, writeOff, settle, aging, documentEntries, AR, AP } from "./accruals.mjs";
import { taxDepreciation, s179IncomeLimit } from "./taxdepr.mjs";
import { FX_ACCOUNT, fxEntries, docRevalEntries, fxRegister as fxReg, convertRow, fxCurrency, foreignBalance, addFxAccount, setRates, parseRates, rateOn } from "./fx.mjs";
import { inventoryEntries, inventoryRegister, addInventoryMove, addLandedCost, addInventoryWritedown, setInventoryMethod, INVENTORY_ACCOUNT } from "./inventory.mjs";
import { prepaidEntries, prepaidRegister, addPrepaid, PREPAID_ACCOUNT } from "./prepaid.mjs";
import { assetEntries, register, addAsset, disposeAsset, addAssetsCsv, ASSET_ACCOUNT } from "./assets.mjs";
import { cashBasis } from "./cashbasis.mjs";
import { payrollEntries } from "./payroll.mjs";
import { closingEntries } from "./yearend.mjs";
import { openingEntry, setOpeningBalances, clearOpeningBalances } from "./opening.mjs";
import { SAMPLE_CHECKING, SAMPLE_CARD } from "./example-data.mjs";

export { setOpeningBalances, clearOpeningBalances };
export { closeYear, reopenYear, yearEndReport } from "./yearend.mjs";
export { addFxAccount, setRates, parseRates, rateOn };
export const fxRegister = (books, asOf = null) => fxReg(books, journal(books), asOf);
export { DEFAULT_ACCOUNTS, fmt, dollars, payeeKey, addDocuments, writeOff, aging, addAsset, disposeAsset, addAssetsCsv, register, addPrepaid, prepaidRegister, addInventoryMove, addLandedCost, addInventoryWritedown, setInventoryMethod, inventoryRegister };

export const VERSION = 1;
const CAPEX_LIKELY = /suppl|office|repair|equipment|tool|computer|furniture|material|uncategori/i;
const FX_TRANSFER_TOLERANCE = 0.03; // bank rate vs typed rate, across a foreign and a base account
export const DEFAULTS = {
  autoPost: 0.85, // memory or your rule at or above this posts without review
  transferDays: 5, // a transfer's two sides may post this many days apart
  capitalizeOver: 250000, // cents; an expense line above this is flagged as possible equipment
  unusualRatio: 3, // a payee's charge this many times its usual size is flagged
};

export function newBooks({ name = "My business", accounts = DEFAULT_ACCOUNTS, currency = "USD" } = {}) {
  return { version: VERSION, name, currency, accounts: accounts.map((a) => ({ ...a })), rules: "", transactions: [], history: [], opening: {} };
}

// Lock a closed period: lines and documents dated on or before `date` can no
// longer be imported, re-filed, booked or written off. Refuses while a line in
// the period still needs an account. `date` null unlocks. -> new books.
export function lockPeriod(booksIn, date) {
  const books = clone(booksIn);
  if (date === null) { delete books.lockedThrough; return books; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(dayNum(date))) throw new Error(`Lock date ${date} is not a YYYY-MM-DD date.`);
  const open = books.transactions.filter((t) => t.date <= date && (t.status === "review" || t.status === "new"));
  if (open.length) throw new Error(`${open.length} line${open.length === 1 ? "" : "s"} dated on or before ${date} still need an account; file them before locking.`);
  if (books.lockedThrough && date < books.lockedThrough) throw new Error(`Already locked through ${books.lockedThrough}; unlock first to move the lock back.`);
  books.lockedThrough = date;
  return books;
}

// Rebuild the learned parts (memory, classifier) from the books' history.
export function modelFor(books, skip = null) {
  const { rules, problems } = parseRules(books.rules, books.accounts);
  return { rules, ruleProblems: problems, memory: buildMemory(books.history), classifier: trainClassifier(books.history), codes: new Set(books.accounts.map((a) => a.code)), ...(skip ? { skip: new Set(skip) } : {}) };
}

// A bank shows a card purchase as pending ("SQ *BLUE BOTTLE") and later posts it
// worded differently and a day or two later ("BLUE BOTTLE COFFEE SF"). When a
// re-import covers (give or take 4 days) the dates of lines already booked, a new row with no id match
// that equals an unmatched booked line in this account (same cents, date within
// 4 days, descriptions that differ yet share a word of 4+ letters) is that line again. Booked
// lines the file does re-supply by id are never candidates, so a daily $4.50
// coffee is not mistaken for yesterday's. One booked line absorbs one row.
// -> Map(row index -> text for the note)
function rewordedLines(books, account, rows, ids, oldIds, have) {
  const out = new Map();
  if (!rows.length) return out;
  const supplied = new Set([...ids, ...oldIds]);
  const dates = rows.map((r) => r.date).sort();
  const [lo, hi] = [dates[0], dates[dates.length - 1]];
  const words = (s) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && !/^\d+$/.test(w)));
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const day = (d) => Date.parse(d + "T00:00:00Z") / 864e5;
  const pool = books.transactions.filter((t) => t.account === account && day(t.date) >= day(lo) - 4 && day(t.date) <= day(hi) + 4 && !supplied.has(t.id));
  const taken = new Set();
  rows.forEach((r, i) => {
    if (have.has(ids[i]) || have.has(oldIds[i])) return;
    const w = words(r.desc);
    const hit = pool.find((t) => !taken.has(t.id) && t.cents === r.cents && norm(t.desc) !== norm(r.desc) && Math.abs(day(t.date) - day(r.date)) <= 4 && [...words(t.desc)].some((x) => w.has(x)));
    if (hit) { taken.add(hit.id); out.set(i, `"${r.desc}" ${r.date} ~ "${hit.desc}" ${hit.date}`); }
  });
  return out;
}

// Import one statement into one bank account. Lines already in the books (same
// id) are skipped, so re-importing an overlapping month adds only what is new.
// -> { books, added, skipped, problems, balanceCheck }
export function importStatement(booksIn, csv, account, opts = {}) {
  const books = clone(booksIn);
  const acct = accountMap(books.accounts).get(account);
  if (!acct) return { books, added: 0, skipped: 0, problems: [`No account ${account} in the chart of accounts.`], balanceCheck: null };
  const { rows, problems, inferred, statement } = readStatement(csv, opts);
  if (inferred) problems.push(inferred);
  // A card file of purchases only (no payment row to read the sign from) lists every
  // charge as a positive amount; a card statement with nothing but credits is rare.
  if (opts.invert === undefined && !inferred && acct.type === "liability" && rows.length >= 2 && !statement &&
      rows.every((r) => r.cents > 0 && r.balance === null)) {
    for (const r of rows) r.cents = -r.cents;
    problems.push("Every line was positive on a card account, so they were read as charges and the signs flipped (pass invert: false if they are refunds).");
  }
  const ids = rowIds(rows, account, { loose: true }), oldIds = rowIds(rows, account);
  const have = new Set(books.transactions.map((t) => t.id));
  let added = 0, skipped = 0;
  let locked = 0, noRate = 0;
  const reworded = rewordedLines(books, account, rows, ids, oldIds, have);
  if (reworded.size) problems.push(`${reworded.size} line${reworded.size === 1 ? "" : "s"} skipped as already booked under different wording or a date a few days apart (a pending line later posted): ${[...reworded.values()].slice(0, 3).join("; ")}${reworded.size > 3 ? "; ..." : ""}.`);
  rows.forEach((r, i) => {
    if (have.has(ids[i]) || have.has(oldIds[i])) { skipped++; return; }
    if (reworded.has(i)) { skipped++; return; }
    if (books.lockedThrough && r.date <= books.lockedThrough) { locked++; return; }
    const conv = convertRow(books, account, r);
    if (!conv) { noRate++; return; }
    books.transactions.push({ id: ids[i], account, date: r.date, desc: r.desc, cents: conv.cents, ...(conv.foreign ? { foreign: conv.foreign } : {}), balance: r.balance, ...(r.bankCat ? { bankCat: r.bankCat } : {}), status: "new" });
    added++;
  });
  // Balances are kept debit-positive (what you own is positive, what you owe
  // negative). A card statement prints what you owe as positive, so try both
  // signs and keep whichever the rows agree with.
  if (noRate) problems.push(`${noRate} line${noRate === 1 ? "" : "s"} left out: no ${fxCurrency(books, account)} exchange rate on or before ${noRate === 1 ? "its date" : "their dates"}. Add rates (fx rate ${fxCurrency(books, account)} DATE RATE) and import again.`);
  if (locked) problems.push(`${locked} line${locked === 1 ? "" : "s"} dated on or before ${books.lockedThrough} left out: that period is locked.`);
  const asIs = checkRunningBalance(rows);
  const flipped = checkRunningBalance(rows.map((r) => ({ ...r, balance: r.balance === null ? null : -r.balance })));
  const balanceCheck = !asIs.checked ? asIs : flipped.breaks.length < asIs.breaks.length || (flipped.breaks.length === asIs.breaks.length && acct.type === "liability") ? flipped : asIs;
  if (balanceCheck.checked) {
    books.statements = { ...(books.statements ?? {}), [account]: { closing: balanceCheck.closing, closingDate: balanceCheck.closingDate } };
    if (books.opening[account] === undefined && !booksIn.transactions.some((t) => t.account === account) && balanceCheck.opening) {
      const cur = fxCurrency(books, account), first = rows.map((r) => r.date).sort()[0];
      const c = cur ? convertRow(books, account, { date: first, cents: balanceCheck.opening }) : { cents: balanceCheck.opening };
      if (c) { books.opening[account] = c.cents; if (cur) books.fx.opening[account] = balanceCheck.opening; }
      else problems.push(`The opening balance of ${fmt(balanceCheck.opening)} ${cur} could not be converted: no rate on or before ${first}.`);
    }
  }
  // OFX, MT940 and CAMT files print no running balance per line, only the closing one: keep it for the reconcile check.
  if (!balanceCheck.checked && statement) books.statements = { ...(books.statements ?? {}), [account]: { closing: statement.cents, closingDate: statement.date } };
  return { books: categorize(books, opts), added, skipped, problems, balanceCheck };
}

// Import an OFX/QFX file that holds several accounts. `map` sends each OFX
// account id to a chart code ({ "123456789": "1000", "4111": "2000" }); an
// account left out of the map is not imported and is named in `problems`.
// -> importStatement's result, summed, plus `accounts` (what the file held).
export function importOfxAccounts(booksIn, text, map, opts = {}) {
  const parts = sniffFormat(text) === "ofx" ? splitOfx(text) : [];
  const accounts = parts.map((p) => ({ id: p.id, type: p.type, card: p.card, code: map?.[p.id] ?? null }));
  let books = booksIn, added = 0, skipped = 0;
  const problems = [];
  if (!parts.length) problems.push("Not an OFX file.");
  parts.forEach((p, i) => {
    const code = accounts[i].code;
    if (!code) { problems.push(`Account ${p.id || "(no id)"} (${p.card ? "card" : p.type || "bank"}) has no chart code in the map, left out.`); return; }
    const r = importStatement(books, p.text, code, opts);
    books = r.books; added += r.added; skipped += r.skipped;
    problems.push(...r.problems.map((x) => (parts.length > 1 ? `Account ${p.id}: ${x}` : x)));
  });
  return { books, added, skipped, problems, accounts };
}

// A QIF file with several `!Account` sections (Quicken): `map` sends each
// account name to a chart code, as importOfxAccounts does for OFX ids.
export function importQifAccounts(booksIn, text, map, opts = {}) {
  const parts = sniffFormat(text) === "qif" ? splitQif(text) : [];
  const accounts = parts.map((p) => ({ name: p.id, type: p.type, code: map?.[p.id] ?? null }));
  let books = booksIn, added = 0, skipped = 0;
  const problems = [];
  if (!parts.length) problems.push("No QIF file with more than one named !Account section.");
  parts.forEach((p, i) => {
    const code = accounts[i].code;
    if (!code) { problems.push(`Account "${p.id}" has no chart code in the map, left out.`); return; }
    const r = importStatement(books, p.text, code, opts);
    books = r.books; added += r.added; skipped += r.skipped;
    problems.push(...r.problems.map((x) => `Account "${p.id}": ${x}`));
  });
  return { books, added, skipped, problems, accounts };
}

// A CSV whose rows name their account (Mint, Monarch, Tiller, YNAB exports):
// `map` sends each name in the file's Account column to a chart code. Names
// left out of the map are not imported and are listed in `problems`.
// -> importStatement's result, summed, plus `accounts` ({ name, code }).
export function importCsvAccounts(booksIn, csv, map, opts = {}) {
  const names = readStatement(csv, opts).accountNames ?? [];
  const accounts = names.map((name) => ({ name, code: map?.[name] ?? null }));
  let books = booksIn, added = 0, skipped = 0;
  const problems = [];
  if (!names.length) problems.push("No Account column naming more than one account in this file.");
  for (const a of accounts) {
    if (!a.code) { problems.push(`Account "${a.name}" has no chart code in the map, left out.`); continue; }
    const r = importStatement(books, csv, a.code, { ...opts, onlyAccount: a.name });
    books = r.books; added += r.added; skipped += r.skipped;
    problems.push(...r.problems.map((x) => `Account "${a.name}": ${x}`));
  }
  return { books, added, skipped, problems, accounts };
}

// Suggest an account for every open line, pair transfers, and auto-post what
// is sure. Lines you already confirmed are never touched.
export function categorize(booksIn, opts = {}) {
  const books = clone(booksIn);
  const o = { ...DEFAULTS, ...opts };
  const model = modelFor(books, o.skipLayers);
  const map = accountMap(books.accounts);
  // Lines matched to an invoice or bill are re-matched at the end of every pass.
  for (const t of books.transactions) if (t.status === "settled") { t.status = "new"; delete t.posted; delete t.doc; }
  pairTransfers(books, o.transferDays);
  for (const t of books.transactions) {
    if (t.status === "confirmed" || t.status === "transfer" || t.status === "split") continue;
    let s = suggest(t, model);
    // Keep a model's suggestion over a weaker deterministic one; your rules
    // and memory still win.
    if (t.suggestion?.source === "ai" && s.source !== "rule" && s.source !== "memory") s = t.suggestion;
    t.suggestion = s;
    if (s.account === "transfer") {
      // A transfer hint with no matching line in another imported account: the
      // other side has not been imported yet, so it waits for review.
      t.status = "review";
      t.suggestion = { ...s, account: null, reason: `${s.reason}: looks like a transfer, but the other side is not in the books yet. Import that account's statement, or pick the account it went to.` };
    } else if (s.account && map.has(s.account) && (s.source === "rule" || s.source === "memory") && s.confidence >= o.autoPost) {
      t.status = "auto";
      t.posted = s.account;
    } else {
      t.status = "review";
      delete t.posted;
    }
  }
  return books.documents?.length ? settle(books) : books;
}

// Two lines in different bank accounts, equal and opposite, within `days`:
// one transfer, posted once (debit the account that received, credit the one
// that paid). Each line pairs at most once, nearest date first.
export function pairTransfers(books, days = DEFAULTS.transferDays) {
  const open = books.transactions.filter((t) => t.status !== "confirmed" && t.status !== "transfer" && t.status !== "split");
  const bankCodes = new Set(books.accounts.filter((a) => a.bank).map((a) => a.code));
  const ins = open.filter((t) => t.cents > 0 && bankCodes.has(t.account));
  const outs = open.filter((t) => t.cents < 0 && bankCodes.has(t.account));
  const used = new Set();
  const pairs = [];
  for (const a of ins) for (const b of outs) {
    if (a.account === b.account) continue;
    // Between a foreign-currency account and a base-currency one the two sides
    // differ by the bank's own rate against the typed one: pair them when they
    // are within FX_TRANSFER_TOLERANCE of each other (the difference is booked as
    // realized exchange gain or loss, see journal()).
    const diff = Math.abs(a.cents + b.cents);
    if (diff !== 0) {
      if (!a.foreign && !b.foreign) continue;
      // Two foreign accounts: the same currency must move the same foreign amount
      // (only the typed rates differ); different currencies are judged in base units.
      if (a.foreign && b.foreign && a.foreign.currency === b.foreign.currency && a.foreign.cents + b.foreign.cents !== 0) continue;
      if (diff > Math.max(a.cents, -b.cents) * FX_TRANSFER_TOLERANCE) continue;
    }
    const gap = Math.abs(dayNum(a.date) - dayNum(b.date));
    if (gap <= days) pairs.push([gap, diff, a, b]);
  }
  pairs.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  for (const [, , a, b] of pairs) {
    if (used.has(a.id) || used.has(b.id)) continue;
    used.add(a.id); used.add(b.id);
    if (a.cents + b.cents !== 0 && !books.accounts.some((x) => x.code === FX_ACCOUNT)) books.accounts.push({ code: FX_ACCOUNT, name: "Foreign exchange gain or loss", type: "expense" });
    a.status = b.status = "transfer";
    a.pair = b.id; b.pair = a.id;
    a.posted = b.account; b.posted = a.account;
    delete a.suggestion; delete b.suggestion;
  }
  return pairs.length;
}

// Confirm (or correct) lines: { [id]: accountCode }. Each one is learned from.
// A value can instead be a split: [{ account, cents }, ...], parts signed like
// the bank line (a payout of 970.00 is sales +1000.00 and fees -30.00), at most
// one with no cents to take the remainder. A split posts one entry with a line
// per part and is not learned from, since the same payee splits differently
// each time.
export function confirm(booksIn, choices) {
  const books = clone(booksIn);
  const codes = new Set(books.accounts.map((a) => a.code));
  for (const t of books.transactions) {
    const c = choices[t.id];
    if (c === undefined) continue;
    if (books.lockedThrough && t.date <= books.lockedThrough) throw new Error(`Line ${t.id} is dated ${t.date}, in the period locked through ${books.lockedThrough}. Unlock it first.`);
    if (Array.isArray(c)) {
      const parts = resolveSplit(t, c, codes);
      if (t.status === "transfer") unpair(books, t);
      t.status = "split";
      t.split = parts;
      t.posted = parts.reduce((m, p) => (Math.abs(p.cents) > Math.abs(m.cents) ? p : m)).account;
      continue;
    }
    if (!codes.has(c)) throw new Error(`No account ${c} in the chart of accounts.`);
    if (t.status === "transfer") unpair(books, t);
    delete t.split; delete t.doc;
    t.status = "confirmed";
    t.posted = c;
    books.history.push(historyRecord(t, c));
  }
  return categorize(books);
}

// Check a split against its bank line and fill in the one open part. Returns
// [{ account, cents }] summing exactly to the line's cents.
export function resolveSplit(t, parts, codes) {
  if (!Array.isArray(parts) || parts.length < 2) throw new Error(`Line ${t.id}: a split needs at least two parts.`);
  const open = parts.filter((p) => p.cents === undefined || p.cents === null);
  if (open.length > 1) throw new Error(`Line ${t.id}: only one part of a split can leave its amount to the remainder.`);
  for (const p of parts) {
    if (!codes.has(p.account)) throw new Error(`No account ${p.account} in the chart of accounts.`);
    if (p.cents !== undefined && p.cents !== null && (!Number.isInteger(p.cents) || p.cents === 0)) throw new Error(`Line ${t.id}: split amounts are whole, non-zero cents.`);
  }
  const given = parts.reduce((a, p) => a + (p.cents ?? 0), 0);
  const out = parts.map((p) => ({ account: p.account, cents: p.cents ?? t.cents - given }));
  if (out.some((p) => p.cents === 0)) throw new Error(`Line ${t.id}: the remainder part would be zero.`);
  const sum = out.reduce((a, p) => a + p.cents, 0);
  if (sum !== t.cents) throw new Error(`Line ${t.id}: the parts add to ${fmt(sum)} but the line is ${fmt(t.cents)}.`);
  return out;
}

// "4000:1000.00, 6010:-30.00" or "4000, 6010:-30.00" -> [{ account, cents }].
// Amounts are signed like the bank line; one may be left out. A bare code with
// no comma is not a split, so it comes back as the code.
export function parseSplit(text) {
  const bits = String(text ?? "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  if (bits.length < 2) return bits[0] ?? "";
  return bits.map((b) => {
    const [account, amt] = b.split(":").map((x) => x.trim());
    if (amt === undefined || amt === "") return { account };
    const cents = parseCents(amt);
    if (cents === null || cents === undefined || Number.isNaN(cents)) throw new Error(`Cannot read the amount "${amt}" in "${b}".`);
    return { account, cents };
  });
}

// The account legs of a posted line, signed like the bank line.
const legsOf = (t) => (t.split ?? (t.posted ? [{ account: t.posted, cents: t.cents }] : []));

// Accept every suggestion at or above a confidence, as if confirmed one by one.
export function acceptSuggestions(books, minConfidence = 0.7) {
  const choices = {};
  for (const t of books.transactions) if ((t.status === "review" || t.status === "auto") && t.suggestion?.account && t.suggestion.confidence >= minConfidence) choices[t.id] = t.suggestion.account;
  for (const t of books.transactions) if (t.status === "auto") choices[t.id] = t.posted;
  return confirm(books, choices);
}

function unpair(books, t) {
  const other = books.transactions.find((x) => x.id === t.pair);
  if (other) { other.status = "new"; delete other.pair; delete other.posted; }
  delete t.pair;
}

// Journal entries for everything posted (confirmed, auto, transfer), plus the
// opening balances. Review lines are left out and counted.
export function journal(books, { withClosing = false } = {}) {
  const entries = [];
  const map = accountMap(books.accounts);
  const tb = openingEntry(books);
  if (tb) entries.push(tb);
  const tbCodes = new Set((books.openingTB?.lines ?? []).map((l) => l.account));
  for (const [code, cents] of Object.entries(books.opening ?? {})) {
    if (!cents || !map.has(code) || tbCodes.has(code)) continue; // a trial balance you entered wins over one inferred from a statement
    const firstDate = books.transactions.filter((t) => t.account === code).map((t) => t.date).sort()[0] ?? "2000-01-01";
    const date = prevDay(firstDate);
    const deb = cents > 0;
    entries.push({ id: `OPEN-${code}`, date, memo: `Opening balance, ${map.get(code).name}`, source: "opening", lines: [{ account: code, debit: deb ? cents : 0, credit: deb ? 0 : -cents }, { account: "3000", debit: deb ? 0 : -cents, credit: deb ? cents : 0 }] });
  }
  entries.push(...documentEntries(books), ...assetEntries(books), ...prepaidEntries(books), ...inventoryEntries(books), ...fxEntries(books), ...docRevalEntries(books), ...payrollEntries(books));
  const seen = new Set();
  for (const t of books.transactions) {
    if (!t.posted || t.status === "review" || t.status === "new" || seen.has(t.id)) continue;
    seen.add(t.id);
    if (t.status === "transfer") seen.add(t.pair);
    if (t.status === "split") {
      const bank = { account: t.account, debit: Math.max(t.cents, 0), credit: Math.max(-t.cents, 0) };
      entries.push({ id: t.id, date: t.date, memo: t.desc, source: "split", lines: [bank, ...t.split.map((p) => ({ account: p.account, debit: Math.max(-p.cents, 0), credit: Math.max(p.cents, 0) }))] });
      continue;
    }
    const other = t.status === "transfer" ? books.transactions.find((x) => x.id === t.pair) : null;
    if (other && t.cents + other.cents !== 0) {
      // A transfer across currencies: each account carries its own side, the
      // difference is realized exchange gain (received more than was carried out) or loss.
      const [inn, out] = t.cents > 0 ? [t, other] : [other, t];
      const diff = inn.cents + out.cents;
      entries.push({ id: t.id, date: t.date, memo: t.desc, source: "transfer", lines: [{ account: inn.account, debit: inn.cents, credit: 0 }, { account: out.account, debit: 0, credit: -out.cents }, { account: FX_ACCOUNT, debit: Math.max(-diff, 0), credit: Math.max(diff, 0) }] });
      continue;
    }
    const amt = Math.abs(t.cents);
    const into = t.cents > 0 ? t.account : t.posted;
    const from = t.cents > 0 ? t.posted : t.account;
    entries.push({ id: t.id, date: t.date, memo: t.desc, source: t.status, lines: [{ account: into, debit: amt, credit: 0 }, { account: from, debit: 0, credit: amt }] });
  }
  if (withClosing && books.yearEnd?.length) entries.push(...closingEntries(books, entries));
  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

// What a bookkeeper checks before calling a month closed. Each finding names
// the lines it is about and says what to do.
export function closeChecks(books, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const map = accountMap(books.accounts);
  const entries = journal(books);
  const out = [];
  const review = books.transactions.filter((t) => t.status === "review" || t.status === "new");
  if (review.length) out.push({ severity: "high", check: "review", message: `${review.length} line${review.length === 1 ? "" : "s"} still need an account. Nothing is posted for them yet, so the reports leave them out.`, ids: review.map((t) => t.id) });

  for (const e of entries) { const p = validateEntry(e, map); if (p.length) out.push({ severity: "high", check: "unbalanced", message: `Entry ${e.id}: ${p.join("; ")}.`, ids: [e.id] }); }

  if (books.openingTB) {
    const early = books.transactions.filter((t) => t.date <= books.openingTB.date && t.posted);
    if (early.length) out.push({ severity: "high", check: "opening-overlap", message: `${early.length} posted line${early.length === 1 ? " is" : "s are"} dated on or before the opening balances (${books.openingTB.date}), so they count twice. Re-import from the next day.`, ids: early.map((t) => t.id) });
  }

  const sus = books.accounts.filter((a) => a.suspense).map((a) => a.code);
  const b = balances(entries);
  for (const c of sus) if (b.get(c)) out.push({ severity: "medium", check: "suspense", message: `${fmt(Math.abs(b.get(c)))} sits in ${map.get(c).name}. Move it to a real account before you file.`, ids: books.transactions.filter((t) => legsOf(t).some((l) => l.account === c)).map((t) => t.id) });

  // Equipment: the asset account should equal the register's cost. A purchase filed to
  // 1500 with no register row is not being depreciated.
  if (books.assets?.length) {
    const cost = register(books).cost;
    const ledger = b.get(ASSET_ACCOUNT) ?? 0;
    if (ledger !== cost) out.push({ severity: "low", check: "assets", message: `${map.get(ASSET_ACCOUNT)?.name ?? ASSET_ACCOUNT} is ${fmt(ledger)} in the ledger but the asset register adds up to ${fmt(cost)}. ${ledger > cost ? "A purchase filed there has no register row, so it is not being depreciated." : "A register row has no purchase filed to the account."}`, ids: [] });
  }

  // Prepaid expenses: account 1400 should equal what the register says is still paid ahead.
  if (books.prepaids?.length) {
    const ahead = prepaidRegister(books).remaining, ledger = b.get(PREPAID_ACCOUNT) ?? 0;
    if (ledger !== ahead) out.push({ severity: "low", check: "prepaid", message: `${map.get(PREPAID_ACCOUNT)?.name ?? PREPAID_ACCOUNT} is ${fmt(ledger)} in the ledger but the prepaid register has ${fmt(ahead)} still paid ahead. ${ledger > ahead ? "A payment filed there has no register row, so it is not being spread over its months." : "A register row has no payment filed to the account."}`, ids: [] });
  }

  // Inventory: account 1450 should equal the stock register's value.
  if (books.inventory?.moves?.length) {
    const reg = inventoryRegister(books).value, ledger = b.get(INVENTORY_ACCOUNT) ?? 0;
    if (ledger !== reg) out.push({ severity: "low", check: "inventory", message: `${map.get(INVENTORY_ACCOUNT)?.name ?? INVENTORY_ACCOUNT} is ${fmt(ledger)} in the ledger but the stock register values what is on hand at ${fmt(reg)}. ${ledger > reg ? "A purchase filed there has no register row (add it with inventory buy)." : "A register purchase has no payment filed to the account."}`, ids: [] });
  }

  // Duplicates: same account, date, amount and payee, in different imports.
  const groups = new Map();
  for (const t of books.transactions) { const k = `${t.account}|${t.date}|${t.cents}|${payeeKey(t.desc)}`; groups.set(k, [...(groups.get(k) ?? []), t]); }
  for (const g of groups.values()) if (g.length > 1) out.push({ severity: "low", check: "duplicate", message: `${g.length} identical lines on ${g[0].date} for ${fmt(Math.abs(g[0].cents))} (${g[0].desc}). Two real purchases, or the same one imported twice?`, ids: g.map((t) => t.id) });

  // Unusual size for a payee you have paid before.
  const byPayee = new Map();
  for (const t of books.transactions) if (t.cents < 0) { const k = payeeKey(t.desc); if (k) byPayee.set(k, [...(byPayee.get(k) ?? []), t]); }
  for (const [k, list] of byPayee) {
    if (list.length < 4) continue;
    const med = median(list.map((t) => -t.cents));
    for (const t of list) if (-t.cents > o.unusualRatio * med && -t.cents - med > 5000) out.push({ severity: "medium", check: "unusual", message: `${t.date}: ${fmt(-t.cents)} to "${k}" is ${(-t.cents / med).toFixed(1)}x the usual ${fmt(med)}. A price rise, an annual plan, or a mistake?`, ids: [t.id] });
  }

  for (const t of books.transactions) for (const l of legsOf(t)) {
    const a = map.get(l.account);
    // Only accounts where a long-lived purchase hides: supplies, office, repairs, tools.
    if (l.cents < 0 && a?.type === "expense" && CAPEX_LIKELY.test(a.name) && -l.cents >= o.capitalizeOver) out.push({ severity: "low", check: "capitalize", message: `${t.date}: ${fmt(-l.cents)} to ${a.name} (${t.desc}). If it is equipment that lasts more than a year, it may belong in an asset account and be depreciated; ask your accountant.`, ids: [t.id] });
  }

  // Ledger vs. the bank's own closing balance, when the statement printed one.
  for (const [code, s] of Object.entries(books.statements ?? {})) {
    const a = map.get(code);
    if (!a) continue;
    const fxc = fxCurrency(books, code); // a foreign account's statement is in its own currency
    const ledger = natural(a, fxc ? foreignBalance(books, code, s.closingDate) : balances(entries, { to: s.closingDate }).get(code) ?? 0);
    const bank = natural(a, s.closing);
    if (ledger !== bank) out.push({ severity: "high", check: "reconcile", message: `${a.name}: the books say ${fmt(ledger)} on ${s.closingDate}, the statement says ${fmt(bank)}, a difference of ${fmt(ledger - bank)}. Usually a line still in review, or a missing opening balance.`, ids: [] });
    else out.push({ severity: "ok", check: "reconcile", message: `${a.name} agrees with the statement's closing balance of ${fmt(bank)} on ${s.closingDate}.`, ids: [] });
  }

  // A liability below zero means more was paid out of it than was ever put in:
  // on cash-basis books, usually sales tax collected inside your deposits, or a
  // loan whose opening balance was never entered.
  const bs = balances(entries);
  for (const a of books.accounts.filter((x) => x.type === "liability" && !x.bank)) {
    const v = natural(a, bs.get(a.code) ?? 0);
    if (v < 0) out.push({ severity: "medium", check: "liability", message: `${a.name} is ${fmt(v)}: more was paid out of it than was ever recorded owing. If it is tax you collected, part of your sales deposits belongs here; if it is a loan, enter the balance it started with.`, ids: books.transactions.filter((t) => legsOf(t).some((l) => l.account === a.code)).map((t) => t.id) });
  }

  // Receivable and payable: the ledger should equal the open documents. A
  // difference is a line filed to the control account with no document behind it.
  if (books.documents?.length) {
    const ag = aging(books, opts.asOf ?? null);
    for (const [code, side, label] of [[AR, ag.receivable, "Accounts receivable"], [AP, ag.payable, "Accounts payable"]]) {
      const a = map.get(code);
      if (!a) continue;
      const ledger = natural(a, bs.get(code) ?? 0);
      if (ledger !== side.total) out.push({ severity: "medium", check: "control", message: `${label} is ${fmt(ledger)} in the ledger but the open documents add up to ${fmt(side.total)}. A line was filed to ${code} with no invoice or bill behind it, or a document is missing.`, ids: books.transactions.filter((t) => legsOf(t).some((l) => l.account === code) && !t.doc).map((t) => t.id) });
    }
    const late = ag.open.filter((d) => !d.credit && d.daysLate > 30);
    for (const d of late) out.push({ severity: d.kind === "invoice" ? "medium" : "low", check: d.kind === "invoice" ? "overdue" : "bill-overdue", message: `${d.kind === "invoice" ? "Invoice" : "Bill"} ${d.id.replace(/^[A-Z]+-/, "")} from ${d.party} for ${fmt(d.total)}${d.partlyPaid ? ` still owing (of ${fmt(d.original)})` : ""} is ${d.daysLate} days past due as of ${ag.asOf}.${d.kind === "invoice" ? " Chase it, or write it off." : " Pay it, or confirm it is disputed."}`, ids: [d.id] });
  }

  // An account with lines still in review is already reported above; its
  // running balance is incomplete, so a dip below zero there means nothing yet.
  const pending = new Set(review.map((t) => t.account));
  for (const c of books.accounts.filter((x) => x.bank && x.type === "asset" && !pending.has(x.code))) {
    let run = 0, worst = null;
    for (const e of entries) for (const l of e.lines) if (l.account === c.code) { run += l.debit - l.credit; if (run < 0 && (!worst || run < worst.cents)) worst = { date: e.date, cents: run }; }
    if (worst) out.push({ severity: "medium", check: "negative", message: `${c.name} goes negative (${fmt(worst.cents)}) on ${worst.date}. An overdraft, or a deposit not yet imported.`, ids: [] });
  }
  return out;
}

// Exports. Positive = debit in Xero's and IIF's single amount column.
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csvRow = (cells) => cells.map(csvCell).join(",");
// Text copied from a bank file opens in Excel or Sheets as a formula if it starts with = + - @ (or a tab/CR),
// so exported text columns get a leading apostrophe (OWASP's CSV-injection advice). Amounts and dates stay bare.
export const safeText = (v) => { const s = String(v ?? ""); return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; };
const usDate = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const ukDate = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function exportJournal(books, format = "csv") {
  const map = accountMap(books.accounts);
  const entries = journal(books, { withClosing: true });
  const name = (c) => map.get(c)?.name ?? c;
  if (format === "qbo") {
    const rows = [csvRow(["*JournalNo", "*JournalDate", "*AccountName", "Debits", "Credits", "Description"])];
    entries.forEach((e, i) => { for (const l of e.lines) rows.push(csvRow([`AB-${String(i + 1).padStart(5, "0")}`, usDate(e.date), safeText(name(l.account)), l.debit ? dollars(l.debit) : "", l.credit ? dollars(l.credit) : "", safeText(e.memo)])); });
    return rows.join("\n") + "\n";
  }
  if (format === "xero") {
    const rows = [csvRow(["*Narration", "*Date", "Description", "*AccountCode", "*TaxRate", "*Amount"])];
    for (const e of entries) for (const l of e.lines) rows.push(csvRow([safeText(e.memo || e.id), ukDate(e.date), safeText(e.memo), l.account, "Tax Exempt", dollars(l.debit - l.credit)]));
    return rows.join("\n") + "\n";
  }
  if (format === "iif") {
    // QuickBooks Desktop reads ":" in an account name as a sub-account and a tab as a column break.
    const iifName = (c) => String(name(c)).replace(/[:\t\r\n]+/g, "-");
    // IIF import fails on an account QuickBooks does not have, so the accounts used are listed first.
    const accntType = (c) => {
      const a = map.get(c), n = String(a?.name ?? "").toLowerCase();
      if (a?.type === "asset") return a.bank ? "BANK" : /receivable/.test(n) ? "AR" : /equipment|vehicle|furniture|depreciation|building|software|fixed/.test(n) ? "FIXASSET" : "OCASSET";
      if (a?.type === "liability") return /payable/.test(n) && !/payroll|tax/.test(n) ? "AP" : /loan|note|mortgage/.test(n) ? "LTLIAB" : "OCLIAB";
      if (a?.type === "income") return "INC";
      if (a?.type === "expense") return /cost of (goods|sales)|cogs/.test(n) ? "COGS" : "EXP";
      return "EQUITY";
    };
    const usedCodes = [...new Set(entries.flatMap((e) => e.lines.map((l) => l.account)))];
    const out = ["!ACCNT\tNAME\tACCNTTYPE", ...usedCodes.map((c) => `ACCNT\t${iifName(c)}\t${accntType(c)}`), "!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tMEMO", "!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tMEMO", "!ENDTRNS"];
    for (const e of entries) {
      const [first, ...rest] = e.lines;
      const memo = String(e.memo).replace(/[\t\r\n]/g, " ");
      out.push(`TRNS\t\tGENERAL JOURNAL\t${usDate(e.date)}\t${iifName(first.account)}\t${dollars(first.debit - first.credit)}\t${memo}`);
      for (const l of rest) out.push(`SPL\t\tGENERAL JOURNAL\t${usDate(e.date)}\t${iifName(l.account)}\t${dollars(l.debit - l.credit)}\t${memo}`);
      out.push("ENDTRNS");
    }
    return out.join("\r\n") + "\r\n";
  }
  if (format === "ledger" || format === "beancount") return plainText(books, entries, map, format === "beancount");
  const rows = [csvRow(["entry", "date", "account_code", "account_name", "debit", "credit", "memo", "posted_by"])];
  for (const e of entries) for (const l of e.lines) rows.push(csvRow([e.id, e.date, l.account, safeText(name(l.account)), l.debit ? dollars(l.debit) : "", l.credit ? dollars(l.credit) : "", safeText(e.memo), e.source]));
  return rows.join("\n") + "\n";
}

// Plain-text accounting (ledger-cli and hledger, or Beancount): one dated entry
// per journal entry, amounts in the books' currency, each entry summing to zero.
// Beancount also wants an `open` line per account and capitalised name parts.
function plainText(books, entries, map, bean) {
  const root = { asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", expense: "Expenses" };
  const path = (code) => {
    const a = map.get(code);
    const words = String(a?.name ?? code).replace(/[^A-Za-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
    const parts = (words.length ? words : [`A${code}`]).map((w) => (bean ? w[0].toUpperCase() + w.slice(1) : w));
    return `${root[a?.type] ?? "Equity"}:${parts.join("-")}`;
  };
  // Beancount commodities are upper-case codes; a symbol or lower-case code would not parse.
  const cur = bean ? ({ "$": "USD", "€": "EUR", "£": "GBP" }[books.currency] ?? String(books.currency || "USD").toUpperCase()) : String(books.currency || "USD").replace(/[.\s]+$/, "");
  const text = (t) => String(t ?? "").replace(/[\r\n]+/g, " ").replace(bean ? /"/g : /;/g, bean ? "'" : ",").replace(bean ? /\\/g : /$^/g, "/").trim();
  const out = [];
  if (bean) {
    const used = [...new Set(entries.flatMap((e) => e.lines.map((l) => l.account)))];
    out.push(`option "title" "${text(books.name ?? "Books")}"`, `option "operating_currency" "${cur}"`, "");
    for (const c of used) out.push(`${entries[0].date} open ${path(c)} ${cur}`);
    out.push("");
  } else {
    // Declared up front so `ledger --strict --pedantic` (which flags unknown accounts and
    // commodities, catching typos) and `hledger check accounts commodities` accept the file.
    const used = [...new Set(entries.flatMap((e) => e.lines.map((l) => path(l.account))))];
    out.push(`commodity ${cur}`, "");
    for (const a of used) out.push(`account ${a}`);
    out.push("");
  }
  for (const e of entries) {
    // ledger-cli and hledger read a leading `*` or `!` as a status mark and `(...)` as a code, so
    // a description that starts that way gets a "- " in front to keep its text (hledger 1.43.2).
    const desc = text(e.memo || e.id);
    out.push(bean ? `${e.date} * "${desc}"` : `${e.date} ${/^[*!(]/.test(desc) ? "- " : ""}${desc}`);
    const w = Math.max(...e.lines.map((l) => path(l.account).length));
    for (const l of e.lines) {
      const n = l.debit - l.credit;
      out.push(`  ${path(l.account).padEnd(w)}  ${n < 0 ? "-" : ""}${dollars(Math.abs(n))} ${cur}`);
    }
    out.push("");
  }
  return out.join("\n");
}

// Every line with what happened to it, for a preparer or a spreadsheet.
export function exportLines(books) {
  const map = accountMap(books.accounts);
  const rows = [csvRow(["date", "bank_account", "description", "amount", "status", "account_code", "account_name", "suggested", "confidence", "source", "reason"])];
  for (const t of [...books.transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    const s = t.suggestion ?? {};
    rows.push(csvRow([t.date, safeText(map.get(t.account)?.name ?? t.account), safeText(t.desc), dollars(t.cents), t.status, t.split ? "split" : t.posted ?? "", t.split ? t.split.map((p) => `${map.get(p.account)?.name ?? p.account} ${dollars(p.cents)}`).join("; ") : map.get(t.posted)?.name ?? "", s.account ?? "", s.confidence !== undefined ? s.confidence.toFixed(2) : "", s.source ?? "", safeText(s.reason ?? (t.status === "transfer" ? "paired with an equal and opposite line in another account" : ""))]));
  }
  return rows.join("\n") + "\n";
}

export function reports(books, { from = null, to = null } = {}) {
  const entries = journal(books);
  const pnl = profitAndLoss(entries, books.accounts, { from, to }), bs = balanceSheet(journal(books, { withClosing: true }), books.accounts, { to });
  return { trialBalance: trialBalance(entries, books.accounts, { to }), profitAndLoss: pnl, balanceSheet: bs, ratios: { ...ratios(pnl, bs), ...daysOutstanding(pnl, bs) }, breakEven: breakEven(pnl), cashFlow: cashFlow(entries, books.accounts, { from, to }), cashByMonth: cashFlowByMonth(entries, books.accounts, { from, to }) };
}

// The year's business income before the Section 179 deduction, for the
// taxable-income limit (Form 4562 line 11): the books' net profit for the year
// with the book depreciation on assets that have a tax treatment put back and
// their MACRS and bonus depreciation taken instead. Not modelled: other
// adjustments (self-employment tax deduction, gains on disposal, other
// businesses' income), so a preparer should confirm it.
// -> cents (may be negative)
export function taxableBusinessIncome(books, year) {
  const entries = journal(books);
  const net = profitAndLoss(entries, books.accounts, { from: `${year}-01-01`, to: `${year}-12-31` }).net;
  const t = taxDepreciation(books, year).totals;
  return net + t.book - (t.macrs + t.bonus);
}

// The Section 179 amount carried into `year` from earlier years, worked out
// from the books instead of typed in. Each year from the first one with an
// election applies the taxable-income limit (`s179IncomeLimit`) to that year's
// business income from the books plus the carry from the year before.
// A year with no bookkeeping at all counts as zero income, so it is flagged
// `booked: false`; a preparer's figure for those years should replace it.
// -> { carryIn, years: [{ year, elected, dollarLimited, carryIn, income, deductible, carryOut, booked }] }
export function s179Carryforward(books, year, { limits } = {}) {
  const firstYear = Math.min(...(books.assets ?? []).filter((a) => a.tax?.s179).map((a) => +a.date.slice(0, 4)), year);
  const entries = journal(books);
  const years = [];
  let carry = 0;
  for (let y = firstYear; y < year; y++) {
    const income = taxableBusinessIncome(books, y);
    const r = s179IncomeLimit(books, y, { ...(limits ? { limits } : {}), businessIncome: income, carryIn: carry });
    const booked = entries.some((e) => !["depreciation", "disposal", "opening"].includes(e.source) && e.date.startsWith(String(y)));
    years.push({ year: y, elected: r.elected, dollarLimited: r.dollarLimited, carryIn: carry, income, deductible: r.deductible, carryOut: r.carryOut, booked });
    carry = r.carryOut;
  }
  return { carryIn: carry, years };
}

// Payees you have filed the same way again and again, offered as rules. A rule
// is explicit and survives the learned history, and you can edit it. A payee is
// offered when it was filed at least `minCount` times, at least `minShare` of
// them to one account, in one direction (money in or out), and no rule you
// already wrote matches its name.
// -> [{ key, account, count, share, rule: "key => code" }], most-filed first.
export function suggestRules(books, { minCount = 3, minShare = 0.9 } = {}) {
  const { rules } = parseRules(books.rules, books.accounts);
  const groups = new Map();
  for (const h of books.history) {
    if (!h.key) continue;
    const k = `${h.key}|${h.dir}`;
    const g = groups.get(k) ?? { key: h.key, counts: new Map(), n: 0 };
    g.counts.set(h.account, (g.counts.get(h.account) ?? 0) + 1);
    g.n++;
    groups.set(k, g);
  }
  const out = [];
  for (const g of groups.values()) {
    if (g.n < minCount) continue;
    const [account, count] = [...g.counts].sort((a, b) => b[1] - a[1])[0];
    if (count / g.n < minShare || rules.some((r) => r.re.test(g.key))) continue;
    out.push({ key: g.key, account, count: g.n, share: count / g.n, rule: `${g.key} => ${account}` });
  }
  // The same payee can come back once per direction; keep the most-filed.
  const seen = new Set();
  return out.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)).filter((r) => (seen.has(r.rule) ? false : seen.add(r.rule)));
}

// Append suggested rules (the `rule` strings) to the books' rules text.
export function addRules(booksIn, ruleLines) {
  const books = clone(booksIn);
  const have = new Set(String(books.rules ?? "").split(/\r?\n/).map((l) => l.trim()));
  const add = ruleLines.filter((l) => !have.has(l));
  if (add.length) books.rules = [String(books.rules ?? "").replace(/\s+$/, ""), ...add].filter(Boolean).join("\n") + "\n";
  return books;
}

// Sales tax collected, credited back and paid over, by month, from the
// sales tax payable account (2100 unless `account` says otherwise). Collected
// is what invoices put on it, credited what credit notes took off, remitted
// what bank lines paid to the authority. `rate` is tax over the invoice's
// other lines, so a mixed-rate month shows an average. -> { account, months,
// totals, owed, invoices }
export function salesTax(books, { account = "2100", from = null, to = null } = {}) {
  const months = new Map();
  const m = (d) => {
    const k = d.slice(0, 7);
    if (!months.has(k)) months.set(k, { month: k, sales: 0, collected: 0, credited: 0, remitted: 0 });
    return months.get(k);
  };
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  const invoices = [];
  for (const d of books.documents ?? []) {
    if (d.kind !== "invoice" || !inRange(d.date)) continue;
    const tax = d.lines.filter((l) => l.account === account).reduce((a, l) => a + l.cents, 0);
    const base = d.total - tax;
    const row = m(d.date);
    if (d.credit) { row.credited += tax; row.sales -= base; continue; }
    row.collected += tax; row.sales += base;
    if (tax) invoices.push({ id: d.id, party: d.party, date: d.date, sales: base, tax, rate: base ? tax / base : null });
  }
  for (const e of journal(books)) {
    if (e.source === "invoice" || e.source === "credit" || e.source === "bill" || !inRange(e.date)) continue;
    for (const l of e.lines) if (l.account === account) {
      if (l.debit) m(e.date).remitted += l.debit;
      else if (l.credit) m(e.date).collected += l.credit;
    }
  }
  const rows = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
  for (const r of rows) r.owed = r.collected - r.credited - r.remitted;
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const totals = { sales: sum("sales"), collected: sum("collected"), credited: sum("credited"), remitted: sum("remitted") };
  return { account, months: rows, totals, owed: totals.collected - totals.credited - totals.remitted, invoices };
}

// A VAT return worksheet on the UK's nine-box layout, from the output account
// (2100, as for salesTax) and an input account for VAT paid on purchases
// (1300 unless `input` says otherwise; add it to the chart as an asset).
// Invoice basis: a document counts on its own date, not when it is paid.
// Box 1 VAT due on sales, 2 on EU acquisitions (always 0 here), 3 = 1 + 2,
// 4 reclaimed on purchases, 5 = net to pay (negative: repayable), 6 and 7 sales and
// purchases excluding VAT in whole pounds (pence dropped, as the form asks), 8 and
// 9 EU supplies (0 here). Bank lines filed straight to the output or input account
// count in boxes 1 and 4; a purchase paid without a bill is not in box 7, which is
// flagged. -> { boxes, paid, warnings, from, to }
export function vatReturn(books, { output = "2100", input = "1300", from = null, to = null } = {}) {
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  const sum = (d, acct) => d.lines.filter((l) => l.account === acct).reduce((a, l) => a + l.cents, 0);
  let due = 0, reclaim = 0, sales = 0, purchases = 0, paid = 0, bankPurchases = 0;
  for (const d of books.documents ?? []) {
    if (!inRange(d.date)) continue;
    const sign = d.credit ? -1 : 1;
    if (d.kind === "invoice") { const tax = sum(d, output); due += sign * tax; sales += sign * (d.total - tax); }
    else { const tax = sum(d, input); reclaim += sign * tax; purchases += sign * (d.total - tax); }
  }
  for (const e of journal(books)) {
    if (["invoice", "credit", "bill"].includes(e.source) || !inRange(e.date)) continue;
    for (const l of e.lines) {
      if (l.account === output) { if (l.debit) paid += l.debit; else due += l.credit; }
      else if (l.account === input) { reclaim += l.debit - l.credit; if (l.debit) bankPurchases++; }
    }
  }
  const warnings = [];
  if (!books.accounts.some((a) => a.code === input)) warnings.push(`No input VAT account ${input} in the chart, so box 4 is 0. Add it as an asset and put the VAT on each bill there.`);
  if (bankPurchases) warnings.push(`${bankPurchases} bank line(s) filed to ${input} count in box 4, but the net amount of those purchases is not in box 7.`);
  if (from === null && to === null) warnings.push("No period given: the boxes cover every date in the books. Pass a from and to date for one return.");
  const whole = (c) => Math.trunc(c / 100);
  const b5 = due - reclaim;
  return { from, to, input, output, paid, warnings, cents: { sales, purchases }, boxes: { 1: due, 2: 0, 3: due, 4: reclaim, 5: b5, 6: whole(sales), 7: whole(purchases), 8: 0, 9: 0 }, payable: b5 >= 0 ? "pay" : "reclaim" };
}

export function status(books) {
  const c = { new: 0, review: 0, auto: 0, confirmed: 0, split: 0, transfer: 0, settled: 0 };
  for (const t of books.transactions) c[t.status] = (c[t.status] ?? 0) + 1;
  return { lines: books.transactions.length, ...c, learnedFrom: books.history.length };
}

// The one call agents and the CLI use. Input:
//   { statements: [{ csv, account }], books?, confirm?: {id: code}, rules?,
//     accounts? (CSV text), documents? ([{ csv }] invoice and bill lists), asOf?,
//     from?, to?, autoPost?, example? }
// -> { status, review: [...], reports, aging, cashBasis (with documents), checks, books }
export function analyze(input = {}) {
  let books = input.books ? clone(input.books) : newBooks({ name: input.name });
  if (input.rules !== undefined) books.rules = input.rules;
  const openingProblems = [];
  if (input.opening) {
    const r = setOpeningBalances(books, input.opening.csv ?? input.opening, { date: input.opening.date ?? input.openingDate, decimalComma: !!input.decimalComma });
    books = r.books;
    openingProblems.push(...r.problems);
  }
  const opts = { autoPost: input.autoPost ?? DEFAULTS.autoPost, dayFirst: input.dayFirst ?? undefined, decimalComma: input.decimalComma ?? undefined };
  const statements = input.example ? [{ csv: SAMPLE_CHECKING, account: "1000" }, { csv: SAMPLE_CARD, account: "2000", invert: true }] : input.statements ?? (input.csv ? [{ csv: input.csv, account: input.account ?? "1000", invert: input.invert }] : []);
  const problems = [...openingProblems];
  for (const s of statements) {
    const r = importStatement(books, s.csv, s.account ?? "1000", { ...opts, invert: s.invert });
    books = r.books;
    problems.push(...r.problems);
  }
  for (const d of input.documents ? [].concat(input.documents) : []) {
    const r = addDocuments(books, d.csv ?? d, opts);
    books = r.books;
    problems.push(...r.problems);
  }
  books = categorize(books, opts);
  if (input.confirm) books = confirm(books, input.confirm);
  const map = accountMap(books.accounts);
  return {
    status: status(books),
    problems,
    review: books.transactions.filter((t) => t.status === "review").map((t) => ({ id: t.id, date: t.date, account: map.get(t.account)?.name, desc: t.desc, amount: dollars(t.cents), suggested: t.suggestion?.account ?? null, suggestedName: map.get(t.suggestion?.account)?.name ?? null, confidence: t.suggestion?.confidence ?? 0, reason: t.suggestion?.reason })),
    reports: reports(books, { from: input.from, to: input.to }),
    ruleSuggestions: suggestRules(books),
    aging: books.documents?.length ? aging(books, input.asOf) : null,
    cashBasis: books.documents?.length ? cashBasis(books, { from: input.from, to: input.to }) : null,
    salesTax: salesTax(books, { from: input.from, to: input.to }),
    checks: closeChecks(books, opts),
    books,
  };
}

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function dayNum(iso) { return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000; }
function prevDay(iso) { return new Date((dayNum(iso) - 1) * 86400000).toISOString().slice(0, 10); }
function median(xs) { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }
