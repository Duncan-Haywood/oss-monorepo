---
title: "Our e-invoice repair changed 69 valid invoices. Now it changes 2."
seo_title: "E-invoice repair that leaves valid invoices alone (EN 16931)"
date: 2026-11-14
tags: [einvoice-preflight, ventures]
description: "Run over 529 real, valid UBL, CII and Factur-X files, our e-invoice repair changed 69 and the amount due on 53. Why, and what a repair must leave alone."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) has a repair button. Give it a UBL, CII or Factur-X invoice whose sums don't add up and it recomputes the line totals, VAT and amount due in place, editing nothing but amounts. Until today it had only been tested on invoices we wrote ourselves.

So we ran it over 529 real test files from four public suites: the ZUGFeRD community corpus, the Mustang project, KoSIT's XRechnung test suite and the CEN EN 16931 examples. Nearly all of them pass the official validators. A repair has no business changing any of them.

**It changed 69, and moved the amount due on 53.**

## What went wrong

Every cause was in our code. None was in the files.

**It trusted quantity x price over everything else.** KoSIT's car-insurance sample bills a premium of 80.00 with a net price of 67.2244. That is 80.00 less 19% insurance tax, and the price is there for information. The line net, the tax breakdown and the total all say 80.00. Our repair decided the line "should" be 67.22 and cut the amount due from 220.00 to 184.87. EN 16931 has no rule that a line net equals quantity x price (Peppol adds one; the European standard and XRechnung don't). When the header totals agree with the line nets, they back the nets up. A mismatch then points at the price or the quantity, and only a person can say which.

**It rewrote rounding cents the standard allows.** Sellers round VAT line by line, so a VAT total can come out a cent away from taxable amount x rate. EN 16931 accepts a gap of up to one currency unit (rules BR-CO-17 and BR-S-09). KoSIT's minimal test states 757.41 where 3,986.34 x 19% gives 757.40, and the official rules accept it. We "fixed" it.

**Three smaller ones.** Hungarian VAT stated in whole forints (our checker already allowed this, but the repair did not). ZUGFeRD EXTENDED sub-invoice lines, where a group line repeats the sum of its detail lines, so adding every line counts them twice. And XRechnung's third-party payments, which legitimately make the amount due differ from the invoice total.

## The rule we use now

A repair should change only values the official rules reject. Concretely:

- If the line nets add up to the stated line total, keep them. List each line that disagrees with quantity x price so a person can check the price.
- If a VAT amount is within a cent per line of taxable amount x rate, keep it.
- If the file has a structure the repair doesn't model (sub-invoice lines, third-party payments), don't recompute it, and say why.

After the change, 2 of the 529 files are still changed, and neither was valid before: one has a four-decimal line net, and one states 200 as the sum of two lines of 1,000. No amount due moves.

## Real PDFs, read back by someone else's code

A Factur-X invoice is a PDF with the XML attached. The repair appends a new copy of the XML as an incremental update and leaves every original byte as it was. To test that on real files, we took the 179 real Factur-X and ZUGFeRD PDFs in the corpus and Mustang that the repair leaves alone. We pushed the tax total in each one's XML up by 7.00 and had qpdf write each PDF twice, once with a classic cross-reference table and once with object streams. That gave 358 seeded PDFs to repair.

- qpdf's syntax check passed all 358 repaired PDFs, and every page count was unchanged.
- In 248, the XML that qpdf read back was the original file, byte for byte.
- The other 110 were declined, with the reason printed. Most have header allowances, which the CII repair does not recompute yet.
- None came back with a wrong value.

On the way we found one more bug. A sample from GnuAccounting starts its XML with a UTF-8 byte-order mark, and our repair silently dropped those three bytes. That's fixed now.

## What's still open

These are test-suite samples, not a business's own exports. The PDF check ran on qpdf's two layouts rather than on each producer's original bytes, and we have not run veraPDF to confirm the files are still PDF/A-3. The method and every number are in [`eval/repair-real-files-2026-11-14.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/einvoice-preflight/eval/repair-real-files-2026-11-14.md). Both scripts run against your own checkouts of the suites.

*E-invoice preflight is free and open source (MIT). It checks and repairs files locally and submits nothing. It is not tax or legal advice: check every repaired invoice against your own records before you send it.*
