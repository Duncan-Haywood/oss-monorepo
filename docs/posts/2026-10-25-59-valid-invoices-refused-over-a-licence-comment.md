---
title: "59 valid e-invoices were refused because of a licence comment"
date: 2026-10-25
description: "Running einvoice-preflight over the ZUGFeRD corpus PDFs found it could open 40 of 126 valid files. The cause was a 4 KB sniff window."
tags: [einvoice, zugferd, testing]
---

einvoice-preflight unwraps Factur-X and ZUGFeRD PDFs to the XML inside and
checks that. Its tests used PDFs it built itself, so it had never met a real
one. The ZUGFeRD community corpus has 126 PDFs in its "correct" folders; we
ran all of them.

Only 40 opened. The tool decided whether an attachment was an invoice by
looking at the first 4,096 bytes for a `CrossIndustryInvoice` root. The
official samples begin with a licence comment longer than that, so the root
sat past the window and the PDF was refused as "no invoice inside". Another
five failed because one unrelated attachment would not decompress and took the
whole read down with it.

Fixing those two, and teaching the arithmetic checks that the MINIMUM and
BASIC WL profiles have no line items by design, took the count to 104 of 126
opened and 18 clean. The rest are mostly placeholder VAT ids and IBANs in the
samples, plus one real inconsistency (20 x 2.77 stated as 55.46). 24 files are
ZUGFeRD 1.0, an older layout the tool does not read, and now says so.

Still open: a few EXTENDED samples with header allowances where our totals
disagree with the file. Whether the sample or our handling is wrong is not
yet known. Details and the script (`eval/facturx-corpus.mjs`) are in the
einvoice-preflight README.
