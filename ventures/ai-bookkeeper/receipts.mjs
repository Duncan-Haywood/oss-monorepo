// Receipts matched to bank lines. Paste the text of receipts (typed, copied
// from an email, or read off a photo by any OCR tool) and each one is parsed
// into a merchant, a date, a total and a tax amount, then paired with the bank
// or card line that paid it. What is left over is the useful part:
//   unmatched receipts - paid some other way, or a line not imported yet
//   missing receipts   - spending at or over `minCents` with no receipt on file
//   duplicate receipts - the same merchant, date and total twice
// Integer cents. Receipts are kept in books.receipts and never change the
// journal. A heuristic: text is read with regular expressions, so the output
// says what it read and a person confirms. `attach` pins a pair by hand.
// Not a statement of what any tax authority requires you to keep.

import { parseCents, parseDate } from "./bank.mjs";
import { payeeTokens, suggest, historyRecord } from "./categorize.mjs";
import { accountMap } from "./ledger.mjs";
import { cleanOcr } from "./cleanocr.mjs";
import { modelFor, confirm } from "./engine.mjs";

const day = (d) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000);
const MONEY = /(?:[$£€]\s*)?(\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})(?!\d)/g;
const MONEY1 = new RegExp(MONEY.source);
// Decimal-comma receipts (12,50 / 1.234,56), common across continental Europe.
const MONEY_C = /(?:[$£€]\s*)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(?!\d)/g;
const DOTDATE = /\b\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2})\b/g;
// A receipt is decimal-comma when it has more amounts written 12,50 than 12.50
// (day.month.year dates are not amounts).
export function commaStyle(text) {
  const t = String(text).replace(DOTDATE, " ");
  return (t.match(MONEY_C) ?? []).length > (t.match(MONEY) ?? []).length;
}
const DATE_RES = [
  /\b(\d{4}-\d{1,2}-\d{1,2})\b/,
  /\b(\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2}))\b/,
  /\b(\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2}))\b/,
  /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2},? \d{4})\b/i,
  /\b(\d{1,2} (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,? \d{4})\b/i,
];
const TOTAL_RE = /\b(grand\s+total|total\s+(?:due|paid|charged|amount)|amount\s+(?:due|paid|charged)|balance\s+due|order\s+total|gesamt(?:betrag)?|summe|totale|totaal|total)\b/i;
const NOT_TOTAL_RE = /sub\s*-?total|zwischensumme|sous-total|total\s+(?:savings|discount|items|tax|points)|tax\s+total|before\s+tax|tip\b|change\b|cash\b/i;
const TAX_RE = /\b(sales\s+tax|tax|vat|gst|hst|pst|tva|mwst|iva|btw)\b/i;

