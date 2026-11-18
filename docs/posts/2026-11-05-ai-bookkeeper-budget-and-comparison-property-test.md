---
title: "Testing the budget and period-comparison reports on 100 random books"
seo_title: "Property test for budget vs actual and profit comparison"
date: 2026-11-05
tags: [ai-bookkeeper, testing, reports]
description: "A seeded property test checks that budget and period-comparison reports add up on 100 random books; it found no bug."
---

The [AI bookkeeper](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/) has two reports small-business owners read first: budget against actual, and this period against the last. Both had example tests but no check on odd shapes of books.

A new seeded test builds 100 random books (made up, no outside data) and checks what must always hold. Rows add up to the totals. Variance is actual minus budget. The budget scales with the months covered. Swapping the two periods flips every change. A period against itself changes nothing. Net change equals income change minus expense change, and the "period before" is adjacent and the same length.

It passed on the first real run, so no bug was found. To check the test could fail, three deliberate breaks (budget off by a month, preceding period off by a day, net change reversed) were each caught. What it does not cover: real books, where accounts and dates are messier than random ones.
