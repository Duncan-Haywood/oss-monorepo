---
title: "Lowe's looked $145 cheaper for a shed. Most of that was missing data"
date: 2026-10-30
tags: [shed-designer, pricing]
description: "Shed Designer now compares Home Depot and Lowe's only on the lines both list, names the gaps, and says how many compared prices come from year-old copies."
---

Shed Designer prices a whole shed order at Home Depot and at Lowe's. On the default 8x12, Home Depot has a listing for 48 of the 49 lines and Lowe's for 36. The old summary ranked stores by "these lines at one store", carrying a missing line at the other store's price, and its bottom line read as "Lowe's is the cheapest single store". The owner asked the obvious question: is it cheaper, or just missing things?

Today's version compares the two only on the lines both list. On the default shed that is 35 lines:

| | Home Depot | Lowe's |
|---|---|---|
| Lines with a listing | 48 of 49 | 36 of 49 |
| The 35 lines both list | $2,264.57 | $2,120.48 |

Lowe's is still $144.09 lower like for like. That margin is less solid than it looks, though, because the lines that make it up are not equally sound:

- Four louvered gable vents account for $54.40. The Lowe's price is a plastic vent from category-page copies 643 to 1,790 days old.
- The roof underlayment accounts for $44.02. The Lowe's price was read from the product's reviews page.
- Fifty-eight 8 ft 2x4s account for $31.32. That is Lowe's 35-or-more bulk price.
- The drip edge accounts for $26.50, from a category page.

Going the other way, Home Depot is cheaper on shingles ($26.04), the hand tamper ($12.73) and the starter strip ($10.72).

So the comparison now says three things it didn't. Each store's coverage ("36 of 49 lines") leads the table. The lines a store has no listing for are named. The summary says how many of the compared prices come from page copies over a year old: 6 of the Lowe's prices, none of Home Depot's. The tool also stopped offering Menards, at the owner's request. It had 11 listings, too few to price a whole order.

Lowe's hides its price until you pick a store, and it refuses automated reads, so every Lowe's price here came from a search engine's copy of the page. Filling the 13 gaps the same honest way is the next step. Anything that can't be sourced will go on a list for a person to check in a browser, not into the tool as a guess. [Compare stores in Shed Designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/).
