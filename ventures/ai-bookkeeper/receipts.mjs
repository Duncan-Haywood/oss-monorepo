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
// `receiptSplit` reads the item lines and proposes how to split the matched
// bank line across accounts (a hardware run that was half supplies, half
// meals); `applySplit` posts it as an ordinary split.
// Not a statement of what any tax authority requires you to keep.

import { parseCents, parseDate } from "./bank.mjs";
import { payeeTokens } from "./categorize.mjs";
import { accountMap, fmt } from "./ledger.mjs";
import { BUILT_IN } from "./categorize.mjs";
import { confirm } from "./engine.mjs";

const day = (d) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000);
const MONEY = /(?:[$£€]\s*)?(\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})(?!\d)/g;
const MONEY1 = new RegExp(MONEY.source);
const DATE_RES = [
  /\b(\d{4}-\d{1,2}-\d{1,2})\b/,
  /\b(\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2}))\b/,
  /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2},? \d{4})\b/i,
  /\b(\d{1,2} (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,? \d{4})\b/i,
];
const TOTAL_RE = /\b(grand\s+total|total\s+(?:due|paid|charged|amount)|amount\s+(?:due|paid|charged)|balance\s+due|order\s+total|total)\b/i;
const NOT_TOTAL_RE = /sub\s*-?total|total\s+(?:savings|discount|items|tax|points)|tax\s+total|before\s+tax|tip\b|change\b|cash\b/i;
const TAX_RE = /\b(sales\s+tax|tax|vat|gst|hst|pst)\b/i;

const amountsIn = (line) => [...line.matchAll(MONEY)].map((m) => parseCents(m[1])).filter((c) => Number.isInteger(c));

// Receipts are separated by a line of three or more dashes, equals signs or
// underscores, or by a form feed. One receipt with no separator is fine.
export function splitReceipts(text) {
  return String(text ?? "").split(/^\s*(?:[-=_]{3,}|\f)\s*$/m).map((b) => b.trim()).filter(Boolean);
}

// Item lines: words, then an amount at the end of the line. Totals, tax, tip,
// payment and discount lines are not items. "2 x Latte 11.00" keeps the whole
// line amount; the quantity stays in the description.
const NOT_ITEM_RE = /sub\s*-?total|\btotal\b|\btax\b|\bvat\b|\bgst\b|\bhst\b|\bpst\b|\btip\b|gratuity|change\b|cash\b|visa|master ?card|amex|debit|credit|balance|amount\s+(?:due|paid)|discount|coupon|savings|\bsaved\b|points|rounding|auth|approv|card\b/i;
export function parseItems(lines, skip = null) {
  const items = [];
  for (const l of lines) {
    if (l === skip || NOT_ITEM_RE.test(l) || DATE_RES.some((re) => re.test(l))) continue;
    const m = l.match(/^(.*?[a-z]{2}.*?)\s+(?:[$£€]\s*)?(\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})\s*[A-Za-z]?$/i);
    if (!m) continue;
    const cents = parseCents(m[2]);
    if (Number.isInteger(cents) && cents > 0) items.push({ desc: m[1].trim().slice(0, 60), cents });
  }
  return items;
}

