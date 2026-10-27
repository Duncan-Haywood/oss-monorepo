// Form 1099-K reconciliation. A card processor or marketplace (Stripe, Square,
// PayPal, Etsy, Amazon ...) files a 1099-K with the IRS that reports the GROSS
// payments it handled for you in the year: before refunds, before its fees,
// with any sales tax, tips and shipping the buyer paid included. A seller's
// books carry income net of refunds and fees, so the form and the books never
// agree, and the mismatch is what a notice or a preparer asks about.
//
// This takes the processor's own report (the same file `payouts` reads) and
// the box 1a amount (and optionally the twelve monthly boxes 5a-5l), and lays
// out the bridge: gross payments the report shows for the year, what the form
// says, the gap and what in the report could explain it, then what the books
// should show as sales if every payout was split (gross sales less refunds).
// Integer cents. The form's exact rules (what counts as a reportable
// transaction, thresholds, which date a transaction falls on) are the
// processor's and the IRS's: check the instructions for the year. Hand-written
// fixtures only; no real 1099-K has been tried. Not tax advice.

import { journal } from "./engine.mjs";
import { fmt } from "./ledger.mjs";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Pick the rows created in `year` and total them by month and kind.
function totals(report, year) {
  const rows = report.rows.filter((x) => x.created && x.created.startsWith(`${year}-`));
  const out = { gross: 0, refunds: 0, fees: 0, disputes: 0, other: 0, months: Array(12).fill(0), pendingGross: 0, outside: 0, undated: 0 };
  for (const x of report.rows) {
    if (!x.created) { if (x.kind === "sales" && x.gross > 0) out.undated += x.gross; continue; }
    if (!x.created.startsWith(`${year}-`) && x.kind === "sales" && x.gross > 0) out.outside += x.gross;
  }
  for (const x of rows) {
    if (x.kind === "sales" && x.gross > 0) {
      out.gross += x.gross;
      out.months[Number(x.created.slice(5, 7)) - 1] += x.gross;
      if (!x.payout) out.pendingGross += x.gross;
    } else if (x.kind === "refunds" || (x.kind === "sales" && x.gross < 0)) out.refunds += -x.gross;
    else if (x.kind === "fees") out.fees += x.fee || -x.gross;
    else if (x.kind === "disputes") out.disputes += -x.gross + x.fee;
    else if (x.kind === "other") out.other += x.gross;
    if (x.kind !== "fees") out.fees += x.kind === "sales" ? x.fee : 0;
  }
  return out;
}

// Will a 1099-K arrive at all? Payment-card processors (Stripe, Square) report
// every payment with no minimum. Third-party settlement organizations
// (marketplaces, PayPal, Venmo, Etsy) report only above $20,000 AND more than
// 200 transactions: P.L. 119-21 (2025) restored those figures as if the
// $5,000/$2,500/$600 phase-down had never happened (read on Publication 1099
// (2026), irs.gov/pub/irs-pdf/p1099.pdf, 2026-10-27: payment card transactions
// "All amounts", third party network transactions "More than $20,000 ... and more
// than 200"; the same text says a TPSO backs up only over those figures or if the
// payee had a reportable payment the year before). Backup withholding can force a
// form regardless.
export const TPSO_1099K = { gross: 2000000, count: 200 };
// Which rule a report's own format implies: PayPal, Etsy, eBay, Airbnb and Amazon are third-party
// settlement organizations (the $20,000 and 200 threshold); Stripe, Square and the rest are read as
// card processors. A Stripe Connect platform or a wallet on a card file is the caller's to say.
export const defaultProcessor = (report) => (["paypal", "etsy", "airbnb", "amazon", "ebay"].includes(report?.source) ? "marketplace" : "card");

export function reportable1099K(report, year, { processor = "card" } = {}) {
  const rows = report.rows.filter((x) => x.created && x.created.startsWith(`${year}-`) && x.kind === "sales" && x.gross > 0);
  const gross = rows.reduce((a, x) => a + x.gross, 0), count = rows.length;
  if (processor === "card") return { processor, gross, count, reportable: gross > 0, why: "A payment-card processor reports every card payment with no minimum." };
  if (processor !== "marketplace") throw new Error('processor must be "card" or "marketplace".');
  const over = gross > TPSO_1099K.gross && count > TPSO_1099K.count;
  return { processor, gross, count, reportable: over, why: over ? `${fmt(gross)} over ${count} payments is above $20,000 and 200, so a 1099-K is due.` : `${fmt(gross)} over ${count} payments is not above both $20,000 and 200 payments, so no 1099-K is required (the income is still taxable; backup withholding can still trigger a form).` };
}

