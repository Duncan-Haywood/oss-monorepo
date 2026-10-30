---
title: "How fast does a bookkeeper learn? Replaying a nonprofit's books in date order"
seo_title: "How fast does a bookkeeper learn?"
date: 2026-10-25
description: "ai-bookkeeper on Hack Club's public ledger, 1,241 lines: keyword rules suggest 40%, learning as it goes suggests 91%."
tags: [ai-bookkeeper, bookkeeping, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) categorises bank lines with
rules, payee memory, naive Bayes and a built-in keyword list. Until now the
only real-data numbers were for the keyword list. That is the layer you get on
day one, not the one you use in month six.

This run replayed Hack Club's archived books (2015 to 2018, open data licence,
fetched at run time and never copied) in date order. Each line was suggested
from everything filed before it, then filed the way the treasurer filed it.

| | suggested | right of suggested | right of all |
|---|---|---|---|
| keywords only | 40.1% | 99.0% | 39.7% |
| learning as it goes | 90.7% | 96.0% | 87.1% |

By year the learning run gets 82.2%, 82.6% and 91.5% of lines right. Payee
memory supplied 1,047 of the 1,126 suggestions. Of the 45 wrong ones, most are
the books' own inconsistencies (the same vendor filed under two accounts).

Caveats: these are clean payee names, not bank text, so treat 87% as an upper
bound. The next step is the same replay on a real bank export.

Run it: `node ventures/ai-bookkeeper/eval/hackclub-online.mjs`.
