---
title: "Dividing the piano, the clock and the ring: a fair-division tool for heirs"
seo_title: "How to divide personal property among heirs fairly"
date: 2026-11-13
tags: [ventures, estate-item-divider, fair-division, algorithms]
description: "A new free tool divides an estate's belongings between heirs: sealed bids with envy-free cash, or a proven max-Nash-welfare split with no cash at all."
---

Money in an estate splits itself. The piano, the grandfather clock and a
wedding ring do not, and they are where families fall out. The usual answers
are taking turns (whoever picks first does best) or appraisal value (which says
nothing about who cares about what). The fair-division literature has better
ones, so we built them into a free page:
[estate item divider](https://marisstella.app/estate-item-divider/).

Each heir privately writes down what every item is worth to them. Then:

**Sealed bids, cash evens it up.** Each item goes to whoever values it most,
and cash moves so that no heir would rather have another heir's items plus that
heir's cash. In the
[worked example](https://marisstella.app/estate-item-divider/how-to-divide-personal-property-among-heirs.html),
three heirs split six items and every one of them ends $1,255.56 above a fair
third of the estate *as they value it*. The payments come from a short argument:
envy-freeness is a set of difference constraints between heirs, longest paths
give the smallest payments that satisfy them, and those payments move
one-for-one with the margin over a fair share, so the best margin has a closed
form. With unequal shares (a will saying 50/25/25) it switches to Knaster's
1946 sealed-bid procedure with percentages.

**Items only, no cash.** Many families will not pay each other. Then the tool
maximises the product of what each heir gets (maximum Nash welfare), which is
Pareto-optimal and envy-free up to one item. That is NP-hard in general, so the
interesting part was proving answers optimal in a browser. A plain branch and
bound with an "everyone gets everything left" bound proved 0 of 10 random
estates with 4 heirs and 20 items. Adding a Lagrangian dual bound, with item
prices read off the best division found so far, proved 10 of 10 at that size in
about 2 ms, 10 of 10 with 6 heirs and 60 items, and 7 to 8 of 10 at the 8-heir,
80-item limit. When the proof does not finish, the page says "best found"
rather than "proven". Local search alone already matched brute force on 400 of
400 small estates; the proof is what lets the page say so for yours.

The suite checks the claims rather than the code paths: 500 random estates
where payments must sum to zero and nobody may envy anyone, a random search for
envy-free payments that would treat the worst-off heir better (none found),
brute-force comparisons for the Nash-welfare answers, and the guide's three
tables recomputed from the engine.

It is arithmetic on the values people type, not legal advice; the will and the
executor decide. Nothing is uploaded. Source and measurements:
[`ventures/estate-item-divider`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/estate-item-divider).
