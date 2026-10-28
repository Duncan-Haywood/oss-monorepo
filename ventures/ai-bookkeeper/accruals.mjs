// Accruals: unpaid invoices and bills. A cash-basis ledger books a sale when the
// deposit lands; an accrual ledger books it when you send the invoice, parks it
// in accounts receivable (bills: accounts payable), and clears it when the bank
// line arrives. This module reads a document list, journals it, matches bank
// lines to the documents they settle, and ages what is still open.
//
// Documents live in books.documents:
//   { id: "INV-1042", kind: "invoice"|"bill", number, date, due, party,
//     lines: [{ account, cents }], total, settledBy?: bank line id }
// Pure functions, no DOM, no network.

import { parseCsv, parseCents, parseDate } from "./bank.mjs";
import { payeeTokens } from "./categorize.mjs";
import { convertCents, rateOn, FX_ACCOUNT, docRevals } from "./fx.mjs";

export const AR = "1100", AP = "2050";
const MATCH_DAYS = 180; // a payment this long after the document date still matches
// -> { kind: "invoice"|"bill", credit } or null. A credit note (sales) or vendor
// credit / debit note (purchases) is a document of its own kind with credit: true.
const KIND = (v) => {
  if (/^(vendor credit|bill credit|supplier credit|purchase credit|debit note|dn\b)/i.test(v)) return { kind: "bill", credit: true };
  if (/^(credit|cn\b|cr note|sales credit|refund)/i.test(v)) return { kind: "invoice", credit: true };
  if (/^(inv|sale|sales|ar|receiv|customer)/i.test(v)) return { kind: "invoice", credit: false };
  if (/^(bill|exp|purchase|ap|payable|vendor|supplier)/i.test(v)) return { kind: "bill", credit: false };
  return null;
};
const docId = (kind, credit, number) => `${credit ? (kind === "invoice" ? "CN" : "VC") : kind === "invoice" ? "INV" : "BILL"}-${number}`;

