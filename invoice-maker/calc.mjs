// Invoice maths in integer cents so totals never drift by a penny.
// Pure functions only: the page owns storage and rendering.

export const TERMS = {
  due_on_receipt: { label: "Due on receipt", days: 0 },
  net7: { label: "Net 7", days: 7 },
  net15: { label: "Net 15", days: 15 },
  net30: { label: "Net 30", days: 30 },
  net45: { label: "Net 45", days: 45 },
  net60: { label: "Net 60", days: 60 },
};

export function toCents(value) {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100 + (n < 0 ? -1e-9 : 1e-9));
}

export function fromCents(cents) {
  return Math.round(cents) / 100;
}

export function formatMoney(cents, currency = "USD", locale = "en-US") {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return (cents / 100).toFixed(2);
  }
}

// Round a percentage of an integer-cent amount half away from zero.
export function percentOf(cents, pct) {
  const raw = (cents * (Number(pct) || 0)) / 100;
  return Math.sign(raw) * Math.round(Math.abs(raw) + 1e-9);
}

export function lineAmount(line) {
  const qty = Number(line.qty);
  const rate = toCents(line.rate);
  if (!Number.isFinite(qty)) return 0;
  return Math.round(qty * rate + (qty * rate < 0 ? -1e-9 : 1e-9));
}

// totals: subtotal, discount, taxable, tax, total, deposit/paid, balance.
// Discount is applied before tax. Lines flagged taxable:false are excluded
// from the tax base; a percentage discount reduces the taxable base pro rata.
export function computeTotals(inv) {
  const lines = (inv.lines || []).map((l) => ({ ...l, amount: lineAmount(l) }));
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  let discount = 0;
  if (inv.discountType === "percent") discount = percentOf(subtotal, inv.discountValue);
  else if (inv.discountType === "amount") discount = Math.min(toCents(inv.discountValue), Math.max(subtotal, 0));
  discount = Math.min(discount, Math.max(subtotal, 0));
  const taxableLines = lines.filter((l) => l.taxable !== false).reduce((s, l) => s + l.amount, 0);
  const taxableBase = subtotal > 0 ? Math.max(0, taxableLines - Math.round((discount * taxableLines) / subtotal)) : 0;
  const tax = percentOf(taxableBase, inv.taxRate);
  const shipping = toCents(inv.shipping);
  const total = subtotal - discount + tax + shipping;
  const paid = Math.max(0, toCents(inv.paid));
  return { lines, subtotal, discount, taxableBase, tax, shipping, total, paid, balance: total - paid };
}

export function parseDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}

export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const d = parseDate(iso);
  if (!d) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

export function dueDate(issued, termsKey, customDays) {
  const days = termsKey === "custom" ? Math.max(0, Math.floor(Number(customDays) || 0)) : (TERMS[termsKey] || TERMS.net30).days;
  return addDays(issued, days);
}

export function daysBetween(fromIso, toIso) {
  const a = parseDate(fromIso), b = parseDate(toIso);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000);
}

// Late fee from a flat fee and/or a monthly percentage, charged on the unpaid
// balance. Whole months overdue (30-day blocks) -- the usual contract wording.
// This only prices the clause the user wrote; legality caps vary by state.
export function lateFee(balanceCents, daysOverdue, { flat = 0, monthlyPct = 0 } = {}) {
  if (balanceCents <= 0 || daysOverdue <= 0) return { fee: 0, months: 0 };
  const months = Math.ceil(daysOverdue / 30);
  const fee = toCents(flat) + percentOf(balanceCents, (Number(monthlyPct) || 0) * months);
  return { fee, months };
}

export function status(inv, today) {
  const t = computeTotals(inv);
  if (inv.void) return "void";
  if (t.total > 0 && t.balance <= 0) return "paid";
  if (inv.sent) {
    if (inv.due && today && inv.due < today) return "overdue";
    return t.paid > 0 ? "partial" : "sent";
  }
  return "draft";
}

