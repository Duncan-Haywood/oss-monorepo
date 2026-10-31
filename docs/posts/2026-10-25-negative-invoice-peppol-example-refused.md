---
title: "The official Peppol negative-invoice example was rejected by our e-invoice checker"
seo_title: "The official Peppol negative-invoice example failed our checker"
date: 2026-10-25
description: "einvoice-preflight on Peppol BIS 3.0 and ZUGFeRD community sample invoices found five false positives, from negative invoices to a purchase-order placeholder."
tags: [e-invoicing, peppol, testing]
---

`einvoice-preflight` checks UBL, CII and Factur-X invoices before you send
them. A checker that cries wolf on valid invoices gets ignored, so we ran it
over documents that other validators already accept: the OpenPEPPOL BIS Billing
3.0 examples and the ZUGFeRD community corpus (read, not copied).

Five rules were wrong:

- **Negative invoices.** Peppol's own "negative invoice correction" example has
  a negative net, tax, gross and header charge. We required all of them to be
  non-negative. They now keep their sign and the arithmetic is still checked.
- **Negative prepaid amounts**, as in a German insurance invoice, are accepted
  when the amount due follows from them.
- **Document type codes.** We knew nine of the UNCL 1001 codes; valid files use
  204, 387, 575, 877 and more.
- **Purchase order `NA`.** Peppol says to write `NA` when only a sales order
  exists. We called it a placeholder.
- **A malformed IBAN** was reported as a missing one, hiding the real message.

What remains on those files is placeholder data (fake VAT ids and IBANs) and
a few line totals that really do not equal quantity times price. The sample
files are test data, not real company invoices, so this says little about
your own ERP's output; that check is still open.