// form: { gross (box 1a, cents), months?: [12 cents] (boxes 5a-5l) }
export function reconcile1099K(report, form, year, books = null, { sales = "4000" } = {}) {
  if (!Number.isInteger(year)) throw new Error("A year is needed, e.g. 2026.");
  if (!Number.isInteger(form?.gross) || form.gross < 0) throw new Error("The form's box 1a gross amount is needed, in dollars and cents.");
  const t = totals(report, year);
  const diff = form.gross - t.gross;
  const notes = [];
  const bridge = [
    { label: "Gross card payments in the processor report", cents: t.gross },
    { label: "Box 1a on the 1099-K", cents: form.gross },
    { label: "Form minus report", cents: diff },
  ];
  if (diff === 0) notes.push("The form and the report agree on gross payments for the year.");
  else {
    if (diff > 0) {
      notes.push(`The form is ${fmt(diff)} higher than the report's gross for ${year}. A report that starts after 1 January, ends before 31 December, or leaves out an account, a currency or a second processor profile is the usual cause; so is a processor counting sales tax, tips or shipping that the report shows apart.`);
      if (t.outside) notes.push(`The report also holds ${fmt(t.outside)} of gross created in other years; the form counts by the year a payment was made, so check the export's date range and time zone (a charge at 11 pm on 31 December can fall in the next year in UTC).`);
    } else {
      notes.push(`The report shows ${fmt(-diff)} more gross for ${year} than the form. Gross rows that are not reportable card payments (cash, invoices paid by bank transfer, peer-to-peer transfers marked personal) or a report that includes another year's late entries would do this; ask the processor which transactions the form leaves out.`);
    }
    if (t.refunds && Math.abs(diff) === t.refunds) notes.push("The gap equals the year's refunds exactly: the form is probably net of refunds, which is unusual (box 1a is gross), so confirm with the processor.");
    if (t.fees && Math.abs(diff) === t.fees) notes.push("The gap equals the year's fees exactly: the form may have been netted of fees, which box 1a does not do.");
  }
  if (t.undated) notes.push(`${fmt(t.undated)} of gross rows have no date and are left out of the year.`);
  if (t.pendingGross) notes.push(`${fmt(t.pendingGross)} of the year's gross has not been paid out yet; the form still counts it by payment date.`);
  let monthly = null;
  if (form.months) {
    if (form.months.length !== 12 || form.months.some((m) => !Number.isInteger(m))) throw new Error("The monthly boxes need twelve amounts, January to December.");
    monthly = form.months.map((f, i) => ({ month: MONTHS[i], form: f, report: t.months[i], diff: f - t.months[i] }));
    const sum = form.months.reduce((a, b) => a + b, 0);
    if (sum !== form.gross) notes.push(`The twelve monthly boxes add up to ${fmt(sum)} but box 1a says ${fmt(form.gross)}: one of them was mistyped.`);
    const off = monthly.filter((m) => m.diff !== 0).map((m) => m.month);
    if (off.length && off.length < 12) notes.push(`The months that differ: ${off.join(", ")}. A gap that sits in one month points to payments that fell on either side of a month end.`);
  }
  // What the books should hold. Refunds default to the sales account, so a fully
  // split year leaves sales = gross - refunds; fees and disputes sit in expenses.
  let ledger = null;
  if (books) {
    const lo = `${year}-01-01`, hi = `${year}-12-31`;
    let cr = 0;
    for (const e of journal(books)) if (e.date >= lo && e.date <= hi) for (const l of e.lines) if (l.account === sales) cr += l.credit - l.debit;
    const expected = form.gross - t.refunds;
    ledger = { account: sales, books: cr, expected, diff: cr - expected };
    if (cr === expected) notes.push(`Account ${sales} for ${year} equals the form's gross less the year's refunds (${fmt(expected)}).`);
    else notes.push(`Account ${sales} for ${year} shows ${fmt(cr)}; the form's gross less the year's refunds is ${fmt(expected)}, so ${fmt(Math.abs(cr - expected))} of ${cr < expected ? "payouts are not split into the books yet (run `payouts --apply`), or sales were booked another way" : "income is booked that the form does not show (cash or bank-transfer sales are not on a 1099-K and that is fine)"}.`);
  }
  return { year, form, report: { gross: t.gross, refunds: t.refunds, fees: t.fees, disputes: t.disputes, byMonth: t.months }, bridge, monthly, ledger, notes };
}
