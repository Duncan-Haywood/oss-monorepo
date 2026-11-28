---
title: "We ran our e-invoice checker on 72 official German invoices and found six false positives"
seo_title: "72 official German invoices, six false positives in our checker"
date: 2026-10-25
updated: 2026-11-28
description: "The XRechnung test suite exposed six rules in our e-invoice checker that rejected valid invoices, from direct debits to extension third-party payments."
tags: [einvoice-preflight, evaluation, e-invoicing]
---

E-invoice Preflight checks invoices before they go to a customer or a tax
portal. Our built-in rules had only been run on the 41 EN 16931 examples, so we
fetched a second public corpus: the KoSIT XRechnung test suite, 72 valid German
invoices in UBL and CII. They pass the official validator, so anything our rules
flagged beyond placeholder data was our mistake.

All 72 drew a finding. Five were real false positives:

- **Payment means code 68** (online payment service) was called undocumented. We
  held 13 codes; the standard allows the whole UNCL 4461 list.
- **Direct debits** were asked for the seller's IBAN. A debit names the buyer's
  account, so the rule was wrong.
- **Zero-rated lines (category Z)** were asked for an exemption reason. The
  standard says there is none.
- **Rounding amounts** (BT-114) were left out of the amount due.
- **Prepayments above the invoice total** gave a negative amount due, which the
  standard allows and we refused. We now accept it only when the arithmetic is
  stated: gross minus prepaid plus rounding.

What is left is mostly placeholder data (fake VAT ids, a literal "[BIC]") and
rules we kept on purpose, such as the missing payment reference. Details and the
counts per rule are in the README. The rules still have not met a real ERP
export, which is the next test.

## The sixth, a month later (2026-11-28)

One amount-due finding stayed on the list as "the example's own doing". It
was ours. The suite's extension case 05.01a declares the XRechnung
*extension* (its BT-24 ends in `#conformant#urn:xeinkauf.de:kosit:extension:xrechnung_3.0`)
and lists two third-party payments: mobile payments of 19.96 and 10.00 that
the seller collects for other providers. The extension's group for them is
BG-DEX-09, written in UBL as `cac:PrepaidPayment`. KoSIT's rule BR-DEX-09
replaces the standard's BR-CO-16 in such a file: the amount due is gross,
minus prepaid, plus rounding, **plus** the third-party payments. So the
invoice's 366.86 is right (336.90 + 19.96 + 10.00). Our checker told the
seller to change it to 336.90, which would have broken a valid invoice.

The checker now applies BR-DEX-09 when BT-24 names the extension. In a
standard XRechnung, where the payments do not count, the finding says that,
not only "wrong total". With the XRechnung profile on, it also checks what
KoSIT checks on each payment: a type, an amount and a description, at most
two decimals, and the invoice's currency. We read the rules from KoSIT's own
Schematron (Apache-2.0) and did not copy it. The suite now has 72 files and
no amount-due findings at all. The six extension cases draw nothing from the
new rules. The one profile finding left there is real: a placeholder
Leitweg-ID whose check digits do not match.

If your invoice to a German buyer carries amounts you collect for another
provider, as the suite's mobile-payment example does ("Brutto-Forderung für
Fremdleistungen"), the extension is where XRechnung puts them, and the
amount due works differently there.

