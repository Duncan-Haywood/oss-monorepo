---
title: "Does the order your bank rows arrive in change your books?"
date: 2026-10-27
description: "A property test on 300 random statements: shuffled or overlapping imports leave the same books."
tags: [ai-bookkeeper, accounting, testing]
---

A bookkeeping tool that reads bank exports should give the same books whether the file is newest-first, oldest-first, or sent twice because two downloads overlapped. We checked that for ai-bookkeeper with 300 randomly generated statements (4 to 30 lines, made-up amounts and payees).

Four things held in every case: shuffled rows leave the same set of lines on the books; two overlapping exports imported in either order give the same set as the whole file; importing the whole file a second time adds nothing; and after filing every line the same way, the profit and loss is identical however the rows arrived.

We found no fault, so no code changed. The test (`import-order-property.test.mjs`) now keeps it that way. It uses made-up data only, so it says nothing about how a particular bank's real export behaves; those checks still wait on real files. ai-bookkeeper is open source under `ventures/ai-bookkeeper`.
