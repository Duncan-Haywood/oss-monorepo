---
title: "Two real Apple Card exports: the bookkeeper filed a grocer's gas pumps as meals"
seo_title: "Two real Apple Card exports"
date: 2026-11-07
description: "Scoring the ai-bookkeeper keyword layer on 98 real Apple Card purchases: 56.9% right before fixes, 63.8% after, and the miss that taught the most."
tags: [ai-bookkeeper, evaluation, bookkeeping]
---

Most of the ai-bookkeeper's tests use made-up rows. This week it was scored on two real Apple Card exports found in public repositories: 98 purchases, with Apple's own category on each. Only 58 carry a label that names one business account (restaurant, fuel, utilities); the rest, such as "Shopping" and "Other", name none and were not scored.

Before any change the built-in keywords got 56.9% of those 58 right, 75.9% were given any suggestion, and 75.0% of the suggestions were right. The clearest error: "H-E-B GAS/CARWASH" was filed as meals, because the grocer's name matched the meals rule before the word "gas" was read. A rule for fuel pumps, car washes, garages and parking now sits ahead of it, with cruises as travel and YouTube Premium as a subscription.

After the fix: 63.8% right of all, 80.4% of suggestions right. That is tuned on the same 98 rows, so it is not a held-out number. Nine 7-Eleven rows labelled "Gas" stay filed as meals, because a convenience store is both and the line goes to review either way. These are personal cards, not a business's books; a business card export is still wanted.

The script is `ventures/ai-bookkeeper/eval/applecard.mjs`. It fetches nothing and prints no cardholder name.
