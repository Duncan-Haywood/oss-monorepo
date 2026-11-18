// The VAT total in the VAT accounting currency (BT-111) beside the document's (BT-110).
//
// When the VAT accounting currency is the invoice currency (every SAR invoice under
// ZATCA, which asks for BT-111 in SAR; any UBL or CII file that repeats its tax in
// its own currency), BT-111 is the same tax written twice, so the two must agree.
// ZATCA's rule sets (EN 16931 cut and KSA rules, as this tool runs them) do not
// compare them: on 2026-11-12 a seeded BT-111 that differed from BT-110 passed
// every rule in 17 of 17 seeds (README, "BT-111 in the invoice's own currency").
// A file whose two figures
// disagree is reporting two different VAT totals, and whichever one the receiver
// books is wrong for one of them.
//
// A BT-111 in another currency needs the seller's exchange rate and is not checked.

import { parseDecimal } from "./numbers.mjs";

function cents(value) {
  const parsed = parseDecimal(value);
  return parsed === null ? null : Math.round(parsed * 100);
}

export function inspectAccountingCurrencyTax(invoice) {
  const totals = invoice && typeof invoice.totals === "object" && invoice.totals ? invoice.totals : null;
  if (!totals || totals.tax_accounting_currency === undefined || totals.tax_accounting_currency === null) return [];
  const repeat = cents(totals.tax_accounting_currency);
  const tax = cents(totals.tax);
  if (repeat === null || tax === null || repeat === tax) return [];
  const shown = (c) => (c / 100).toFixed(2);
  return [{
    rule: "INV-059",
    message: `The VAT total in the VAT accounting currency (BT-111, ${shown(repeat)}) differs from the document VAT total (BT-110, ${shown(tax)}) although both are in ${invoice.currency || "the invoice currency"}.`,
    fix: `Set the second VAT total to ${shown(tax)}, or correct the VAT breakdown if that is the wrong figure; the repair pass does this.`,
    path: "/totals/tax_accounting_currency",
  }];
}
