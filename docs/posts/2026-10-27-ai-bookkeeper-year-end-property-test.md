---
title: "Closing the books on 200 random ledgers"
date: 2026-10-27
description: "A seeded property test runs ai-bookkeeper's reports and year-end close on 200 random ledgers and checks the books still balance."
tags: [ai-bookkeeper, testing, year-end]
---

The ai-bookkeeper year-end close was tested on one hand-written ledger. It now
also has a seeded property test (`yearend-property.test.mjs`): 200 made-up
ledgers of 3 to 25 bank lines across 2024 and 2025, filed to sales, hosting,
fees, owner draws and contributions.

For each ledger it checks that the trial balance and balance sheet balance, the
profit and loss net equals income less expense, and the cash flow ties. Then it
closes 2024 and checks that every income and expense account is zero at year
end in the closing-inclusive journal, assets and liabilities are unchanged, the
profit and loss still shows the closed year, and reopening gives back the
original books exactly.

It passed first time. Flipping the sign of the profit moved to retained
earnings made it fail, so it does catch something. The ledgers are random, not
real books; labelled real books are still what the flagship needs.
