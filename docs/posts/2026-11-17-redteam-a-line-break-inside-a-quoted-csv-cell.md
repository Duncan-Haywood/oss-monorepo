---
title: "A line break inside a quoted CSV cell, and three tools that split it"
seo_title: "Multi-line CSV cells: why line-by-line feed parsing breaks"
date: 2026-11-17
tags: [redteam, csv, merchant-center, testing]
description: "A red-team run found a feed checker splitting one multi-line description into two broken items. Three tools fixed; CI now scans 156 CSV parsers."
---

The [Merchant Feed Check](https://marisstella.app/merchant-feed-check/) reads a Google Merchant
Center or Meta Catalog feed and lists the items that would be disapproved. Today a red-team run
seeded 28 faults into its engine and read the code the way a stranger's feed would.

## What the seeded faults showed

The suite caught 20 of the 28. The 8 it missed sat on boundaries: an `id` of exactly 50
characters, a `title` of exactly 150, a 20-character description, a 12-digit UPC-A barcode (only
13-digit EANs were tested), an image shared by exactly 5 items, and totals that leave out
feed-level errors such as duplicate ids. Six small tests now pin each boundary, and all 8 faults
fail the suite.

## The real defects

**A quoted line break split an item in two.** Shopify and Excel exports put multi-paragraph
descriptions in one quoted cell, and the CSV standard (RFC 4180) allows a line break inside quotes.
The checker cut the text into lines *before* reading the quotes. One product became two rows: the
real one, cut off partway through the description, and a phantom row starting mid-sentence that
reported every required field missing. A clean feed would come back with a page of errors.

**Google's own spelling was rejected.** Google's product data specification lists availability
as `in_stock` and `out_of_stock`. The checker accepted only the spaced form (`in stock`), so a feed
that followed Google's spec exactly got an error on every item. It now accepts both.

**A `null` in a JSON feed crashed the page** with a raw `TypeError`. It now says which item is
not an object.

## The same bug elsewhere

To find other parsers with the line-first shape, the run fed every exported `parseCsv`-style
function in the repository a header and one record whose quoted first field spans four lines.
Two of the parsers that split it were business tools that take free text: the
[deal pipeline tracker](https://marisstella.app/deal-keeper/) (deal names and next steps) and the
[cost-sharing calculator](https://marisstella.app/cost-sharing-calculator/). Both now parse the
whole text quote-aware, with a test each. deal-keeper's error lines now count the header, so
"Line 5" points at line 5 of the file. With those fixed, 137 of the 156 parsers keep the field
together.

The other 19 are mostly numeric-series tools (one number per cell) and id,date event lists, where
a multi-line cell is unlikely. They are on a known list in a new CI check,
`platform/ci/test_csv_quoted_newlines.py`. A new parser that splits a quoted line break fails the
pull request that adds it. A listed parser that gets fixed has to come off the list, so the list
can only get shorter.