export function nextNumber(invoices, prefix = "INV-") {
  let max = 0, width = 4;
  for (const i of invoices) {
    const m = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`).exec(i.number || "");
    if (m) { max = Math.max(max, +m[1]); width = Math.max(width, m[1].length); }
  }
  return prefix + String(max + 1).padStart(width, "0");
}

export function duplicateNumbers(invoices) {
  const seen = new Map();
  for (const i of invoices) if (i.number) seen.set(i.number, (seen.get(i.number) || 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([k]) => k);
}

// Receivables across all saved invoices, aged from the due date.
export function receivables(invoices, today) {
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  const byClient = {};
  let outstanding = 0, paidYtd = 0;
  for (const inv of invoices) {
    const st = status(inv, today);
    const t = computeTotals(inv);
    if (st === "paid" && (inv.issued || "").slice(0, 4) === today.slice(0, 4)) paidYtd += t.total;
    if (st === "draft" || st === "void" || st === "paid") continue;
    outstanding += t.balance;
    const late = Math.max(0, daysBetween(inv.due || inv.issued, today));
    const key = late === 0 ? "current" : late <= 30 ? "d1_30" : late <= 60 ? "d31_60" : late <= 90 ? "d61_90" : "d90plus";
    buckets[key] += t.balance;
    const c = inv.clientName || "(no client)";
    byClient[c] = (byClient[c] || 0) + t.balance;
  }
  return { outstanding, paidYtd, buckets, byClient };
}

function csvCell(v) {
  const s = String(v ?? "");
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; // spreadsheet formula injection
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function invoicesToCsv(invoices, today) {
  const head = ["Number", "Client", "Issued", "Due", "Status", "Subtotal", "Discount", "Tax", "Total", "Paid", "Balance"];
  const rows = invoices.map((i) => {
    const t = computeTotals(i);
    return [i.number, i.clientName, i.issued, i.due, status(i, today), ...[t.subtotal, t.discount, t.tax, t.total, t.paid, t.balance].map((c) => (c / 100).toFixed(2))];
  });
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

// Plain-language payment-terms sentence printed on the invoice.
export function termsSentence(inv, feeClause = {}) {
  const base = inv.terms === "due_on_receipt" ? "Payment is due on receipt." : `Payment is due within ${inv.terms === "custom" ? Math.floor(Number(inv.customDays) || 0) : (TERMS[inv.terms] || TERMS.net30).days} days of the invoice date${inv.due ? ` (by ${inv.due})` : ""}.`;
  const parts = [];
  if (toCents(feeClause.flat) > 0) parts.push(`a flat late fee of ${formatMoney(toCents(feeClause.flat))}`);
  if (Number(feeClause.monthlyPct) > 0) parts.push(`${Number(feeClause.monthlyPct)}% per month on the unpaid balance`);
  return parts.length ? `${base} Overdue balances may be charged ${parts.join(" plus ")}.` : base;
}

export function validate(inv) {
  const out = [];
  if (!inv.number) out.push("Add an invoice number: most clients' accounts-payable teams need one to pay.");
  if (!inv.clientName) out.push("Add the client name.");
  if (!inv.issued) out.push("Add the issue date.");
  if (!(inv.lines || []).some((l) => String(l.desc || "").trim() && lineAmount(l) !== 0)) out.push("Add at least one line item with a description and an amount.");
  if (inv.issued && inv.due && inv.due < inv.issued) out.push("The due date is before the issue date.");
  if (Number(inv.taxRate) < 0 || Number(inv.taxRate) > 100) out.push("Tax rate should be between 0 and 100.");
  if (!inv.fromName) out.push("Add your business name so the client knows who to pay.");
  if (!inv.payInstructions) out.push("Add payment instructions (bank transfer, Zelle, check payee, payment link): invoices without them are paid later.");
  return out;
}

// Reads a #handoff=... fragment written by Freelance Proposal Maker. Returns
// only whitelisted, string-typed fields, or null if the fragment is not ours.
export function parseHandoff(hash, section, fields) {
  const m = /^#?handoff=(.+)$/.exec(String(hash ?? ""));
  if (!m) return null;
  let obj;
  try { obj = JSON.parse(decodeURIComponent(m[1])); } catch { return null; }
  if (!obj || obj.v !== 1 || obj.from !== "freelance-proposal-maker" || !obj[section] || typeof obj[section] !== "object") return null;
  const out = {};
  for (const k of fields) if (obj[section][k] !== undefined && obj[section][k] !== null) out[k] = String(obj[section][k]).slice(0, 4000);
  const lines = Array.isArray(obj[section].lines) ? obj[section].lines.slice(0, 20).map((l) => ({ desc: String(l?.desc ?? "").slice(0, 300), qty: String(l?.qty ?? 1).slice(0, 12), rate: String(l?.rate ?? "").slice(0, 20) })) : null;
  if (lines && fields.includes("lines")) out.lines = lines;
  return Object.keys(out).length ? out : null;
}
