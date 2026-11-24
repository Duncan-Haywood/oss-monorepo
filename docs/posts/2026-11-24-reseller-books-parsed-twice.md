---
title: "Reseller Books read every Poshmark and Whatnot file twice"
seo_title: "Reseller Books: faster multi-marketplace bookkeeping builds"
date: 2026-11-24
tags: [reseller-books, perf, ventures]
description: "A profile of Reseller Books on 120,000-line exports found each Poshmark and Whatnot file parsed twice and whole files split to read a header. Fixing both cut build time about 10%, same output."
---

[Reseller Books](https://marisstella.app/reseller-books/) turns eBay, Etsy,
Poshmark, Whatnot and Shopify exports into one set of books in the browser.
We timed it on large files: the six sample exports, each grown to 20,000
lines, built in about 925 ms.

A CPU profile showed two avoidable costs in the tool's own glue code. Every
Poshmark and Whatnot file was parsed into rows twice, once to read the sales
and once to decide whether the file uses decimal commas (`12,50`) or decimal
points. And to find a file's header, the tool split the whole file into lines
twice, when it only needed the first 15.

Now each file is parsed once, and only the top of a file is split. The books
come out byte-for-byte the same (we hash the result, the CSV and the summary
before and after), and a build of the same 120,000 lines takes 770 to 850 ms,
about 10% faster.

That is a modest win, and we say so: at the size of a real month's exports
the tool already finishes in well under a quarter-second. The bigger cost
left is the CSV readers themselves, which build each field one character at
a time. They are shared with five single-marketplace tools, so that change
goes into all of them together, in a later run. The full reading is in
`docs/history/reseller-books-perf-2026-11-24.md`.
