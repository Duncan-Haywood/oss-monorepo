---
title: "\"You can lose 126% of your dogs\": a price-raise table in six calculators that went past 100%"
seo_title: "Break-even customer loss on a price rise: when it goes past 100%"
date: 2026-11-11
tags: [pricing, small-business, mutation-testing, css]
description: "Customers you can lose before a raise stops paying: extra / (contribution + extra). With negative margin it tops 100%, and six of our calculators showed that."
---

Today's red-team run seeded eight faults into `calc.mjs` of the
[dog grooming profit calculator](../../ventures/dog-grooming-profit-calculator/), which got a
thousands-comma fix earlier this week. The tests caught five. One of the three that got through
was a fallback value for an edge case no test had reached: weekly contribution at or below zero.
Following that case up turned up a real bug.

## The formula

The calculator has a table called "What a price raise can cost". For each raise (5, 10, 15, 20%)
it shows how many dogs you could lose before the raise leaves you worse off. If your weekly
contribution (revenue after card fees and supplies) is *C* and the raise adds *E* a week, losing
a share *x* of dogs leaves (1 − *x*)(*C* + *E*). Setting that equal to *C* gives

*x* = *E* / (*C* + *E*).

That's correct when *C* is positive. When supplies and fees cost more than the price, *C* is
negative, *C* + *E* is smaller than *E*, and the share goes over 1. A $100 groom with $98 of
supplies at a 3% card fee loses $1 a dog, and the table said **"Dogs you can lose first:
126.0%"**.

The right answer is simpler. When each dog costs you money, losing every one of them doesn't
lower your contribution, so the answer is 100%. It's never more than that. (The page already
warns about a mix that loses money. The table just shouldn't contradict that warning with an
impossible number.)

## Six copies

The same line was in the DJ gig, massage therapist and wedding photographer profit
calculators, which come from the same template. The laundromat payback calculator wrote it
differently, (*c₁* − *C*) / *c₁*, and the restaurant menu-mix analyzer wrote it as 1 − *cm* /
(*cm* + Δ*p*), but both have the same flaw. A money-losing Plowhorse dish there showed a 200%
break-even loss. All six are fixed. Each has a test that fails on the old code. The menu-mix
analyzer now leaves the figure out for a dish that loses money per plate, and its existing
"costs more to make than it sells for" finding covers that dish.

The two pricing tools built for this question, the
[price increase break-even calculator](../../ventures/price-increase-breakeven-calculator/) and
the [freelance rate increase calculator](../../ventures/freelance-rate-increase-calculator/),
were already safe. One leaves below-cost items out of the totals, and the other clamps at 100%.

## The CSS half

The second campaign seeded eight faults into the shared site header and footer CSS
(`platform/pages/site-nav.mjs`). The tests caught none. Six of those faults made no visible
difference (font weight 401 instead of 400, a shadow one shade darker). The other two changed
`margin:0` to `margin:1` and `margin:0 auto` to `margin:1 auto`. Those are worse than they look.
A bare `1` isn't a length, so the browser drops the whole declaration without any warning, and
the element loses its centering.

So there is now a small lint, [`platform/pages/css-lint.mjs`](../../platform/pages/css-lint.mjs),
that flags a non-zero number with no unit on a length property. It runs over the shared chrome
and over every hand-written page, stylesheet and `style=""` attribute in the tree, about 3,750
files. Today it found nothing, so the check starts green, and the next `padding:4` fails CI
instead of shipping.

Catch rate for the run: 5 of 9 non-equivalent faults before, 9 of 9 after. One real defect,
found in six products, all fixed.
