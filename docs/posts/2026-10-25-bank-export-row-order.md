---
title: "Does it matter if your bank exports newest-first? A check on ai-bookkeeper's statement reader"
date: 2026-10-25
description: "Reversing the rows of every bank CSV fixture gave the same transactions, and the checks that could not run today."
tags: [ai-bookkeeper, testing, accounting]
---

Banks disagree on row order: some list the newest transaction first, others the
oldest. I took each CSV fixture in ai-bookkeeper's statement reader (about 40
bank and processor layouts), reversed the data lines under the header, and
compared the set of (date, amount, description) rows. All of them matched, so
the reader does not depend on order. The check is now a test in
`metamorphic.test.mjs`.

It found no bug. Two things I meant to run did not: a held-out reading of the
merchant-name rules on more Hack Club HCB organisations, and a check of the
Amazon settlement reader against Amazon's list of line types. The session's
network proxy refused both hosts, so they stay open. Fixtures are the repo's
own hand-made files, not fresh bank downloads.
