// Cash-basis profit and loss for books that carry invoices and bills.
//
// The ledger books an invoice or bill when it is dated (accrual). Many small
// businesses and almost all US sole proprietors file on the cash method: income
// counts when the money arrives, an expense when it is paid. This module redraws
// the profit and loss that way from the same books, nothing is rewritten.
//
// Each payment recognises its share of the document's income and expense lines,
// dated on the bank line (a part-payment recognises a part; the last payment takes
// the rounding). A credit note applied to an invoice shrinks what the invoice
// recognises; one nobody applied counts on the day it is refunded. A write-off or
// a bill the supplier forgave never counts (no money moved). Exchange differences
// are left out: a foreign document is recognised at its booked rate.
// Pure functions, no DOM, no network.

import { journal } from "./engine.mjs";
import { profitAndLoss } from "./ledger.mjs";
import { settle, AR, AP } from "./accruals.mjs";

const DOC_SOURCES = new Set(["invoice", "bill", "credit", "writeoff", "fx"]);

// -> { profitAndLoss, accrual, timing, notes }
//   timing.net: accrual net profit less cash net profit over the same dates
//   (positive: sales invoiced but not collected outweigh bills not yet paid).
export function cashBasis(booksIn, { from = null, to = null } = {}) {
  const books = settle(JSON.parse(JSON.stringify(booksIn)));
  const docs = books.documents ?? [];
  const accrualEntries = journal(books);
  const dateOf = new Map(books.transactions.map((t) => [t.id, t.date]));
  const entries = accrualEntries.filter((e) => !DOC_SOURCES.has(e.source));
  const notes = [];

  // Add `lines` (account -> cents in the document's direction) as one entry.
  const emit = (id, date, memo, invoice, amounts) => {
    const lines = [];
    let ctl = 0;
    for (const [account, cents] of amounts) {
      if (!cents) continue;
      // An invoice's lines are credits (income), a bill's debits (expense); negative flips.
      const credit = invoice ? cents > 0 : cents < 0;
      lines.push({ account, debit: credit ? 0 : Math.abs(cents), credit: credit ? Math.abs(cents) : 0 });
      ctl += cents;
    }
    if (!lines.length) return;
    // The receivable (payable) side, so the entry balances.
    const down = invoice ? ctl > 0 : ctl < 0;
    lines.push({ account: invoice ? AR : AP, debit: down === invoice ? Math.abs(ctl) : 0, credit: down === invoice ? 0 : Math.abs(ctl) });
    entries.push({ id, date, memo, source: "cash", lines });
  };

  const foreign = new Set();
  const writtenOff = [];
  for (const d of docs.filter((x) => !x.credit)) {
    if (d.currency) foreign.add(d.number);
    if (d.writtenOff) writtenOff.push(d.number);
    const net = d.total - (d.credited ?? 0);
    if (net <= 0) continue;
    const invoice = d.kind === "invoice";
    // Income (or expense) per account, with the credit notes applied to this document taken off.
    const totals = new Map();
    for (const l of d.lines) totals.set(l.account, (totals.get(l.account) ?? 0) + l.cents);
    for (const c of docs.filter((x) => x.credit && x.kind === d.kind && x.against === d.number && x.applied > 0)) {
      for (const l of c.lines) totals.set(l.account, (totals.get(l.account) ?? 0) - Math.round((l.cents * c.applied) / c.total));
    }
    const paid = (d.payments ?? []).map((p) => ({ date: dateOf.get(p.line) ?? d.date, cents: p.cents })).sort((a, b) => a.date.localeCompare(b.date));
    const done = new Map();
    let cum = 0;
    for (const p of paid) {
      cum += p.cents;
      const share = [];
      for (const [account, total] of totals) {
        const target = cum >= net ? total : Math.round((total * cum) / net);
        share.push([account, target - (done.get(account) ?? 0)]);
        done.set(account, target);
      }
      emit(`CASH-${d.id}-${p.date}`, p.date, `${invoice ? "Invoice" : "Bill"} ${d.number}, ${d.party}: paid ${p.date}`, invoice, share);
    }
  }
  // A credit note nobody applied counts on the day it is refunded, in its own direction.
  for (const c of docs.filter((x) => x.credit && x.refund)) {
    const t = dateOf.get(c.refund.line) ?? c.date;
    const share = c.lines.map((l) => [l.account, -Math.round((l.cents * c.refund.cents) / c.total)]);
    emit(`CASH-${c.id}`, t, `${c.kind === "invoice" ? "Credit note" : "Vendor credit"} ${c.number}, ${c.party}: refunded ${t}`, c.kind === "invoice", share);
  }

  if (foreign.size) notes.push(`Foreign-currency documents (${[...foreign].sort().join(", ")}) are recognised at their booked rate; exchange differences are left out.`);
  if (writtenOff.length) notes.push(`Written-off or forgiven documents (${writtenOff.sort().join(", ")}) never count: no money moved.`);
  const cash = profitAndLoss(entries, books.accounts, { from, to });
  const accrual = profitAndLoss(accrualEntries, books.accounts, { from, to });
  return { profitAndLoss: cash, accrual, timing: { net: accrual.net - cash.net, income: accrual.totalIncome - cash.totalIncome, expense: accrual.totalExpense - cash.totalExpense }, notes };
}
