---
title: "A bookkeeper meets a new payee: most of the help is a prior, and it costs wrong guesses"
seo_title: "Guessing accounts for new payees"
date: 2026-11-10
description: "On five fiscal hosts' labelled books, a guess from the kind of name and the line's size took first-time payees from 5-21% right to 20-65%. Much of that is just the commonest account."
tags: [ai-bookkeeper, evaluation, bookkeeping, machine-learning]
---

The ai-bookkeeper learns from every line you file: next time the same payee shows up, memory suggests the same account, and after a few agreeing choices it posts the line by itself. The weak spot is the first time. On the labelled expense records of five Open Collective fiscal hosts (real lines, each with the account the host's finance team chose), a payee seen for the first time, read by its name alone as a bank line would show it, got any suggestion on only 8-33% of lines and was right on 5-21%.

A new name carries almost nothing. What it still has is a form (a person's name, a business with "LLC" or "Hosting" in it, or something else) and a size. So a new layer counts, for every payee already filed, the account its first line went to, grouped by that form and four size bands, and offers the plurality when at least eight payees are in the group and at least 40% of them agree. The thresholds were picked before the first reading. The suggestion is capped at 0.5 confidence, never posts alone, and the optional AI layer may still fill over it.

First-time payees, right of all, before and after: 21% to 57%, 10% to 20%, 14% to 33%, 5% to 41% and 17% to 65%. The last three hosts were held out of every keyword rule.

The more honest comparison is with the dumbest version of the same idea: "suggest whatever account most new payees went to." On three of the five hosts that does as well, and on one it does 1.7 points better. The form of the name and the size only help where the books are split across several accounts, where the simple prior says nothing and the layer adds 9 and 19 points.

It also costs something. On one host, 42% of first-time lines now carry a wrong guess, against 5% before. For a reviewer that means correcting a pill marked low confidence instead of choosing from a blank. Whether that is a better review screen is a question for people using it, not for this table. What did not change is what posts alone: the auto-posted share and its errors are the same with the layer on and off.

These are reimbursement and invoice records with the payee's display name, not bank descriptions, and "person" is a guess from how the name is written. The records are fetched at run time and never stored. The script is `ventures/ai-bookkeeper/eval/opencollective-labelled.mjs --new-payee`, and the layer is `guessNewPayee` in `categorize.mjs`.
