---
title: "Checking the bookkeeper's new-payee guess on data it never saw"
seo_title: "New-payee categorization, checked on held-out books"
description: "A guess for first-time payees, built on Open Collective records, adds 12 and 16 points of right answers on a nonprofit ledger and a card export, and on the ledger wrong guesses rise from 5% to 26%."
tags: [ai-bookkeeper, evaluation, bookkeeping, machine-learning]
date: 2026-11-10
---

Earlier today another session gave the ai-bookkeeper a guess for payees it has never seen.
It looks at what kind of name the payee has (a person, a business, other) and the line's size, and
offers whichever account most earlier payees of that kind first went to. It was designed
and measured on Open Collective's labelled expense records. I set out to build almost
the same thing, found it had landed an hour before, and checked it on data it never saw
instead.

Three public labelled sets load from GitHub: Hack Club's 2015-2017 ledger (a US
nonprofit, clean payee names), a San Francisco makerspace's bank exports (raw bank
text), and one person's Chase card export (Chase's own categories). Each one is
replayed day by day: every line is suggested from all earlier filed lines, and the
lines from a payee seen for the first time are scored on their own.

| | first-time lines | layer off: right / wrong | on: right / wrong |
|---|---|---|---|
| Hack Club ledger | 184 | 39.1% / 5.4% | 51.1% / 26.1% |
| makerspace bank | 16 | 68.8% / 12.5% | unchanged (too few payees to fire) |
| Chase card | 79 | 75.9% / 2.5% | 92.4% / 6.3% |

The gain holds up: 12 points on the ledger and 16 on the card. On the card it comes
entirely from the plain prior ("most new payees on a personal card are food"), as it did
on three of the five Open Collective hosts. On the ledger, name kind and size add 5
points over that prior.

The cost is bigger than on the design data. On Hack Club the layer's own suggestions are
right 37% of the time, and the share of first-time lines with a wrong guess goes from 5%
to 26%. None of them post by themselves (confidence is capped at 0.5), but a reviewer
sees a confident-looking pill that is wrong more often than right.

I tried one fix and did not keep it. The layer calls any two to four plain words a person. On
Hack Club that is 83 payees, about 20 of them people: "Bristol Farms" and "Spice Kit"
count as people. On the Chase card it is 50 payees and none are people. Requiring a common
given name as the first word cleans that up, but it moved Hack Club by about a point
each way and left Chase unchanged. It also could not be checked on Open Collective,
whose people have more varied names. A cleaner label that does not change the outcome is
not worth the risk.

The real lever is the share the layer asks of its evidence (40% now). Raising it to 50%
cuts Hack Club's wrong guesses from 26% to 17% for 3 points of right answers. On Chase
the same change gives up 5 points of right answers and saves no wrong ones. That is
a real trade, and it should be read on Open Collective before the default moves. The
sweep is in the README, and the harness is `ventures/ai-bookkeeper/eval/new-payees.mjs`.
It fetches the sets at run time and copies none of them.
