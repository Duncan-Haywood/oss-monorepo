---
title: "A real Wells Fargo export through the bookkeeper: the reader held, four rows gained"
seo_title: "Wells Fargo CSV export in an AI bookkeeper: real-file test"
date: 2026-11-09
tags: [ai-bookkeeper, bookkeeping, wells-fargo, evaluation]
description: "The bookkeeper's headerless Wells Fargo reader had only hand-written fixtures. We ran it on a public real export: 71 of 71 rows read, 4 more debits suggested."
---

Until today the bookkeeper's Wells Fargo reader had been tested only on layouts written from memory. Wells Fargo's checking export has no header row (`"date","amount","*","","description"`), so a wrong guess fails quietly.

We found one real file on GitHub (71 rows, Jan to Mar 2026, one person's spending) and fetched it at run time without copying it into the repository. Results:

- The reader named it Wells Fargo and read **71 of 71 rows** with no problems. Purchases came out negative, deposits positive.
- Of 63 debits, the built-in keywords suggested an account for **10**. The misses that a business would care about were insurance premiums (`ALLSTATE INS CO INS PREM FEB 26`) and a gas utility (`CPENERGY ... ACH DR`). We added those descriptors; **14** now get a suggestion.
- The other 49 are household spending (groceries, streaming, fuel) and stay blank on purpose.

What this does not show: accuracy. The file has no labels, so we can say how many rows got a suggestion, not how many were right. The file is one person's personal account, not a business book. A labelled Wells Fargo business ledger is still wanted.

Code and tests: `ventures/ai-bookkeeper/wells-fargo-real.test.mjs` (the full 2,405-test suite passes).
