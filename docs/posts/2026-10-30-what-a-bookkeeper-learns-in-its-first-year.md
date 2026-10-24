---
title: "What an AI bookkeeper learns in its first year of a real ledger"
date: 2026-10-30
description: "ai-bookkeeper's payee memory, replayed in filing order over a US nonprofit's three years of public books: from 40% suggested to 91%, with confidence that tells the good suggestions from the guesses."
tags: [ai-bookkeeper, evaluation, bookkeeping]
---

The built-in keyword list in [ai-bookkeeper](../../ventures/ai-bookkeeper/)
had been measured on real books, but the part that makes it a bookkeeper rather
than a lookup table, the layers that learn from each line you file, had only
been measured on synthetic data.

This run replayed Hack Club's public ledger (1,297 transactions, 2015 to 2017,
fetched at run time and not copied). Each line is predicted from only the lines
filed before it, then added to the history, and the answer is the account the
treasurer actually used.

- Keywords alone: 40.1% of lines get a suggestion, 99.0% of those right.
- With learning: 90.7% get one, 96.0% right. Accuracy on all lines climbs from
  82% in the first half-year to 92% in the last quarter.
- Starting from only the first quarter of the ledger as imported history:
  79.3% suggested, 94.0% right.

The errors are informative. Of 45 wrong suggestions, most are payees the
treasurer files in several places (Amazon, Walgreens, Target) or a person paid
both as salary and as expense reimbursement. A name cannot settle those. But
the confidence score knows: suggestions at 0.8 or above were 98.8% right
(896 of them), those below were 85.2% right (230).

Caveat: these are clean payee names, not raw bank text, so read the numbers as
an upper bound. Next is the same replay on a real bank export long enough to
learn from, and splitting ambiguous payees by amount. The script is
`eval/hackclub-memory.mjs`; the README's Next section has the details.
