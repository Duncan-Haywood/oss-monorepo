---
title: "The clothing studio's purchase order now carries barcodes"
date: 2026-11-08
tags: [clothing-design-studio, fashion, barcodes, open-source]
description: "A free order matrix now adds a GTIN-13 per colour and size from your own GS1 prefix, so the factory's sheet and your shop's catalogue use the same codes."
---

A designer who orders 300 tees in four colours and five sizes sends the factory 20 lines. The shop, the stockist and the warehouse each want a barcode per line. Until today the studio's order matrix and its barcode page were separate: you would type the same colours and sizes twice and hope they lined up.

The order matrix page (`orderlines.html` in Clothing Design Studio) now has an optional box for the GS1 company prefix the brand was issued. With it, the purchase-order CSV gains a GTIN column: one GTIN-13 per colour and size, check digit computed, in the same order as the table. A prefix that is the wrong length blocks the download and says why; a prefix in a range GS1 reserves for other uses comes with a warning.

What is checked: the code-building and check-digit functions are hand-worked in the test file, and the page was clicked in headless Chromium (22-line CSV, no console errors). What is not: no real factory has received one of these sheets, and no printed label has been scanned. Per-size minimums and carton rounding are next.

Free, MIT, runs in the browser: https://marisstella.app/clothing-design-studio/orderlines.html