export function parseReceipt(block) {
  const lines = String(block).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const notes = [];
  let date = null;
  for (const l of lines) {
    for (const re of DATE_RES) { const m = l.match(re); if (m && (date = parseDate(m[1]))) break; }
    if (date) break;
  }
  if (!date) notes.push("no date found");

  // merchant: the first line that is words, not an address, phone, date or amount
  const merchantLine = lines.find((l) => /[a-z]{3}/i.test(l) && !/^(receipt|invoice|order|thank|tax invoice)/i.test(l)
    && !/\d{3}[-. ]\d{3,4}/.test(l) && !DATE_RES.some((re) => re.test(l)) && !MONEY1.test(l) && !/^\d+\s+\w+\s+(st|street|ave|avenue|rd|road|blvd|dr|drive|ln|way)\b/i.test(l));
  const merchant = merchantLine ? merchantLine.replace(/\s{2,}.*$/, "").slice(0, 60) : null;
  if (!merchant) notes.push("no merchant found");

  // total: the last total-looking line with an amount; else the largest amount on the page
  let cents = null, from = null;
  for (const l of lines) {
    if (TOTAL_RE.test(l) && !NOT_TOTAL_RE.test(l)) { const a = amountsIn(l); if (a.length) { cents = a[a.length - 1]; from = l; } }
  }
  if (cents === null) {
    const all = lines.flatMap(amountsIn);
    if (all.length) { cents = Math.max(...all); notes.push("no total line; took the largest amount"); }
  }
  if (cents === null) notes.push("no amount found");

  let taxCents = null;
  for (const l of lines) if (TAX_RE.test(l) && !TOTAL_RE.test(l) && !/subtotal/i.test(l)) { const a = amountsIn(l); if (a.length) taxCents = a[a.length - 1]; }
  if (taxCents !== null && cents !== null && taxCents >= cents) taxCents = null;
  const items = parseItems(lines, merchantLine);
  return { date, merchant, cents, taxCents, items, ok: !!(date && merchant && cents), notes, totalLine: from, text: lines.join("\n").slice(0, 400) };
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
    const r = { id: `r${++n}`, date: p.date, merchant: p.merchant, cents: p.cents, taxCents: p.taxCents, items: p.items.length ? p.items : undefined, matched: null, note: p.notes.join("; ") || undefined, text: p.text };
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
export function matchReceipts(books, { before = 3, after = 7, tipPct = 0.25 } = {}) {
  const receipts = (books.receipts ?? []).map((r) => ({ ...r }));
  const bank = new Set(books.accounts.filter((a) => a.bank).map((a) => a.code));
  const taken = new Set(receipts.filter((r) => r.matched).map((r) => r.matched));
  const pool = books.transactions.filter((t) => bank.has(t.account) && t.cents < 0 && t.status !== "transfer" && !taken.has(t.id));
  const pairs = [];
  for (const r of receipts) {
    if (r.matched) continue;
    for (const t of pool) {
      const gap = day(t.date) - day(r.date);
      if (gap < -before || gap > after) continue;
      const paid = -t.cents, extra = paid - r.cents;
      if (extra < 0 || extra > Math.round(r.cents * tipPct)) continue;
      const words = overlap(r.merchant, t.desc);
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

// What an item is, by its own words. Narrower than the payee rules: a hardware
// store sells supplies and also coffee, so the item decides, the store only
// fills in what the items do not say.
const ITEM_RULES = [
  ["6130", /coffee|latte|espresso|tea\b|sandwich|burger|pizza|salad|lunch|dinner|breakfast|meal|snack|pastry|croissant|bagel|soda|juice|beer|wine|cocktail|entree|combo/i],
  ["6070", /paper|toner|ink\b|cartridge|\bpens?\b|pencil|stapl|envelope|folder|binder|notebook|label|post-?it|sticky|postage|stamp/i],
  ["6180", /shipping|freight|delivery|courier|parcel/i],
  ["6160", /unleaded|diesel|premium fuel|\bgas\b|fuel|car wash|toll|parking/i],
  ["6060", /subscription|licen[cs]e|software|saas|\bplan\b|hosting|domain|renewal/i],
  ["6120", /flight|airfare|hotel|lodging|room charge|taxi|rideshare|baggage/i],
  ["6090", /repair|service call|labor|maintenance|replacement part/i],
  ["6100", /lumber|screw|nail|bolt|fastener|paint|primer|tape|adhesive|glue|caulk|drywall|plywood|pipe|fitting|wire\b|bulb|filter|hose|gloves|tarp|sandpaper|supplies/i],
];
const itemAccount = (desc) => (ITEM_RULES.find(([, re]) => re.test(desc)) ?? [null])[0];

// Largest-remainder shares of `total` cents over `weights`, summing exactly.
function shares(total, weights) {
  const w = weights.reduce((a, b) => a + b, 0);
  if (!w) return weights.map(() => 0);
  const raw = weights.map((x) => (total * x) / w), out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (left-- > 0) out[i]++; });
  return out;
}

// Propose a split of a receipt's bank line. Each item goes to the account its
// words suggest, else to the "base" account: the one the line is already posted
// to, or the payee rules' guess. Tax is shared out in proportion to the items,
// and whatever the items and tax do not explain (a tip, an unlisted item,
// rounding) stays with the base account. Returns null when it cannot say why a
// split would help; `notes` says what it checked.
export function receiptSplit(books, receiptId, { base = null } = {}) {
  const r = (books.receipts ?? []).find((x) => x.id === receiptId);
  if (!r) throw new Error(`no receipt ${receiptId}`);
  const t = r.matched && books.transactions.find((x) => x.id === r.matched);
  if (!t) return { receipt: r.id, parts: null, notes: ["the receipt is not matched to a bank line"] };
  const items = r.items ?? [];
  if (!items.length) return { receipt: r.id, line: t.id, parts: null, notes: ["no item lines were read from this receipt"] };
  const codes = new Set(books.accounts.map((a) => a.code));
  const text = `${r.merchant} ${t.desc}`.toLowerCase();
  const guess = BUILT_IN.find(([a, d, re]) => a !== "transfer" && d !== "in" && codes.has(a) && re.test(text));
  const baseAccount = base ?? (t.status === "confirmed" || t.status === "auto" ? t.posted : null) ?? t.suggestion?.account ?? guess?.[0] ?? null;
  const notes = [];
  const paid = -t.cents;
  const itemSum = items.reduce((a, i) => a + i.cents, 0);
  const tax = r.taxCents ?? 0;
  if (itemSum + tax > paid) return { receipt: r.id, line: t.id, parts: null, notes: [`the items and tax (${fmt(itemSum + tax)}) add to more than the ${fmt(paid)} paid; a discount line is probably missing`] };
  const rows = items.map((i) => ({ ...i, account: itemAccount(i.desc) ?? baseAccount }));
  if (rows.some((i) => !i.account)) {
    for (const i of rows.filter((x) => !x.account)) notes.push(`"${i.desc}" has no account: pass one as the base`);
    return { receipt: r.id, line: t.id, parts: null, items: rows, notes };
  }
  const accounts = [...new Set(rows.map((i) => i.account))];
  const sums = accounts.map((a) => rows.filter((i) => i.account === a).reduce((s, i) => s + i.cents, 0));
  const taxShare = shares(tax, sums);
  const cents = sums.map((s, k) => s + taxShare[k]);
  const rest = paid - cents.reduce((a, b) => a + b, 0);
  if (rest > 0) {
    const home = accounts.indexOf(baseAccount);
    const k = home >= 0 ? home : cents.indexOf(Math.max(...cents));
    cents[k] += rest;
    notes.push(`${fmt(rest)} not explained by the items and tax (tip, unlisted item or rounding) stays with ${accounts[k]}`);
  }
  if (r.taxCents == null) notes.push("no tax line read; tax is inside the item amounts or in the leftover");
  if (accounts.length < 2) return { receipt: r.id, line: t.id, parts: null, items: rows, notes: [...notes, `every item belongs to ${accounts[0]}: nothing to split`] };
  const parts = accounts.map((account, k) => ({ account, cents: -cents[k] }));
  return { receipt: r.id, line: t.id, parts, items: rows, notes };
}

// Post the proposal (or `parts` the person edited) as a split on the bank line.
export function applySplit(books, receiptId, parts = null) {
  const p = parts ? { parts, line: (books.receipts ?? []).find((x) => x.id === receiptId)?.matched } : receiptSplit(books, receiptId);
  if (!p.parts) throw new Error(p.notes?.join("; ") || `no split for ${receiptId}`);
  return confirm(books, { [p.line]: p.parts });
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
  for (const r of books.receipts ?? []) {
    if (!inRange(r.date)) continue;
    if (!r.taxCents) { noTax.push({ id: r.id, date: r.date, merchant: r.merchant, cents: r.cents }); continue; }
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
