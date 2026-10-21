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

export const AR = "1100", AP = "2050";
const MATCH_DAYS = 180; // a payment this long after the document date still matches
const KIND = (v) => (/^(inv|sale|sales|ar|receiv|customer)/i.test(v) ? "invoice" : /^(bill|exp|purchase|ap|payable|vendor|supplier)/i.test(v) ? "bill" : null);

// CSV with a header row: type, number, date, due (optional), party, amount,
// account. Several rows with the same type and number are one document with a
// line per row (a sales-tax line goes to 2100). Amounts are positive.
// -> { documents, problems }
export function parseDocuments(text, { dayFirst = false, decimalComma = false } = {}) {
  const rows = parseCsv(text);
  const problems = [];
  if (rows.length < 2) return { documents: [], problems: ["No document rows found. Expected a header: type,number,date,due,party,amount,account."] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const c = { type: col("type", "kind"), number: col("number", "no", "invoice", "bill", "ref", "id"), date: col("date", "issued", "invoice date", "bill date"), due: col("due", "due date"), party: col("party", "customer", "vendor", "name", "supplier"), amount: col("amount", "total", "line amount"), account: col("account", "account code", "code") };
  for (const k of ["type", "number", "date", "party", "amount", "account"]) if (c[k] === -1) problems.push(`Missing column "${k}".`);
  if (problems.length) return { documents: [], problems };
  const byId = new Map();
  rows.slice(1).forEach((r, i) => {
    const where = `Row ${i + 2}`;
    const kind = KIND((r[c.type] ?? "").trim());
    const number = (r[c.number] ?? "").trim();
    const date = parseDate(r[c.date], dayFirst);
    const due = c.due >= 0 && (r[c.due] ?? "").trim() ? parseDate(r[c.due], dayFirst) : null;
    const cents = parseCents(r[c.amount], decimalComma);
    const account = (r[c.account] ?? "").trim();
    if (!kind) return problems.push(`${where}: type must be invoice or bill.`);
    if (!number) return problems.push(`${where}: no number.`);
    if (!date) return problems.push(`${where}: unreadable date "${r[c.date]}".`);
    if (c.due >= 0 && (r[c.due] ?? "").trim() && !due) return problems.push(`${where}: unreadable due date "${r[c.due]}".`);
    if (!Number.isFinite(cents) || cents <= 0) return problems.push(`${where}: amount must be a positive number.`);
    if (!account) return problems.push(`${where}: no account.`);
    const id = `${kind === "invoice" ? "INV" : "BILL"}-${number}`;
    const d = byId.get(id) ?? { id, kind, number, date, due, party: (r[c.party] ?? "").trim(), lines: [], total: 0 };
    d.lines.push({ account, cents });
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
    const inv = d.kind === "invoice";
    const lines = [{ account: inv ? AR : AP, debit: inv ? d.total : 0, credit: inv ? 0 : d.total }, ...d.lines.map((l) => ({ account: l.account, debit: inv ? 0 : l.cents, credit: inv ? l.cents : 0 }))];
    return { id: d.id, date: d.date, memo: `${inv ? "Invoice" : "Bill"} ${d.number}, ${d.party}`, source: d.kind, lines };
  });
}

const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
const hasNumber = (desc, number) => new RegExp(`(^|[^0-9a-z])${number.replace(/[^0-9a-z]/gi, "")}($|[^0-9a-z])`, "i").test(desc.replace(/[#\-_/]/g, ""));
const partyHit = (desc, party) => {
  const have = new Set(payeeTokens(desc));
  return payeeTokens(party).filter((w) => w.length >= 3).some((w) => have.has(w));
};

// Match bank lines to the documents they settle, by exact amount, a date on or
// after the document's, and either its number in the description or the
// party's name (strong: the line is settled and posts to receivable/payable) or
// nothing else (weak: a suggestion for the review queue, only when exactly one
// open document has that amount). A line you filed to the control account by
// hand also settles a document of that amount. Rebuilt from scratch each call.
export function settle(booksIn) {
  const books = JSON.parse(JSON.stringify(booksIn));
  const docs = books.documents ?? [];
  for (const t of books.transactions) if (t.status === "settled") { t.status = "new"; delete t.posted; delete t.doc; delete t.suggestion; }
  for (const d of docs) { delete d.settledBy; }
  const open = () => docs.filter((d) => !d.settledBy);
  const fits = (d, t) => t.cents === (d.kind === "invoice" ? d.total : -d.total) && dayNum(t.date) >= dayNum(d.date) && dayNum(t.date) - dayNum(d.date) <= MATCH_DAYS;
  const control = (d) => (d.kind === "invoice" ? AR : AP);
  // Lines already filed by hand to a control account.
  for (const t of books.transactions) if (t.status === "confirmed" && (t.posted === AR || t.posted === AP)) {
    const d = open().filter((x) => control(x) === t.posted && fits(x, t)).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (d) d.settledBy = t.id;
  }
  const lines = books.transactions.filter((t) => t.status !== "confirmed" && t.status !== "split" && t.status !== "transfer");
  const scored = [];
  for (const t of lines) for (const d of open()) if (fits(d, t)) {
    const score = hasNumber(t.desc, d.number) ? 2 : partyHit(t.desc, d.party) ? 1 : 0;
    scored.push({ t, d, score, gap: dayNum(t.date) - dayNum(d.date) });
  }
  scored.sort((a, b) => b.score - a.score || a.gap - b.gap || a.d.id.localeCompare(b.d.id));
  const usedLine = new Set();
  for (const { t, d, score } of scored) {
    if (score === 0 || usedLine.has(t.id) || d.settledBy) continue;
    usedLine.add(t.id);
    d.settledBy = t.id;
    t.status = "settled"; t.posted = control(d); t.doc = d.id;
    t.suggestion = { account: control(d), confidence: 1, source: "document", reason: `${d.kind === "invoice" ? "Invoice" : "Bill"} ${d.number} from ${d.party}: same amount, ${score === 2 ? "number in the description" : "party name in the description"}` };
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
    if (d.settledBy || d.date > day) continue;
    const late = dayNum(day) - dayNum(d.due ?? d.date);
    const b = bucket(late);
    const side = d.kind === "invoice" ? out.receivable : out.payable;
    side.total += d.total;
    side.byBucket[b] += d.total;
    out.open.push({ id: d.id, kind: d.kind, party: d.party, date: d.date, due: d.due, total: d.total, daysLate: Math.max(late, 0), bucket: names[b] });
  }
  out.open.sort((x, y) => y.daysLate - x.daysLate || x.id.localeCompare(y.id));
  return out;
}
