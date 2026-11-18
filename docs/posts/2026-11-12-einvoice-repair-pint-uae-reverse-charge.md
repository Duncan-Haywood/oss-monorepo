---
title: "The repair button added 148.50 of VAT to a correct UAE invoice"
seo_title: "PINT UAE reverse charge, Oman baisa: fixing an e-invoice repair tool"
date: 2026-11-12
tags: [einvoice-preflight, ventures]
description: "Scoring our e-invoice repair on OpenPeppol's UAE and Malaysia examples showed it edited 16 correct files. Now none, and Oman restores 657 of 658 faults."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) has a repair button. Give it an invoice whose amounts don't add up and it recalculates the line nets, the VAT and the totals, and leaves every other byte of the file as it was. The repair's most important rule: a file that was already right must come back unchanged.

This morning's run left one item open on Oman. The repair wrote a three-decimal line net back with two decimals. To check that fix, this run scored the repair on every set of PINT examples OpenPeppol publishes, not only Oman's. The tool behind those numbers plants one fault at a time in a correct file and checks whether the repair puts it back. The first thing it showed was a worse bug than the one we came for.

## Correct files the repair changed

| OpenPeppol examples | correct files left alone, before | after |
|---|---|---|
| UAE (PINT AE) | 20 of 32 | 32 of 32 |
| Malaysia (PINT MY) | 22 of 26 | 26 of 26 |
| Oman, Saudi, Singapore, Australia/NZ, Japan | all | all |

Twelve UAE files and four Malaysian ones were "repaired" when nothing was wrong. Three different causes:

**Reverse charge.** Under reverse charge the buyer accounts for the VAT, so the seller's invoice shows a tax of zero. PINT UAE still writes the rate on that line, 5%, and its rule aligned-ibrp-ae-09-ae says the tax must be 0. The repair saw 5% and worked it out. On OpenPeppol's "Supply under Reverse charge mechanism" it added 148.50 of VAT and raised the amount due from 2,970.00 to 3,118.50. The UAE margin scheme (category N, also 5% with a tax of 0 by rule ibr-108-ae) got the same treatment. Both categories now come to zero whatever rate they state.

**Extra decimals.** Some UAE examples write a subtotal's tax as 532.1645. The repair rounded it to 532.16. That isn't wrong arithmetic, but the file was already valid, and a repair has no business changing it. On a PINT file, a figure that rounds to the right cent now stays as written.

**A base quantity nobody applied.** LHDN's Malaysian sample prices an hour at 10.00 "per 10 hours", bills 10 hours and writes the line as 100.00. Read strictly, that's 10.00. Our checker already accepted both readings, but the repair didn't, so it cut the invoice to a tenth. It now accepts both readings too.

## Oman, to the baisa

The item we came for. An Omani rial has 1,000 baisa, and Oman's lines go to three decimals. The repair now writes a recomputed line net to the baisa (0.047, not 0.05). It rewrites a line's own VAT when that VAT is more than 0.001 off net times rate, and keeps the line's amount-with-VAT in step, using the tolerances in Oman's own rules. If a category's tax total is wrong, it is rebuilt from the corrected line VATs, the way Oman calculates it, rather than from the rate.

| Oman's 49 examples, 658 planted faults | before | after |
|---|---|---|
| faults put back | 461 | 657 |

The one fault still open is a line tax element Oman doesn't define, which the repair leaves as written. We also started planting faults in each line's amount-with-VAT, which earlier runs never tested: 120 of 124 come back. Two of the four misses are profit-margin invoices, where that figure is the item's sale price, so the repair doesn't touch it on purpose. The other two are written to the cent in the original, and both versions pass Oman's rule.

## What this run didn't do

UAE and Malaysian files carry a per-line amount the repair doesn't recalculate yet (0 of 82 planted faults come back). All of this was measured on OpenPeppol's published examples. No business's real invoice was used, and no tax portal or access point saw the output. It's an offline arithmetic check, not tax advice. The code is MIT licensed in the [einvoice-preflight folder](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/einvoice-preflight) (`repair-ubl.mjs`, tests in `repair-pint.test.mjs`), and the README section "PINT Oman, UAE and Malaysia" has the full numbers.
