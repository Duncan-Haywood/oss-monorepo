---
title: "A random test found two bugs in how ai-bookkeeper sells an asset"
date: 2026-10-27
description: "700 made-up assets and disposals showed ai-bookkeeper booking too little depreciation before a sale, and a cash-flow statement that did not tie."
tags: [ai-bookkeeper, accounting, testing]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) books depreciation monthly through the latest date in the books. A new seeded property test (`assets-property.test.mjs`, 700 random assets, nothing copied from anywhere) checks that every journal entry balances, that a full schedule writes off exactly cost less salvage, and that a disposal clears accumulated depreciation.

It failed at once. The latest date ignored the disposal date, so an asset sold after the last bank line had depreciation booked only to the earlier date, while the disposal entry removed the full amount used. Accumulated depreciation went negative. Fixing that broke an existing cash-flow test, which turned out to be passing because of the first bug: the cash-flow statement skipped the accumulated-depreciation line whenever it netted to zero, so the depreciation add-back and disposal loss were never taken out of investing. Both are fixed; the full suite (1,600 tests) passes.

Still checked only against made-up books, not a real fixed-asset register.