// CSV with a header row: type, number, date, due (optional), party, amount,
// account, and for a credit note an optional "against" column naming the
// invoice or bill it reduces. Several rows with the same type and number are one document with a
// line per row (a sales-tax line goes to 2100). Amounts are positive.
// -> { documents, problems }
export function parseDocuments(text, { dayFirst = false, decimalComma = false } = {}) {
  const rows = parseCsv(text);
  const problems = [];
  if (rows.length < 2) return { documents: [], problems: ["No document rows found. Expected a header: type,number,date,due,party,amount,account."] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const c = { type: col("type", "kind"), number: col("number", "no", "invoice", "bill", "ref", "id"), date: col("date", "issued", "invoice date", "bill date"), due: col("due", "due date"), party: col("party", "customer", "vendor", "name", "supplier"), amount: col("amount", "total", "line amount"), account: col("account", "account code", "code"), against: col("against", "applies to", "original", "credit for"), desc: col("description", "memo", "item", "details"), cur: col("currency", "cur", "ccy"), rate: col("rate", "fx rate", "exchange rate") };
  for (const k of ["type", "number", "date", "party", "amount", "account"]) if (c[k] === -1) problems.push(`Missing column "${k}".`);
  if (problems.length) return { documents: [], problems };
  const byId = new Map();
  rows.slice(1).forEach((r, i) => {
    const where = `Row ${i + 2}`;
    const k = KIND((r[c.type] ?? "").trim());
    const kind = k?.kind, credit = k?.credit ?? false;
    const number = (r[c.number] ?? "").trim();
    const date = parseDate(r[c.date], dayFirst);
    const due = c.due >= 0 && (r[c.due] ?? "").trim() ? parseDate(r[c.due], dayFirst) : null;
    const cents = parseCents(r[c.amount], decimalComma);
    const account = (r[c.account] ?? "").trim();
    if (!kind) return problems.push(`${where}: type must be invoice, bill, credit note or vendor credit.`);
    if (!number) return problems.push(`${where}: no number.`);
    if (!date) return problems.push(`${where}: unreadable date "${r[c.date]}".`);
    if (c.due >= 0 && (r[c.due] ?? "").trim() && !due) return problems.push(`${where}: unreadable due date "${r[c.due]}".`);
    if (!Number.isFinite(cents) || cents <= 0) return problems.push(`${where}: amount must be a positive number.`);
    if (!account) return problems.push(`${where}: no account.`);
    const id = docId(kind, credit, number);
    const against = c.against >= 0 ? (r[c.against] ?? "").trim() : "";
    const d = byId.get(id) ?? { id, kind, number, date, due, party: (r[c.party] ?? "").trim(), lines: [], total: 0 };
    const cur = c.cur >= 0 ? (r[c.cur] ?? "").trim().toUpperCase() : "";
    const rate = c.rate >= 0 && (r[c.rate] ?? "").trim() ? Number((r[c.rate] ?? "").replace(",", ".")) : null;
    if (cur && !/^[A-Z]{3}$/.test(cur)) return problems.push(`${where}: currency must be a three-letter code.`);
    if (rate !== null && !(rate > 0 && rate < 1e6)) return problems.push(`${where}: rate must be a number above zero.`);
    if (cur) { d.currency = cur; if (rate) d.rate = rate; }
    if (credit) { d.credit = true; if (against) d.against = against; }
    const desc = c.desc >= 0 ? (r[c.desc] ?? "").trim() : "";
    d.lines.push(desc ? { account, cents, desc } : { account, cents });
    d.total += cents;
    byId.set(id, d);
  });
  return { documents: [...byId.values()], problems };
}

// Add documents to the books (new numbers only; a number already there is
// skipped, so loading an overlapping export twice adds nothing). The control
// accounts are added to the chart when it lacks them.
// -> { books, added, skipped, problems }
export function addDocuments(booksIn, text, opts = {}) {
  const books = JSON.parse(JSON.stringify(booksIn));
  const { documents, problems } = parseDocuments(text, opts);
  const codes = new Set(books.accounts.map((a) => a.code));
  books.documents = books.documents ?? [];
  const have = new Set(books.documents.map((d) => d.id));
  let added = 0, skipped = 0;
  for (const d of documents) {
    const bad = d.lines.find((l) => !codes.has(l.account));
    if (bad) { problems.push(`${d.id}: no account ${bad.account} in the chart of accounts.`); continue; }
    if (have.has(d.id)) { skipped++; continue; }
    if (d.currency && d.currency !== String(books.currency ?? "USD").toUpperCase()) {
      // Foreign document: amounts are in its currency; the books carry base cents at the rate on its date.
      const rate = d.rate ?? rateOn(books, d.currency, d.date);
      if (!rate) { problems.push(`${d.id}: no ${d.currency} rate on or before ${d.date}; add a rate column or "fx rate".`); continue; }
      d.rate = rate; d.foreignTotal = d.total; d.total = 0;
      for (const l of d.lines) { l.foreign = l.cents; l.cents = convertCents(l.cents, rate); d.total += l.cents; }
      if (!books.accounts.some((a) => a.code === FX_ACCOUNT)) books.accounts.push({ code: FX_ACCOUNT, name: "Foreign exchange gain or loss", type: "expense" });
    } else if (d.currency) { delete d.currency; delete d.rate; }
    if (books.lockedThrough && d.date <= books.lockedThrough) { problems.push(`${d.id}: dated ${d.date}, in the period locked through ${books.lockedThrough}.`); continue; }
    books.documents.push(d);
    have.add(d.id);
    added++;
  }
  ensureControlAccounts(books);
  return { books: settle(books), added, skipped, problems };
}

export function ensureControlAccounts(books) {
  const codes = new Set(books.accounts.map((a) => a.code));
  if (!codes.has(AR)) books.accounts.push({ code: AR, name: "Accounts receivable", type: "asset" });
  if (!codes.has(AP)) books.accounts.push({ code: AP, name: "Accounts payable", type: "liability" });
  books.accounts.sort((a, b) => a.code.localeCompare(b.code));
}

// One journal entry per document, on its own date.
export function documentEntries(books) {
  return (books.documents ?? []).map((d) => {
    // A credit note is the invoice run backwards: income and tax debited, receivable credited.
    const dr = (d.kind === "invoice") !== !!d.credit; // true: the control account is debited
    const lines = [{ account: d.kind === "invoice" ? AR : AP, debit: dr ? d.total : 0, credit: dr ? 0 : d.total }, ...d.lines.map((l) => ({ account: l.account, debit: dr ? 0 : l.cents, credit: dr ? l.cents : 0 }))];
    const name = d.credit ? (d.kind === "invoice" ? "Credit note" : "Vendor credit") : d.kind === "invoice" ? "Invoice" : "Bill";
    return { id: d.id, date: d.date, memo: `${name} ${d.number}, ${d.party}${d.against ? ` (against ${d.against})` : ""}`, source: d.credit ? "credit" : d.kind, lines };
  }).concat(writeOffEntries(books), fxSettleEntries(books), fxPartEntries(books), creditFxEntries(books));
}

// Write off what a customer will not pay: debits bad debts, credits receivable,
// for the invoice's balance on `date`. A bill a supplier forgives is the mirror
// image: debits payable, credits other income (4100). Credit notes cannot be
// written off. The document leaves aging; a later payment is not matched to it.
// -> { books, cents } or throws.
export const BAD_DEBT = "6900";
export const FORGIVEN = "4100";
export function writeOff(booksIn, id, { date, account } = {}) {
  const books = settle(JSON.parse(JSON.stringify(booksIn)));
  const d = (books.documents ?? []).find((x) => x.id === id || x.number === id);
  if (!d) throw new Error(`No document ${id}.`);
  if (d.credit) throw new Error(`${d.id} is a credit note; only an invoice or a bill can be written off.`);
  const isBill = d.kind !== "invoice";
  account ??= isBill ? FORGIVEN : BAD_DEBT;
  const cents = balance(d);
  if (cents <= 0) throw new Error(`${d.id} has nothing owing.`);
  if (!books.accounts.some((a) => a.code === account)) books.accounts.push(isBill ? { code: account, name: "Debts forgiven", type: "income" } : { code: account, name: "Bad debts", type: "expense" });
  books.accounts.sort((a, b) => a.code.localeCompare(b.code));
  const day = date ?? [...books.transactions.map((t) => t.date), d.date].sort().at(-1);
  if (books.lockedThrough && day <= books.lockedThrough) throw new Error(`The write-off date ${day} is in the period locked through ${books.lockedThrough}.`);
  if (day < d.date) throw new Error(`The write-off date ${day} is before the ${isBill ? "bill" : "invoice"} date ${d.date}.`);
  d.writtenOff = { date: day, cents, account };
  return { books: settle(books), cents };
}
// A foreign invoice or bill settled by a base-currency bank line: what the line
// paid differs from what was booked, and the difference is a realized exchange
// gain or loss (6190; a gain shows as a negative expense).
const fxPartEntries = (books) => (books.documents ?? []).flatMap((d) => (d.payments ?? []).filter((p) => p.fx).map((p) => ({ d, p }))).map(({ d, p }) => {
  const t = books.transactions.find((x) => x.id === p.line);
  const bill = d.kind !== "invoice", n = Math.abs(p.fx), toControl = bill ? p.fx > 0 : p.fx < 0;
  return { id: `FX-${d.id}-${p.line}`, date: t?.date ?? d.date, memo: `Realized exchange ${(p.fx > 0) === !bill ? "loss" : "gain"} on ${bill ? "bill" : "invoice"} ${d.number}, ${d.party} (${d.currency})`, source: "fx", lines: [
    { account: bill ? AP : AR, debit: toControl ? n : 0, credit: toControl ? 0 : n },
    { account: FX_ACCOUNT, debit: toControl ? 0 : n, credit: toControl ? n : 0 }] };
});
const fxSettleEntries = (books) => (books.documents ?? []).map((d) => {
  // Month-end revaluation has already moved the carrying amount by its last cum.
  const diff = (d.fxDiff ?? 0) + (docRevals(books, d).at(-1)?.cum ?? 0);
  return diff && d.settledBy ? { d, diff } : null;
}).filter(Boolean).map(({ d, diff }) => {
  const t = books.transactions.find((x) => x.id === d.settledBy);
  const bill = d.kind !== "invoice", n = Math.abs(diff);
  const toControl = bill ? diff > 0 : diff < 0; // control account debited
  return { id: `FX-${d.id}`, date: t?.date ?? d.date, memo: `Realized exchange ${(diff > 0) === !bill ? "loss" : "gain"} on ${bill ? "bill" : "invoice"} ${d.number}, ${d.party} (${d.currency})`, source: "fx", lines: [
    { account: bill ? AP : AR, debit: toControl ? n : 0, credit: toControl ? 0 : n },
    { account: FX_ACCOUNT, debit: toControl ? 0 : n, credit: toControl ? n : 0 }] };
});
// A foreign credit note applied to a foreign invoice at another rate than the invoice
// was booked at: the control account is cleared of exactly what the invoice carried,
// the rest goes to 6190.
const creditFxEntries = (books) => (books.documents ?? []).filter((c) => c.credit && c.creditFx).map((c) => {
  const bill = c.kind !== "invoice", n = Math.abs(c.creditFx);
  const toControl = bill ? c.creditFx < 0 : c.creditFx > 0; // control account debited
  return { id: `FXC-${c.id}`, date: c.date, memo: `Realized exchange ${(c.creditFx > 0) === !bill ? "gain" : "loss"} on ${bill ? "vendor credit" : "credit note"} ${c.number}, ${c.party} (${c.currency})`, source: "fx", lines: [
    { account: bill ? AP : AR, debit: toControl ? n : 0, credit: toControl ? 0 : n },
    { account: FX_ACCOUNT, debit: toControl ? 0 : n, credit: toControl ? n : 0 }] };
});
const writeOffEntries = (books) => (books.documents ?? []).filter((d) => d.writtenOff).map((d) => {
  const bill = d.kind !== "invoice", w = d.writtenOff;
  return { id: `WO-${d.id}`, date: w.date, memo: `${bill ? "Bill forgiven" : "Write-off of invoice"} ${d.number}, ${d.party}`, source: "writeoff", lines: bill
    ? [{ account: AP, debit: w.cents, credit: 0 }, { account: w.account, debit: 0, credit: w.cents }]
    : [{ account: w.account, debit: w.cents, credit: 0 }, { account: AR, debit: 0, credit: w.cents }] };
});

const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
const hasNumber = (desc, number) => new RegExp(`(^|[^0-9a-z])${number.replace(/[^0-9a-z]/gi, "")}($|[^0-9a-z])`, "i").test(desc.replace(/[#\-_/]/g, ""));
const partyHit = (desc, party) => {
  const have = new Set(payeeTokens(desc));
  return payeeTokens(party).filter((w) => w.length >= 3).some((w) => have.has(w));
};
// Stricter, for a part-payment named only by its party: a party with two or more
// meaningful words needs two of them in the description, so one generic word
// ("paid", "services", "global") cannot claim an unrelated line.
const partyHitStrict = (desc, party) => {
  const have = new Set(payeeTokens(desc));
  const words = payeeTokens(party).filter((w) => w.length >= 3);
  return words.length > 0 && words.filter((w) => have.has(w)).length >= Math.min(2, words.length);
};

// What is still owed on a document: its total less credit notes applied to it
// and part-payments matched to it. A credit note's own balance is what is left
// of it after it was applied.
export const balance = (d) => d.total - (d.credited ?? 0) - (d.writtenOff?.cents ?? 0) - (d.payments ?? []).reduce((a, p) => a + p.cents, 0);
// What is left of a credit note once it was applied to an invoice or refunded.
const creditLeft = (c) => c.total - (c.applied ?? 0) - (c.refund?.cents ?? 0);

// Match bank lines to the documents they settle, by amount, a date on or after
// the document's, and either its number in the description or the party's name
// (strong: the line posts to receivable/payable) or nothing else (weak: a
// suggestion for the review queue, only when exactly one open document has that
// amount). A line equal to the balance settles the document. A smaller line
// that names the document's number (or its party, when that party has just one
// open document) is a part-payment: it posts to the control account, lowers
// the balance, and the document stays open until the balance reaches zero.
// Credit notes naming an invoice (the "against" column) are applied first, so
// the payment expected is the amount net of credit. A line you filed to the
// control account by hand also settles a document of that amount. Rebuilt from
// scratch each call.
export function settle(booksIn) {
  const books = JSON.parse(JSON.stringify(booksIn));
  const docs = books.documents ?? [];
  for (const t of books.transactions) if (t.status === "settled") { t.status = "new"; delete t.posted; delete t.doc; delete t.docs; delete t.suggestion; delete t.partial; delete t.refund; }
  for (const d of docs) { delete d.settledBy; delete d.payments; delete d.credited; delete d.applied; delete d.refund; delete d.fxDiff; delete d.creditedForeign; delete d.creditFx; delete d.paidForeign; }
  // Credit notes reduce the document they name, in date order, never below zero.
  for (const c of docs.filter((x) => x.credit).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    const target = c.against && docs.find((x) => !x.credit && x.kind === c.kind && x.number === c.against);
    if (!target || target.date > c.date) continue;
    let take = Math.min(c.total, balance(target));
    if (take <= 0) continue;
    // Same foreign currency on both: the credit is applied in that currency, so the
    // invoice loses what it carried for those units, and the rate difference to the
    // credit note's own booking is a realized exchange gain or loss (creditFx).
    if (target.currency && target.currency === c.currency && c.foreignTotal != null && target.foreignTotal != null) {
      const left = target.foreignTotal - (target.creditedForeign ?? 0);
      const takeF = Math.min(c.foreignTotal, left);
      if (takeF <= 0) continue;
      const carried = takeF === left ? target.total - (target.credited ?? 0) : convertCents(takeF, target.rate);
      take = Math.min(carried, balance(target));
      target.creditedForeign = (target.creditedForeign ?? 0) + takeF;
      target.credited = (target.credited ?? 0) + take;
      c.applied = takeF === c.foreignTotal ? c.total : convertCents(takeF, c.rate);
      if (c.applied !== take) c.creditFx = c.applied - take;
      continue;
    }
    target.credited = (target.credited ?? 0) + take;
    c.applied = take;
  }
  const open = () => docs.filter((d) => !d.credit && balance(d) > 0);
  const sign = (d) => (d.kind === "invoice" ? 1 : -1);
  const within = (d, t) => dayNum(t.date) >= dayNum(d.date) && dayNum(t.date) - dayNum(d.date) <= MATCH_DAYS;
  // A foreign document is paid in base currency at the bank's rate: close to the booked
  // amount (within 3%, or 10% once an earlier instalment was paid, since the rate may have
  // moved between payments) counts, but only with the number or party name in the description.
  // A line in the document's own currency (a EUR deposit into a EUR account for a EUR
  // invoice) is matched in that currency, so the rate it was paid at never decides
  // whether it fits. Only when every credit applied was in that currency too.
  const fcur = (d, t) => !!d.currency && t.foreign?.currency === d.currency && d.foreignTotal != null && (!d.credited || d.creditedForeign != null) && Math.sign(t.foreign.cents) === sign(d);
  const fbal = (d) => d.foreignTotal - (d.creditedForeign ?? 0) - (d.paidForeign ?? 0);
  const near = (d, t) => d.currency && !fcur(d, t) && Math.sign(t.cents) === sign(d) && Math.abs(Math.abs(t.cents) - balance(d)) <= Math.max(100, Math.round(balance(d) * (d.payments?.length ? 0.1 : 0.03))) && within(d, t) && (hasNumber(t.desc, d.number) || partyHit(t.desc, d.party));
  const fits = (d, t) => (fcur(d, t) ? Math.abs(t.foreign.cents) === fbal(d) && within(d, t) : t.cents === sign(d) * balance(d) && within(d, t)) || near(d, t);
  const control = (d) => (d.kind === "invoice" ? AR : AP);
  const pay = (d, t, cents, fx = 0) => {
    (d.payments ??= []).push({ line: t.id, cents, ...(fx ? { fx } : {}) });
    if (fcur(d, t)) d.paidForeign = (d.paidForeign ?? 0) + Math.abs(t.foreign.cents);
    if (balance(d) === 0) d.settledBy = t.id;
  };
  // Lines already filed by hand to a control account.
  for (const t of books.transactions) if (t.status === "confirmed" && (t.posted === AR || t.posted === AP)) {
    const d = open().filter((x) => control(x) === t.posted && fits(x, t)).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (d) pay(d, t, balance(d));
  }
  const lines = books.transactions.filter((t) => t.status !== "confirmed" && t.status !== "split" && t.status !== "transfer");
  const usedLine = new Set();
  const post = (t, d, score, part) => {
    usedLine.add(t.id);
    t.status = "settled"; t.posted = control(d); t.doc = d.id;
    if (part) t.partial = true;
    t.suggestion = { account: control(d), confidence: 1, source: "document", reason: `${part ? "Part-payment of " : ""}${d.kind === "invoice" ? "Invoice" : "Bill"} ${d.number} from ${d.party}: ${part ? `${(Math.abs(t.cents) / 100).toFixed(2)} of ${(balance(d) / 100).toFixed(2)} owed, ` : "same amount, "}${score === 2 ? "number in the description" : "party name in the description"}` };
  };
  // Full settlements first, then the earliest part-payment, and again: a last
  // instalment only equals the balance once the earlier ones are applied.
  for (;;) {
    const scored = [];
    for (const t of lines) if (!usedLine.has(t.id)) for (const d of open()) if (fits(d, t)) {
      const score = hasNumber(t.desc, d.number) ? 2 : partyHit(t.desc, d.party) ? 1 : 0;
      scored.push({ t, d, score, gap: dayNum(t.date) - dayNum(d.date) });
    }
    scored.sort((a, b) => b.score - a.score || Math.abs(Math.abs(a.t.cents) - balance(a.d)) - Math.abs(Math.abs(b.t.cents) - balance(b.d)) || a.gap - b.gap || a.d.id.localeCompare(b.d.id));
    let moved = false;
    for (const { t, d, score } of scored) {
      if (score === 0 || usedLine.has(t.id) || balance(d) === 0 || !fits(d, t)) continue;
      post(t, d, score, false);
      const owed = balance(d);
      const diff = d.currency && Math.abs(t.cents) !== owed ? owed - Math.abs(t.cents) : 0;
      // The first payment keeps the whole difference in fxDiff (month-end revaluation
      // adjusts it); a last instalment books its own difference with the payment.
      if (d.payments?.length) pay(d, t, owed, diff); else { if (diff) d.fxDiff = diff; pay(d, t, owed); }
      moved = true;
    }
    if (moved) continue;
    // One line paying several documents of one party at once.
    for (const t of lines) {
      if (usedLine.has(t.id) || t.cents === 0) continue;
      const set = bundleFor(t, open().filter((d) => sign(d) === Math.sign(t.cents) && within(d, t)));
      if (!set) continue;
      usedLine.add(t.id);
      t.status = "settled"; t.posted = control(set[0]); t.doc = set[0].id; t.docs = set.map((d) => d.id);
      t.suggestion = { account: control(set[0]), confidence: 1, source: "document", reason: `One payment for ${set.length} documents from ${set[0].party}: ${set.map((d) => d.number).join(", ")} (${set.map((d) => (balance(d) / 100).toFixed(2)).join(" + ")})` };
      for (const d of set) pay(d, t, balance(d));
      moved = true;
    }
    if (moved) continue;
    const parts = [];
    for (const t of lines) if (!usedLine.has(t.id) && t.cents !== 0) for (const d of open()) {
      if (Math.sign(t.cents) !== sign(d) || !within(d, t)) continue;
      if (fcur(d, t) ? Math.abs(t.foreign.cents) >= fbal(d) : Math.abs(t.cents) >= balance(d)) continue;
      const byNumber = hasNumber(t.desc, d.number);
      const byParty = !byNumber && partyHitStrict(t.desc, d.party) && open().filter((x) => x.kind === d.kind && x.party === d.party).length === 1;
      if (byNumber || byParty) parts.push({ t, d, score: byNumber ? 2 : 1 });
    }
    parts.sort((a, b) => a.t.date.localeCompare(b.t.date) || b.score - a.score || a.t.id.localeCompare(b.t.id));
    if (!parts.length) break;
    const { t, d, score } = parts[0];
    post(t, d, score, true);
    if (fcur(d, t)) {
      // Part of a foreign document paid in its own currency: the invoice carries those
      // units at its booking rate; what the bank booked above or below that is exchange.
      const carried = Math.min(convertCents(Math.abs(t.foreign.cents), d.rate), balance(d) - 1);
      pay(d, t, carried, carried - Math.abs(t.cents));
    } else pay(d, t, Math.abs(t.cents));
  }
  // Refunds: money paid back for a credit note nobody applied. A refund of a
  // customer's credit leaves the bank (negative); a supplier's refund comes in.
  for (const c of docs.filter((x) => x.credit).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    const left = creditLeft(c);
    if (left <= 0) continue;
    const want = c.kind === "invoice" ? -left : left;
    const hits = lines.filter((t) => !usedLine.has(t.id) && t.cents === want && within(c, t) && (hasNumber(t.desc, c.number) || partyHit(t.desc, c.party)));
    hits.sort((a, b) => Number(hasNumber(b.desc, c.number)) - Number(hasNumber(a.desc, c.number)) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const t = hits[0];
    if (!t) continue;
    usedLine.add(t.id);
    t.status = "settled"; t.posted = control(c); t.doc = c.id; t.refund = true;
    t.suggestion = { account: t.posted, confidence: 1, source: "document", reason: `Refund of ${c.kind === "invoice" ? "credit note" : "vendor credit"} ${c.number} for ${c.party}: same amount, ${hasNumber(t.desc, c.number) ? "number" : "party name"} in the description` };
    c.refund = { line: t.id, cents: left };
  }
  // Amount-only candidates: suggest, never post.
  for (const t of lines) {
    if (t.status !== "review" && t.status !== "new") continue;
    const cands = open().filter((d) => fits(d, t));
    if (cands.length === 1 && (t.suggestion?.confidence ?? 0) < 0.6) {
      const d = cands[0];
      t.suggestion = { account: control(d), confidence: 0.6, source: "document", reason: `Same amount as ${d.kind} ${d.number} from ${d.party}, dated ${d.date}. Nothing else in the description matches, so confirm it is the payment.` };
    }
  }
  return books;
}

// A bank line that pays several open documents of one party in one go. The
// documents' balances must add to the line to the cent, and the description
// must name the party or one of the numbers. The smallest set wins; if two
// sets of that size fit and the description does not tell them apart, nothing
// is chosen and the line stays in review. At most 16 open documents per party
// are searched.
function bundleFor(t, docs) {
  const total = Math.abs(t.cents);
  const byParty = new Map();
  for (const d of docs) byParty.set(`${d.kind}|${d.party}`, [...(byParty.get(`${d.kind}|${d.party}`) ?? []), d]);
  const found = [];
  for (const group of byParty.values()) {
    const g = group.slice(0, 16);
    const named = g.filter((d) => hasNumber(t.desc, d.number));
    if (!named.length && !partyHit(t.desc, g[0].party)) continue;
    let best = [];
    for (let m = 1; m < 1 << g.length; m++) {
      const pick = g.filter((_, i) => m & (1 << i));
      if (pick.length < 2 || pick.reduce((a, d) => a + balance(d), 0) !== total) continue;
      if (named.some((d) => !pick.includes(d))) continue;
      if (!best.length || pick.length < best[0].length) best = [pick];
      else if (pick.length === best[0].length) best.push(pick);
    }
    if (best.length === 1) found.push(best[0]);
    else if (best.length > 1) return null;
  }
  return found.length === 1 ? found[0].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)) : null;
}

// Open documents aged from their due date (the document date when there is no
// due date), as of `asOf`. -> { asOf, buckets, receivable, payable, open }
export function aging(books, asOf = null) {
  const docs = books.documents ?? [];
  const last = [...docs.map((d) => d.date), ...books.transactions.map((t) => t.date)].sort().at(-1) ?? "2000-01-01";
  const day = asOf ?? last;
  const names = ["current", "1-30", "31-60", "61-90", "90+"];
  const bucket = (late) => (late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4);
  const mk = () => ({ total: 0, byBucket: names.map(() => 0) });
  const out = { asOf: day, buckets: names, receivable: mk(), payable: mk(), open: [] };
  for (const d of docs) {
    if (d.date > day) continue;
    // A credit note counts as a negative item for whatever part of it was not applied to an invoice.
    const left = d.credit ? -creditLeft(d) : balance(d);
    if (left === 0) continue;
    const late = dayNum(day) - dayNum(d.due ?? d.date);
    const b = bucket(late);
    const side = d.kind === "invoice" ? out.receivable : out.payable;
    side.total += left;
    side.byBucket[b] += left;
    out.open.push({ id: d.id, kind: d.kind, party: d.party, date: d.date, due: d.due, total: left, original: d.total, daysLate: Math.max(late, 0), bucket: names[b], ...(d.credit ? { credit: true } : {}), ...(left !== d.total && !d.credit ? { partlyPaid: true } : {}) });
  }
  out.open.sort((x, y) => y.daysLate - x.daysLate || x.id.localeCompare(y.id));
  return out;
}
