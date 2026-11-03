---
title: "Why AT&T's bill slipped past a bookkeeping keyword"
seo_title: "Bank feeds write AT&T as ATT*BILL PAYMENT: categorising it"
date: 2026-11-03
tags: [bookkeeping, categorization, open-source]
description: "Card feeds drop the ampersand from AT&T, so an at&t keyword never fired. AI Bookkeeper now files ATT*BILL PAYMENT and ATT WIRELESS under phone and utilities."
---

AI Bookkeeper's built-in keyword layer knew "at&t". Bank and card feeds rarely print the ampersand: processors write `ATT*BILL PAYMENT`, and the line landed in the review queue with "nothing known". A probe of 15 common small-business descriptors found it was the only miss besides a Steam purchase.

The fix is two alternatives in the phone and utilities pattern: `att*` and `att` followed by bill, wireless, internet, mobility or u-verse. A bare `att` is not matched, so `ATTORNEY FEES` and `ATTIC INSULATION` stay out. Tests in `att-descriptor.test.mjs` cover both directions, and the 29 neighbouring categorizer tests still pass.

Limits: the 15 descriptors were written by hand, not taken from a real bank export, so this is one fix, not a measured gain in suggestion rate. Code is MIT in `ventures/ai-bookkeeper/`.
