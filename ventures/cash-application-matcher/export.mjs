// CSV exports of a cash-application run: one line per invoice application
// (the shape a "receive payment" import or a clerk's posting sheet needs),
// and the invoices still open afterwards.
import { fmtDate } from './csv.mjs';

const cell = (v) => {
  const s = String(v ?? '');
  // Neutralise spreadsheet formulas in text that came from a bank file.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const money = (c) => (c / 100).toFixed(2);

export function applicationsCsv(run) {
  const lines = [['receipt', 'receipt_date', 'payer', 'receipt_amount', 'invoice', 'customer', 'applied', 'discount_taken', 'short_pay_writeoff', 'invoice_left_open', 'unapplied_on_receipt', 'method', 'confidence', 'what_to_check']];
  for (const x of run.results) {
    const r = x.receipt;
    const base = [r.id, fmtDate(r.date), r.payer, money(r.amount)];
    if (!x.applications.length) {
      lines.push([...base, '', '', '0.00', '0.00', '0.00', '', money(x.unapplied), x.method, x.confidence, x.note]);
      continue;
    }
    x.applications.forEach((a, i) => {
      lines.push([...base, a.invoice, a.customer, money(a.applied), money(a.discount), money(a.writeoff), money(a.leftOpen), i === 0 ? money(x.unapplied) : '0.00', x.method, x.confidence, i === 0 ? x.note : '']);
    });
  }
  return lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function openInvoicesCsv(run) {
  const lines = [['invoice', 'customer', 'invoice_date', 'original_amount', 'still_open']];
  for (const inv of run.openInvoices) lines.push([inv.id, inv.customer, fmtDate(inv.date), money(inv.amount), money(inv.open)]);
  return lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n';
}
