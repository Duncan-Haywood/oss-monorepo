---
title: "A second real ledger, held out by merchant"
date: 2026-10-24
description: "ai-bookkeeper's built-in keywords on a US nonprofit's published books: 36.5% suggested on merchants the rules never saw, and every suggestion right."
tags: [ai-bookkeeper, bookkeeping, evaluation]
---

The last real-data check of [ai-bookkeeper](../../ventures/ai-bookkeeper/)'s
keyword categorizer used one organisation and tuned on it. This time the set is
different and the split is honest.

Hack Club published its books, 2015 to 2018, as a plain-text ledger. Each
transaction has a payee and the account its treasurer filed it under. We score
the payee alone against the account, with the engine's keywords and nothing
learned. A hash of the payee decides which fifth is held out, so a merchant is
never on both sides.

| | suggested | right of suggested |
|---|---|---|
| held out, before any rule | 36.5% | 100% (76 of 76) |
| train fifth, before | 15.2% | 97.5% |
| train fifth, after 12 vendor rules | 40.9% | 98.8% |
| held out, after | 36.5% | 100% |

The held-out number did not move, and that is the finding. Rules written from
one set of merchants help only that set's merchants. What carries over is what
the built-in list already knew (Lyft, hosting, shipping). The blank cases are
the ones text cannot settle: `Wells Fargo` is 25 bank fees and 13 interest
credits under one payee, and 35 lines are a person's name that could be salary
or a contractor. Those are the job of payee memory and the review queue.

These are clean payee names, so a real bank export will do worse. The data is
fetched at run time and not copied into the repo. Eval:
`ventures/ai-bookkeeper/eval/hackclub-ledger.mjs`.
