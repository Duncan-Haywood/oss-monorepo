---
title: "A blank price is not a free plan: one escaped fault and one real bug in the subscription price calculator"
seo_title: "SaaS price calculator: a cleared field no longer shows 100% churn"
date: 2026-11-12
tags: [testing, mutation-testing, saas, pricing, redteam]
description: "Eight faults seeded into the SaaS price calculator, seven caught. A manual hunt found a cleared price field showed a green 100% churn headline."
---

The [subscription price impact calculator](../../ventures/subscription-price-impact/)
answers one question for a SaaS founder thinking about a price rise: how many
subscribers can I lose before the new price brings in less than the old one?
Today's red-team run seeded eight faults into its share-link module
(`redteam.py campaign`: change one constant or flip one comparison, run the
tests, put the file back), then read the calculator looking for inputs a
real visitor would type that give a wrong answer.

| File | Seeded | Caught before | Caught after the new test |
|---|---|---|---|
| `subscription-price-impact/share.mjs` | 8 | 7 | 8 of 8 |

## The fault that got through

The share link drops any value below zero. Changing that bound from `< 0` to
`< 1` passed every test, though it would silently drop a $0 fixed-cost line or
a $0.99 app price from the link. The recipient's page would then open on its
own defaults for those fields, showing numbers the sender never entered. The
existing round-trip test only used values well above one. A new test sends
`{customers: 1200, currentPrice: 0.99, proposedPrice: 0.5, monthlyCosts: 0}`
and checks it comes back unchanged.

## The real bug: an empty field read as zero

In JavaScript, `Number('')` is `0`. The calculator's input check rejected
negatives and text but let an empty string through as zero. So a visitor who
cleared "Current monthly price" to type a new one saw, for that moment:

> **100.0%** maximum churn before revenue falls

in green. A current price of $0 means current revenue of $0, so any customer
count matches it. A field holding only spaces in "Proposed monthly price" did
the opposite: 0% headroom and a $2,000 revenue drop. Neither answer has
anything to do with the founder's plan; they come from an unfinished edit.

The check now treats an empty, whitespace-only or missing field as missing
("Enter current price") and shows the page's existing error state, which
hides the headline and clears the table. A typed `0` still counts as a real
input. The test tries all four fields with `''`, `'   '`, `null` and
`undefined`; it fails on the old code and passes on the new.

## Siblings checked

Five other calculators use the same `Number(value)` check. They were left
alone on purpose: the MRR waterfall's components (new, expansion,
reactivation MRR) read sensibly as $0 when left blank, and the mobile
detailing and pet grooming bid calculators fill blanks from their own
defaults. The cloud egress and KDP royalty calculators deserve the same
"does a blank change the headline?" read in a later run.