// Currency printed on a receipt: an unambiguous symbol or a three-letter code
// beside an amount. A bare "$" says nothing (USD, CAD, AUD all use it), so it
// returns null and the receipt is read in the books' currency.
const SYMBOL_CUR = { "€": "EUR", "£": "GBP", "¥": "JPY", "₹": "INR", "₩": "KRW", "₪": "ILS", "R$": "BRL", "CHF": "CHF" };
const CODES = "EUR|GBP|USD|CAD|AUD|NZD|CHF|JPY|SEK|NOK|DKK|PLN|CZK|MXN|BRL|INR|SGD|HKD|ZAR";
export function detectCurrency(lines) {
  const counts = new Map();
  const bump = (c) => counts.set(c, (counts.get(c) ?? 0) + 1);
  for (const l of lines) {
    for (const m of l.matchAll(/(R\$|[€£¥₹₩₪])\s*\d/g)) bump(SYMBOL_CUR[m[1]]);
    for (const m of l.matchAll(new RegExp(`\\b(${CODES})\\b\\s*\\d|\\d[\\d.,]*\\s*\\b(${CODES})\\b`, "g"))) bump(m[1] ?? m[2]);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
// books.currency is a code ("USD") or a symbol ("$"); compare as codes
const bookCode = (books) => { const c = String(books.currency ?? "USD").trim(); return SYMBOL_CUR[c] ?? (c === "$" ? "USD" : c.toUpperCase()); };

const amountsIn = (line, comma = false) => [...line.matchAll(comma ? MONEY_C : MONEY)].map((m) => parseCents(m[1], comma)).filter((c) => Number.isInteger(c));

// Receipts are separated by a line of three or more dashes, equals signs or
// underscores, or by a form feed. One receipt with no separator is fine.
export function splitReceipts(text) {
  return String(text ?? "").split(/^\s*(?:[-=_]{3,}|\f)\s*$/m).map((b) => b.trim()).filter(Boolean);
}

// Lines that carry an amount but are not things bought.
const NOT_ITEM_RE = /sub\s*-?total|zwischensumme|\bgesamt|\bsumme\b|\btotale?\b|\btotaal\b|\btotal\b|\btax\b|\bvat\b|\bgst\b|\bhst\b|\bpst\b|\btva\b|\bmwst\b|\biva\b|\bbtw\b|\btip\b|gratuity|change|cash|tender|visa|mastercard|mc\s|amex|debit|credit|card|payment|paid|balance|amount|discount|coupon|savings|points|rounding|\bauth\b|\bref\b|\bacct\b|\bthank/i;
const TIP_RE = /\b(tip|gratuity)\b/i;

// Item lines: words, then a price (the last amount on the line; "2 x 3.00  6.00"
// is 6.00). Discount lines are not read, so a receipt with one fails the
// check below and says so rather than splitting on a guess.
export function parseItems(lines, comma = false) {
  const items = [];
  for (const l of lines) {
    if (NOT_ITEM_RE.test(l) || DATE_RES.some((re) => re.test(l))) continue;
    const a = amountsIn(l, comma);
    if (!a.length) continue;
    const desc = l.replace(comma ? MONEY_C : MONEY, " ").replace(/^\s*\d+\s*(?:x\s*)?(?=[a-z])/i, "").replace(/[\s$£€@x*]+$/gi, "").replace(/\s{2,}/g, " ").trim();
    if (!/[a-z]{2}/i.test(desc)) continue;
    items.push({ desc: desc.slice(0, 60), cents: a[a.length - 1] });
  }
  return items;
}

export function parseReceipt(block) {
  const lines = cleanOcr(String(block)).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const notes = [];
  const comma = commaStyle(lines.join("\n"));
  let date = null;
  for (const l of lines) {
    // dotted dates and dates beside decimal commas are day-first
    for (const re of DATE_RES) { const m = l.match(re); if (m && (date = parseDate(m[1], comma || m[1].includes(".")))) break; }
    if (date) break;
  }
  if (!date) notes.push("no date found");

  // merchant: the first line that is words, not an address, phone, date or amount
  const merchantLine = lines.find((l) => /[a-z]{3}/i.test(l) && !/^(receipt|invoice|order|thank|tax invoice)/i.test(l)
    && !/\d{3}[-. ]\d{3,4}/.test(l) && !DATE_RES.some((re) => re.test(l)) && !(comma ? new RegExp(MONEY_C.source) : MONEY1).test(l) && !/^\d+\s+\w+\s+(st|street|ave|avenue|rd|road|blvd|dr|drive|ln|way)\b/i.test(l));
  const merchant = merchantLine ? merchantLine.replace(/\s{2,}.*$/, "").slice(0, 60) : null;
  if (!merchant) notes.push("no merchant found");

  // total: the last total-looking line with an amount; else the largest amount on the page
  let cents = null, from = null;
  for (const l of lines) {
    if (TOTAL_RE.test(l) && !NOT_TOTAL_RE.test(l)) { const a = amountsIn(l, comma); if (a.length) { cents = a[a.length - 1]; from = l; } }
  }
  if (cents === null) {
    const all = lines.flatMap((l) => amountsIn(l, comma));
    if (all.length) { cents = Math.max(...all); notes.push("no total line; took the largest amount"); }
  }
  if (cents === null) notes.push("no amount found");

  let taxCents = null;
  for (const l of lines) if (TAX_RE.test(l) && !TOTAL_RE.test(l) && !/subtotal/i.test(l)) { const a = amountsIn(l, comma); if (a.length) taxCents = a[a.length - 1]; }
  if (taxCents !== null && cents !== null && taxCents >= cents) taxCents = null;
  // line items, kept only if they add up to the printed total (with the tax and
  // any tip, or already including tax); the merchant line is not an item
  let tipCents = null;
  for (const l of lines) if (TIP_RE.test(l) && !TOTAL_RE.test(l)) { const a = amountsIn(l, comma); if (a.length) tipCents = a[a.length - 1]; }
  const items = parseItems(lines, comma);
  let itemsOk = false;
  if (items.length && cents !== null) {
    const sum = items.reduce((a, i) => a + i.cents, 0);
    if (sum + (taxCents ?? 0) + (tipCents ?? 0) === cents) itemsOk = true;
    else if (sum + (tipCents ?? 0) === cents && taxCents !== null) itemsOk = "tax included";
    else notes.push(`items add to ${(sum / 100).toFixed(2)} but the total is ${(cents / 100).toFixed(2)}${taxCents !== null ? " with tax" : ""}: not used for a split`);
  }
  const currency = detectCurrency(lines);
  return { date, merchant, currency, cents, taxCents, tipCents, items: itemsOk ? items : [], itemsOk: !!itemsOk, taxIncluded: itemsOk === "tax included", ok: !!(date && merchant && cents), notes, totalLine: from, text: lines.join("\n").slice(0, 400) };
}

const sameReceipt = (a, b) => a.date === b.date && a.cents === b.cents && (a.merchant ?? "").toLowerCase() === (b.merchant ?? "").toLowerCase();

// Parse and keep every readable receipt; returns the new books, the ones kept
// and the blocks that could not be read (each with why).
export function addReceipts(books, text) {
  const kept = [...(books.receipts ?? [])];
  let n = kept.reduce((m, r) => Math.max(m, +String(r.id).slice(1) || 0), 0);
  const added = [], skipped = [], duplicates = [];
  for (const block of splitReceipts(text)) {
    const p = parseReceipt(block);
    if (!p.ok) { skipped.push({ text: p.text.split("\n")[0], notes: p.notes }); continue; }
    const dup = kept.find((r) => sameReceipt(r, p));
    if (dup) { duplicates.push({ id: dup.id, merchant: p.merchant, date: p.date, cents: p.cents }); continue; }
    const foreign = p.currency && p.currency !== bookCode(books) ? p.currency : null;
    const r = { id: `r${++n}`, date: p.date, merchant: p.merchant, ...(foreign ? { currency: foreign } : {}), cents: p.cents, taxCents: p.taxCents, ...(p.items.length ? { items: p.items, printedTipCents: p.tipCents ?? undefined, taxIncluded: p.taxIncluded || undefined } : {}), matched: null, note: p.notes.join("; ") || undefined, text: p.text };
    kept.push(r); added.push(r);
  }
  return { books: matchReceipts({ ...books, receipts: kept }), added, skipped, duplicates };
}

const overlap = (a, b) => {
  const A = new Set(payeeTokens(a)), B = payeeTokens(b);
  if (!A.size || !B.length) return 0;
  // either side may be a prefix of the other ("amzn" / "amazon" is not caught; "blue" / "bluebottle" is)
  const hit = B.filter((t) => A.has(t) || [...A].some((x) => x.length >= 4 && t.length >= 4 && (x.startsWith(t) || t.startsWith(x)))).length;
  return hit / Math.min(A.size, B.length);
};

// Pair each unmatched receipt with at most one outflow on a bank account. The
// amount must equal the receipt total, or exceed it by up to `tipPct` (a tip
// added at the table); the bank date must fall `before` days before to `after`
// days after the receipt date. Best pairs go first: payee words in common, then
// an exact amount, then the closer date. Pairs fixed by hand are kept.
//
// A receipt in another currency (r.currency) cannot be compared by amount alone.
// The rate is, in order: `rates[CUR]` (books-currency units per one foreign
// unit, passed in or kept in books.fxRates), else the median rate of receipts
// in that currency already matched. With a rate the bank amount must be within
// `fxTolerance` of it (default 6%: card fees and the spread on top of the
// day's rate); with no rate at all the payee words must agree and the amount
// only has to be a plausible multiple (0.2x to 5x). The rate each pair implies
// is kept as r.fxRate, and later foreign receipts are matched against it.
export function matchReceipts(books, { before = 3, after = 7, tipPct = 0.25, rates = {}, fxTolerance = 0.06 } = {}) {
  const receipts = (books.receipts ?? []).map((r) => ({ ...r }));
  const known = { ...(books.fxRates ?? {}), ...rates };
  const learned = (cur) => {
    const xs = receipts.filter((r) => r.currency === cur && r.matched && r.fxRate).map((r) => r.fxRate).sort((a, b) => a - b);
    return xs.length ? xs[Math.floor(xs.length / 2)] : null;
  };
  const bank = new Set(books.accounts.filter((a) => a.bank).map((a) => a.code));
  const taken = new Set(receipts.filter((r) => r.matched).map((r) => r.matched));
  const pool = books.transactions.filter((t) => bank.has(t.account) && t.cents < 0 && t.status !== "transfer" && !taken.has(t.id));
  const pairs = [];
  for (const r of receipts) {
    if (r.matched) continue;
    for (const t of pool) {
      const gap = day(t.date) - day(r.date);
      if (gap < -before || gap > after) continue;
      const paid = -t.cents;
      const words = overlap(r.merchant, t.desc);
      if (r.currency) {
        const rate = known[r.currency] ?? learned(r.currency);
        const implied = paid / r.cents;
        if (rate ? Math.abs(implied / rate - 1) > fxTolerance : words < 0.5 || implied < 0.2 || implied > 5) continue;
        if (words < 0.5 && gap > 2) continue;
        pairs.push({ r, t, words, exact: 1, gap: Math.abs(gap), extra: 0, fxRate: implied, rated: Boolean(rate) });
        continue;
      }
      const extra = paid - r.cents;
      if (extra < 0 || extra > Math.round(r.cents * tipPct)) continue;
      // an amount that is not exact needs the payee to agree, or it is a coincidence
      if (extra > 0 && words < 0.5) continue;
      // an exact amount with other words on the line is a guess: only a close date makes it worth showing
      if (words < 0.5 && gap > 2) continue;
      pairs.push({ r, t, words, exact: extra === 0 ? 1 : 0, gap: Math.abs(gap), extra });
    }
  }
  pairs.sort((a, b) => b.words - a.words || b.exact - a.exact || a.gap - b.gap || String(a.t.id).localeCompare(String(b.t.id)));
  const usedT = new Set(), usedR = new Set();
  for (const p of pairs) {
    if (usedT.has(p.t.id) || usedR.has(p.r.id)) continue;
    usedT.add(p.t.id); usedR.add(p.r.id);
    p.r.matched = p.t.id;
    p.r.tipCents = p.extra || undefined;
    if (p.r.currency) { p.r.fxRate = Math.round(p.fxRate * 1e6) / 1e6; p.r.rateSource = p.rated ? "given or learned" : "implied by this pair only"; }
    p.r.payeeAgrees = p.words >= 0.5;
  }
  return { ...books, receipts };
}

export function attachReceipt(books, receiptId, txnId) {
  const receipts = (books.receipts ?? []).map((r) => ({ ...r }));
  const r = receipts.find((x) => x.id === receiptId);
  if (!r) throw new Error(`no receipt ${receiptId}`);
  if (txnId === null || txnId === "") { r.matched = null; return { ...books, receipts }; }
  const t = books.transactions.find((x) => x.id === txnId);
  if (!t) throw new Error(`no line ${txnId}`);
  const other = receipts.find((x) => x.matched === txnId && x.id !== receiptId);
  if (other) other.matched = null;
  r.matched = txnId; delete r.tipCents;
  if (r.currency) r.fxRate = Math.round((-t.cents / r.cents) * 1e6) / 1e6;
  return { ...books, receipts };
}

export function removeReceipt(books, receiptId) {
  if (!(books.receipts ?? []).some((r) => r.id === receiptId)) throw new Error(`no receipt ${receiptId}`);
  return { ...books, receipts: books.receipts.filter((r) => r.id !== receiptId) };
}

// The review: what matched, what did not, and which spending has no receipt.
export function receiptReport(books, { minCents = 7500, from = null, to = null } = {}) {
  const receipts = books.receipts ?? [];
  const byTxn = new Map(books.transactions.map((t) => [t.id, t]));
  const bank = new Set(books.accounts.filter((a) => a.bank).map((a) => a.code));
  const have = new Set(receipts.map((r) => r.matched).filter(Boolean));
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  const matched = receipts.filter((r) => r.matched && byTxn.has(r.matched)).map((r) => ({ ...r, line: byTxn.get(r.matched) }));
  const unmatched = receipts.filter((r) => !r.matched || !byTxn.has(r.matched));
  // wages, owner draws, tax remittances and loan payments are not purchases a receipt would cover
  const map = accountMap(books.accounts);
  const needs = (t) => { const a = t.posted ? map.get(t.posted) : null; return !a || ((a.type === "expense" || (a.type === "asset" && !a.bank)) && a.code !== "6150"); };
  const missing = books.transactions
    .filter((t) => bank.has(t.account) && t.cents <= -minCents && t.status !== "transfer" && needs(t) && !have.has(t.id) && inRange(t.date))
    .sort((a, b) => a.cents - b.cents || a.date.localeCompare(b.date));
  const spend = books.transactions.filter((t) => bank.has(t.account) && t.cents < 0 && t.status !== "transfer" && inRange(t.date));
  const covered = spend.filter((t) => have.has(t.id));
  const weak = matched.filter((m) => m.tipCents || m.payeeAgrees === false);
  return {
    receipts: receipts.length, matched, unmatched, missing, weak,
    minCents,
    coveredCents: covered.reduce((s, t) => s - t.cents, 0),
    spendCents: spend.reduce((s, t) => s - t.cents, 0),
    missingCents: missing.reduce((s, t) => s - t.cents, 0),
  };
}

// Tax printed on receipts, by month and by the account the paid line was filed
// to. Only receipts with a tax line count; `noTax` lists the rest so a gap is
// visible rather than read as zero. `rate` is tax over the pre-tax amount, so a
// rate far from the others at one merchant is a misread worth a look. Tip is
// left out of the base. Not a return: a prompt for who to ask.
export function taxOnReceipts(books, { from = null, to = null } = {}) {
  const byTxn = new Map(books.transactions.map((t) => [t.id, t]));
  const names = accountMap(books.accounts);
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  const months = new Map(), accounts = new Map(), rows = [], noTax = [];
  for (let r of books.receipts ?? []) {
    if (!inRange(r.date)) continue;
    if (!r.taxCents) { noTax.push({ id: r.id, date: r.date, merchant: r.merchant, cents: r.cents }); continue; }
    if (r.currency && !(r.matched && r.fxRate)) { noTax.push({ id: r.id, date: r.date, merchant: r.merchant, cents: r.cents, note: `${r.currency}, not matched to a bank line, so no rate to convert` }); continue; }
    // a foreign receipt is counted in the books' currency at the rate its bank line implies
    if (r.currency) r = { ...r, cents: Math.round(r.cents * r.fxRate), taxCents: Math.round(r.taxCents * r.fxRate) };
    const base = r.cents - r.taxCents;
    const line = r.matched ? byTxn.get(r.matched) : null;
    const code = line?.posted ?? null;
    rows.push({ id: r.id, date: r.date, merchant: r.merchant, cents: r.cents, taxCents: r.taxCents, rate: base > 0 ? r.taxCents / base : null, account: code });
    const m = r.date.slice(0, 7), a = code ?? "unfiled";
    const add = (map, k) => { const x = map.get(k) ?? { taxCents: 0, baseCents: 0, receipts: 0 }; x.taxCents += r.taxCents; x.baseCents += base; x.receipts++; map.set(k, x); };
    add(months, m); add(accounts, a);
  }
  const out = (map, label) => [...map].sort(([x], [y]) => x.localeCompare(y)).map(([k, v]) => ({ ...label(k), ...v }));
  const taxCents = rows.reduce((s, r) => s + r.taxCents, 0);
  return {
    receipts: rows.length, taxCents,
    byMonth: out(months, (month) => ({ month })),
    byAccount: out(accounts, (code) => ({ code, name: names.get(code)?.name ?? (code === "unfiled" ? "Not matched, or line not filed yet" : code) })),
    rows, noTax,
  };
}

// Split a matched bank line by the receipt's items. Each item goes to the
// account the categorizer picks for its own words (your rules and what you
// filed before win, then the built-in keywords); an item it knows nothing about
// goes to `other`, else to the account the merchant's name suggests. Tax is
// shared out over the accounts in proportion to their items (largest remainder,
// so the cents add up), and a tip printed on the receipt joins the biggest one.
// Any tip added at the table, bank amount over the receipt, goes there too.
// -> { receipt, line, parts: [{account, cents, items}], unfiled, single }.
// `single` is the one account when every item lands in the same place: that is a
// plain filing, not a split. Nothing here changes the books; splitFromReceipt does.
export function planReceiptSplit(books, receiptId, { other = null, fix = {} } = {}) {
  let r = (books.receipts ?? []).find((x) => x.id === receiptId);
  if (!r) throw new Error(`no receipt ${receiptId}`);
  if (!r.items?.length) throw new Error(`receipt ${receiptId} has no line items that add up to its total`);
  const line = r.matched ? books.transactions.find((t) => t.id === r.matched) : null;
  if (!line) throw new Error(`receipt ${receiptId} is not matched to a bank line yet (receipts attach ${receiptId} LINEID)`);
  // a foreign receipt is split in the books' currency: items and tax scaled by
  // the rate the bank line implies; any cent of rounding lands on the biggest part
  if (r.currency && r.fxRate) {
    const k = r.fxRate, c = (x) => Math.round(x * k);
    r = { ...r, items: r.items.map((i) => ({ ...i, cents: c(i.cents) })), taxCents: r.taxCents ? c(r.taxCents) : r.taxCents, cents: c(r.cents) };
  }
  const model = modelFor(books);
  const merchant = suggest({ desc: line.desc, cents: line.cents }, model);
  const fallback = other ?? merchant.account;
  const groups = new Map();
  const unfiled = [];
  for (const it of r.items) {
    const s = suggest({ desc: it.desc, cents: -it.cents }, model);
    const fixed = Object.entries(fix).find(([w]) => it.desc.toLowerCase().includes(w.toLowerCase()));
    let account = fixed ? fixed[1] : s.account && s.account !== "transfer" ? s.account : fallback;
    const taught = Boolean(fixed || (other && account === other && !(s.account && s.account !== "transfer")));
    if (!account || account === "transfer") { unfiled.push(it); continue; }
    if (!groups.has(account)) groups.set(account, { account, cents: 0, items: [] });
    const g = groups.get(account);
    g.cents += it.cents; g.items.push(taught ? { ...it, taught } : it);
  }
  const parts = [...groups.values()].sort((a, b) => b.cents - a.cents);
  const itemSum = r.items.reduce((a, i) => a + i.cents, 0);
  if (parts.length && !unfiled.length) {
    // tax in proportion to the items, largest remainder
    const tax = r.taxIncluded ? 0 : r.taxCents ?? 0;
    if (tax) {
      const raw = parts.map((p) => (tax * p.cents) / itemSum);
      const base = raw.map(Math.floor);
      let left = tax - base.reduce((a, b) => a + b, 0);
      raw.map((x, i) => [x - base[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (left-- > 0) base[i]++; });
      parts.forEach((p, i) => { p.taxCents = base[i]; p.cents += base[i]; });
    }
    // the rest (printed tip, tip at the table) onto the biggest account
    const rest = -line.cents - parts.reduce((a, p) => a + p.cents, 0);
    if (rest) { parts[0].extraCents = rest; parts[0].cents += rest; }
  }
  const sign = line.cents < 0 ? -1 : 1;
  return { receipt: r, line, parts: parts.map((p) => ({ ...p, cents: sign * p.cents })), unfiled, single: parts.length === 1 && !unfiled.length ? parts[0].account : null };
}

// Post the split. Needs every item to have an account, so pass `other` when the
// plan lists unfiled items. One account for everything is filed plainly.
export function splitFromReceipt(books, receiptId, opts = {}) {
  const plan = planReceiptSplit(books, receiptId, opts);
  if (plan.unfiled.length) throw new Error(`${plan.unfiled.length} item${plan.unfiled.length === 1 ? "" : "s"} (${plan.unfiled.map((i) => i.desc).join(", ")}) match no account; name one with --other CODE`);
  const choice = plan.single ?? plan.parts.map((p) => ({ account: p.account, cents: p.cents }));
  const out = confirm(books, { [plan.line.id]: choice });
  // Item-level learning: an item you placed (--fix WORD=CODE, or the --other
  // catch-all) is remembered under its own words, so the next receipt with it
  // lands there without being told. Items the categorizer already placed are not
  // re-taught. Skipped when `learn` is false.
  const taught = [];
  if (opts.learn !== false) {
    for (const p of plan.parts) for (const it of p.items) {
      if (!it.taught) continue;
      out.history.push(historyRecord({ desc: it.desc, cents: -it.cents }, p.account));
      taught.push({ desc: it.desc, account: p.account });
    }
  }
  return { books: out, plan, taught };
}
