---
title: "Drawing review: read a customer's part drawing PDF before you quote"
seo_title: "Machining drawing review: title block, tolerances and notes from a PDF"
date: 2026-11-25
tags: [for-customers, machine-shop-guides, jobshop-quote, quoting, drawings, first-article-inspection, lead-magnets]
description: "Drop a part drawing PDF: title block, revision table, general tolerances, notes and callouts read in your browser, and questions for the buyer. Free."
---

A machine shop quote starts with two documents: the buyer's email and the drawing. The email says what they want. The drawing says what you are on the hook for: the revision you will be inspected against, the general tolerance that covers every dimension without its own, the anodize masking in note 3, and the cert in note 2. A quote that misses one of them is the job that loses money.

The new **[drawing review](https://marisstella.app/machine-shop-guides/drawing-review.html)** reads that part for you. Drop the PDF (one exported from CAD, which has a text layer). It is read inside your browser tab. It is never uploaded and nothing is saved.

## What it pulls out

- **Title block:** part number, drawing number, revision, title, material, finish, scale, sheet and CAGE code. Each value shows the text it came from, and a value that doesn't look like that field (a date under "REV", a label under "MATERIAL") is left as "not found" rather than guessed.
- **Revision table:** the latest row, and a question when it disagrees with the title block. The invented sample drawing on the page has this built in: the title block says C, the table's last row is D.
- **General tolerance block:** tolerances by decimal places however they are written (`.XX ±.01`, `X.XX = ±0.01`, `2 PL ±.01`), angles including minutes (`±0°30'`), fractions, an ISO 2768 class, the units and the Y14.5 edition.
- **Notes:** numbered notes, including lines that wrap, each tagged by what it costs: finish or coating, heat treat, part marking, edge break, surface finish, inspection, certs and traceability, controlled data. A gap in the numbering (1, 2, 3, 5) is flagged, because it usually means your copy is missing a note.
- **Callouts in the views:** toleranced dimensions, limit dimensions, threads, holes, angles, reference dimensions, and the tightest tolerance among them.
- **Markings:** a distribution statement other than A, CUI, and ITAR or EAR warnings, each with the question to ask before you forward the drawing to a plater or heat treater.

What is missing or contradicts itself becomes a list of questions you can copy as one email to the buyer. The whole review downloads as a CSV.

## Straight into the first article

The callouts and notes open in the **[first article inspection checker](https://marisstella.app/machine-shop-guides/first-article-inspection.html)** as a starter characteristic list, with the title block's general tolerances already filled in. A bare `4.000` then reads as 3.995 to 4.005 and a bare `2.00` as 1.99 to 2.01 on the sample drawing. The list travels in the part of the link after `#`, which browsers never send to a server. Balloon order is still yours to set: the list comes out top to bottom as the text sits on the sheet.

## What it cannot do

It reads text, not geometry. A scanned drawing has no text, and some CAD exports draw dimensions as lines. In both cases the page says it found nothing and suggests asking for a PDF with text or the STEP model. It doesn't apply ISO 2768 tables by size. It reports the class and leaves the lookup to you. It also matches patterns rather than understanding the drawing, so check every value it shows against the drawing itself.

## Where this is going

This is the "drawing in" half of the RFQ-to-quote assistant we are building for small machine shops (not released yet; early access is on the [manufacturing page](https://marisstella.app/industries/manufacturing/)). With the [RFQ review](https://marisstella.app/machine-shop-guides/rfq-review.html), [stock size from the STEP file](https://marisstella.app/machine-shop-guides/stock-size-from-step-file.html) and the [quote calculator](https://marisstella.app/machine-shop-guides/job-shop-quote-calculator.html), the free tools already cover the whole path from the buyer's email to a priced quote, one step at a time. The paid product will join those steps up and learn each shop's own rates.

**Update, 2026-11-26.** In the quoting assistant, an RFQ's drawing now feeds the quote the same way: when the buyer's email gives only the part number and quantities, the material and finish are read from the drawing's title block and notes, and each one shows the drawing line it came from. A drawing PDF with no text in it, usually a scan, is now flagged on the RFQ ("no text read from it, likely a scan"). An empty part therefore never looks complete, and you know to read that sheet yourself.
