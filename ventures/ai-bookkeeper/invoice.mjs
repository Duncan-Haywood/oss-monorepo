// A document to send: one invoice (or credit note) from the books as a single
// self-contained HTML page that prints cleanly to PDF. Lines come from the
// document's own lines (the CSV "description" column, else the account name; a
// line on 2100 is shown as sales tax), then credits applied, payments received
// and the balance due, so the page always agrees with the ledger. The seller's
// details are books.profile: { name, address, email, taxId, payTo, terms }.
// Pure functions, no DOM, no network.

import { balance } from "./accruals.mjs";
import { fmt } from "./ledger.mjs";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nl = (v) => esc(v).replace(/\r?\n/g, "<br>");
export const PROFILE_KEYS = ["name", "address", "email", "taxId", "payTo", "terms"];

export function setProfile(booksIn, key, value) {
  if (!PROFILE_KEYS.includes(key)) throw new Error(`profile key must be one of ${PROFILE_KEYS.join(", ")}`);
  const books = JSON.parse(JSON.stringify(booksIn));
  books.profile = { ...(books.profile ?? {}), [key]: value };
  if (!value) delete books.profile[key];
  return books;
}

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

// -> { html, balance, status, id } or throws when the document is not found or is a bill.
export function renderInvoice(books, ref, { asOf = null } = {}) {
  const docs = books.documents ?? [];
  const d = docs.find((x) => x.id === ref) ?? docs.find((x) => x.kind === "invoice" && x.number === ref);
  if (!d) throw new Error(`no document ${ref}`);
  if (d.kind !== "invoice") throw new Error(`${d.id} is a bill you owe, not a document to send`);
  const accts = new Map(books.accounts.map((a) => [a.code, a.name]));
  const cur = books.currency ?? "";
  const m = (c) => esc(fmt(c, cur));
  const p = books.profile ?? {};
  const seller = p.name || books.name || "";
  const title = d.credit ? "Credit note" : "Invoice";
  const sign = d.credit ? -1 : 1;
  const rows = d.lines.map((l) => {
    const label = l.desc || (l.account === "2100" ? "Sales tax" : accts.get(l.account) ?? l.account);
    return `<tr><td>${esc(label)}</td><td class="n">${m(sign * l.cents)}</td></tr>`;
  });
  const sub = d.lines.filter((l) => l.account !== "2100").reduce((a, l) => a + l.cents, 0);
  const tax = d.total - sub;
  const bal = d.credit ? null : balance(d);
  const paid = (d.payments ?? []).reduce((a, x) => a + x.cents, 0);
  const adj = [];
  if (!d.credit) {
    if (d.credited) adj.push(["Credit notes applied", -d.credited]);
    if (paid) adj.push(["Payments received", -paid]);
    if (d.writtenOff?.cents) adj.push(["Written off", -d.writtenOff.cents]);
  }
  const today = asOf ?? new Date().toISOString().slice(0, 10);
  let status = d.credit ? "credit" : bal <= 0 ? "paid" : "due";
  let overdue = 0;
  if (status === "due" && d.due && d.due < today) { status = "overdue"; overdue = daysBetween(d.due, today); }
  const totals = [];
  if (tax) totals.push(["Subtotal", sign * sub], ["Sales tax", sign * tax]);
  const table = (arr) => arr.map(([k, v]) => `<tr><td class="r">${esc(k)}</td><td class="n">${m(v)}</td></tr>`).join("");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} ${esc(d.number)}${seller ? ` - ${esc(seller)}` : ""}</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;color:#1a1a1a;max-width:720px;margin:32px auto;padding:0 16px}
h1{font-size:28px;margin:0}.top{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}
.meta td{padding:1px 0 1px 16px}.muted{color:#666}table.items{width:100%;border-collapse:collapse;margin:28px 0 8px}
.items th{text-align:left;border-bottom:2px solid #1a1a1a;padding:6px 0}.items td{padding:7px 0;border-bottom:1px solid #ddd}
.n{text-align:right;font-variant-numeric:tabular-nums}.r{text-align:right}th.n{text-align:right}
.due{font-size:20px;font-weight:700}.stamp{display:inline-block;border:2px solid;padding:2px 10px;border-radius:4px;font-weight:700;text-transform:uppercase}
.paid{color:#1a7f37}.overdue{color:#b42318}.foot{margin-top:32px;border-top:1px solid #ddd;padding-top:12px}
@media print{body{margin:0}}
</style></head><body>
<div class="top"><div><h1>${esc(title)}</h1><div class="muted">${esc(d.number)}</div></div>
<div class="r"><strong>${esc(seller)}</strong><br>${nl(p.address)}${p.email ? `<br>${esc(p.email)}` : ""}${p.taxId ? `<br>Tax ID ${esc(p.taxId)}` : ""}</div></div>
<div class="top" style="margin-top:24px"><div><div class="muted">${d.credit ? "Credit to" : "Bill to"}</div><strong>${esc(d.party)}</strong></div>
<table class="meta"><tr><td class="muted">Date</td><td>${esc(d.date)}</td></tr>${d.due && !d.credit ? `<tr><td class="muted">Due</td><td>${esc(d.due)}</td></tr>` : ""}${d.against ? `<tr><td class="muted">Against</td><td>${esc(d.against)}</td></tr>` : ""}</table></div>
<table class="items"><thead><tr><th>Description</th><th class="n">Amount</th></tr></thead><tbody>${rows.join("")}</tbody></table>
<table style="margin-left:auto">${table(totals)}${table([["Total", sign * d.total]])}${table(adj)}</table>
${bal === null ? "" : `<p class="r due">${bal <= 0 ? `<span class="stamp paid">Paid</span>` : `Balance due ${m(bal)}`}${overdue ? ` <span class="stamp overdue">${overdue} days overdue</span>` : ""}</p>`}
<div class="foot muted">${p.payTo && bal !== null && bal > 0 ? `<p><strong>How to pay.</strong><br>${nl(p.payTo)}</p>` : ""}${p.terms ? `<p>${nl(p.terms)}</p>` : ""}</div>
</body></html>
`;
  return { html, balance: bal, status, id: d.id };
}
