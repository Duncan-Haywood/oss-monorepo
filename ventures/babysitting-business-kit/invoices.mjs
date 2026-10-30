// Babysitting Business Kit: invoices, receipts and the aging view. Pure functions over
// the desk, shared by the browser app (invoices-ui.mjs) and the optional server
// (invoices-server.mjs). Nothing here touches the network, the clock or storage.
//
// desk.invoices = [{ id, number, familyId, from, to, issued, due, keys, items, total,
//                    payToken, status: "open" | "void" }]
//
// An invoice snapshots its line items (from quote(), or the sit's agreed price) when it
// is made, so the amounts a family was sent do not move if the rate card changes later.
// What has been paid is not stored on the invoice: payments live on the bookings, as
// they always have, and are applied to a booking's sits oldest first, exactly as
// unpaid() in engine.mjs applies them. So the invoice balance, the aging view and the
// Today list's "unpaid" items always agree.
//
// Tips are recorded as their own payment with `tip: true`: income for the tax summary,
// but never counted against what a sit costs.

import { quote, expandBookings, payments, daysBetween, addDays } from "./engine.mjs";

const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const num = (x, d = 0) => (Number.isFinite(Number(x)) && x !== "" && x !== null ? Number(x) : d);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const usd = (x) => `$${r2(x).toFixed(2)}`;

export const AGING_BUCKETS = [
  ["current", "Current (not yet due)"],
  ["d1_30", "1-30 days past due"],
  ["d31_60", "31-60 days past due"],
  ["d60p", "Over 60 days past due"],
];

// The sitter's payment settings, with defaults. They live in desk.profile.invoicing.
export function invoiceSettings(profile = {}) {
  const s = (profile && profile.invoicing) || {};
  return {
    prefix: String(s.prefix || "INV").replace(/[^A-Za-z0-9-]/g, "").slice(0, 12) || "INV",
    dueDays: Math.max(0, Math.min(90, Math.round(num(s.dueDays, 7)))),
    venmo: String(s.venmo || "").trim(),
    zelle: String(s.zelle || "").trim(),
    cashApp: String(s.cashApp || "").trim(),
    paypal: String(s.paypal || "").trim(),
    checkTo: String(s.checkTo || "").trim(),
    note: String(s.note || "").trim(),
    tips: !!s.tips,
  };
}

// "How to pay" lines for the invoice, from the sitter's own settings only.
export function paymentInstructions(profile = {}) {
  const s = invoiceSettings(profile);
  const out = [];
  if (s.venmo) out.push(`Venmo: ${s.venmo.startsWith("@") ? s.venmo : `@${s.venmo}`}`);
  if (s.zelle) out.push(`Zelle: ${s.zelle}`);
  if (s.cashApp) out.push(`Cash App: ${s.cashApp.startsWith("$") ? s.cashApp : `$${s.cashApp}`}`);
  if (s.paypal) out.push(`PayPal: ${s.paypal}`);
  if (s.checkTo) out.push(`Check payable to: ${s.checkTo}`);
  out.push("Cash at the end of a sit is fine too.");
  if (s.note) out.push(s.note);
  return out;
}

const care = (b) => payments(b).filter((p) => !p.tip);

// Every sit of one booking with its price, line items, and how much of it is paid.
// Payments (tips excluded) pay the oldest sits first, the same rule as unpaid().
export function occurrenceLedger(desk, b) {
  if (b.status === "cancelled") return [];
  const occ = expandBookings([b]).filter((o) => o.status !== "cancelled");
  let got = care(b).reduce((a, p) => a + num(p.amount), 0);
  return occ.map((o) => {
    const q = quote(o, desk.profile.rates, desk.profile.holidays);
    const agreed = b.price !== undefined && b.price !== "" && b.price !== null && Number.isFinite(Number(b.price));
    const price = r2(agreed ? Number(b.price) : q.total);
    const lines = agreed ? [{ label: "agreed price for this sit", amount: price }] : q.lines.map((l) => ({ label: l.label, amount: l.amount }));
    const paid = r2(Math.min(got, price));
    got -= paid;
    return { key: o.key, bookingId: b.id, familyId: b.familyId, date: o.date, start: o.start, end: o.end, kids: o.kids, price, lines, paid, owed: r2(price - paid) };
  });
}

