// A customer statement of account: every invoice, credit note, payment,
// refund and write-off for one customer in date order with a running balance,
// the amount owed now, and what part of it is past due. The closing balance
// is checked against the aging table's figure for that customer, so the page
// you send agrees with the ledger. Pure functions, no DOM, no network.

import { balance, settle } from "./accruals.mjs";
import { fmt } from "./ledger.mjs";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nl = (v) => esc(v).replace(/\r?\n/g, "<br>");
const norm = (s) => String(s ?? "").trim().toLowerCase();
const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;

// Customers that have an invoice or credit note, with what each owes.
export function customers(booksIn) {
  const books = settle(booksIn);
  const by = new Map();
  for (const d of books.documents ?? []) {
    if (d.kind !== "invoice") continue;
    const k = norm(d.party), c = by.get(k) ?? { party: d.party, owed: 0 };
    c.owed += d.credit ? -(d.total - (d.applied ?? 0) - (d.refund?.cents ?? 0)) : balance(d);
    by.set(k, c);
  }
  return [...by.values()].sort((a, b) => b.owed - a.owed || a.party.localeCompare(b.party));
}

// -> { party, from, to, opening, rows, closing, overdue, events } rows carry
// { date, kind, ref, memo, debit, credit, balance }. `from` starts the listed
// rows; earlier activity is rolled into the opening balance.
export function statement(booksIn, party, { from = null, to = null, asOf = null } = {}) {
  const books = settle(booksIn);
  const docs = (books.documents ?? []).filter((d) => d.kind === "invoice" && norm(d.party) === norm(party));
  if (!docs.length) throw new Error(`no invoices or credit notes for ${party}`);
  const tx = new Map(books.transactions.map((t) => [t.id, t]));
  const ev = [];
  for (const d of docs) {
    if (!d.credit) {
      ev.push({ date: d.date, kind: "invoice", ref: d.id, memo: d.due ? `Due ${d.due}` : "", debit: d.total, credit: 0 });
      for (const p of d.payments ?? []) ev.push({ date: tx.get(p.line)?.date ?? d.date, kind: "payment", ref: d.id, memo: tx.get(p.line)?.desc ?? "Payment", debit: 0, credit: p.cents });
      if (d.writtenOff) ev.push({ date: d.writtenOff.date, kind: "write-off", ref: d.id, memo: "Written off", debit: 0, credit: d.writtenOff.cents });
    } else {
      ev.push({ date: d.date, kind: "credit note", ref: d.id, memo: d.against ? `Against ${d.against}` : "", debit: 0, credit: d.total });
      if (d.refund) ev.push({ date: tx.get(d.refund.line)?.date ?? d.date, kind: "refund", ref: d.id, memo: "Paid back", debit: d.refund.cents, credit: 0 });
    }
  }
  const order = { invoice: 0, "credit note": 1, payment: 2, refund: 2, "write-off": 3 };
  ev.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind] || a.ref.localeCompare(b.ref));
  const last = ev.at(-1).date;
  const end = to ?? asOf ?? last;
  let run = 0, opening = 0;
  const rows = [];
  for (const e of ev) {
    if (e.date > end) continue;
    run += e.debit - e.credit;
    if (from && e.date < from) { opening = run; continue; }
    rows.push({ ...e, balance: run });
  }
  const today = asOf ?? end;
  const overdue = docs.filter((d) => !d.credit && d.due && d.due < today && d.date <= end).reduce((a, d) => a + Math.max(0, balance(d)), 0);
  return { party: docs[0].party, from, to: end, opening, rows, closing: run, overdue: Math.min(overdue, Math.max(run, 0)), events: ev.length };
}

export function renderStatement(books, party, opts = {}) {
  const s = statement(books, party, opts);
  const cur = books.currency ?? "";
  const m = (c) => esc(fmt(c, cur));
  const p = books.profile ?? {};
  const seller = p.name || books.name || "";
  const rows = s.rows.map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(r.kind)} ${esc(r.ref)}${r.memo ? `<div class="muted">${esc(r.memo)}</div>` : ""}</td><td class="n">${r.debit ? m(r.debit) : ""}</td><td class="n">${r.credit ? m(r.credit) : ""}</td><td class="n">${m(r.balance)}</td></tr>`);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Statement ${esc(s.party)}${seller ? ` - ${esc(seller)}` : ""}</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;color:#1a1a1a;max-width:760px;margin:32px auto;padding:0 16px}
h1{font-size:28px;margin:0}.top{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}.muted{color:#666;font-size:13px}
table.items{width:100%;border-collapse:collapse;margin:24px 0 8px}.items th{text-align:left;border-bottom:2px solid #1a1a1a;padding:6px 4px}
.items td{padding:6px 4px;border-bottom:1px solid #ddd;vertical-align:top}.n{text-align:right;font-variant-numeric:tabular-nums}th.n{text-align:right}
.due{font-size:20px;font-weight:700;text-align:right}.overdue{color:#b42318;text-align:right}.foot{margin-top:28px;border-top:1px solid #ddd;padding-top:12px}
@media print{body{margin:0}}
</style></head><body>
<div class="top"><div><h1>Statement</h1><div class="muted">${s.from ? `${esc(s.from)} to ` : "Up to "}${esc(s.to)}</div></div>
<div style="text-align:right"><strong>${esc(seller)}</strong><br>${nl(p.address)}${p.email ? `<br>${esc(p.email)}` : ""}${p.taxId ? `<br>Tax ID ${esc(p.taxId)}` : ""}</div></div>
<p style="margin-top:20px"><span class="muted">For</span><br><strong>${esc(s.party)}</strong></p>
<table class="items"><thead><tr><th>Date</th><th>Detail</th><th class="n">Charges</th><th class="n">Credits</th><th class="n">Balance</th></tr></thead><tbody>
${s.from ? `<tr><td></td><td>Balance brought forward</td><td></td><td></td><td class="n">${m(s.opening)}</td></tr>` : ""}${rows.join("")}</tbody></table>
<p class="due">${s.closing > 0 ? `Balance due ${m(s.closing)}` : s.closing < 0 ? `Credit in your favour ${m(-s.closing)}` : "Nothing owing"}</p>
${s.overdue ? `<p class="overdue">${m(s.overdue)} of this is past due.</p>` : ""}
<div class="foot muted">${p.payTo && s.closing > 0 ? `<p><strong>How to pay.</strong><br>${nl(p.payTo)}</p>` : ""}${p.terms ? `<p>${nl(p.terms)}</p>` : ""}</div>
</body></html>
`;
  return { html, ...s };
}