const ledgerIndex = (desk) => {
  const m = new Map();
  for (const b of desk.bookings) for (const row of occurrenceLedger(desk, b)) m.set(row.key, row);
  return m;
};
const liveInvoices = (desk) => (Array.isArray(desk.invoices) ? desk.invoices : []).filter((i) => i && i.status !== "void");

// Sits for one family in a date range that are not on another open invoice.
export function billable(desk, { familyId, from, to }) {
  const taken = new Set(liveInvoices(desk).flatMap((i) => i.keys || []));
  const rows = [];
  for (const b of desk.bookings) if (b.familyId === familyId) for (const row of occurrenceLedger(desk, b)) if (row.date >= from && row.date <= to && !taken.has(row.key)) rows.push(row);
  return rows.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

export function nextInvoiceNumber(desk, year, prefix = "INV") {
  const re = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  const n = (Array.isArray(desk.invoices) ? desk.invoices : []).reduce((m, i) => { const x = re.exec(String(i && i.number)); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return `${prefix}-${year}-${String(n + 1).padStart(3, "0")}`;
}

// A 128-bit hex token for the family's pay link, from caller-supplied random bytes.
export function payToken(bytes) {
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length < 32) throw new Error("a pay token needs 16 random bytes");
  return hex;
}
export const isPayToken = (t) => /^[0-9a-f]{32,64}$/.test(String(t || ""));

// Make an invoice for one sit (from = to = its date) or a period (a week of a recurring
// family). Returns null when there is nothing to bill.
export function createInvoice(desk, { familyId, from, to = from, issued, dueDays, id, token, number }) {
  const rows = billable(desk, { familyId, from, to });
  if (!rows.length) return null;
  const s = invoiceSettings(desk.profile);
  const days = dueDays === undefined || dueDays === "" ? s.dueDays : Math.max(0, Math.round(num(dueDays)));
  const items = rows.map((r) => ({ key: r.key, bookingId: r.bookingId, date: r.date, start: r.start, end: r.end, lines: r.lines, amount: r.price }));
  return {
    id,
    number: number || nextInvoiceNumber(desk, issued.slice(0, 4), s.prefix),
    familyId, from, to, issued,
    due: addDays(issued, days),
    keys: items.map((i) => i.key),
    items,
    total: r2(items.reduce((a, i) => a + i.amount, 0)),
    payToken: token,
    status: "open",
  };
}

// Where an invoice stands now: paid and owed per sit, tips received, the balance.
export function invoiceStatus(desk, inv, today) {
  const L = ledgerIndex(desk);
  const items = (inv.items || []).map((it) => {
    const row = L.get(it.key);
    // A sit that was deleted or cancelled after the invoice went out owes nothing more.
    const paid = row ? r2(Math.min(row.paid, it.amount)) : 0;
    const owed = row ? r2(Math.max(0, Math.min(row.owed, it.amount - paid))) : 0;
    return { ...it, paid, owed, gone: !row };
  });
  const total = r2(items.filter((i) => !i.gone).reduce((a, i) => a + i.amount, 0));
  const paid = r2(items.reduce((a, i) => a + i.paid, 0));
  const balance = r2(items.reduce((a, i) => a + i.owed, 0));
  const ids = new Set(items.map((i) => i.bookingId));
  const received = [];
  for (const b of desk.bookings) if (ids.has(b.id)) for (const p of payments(b)) if (p.invoiceId === inv.id) received.push({ ...p, bookingId: b.id });
  const tips = r2(received.filter((p) => p.tip).reduce((a, p) => a + num(p.amount), 0));
  const daysPast = today ? daysBetween(inv.due, today) : 0;
  const state = inv.status === "void" ? "void" : balance <= 0.009 ? "paid" : daysPast > 0 ? "overdue" : paid > 0 ? "part paid" : "open";
  return { items, total, paid, balance, tips, received, daysPast, state };
}

// Record a payment against an invoice. The amount is spread over the invoice's sits
// that still owe, oldest first; anything over the balance stays on the last sit as
// income. A tip is its own entry. `ref` (a Stripe session id, a check number) makes it
// idempotent. Mutates the desk; returns the receipt id, or null if `ref` was seen.
export function recordInvoicePayment(desk, inv, { amount = 0, tip = 0, date, method = "", ref = "", stripe = "", receipt }) {
  amount = r2(Math.max(0, num(amount)));
  tip = r2(Math.max(0, num(tip)));
  if (!(amount > 0 || tip > 0)) throw new Error("Enter an amount");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error("Enter the date paid");
  const all = desk.bookings.flatMap((b) => payments(b));
  if (ref && all.some((p) => p.ref === ref)) return null;
  const rid = receipt || nextReceiptId(desk, inv);
  const st = invoiceStatus(desk, inv);
  const byId = new Map(desk.bookings.map((b) => [b.id, b]));
  const live = st.items.filter((i) => !i.gone && byId.has(i.bookingId));
  if (!live.length) throw new Error("The sits on this invoice were deleted");
  const base = { date, method, invoiceId: inv.id, receipt: rid, ...(ref ? { ref } : {}), ...(stripe ? { stripe } : {}) };
  const add = (bookingId, entry) => {
    const b = byId.get(bookingId);
    if (!Array.isArray(b.payments)) { b.payments = payments(b); delete b.paid; delete b.paidDate; }
    b.payments.push(entry);
  };
  let left = amount;
  const shares = new Map();
  for (const it of live) {
    if (left <= 0.009) break;
    const take = r2(Math.min(left, it.owed));
    if (take > 0) { shares.set(it.bookingId, r2((shares.get(it.bookingId) || 0) + take)); left = r2(left - take); }
  }
  if (left > 0.009) { const last = live.at(-1).bookingId; shares.set(last, r2((shares.get(last) || 0) + left)); }
  for (const [bookingId, a] of shares) add(bookingId, { amount: a, ...base });
  if (tip > 0) add(live[0].bookingId, { amount: tip, tip: true, ...base });
  return rid;
}

export function nextReceiptId(desk, inv) {
  const seen = new Set(desk.bookings.flatMap((b) => payments(b)).map((p) => p.receipt).filter(Boolean));
  let n = 1;
  while (seen.has(`${inv.number}-R${n}`)) n++;
  return `${inv.number}-R${n}`;
}

// Every payment as a receipt: entries sharing a receipt id are one receipt; a payment
// recorded before invoices existed is its own receipt.
export function receipts(desk) {
  const groups = new Map();
  for (const b of desk.bookings) payments(b).forEach((p, i) => {
    const id = p.receipt || `${b.id}-P${i + 1}`;
    if (!groups.has(id)) groups.set(id, { id, date: p.date, method: p.method || "", familyId: b.familyId, invoiceId: p.invoiceId || "", amount: 0, tip: 0, sits: [] });
    const g = groups.get(id);
    if (p.tip) g.tip = r2(g.tip + num(p.amount)); else g.amount = r2(g.amount + num(p.amount));
    if (!g.sits.includes(b.date)) g.sits.push(b.date);
  });
  return [...groups.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id.localeCompare(a.id));
}

// Money still owed, by how far past due it is. A sit on an open invoice is due on the
// invoice's due date; any other sit is due the day it happens. Only sits on or before
// today count, so the total always equals the sum of unpaid() in engine.mjs.
export function aging(desk, today) {
  const dueOf = new Map();
  for (const inv of liveInvoices(desk)) for (const k of inv.keys || []) dueOf.set(k, { due: inv.due, invoice: inv.number });
  const buckets = Object.fromEntries(AGING_BUCKETS.map(([k]) => [k, 0]));
  const rows = [];
  for (const b of desk.bookings) for (const row of occurrenceLedger(desk, b)) {
    if (row.date > today || row.owed <= 0.009) continue;
    const d = dueOf.get(row.key) || { due: row.date, invoice: "" };
    const past = daysBetween(d.due, today);
    const bucket = past <= 0 ? "current" : past <= 30 ? "d1_30" : past <= 60 ? "d31_60" : "d60p";
    buckets[bucket] = r2(buckets[bucket] + row.owed);
    rows.push({ ...row, due: d.due, invoice: d.invoice, daysPast: Math.max(0, past), bucket });
  }
  rows.sort((a, b) => b.daysPast - a.daysPast || a.date.localeCompare(b.date));
  const byFamily = {};
  for (const r of rows) byFamily[r.familyId] = r2((byFamily[r.familyId] || 0) + r.owed);
  return { buckets, total: r2(Object.values(buckets).reduce((a, x) => a + x, 0)), rows, byFamily };
}

// ---------- documents ----------

const famOf = (desk, id) => desk.families.find((f) => f.id === id) || { name: "", contactName: "", address: "" };
const sitter = (p) => (p.businessName ? `${p.businessName} (${p.name})` : p.name);
const when = (it) => `${it.date} ${it.start}-${it.end}`;

export function invoiceText(desk, inv, today) {
  const p = desk.profile, f = famOf(desk, inv.familyId), st = invoiceStatus(desk, inv, today);
  return [
    `Invoice ${inv.number} from ${sitter(p)}`,
    `For: ${f.name || f.contactName}`,
    `Issued ${inv.issued}, due ${inv.due}`,
    ``,
    ...st.items.map((it) => `${when(it)}  ${usd(it.amount)}${it.gone ? " (cancelled)" : ""}`),
    ``,
    `Total ${usd(st.total)}`,
    st.paid > 0 ? `Paid so far ${usd(st.paid)}` : "",
    `Balance due ${usd(st.balance)}`,
    ``,
    `How to pay:`,
    ...paymentInstructions(p).map((l) => `  ${l}`),
    `Thank you!`,
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
}

const PAGE_CSS = `body{font:15px/1.5 Georgia,"Times New Roman",serif;color:#222;background:#fff;max-width:44rem;margin:2rem auto;padding:0 1rem}h1{font-size:1.6rem;margin:0}table{width:100%;border-collapse:collapse;margin:1rem 0}td,th{text-align:left;padding:6px 4px;border-bottom:1px solid #ddd;vertical-align:top}.n{text-align:right;white-space:nowrap}.muted{color:#555;font-size:.9em}.tot td{border:0;font-weight:bold}.box{border:1px solid #bbb;border-radius:6px;padding:.6rem 1rem;margin:1rem 0}.paid{color:#1d6b35}button,.btn{font:inherit;padding:.6rem 1rem;min-height:44px;border-radius:6px;border:1px solid #9b3f68;background:#9b3f68;color:#fff;cursor:pointer}@media print{.noprint{display:none}body{margin:0}}`;

// The printable invoice. `payUrl` adds the family's pay link; `cardForm` (server only)
// is the HTML of the "Pay by card" form.
export function invoiceHTML(desk, inv, today, { payUrl = "", cardForm = "", printButton = true } = {}) {
  const p = desk.profile, f = famOf(desk, inv.familyId), st = invoiceStatus(desk, inv, today);
  const rows = st.items.map((it) => `<tr><td>${esc(when(it))}${it.gone ? ` <span class="muted">(cancelled)</span>` : ""}<div class="muted">${it.lines.map((l) => `${esc(l.label)}: ${usd(l.amount)}`).join("<br>")}</div></td><td class="n">${usd(it.amount)}</td></tr>`).join("");
  const how = paymentInstructions(p).map((l) => `<li>${esc(l)}</li>`).join("");
  const contact = [p.phone, p.email].filter(Boolean).map(esc).join(" · ");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Invoice ${esc(inv.number)}</title><style>${PAGE_CSS}</style></head><body>
<h1>Invoice ${esc(inv.number)}</h1>
<p><strong>${esc(sitter(p))}</strong>${p.address ? `<br>${esc(p.address)}` : ""}${contact ? `<br>${contact}` : ""}</p>
<p>Bill to: <strong>${esc(f.name || f.contactName)}</strong>${f.contactName && f.name ? `<br>${esc(f.contactName)}` : ""}</p>
<p>Issued ${esc(inv.issued)} · <strong>Due ${esc(inv.due)}</strong>${inv.from !== inv.to ? ` · Sits ${esc(inv.from)} to ${esc(inv.to)}` : ""}</p>
<table><thead><tr><th>Sit</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr class="tot"><td>Total</td><td class="n">${usd(st.total)}</td></tr>${st.paid > 0 ? `<tr><td>Paid so far</td><td class="n paid">-${usd(st.paid)}</td></tr>` : ""}<tr class="tot"><td>Balance due</td><td class="n">${usd(st.balance)}</td></tr>${st.tips > 0 ? `<tr><td class="muted">Tips received, thank you</td><td class="n muted">${usd(st.tips)}</td></tr>` : ""}</tfoot></table>
${st.state === "paid" ? `<p class="paid"><strong>Paid in full. Thank you!</strong></p>` : `<div class="box"><strong>How to pay</strong><ul>${how}</ul>${payUrl ? `<p>Pay online: <a href="${esc(payUrl)}">${esc(payUrl)}</a></p>` : ""}${cardForm}</div>`}
<p class="muted">Please include ${esc(inv.number)} with your payment. Prepared by the provider; keep it with your child-care records.</p>
${printButton ? `<p class="noprint"><button type="button" onclick="print()">Print or save as PDF</button></p>` : ""}
</body></html>`;
}

export function receiptHTML(desk, receiptId) {
  const r = receipts(desk).find((x) => x.id === receiptId);
  if (!r) return "";
  const p = desk.profile, f = famOf(desk, r.familyId);
  const inv = (desk.invoices || []).find((i) => i.id === r.invoiceId);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Receipt ${esc(r.id)}</title><style>${PAGE_CSS}</style></head><body>
<h1>Receipt</h1>
<p><strong>${esc(sitter(p))}</strong>${p.address ? `<br>${esc(p.address)}` : ""}</p>
<p>Receipt ${esc(r.id)} · ${esc(r.date)}</p>
<p>Received from <strong>${esc(f.name || f.contactName || "a family")}</strong>${r.method ? ` by ${esc(r.method)}` : ""}.</p>
<table><tbody><tr><td>Child care${inv ? `, invoice ${esc(inv.number)}` : ""} (sits on ${esc(r.sits.join(", "))})</td><td class="n">${usd(r.amount)}</td></tr>${r.tip ? `<tr><td>Tip</td><td class="n">${usd(r.tip)}</td></tr>` : ""}</tbody><tfoot><tr class="tot"><td>Total received</td><td class="n">${usd(r.amount + r.tip)}</td></tr></tfoot></table>
${inv ? `<p>Balance left on invoice ${esc(inv.number)}: ${usd(invoiceStatus(desk, inv).balance)}</p>` : ""}
<p class="muted">A record of a payment received, prepared by the provider. It is not tax advice.</p>
<p class="noprint"><button type="button" onclick="print()">Print or save as PDF</button></p>
</body></html>`;
}

// Keep payments the server recorded (card payments through the sitter's Stripe) when the
// app syncs a desk that has not seen them yet. Server first, like the other merges.
export function mergeInvoicePayments(serverDesk, incoming) {
  if (!incoming || !Array.isArray(incoming.bookings)) return incoming;
  const srv = new Map((serverDesk.bookings || []).map((b) => [b.id, b]));
  for (const b of incoming.bookings) {
    const s = b && srv.get(b.id);
    if (!s) continue;
    const have = new Set(payments(b).map((p) => p.stripe).filter(Boolean));
    const extra = payments(s).filter((p) => p.stripe && !have.has(p.stripe));
    if (!extra.length) continue;
    if (!Array.isArray(b.payments)) { b.payments = payments(b); delete b.paid; delete b.paidDate; }
    b.payments.push(...extra);
  }
  return incoming;
}
