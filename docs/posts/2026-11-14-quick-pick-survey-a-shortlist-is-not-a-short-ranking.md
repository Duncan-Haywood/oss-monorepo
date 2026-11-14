---
title: "A shortlist is not a short ranking: finding your top 3 by picking pairs"
seo_title: "Pairwise comparison for a top-k shortlist: how many questions it takes"
date: 2026-11-14
description: "Ranking a whole list and keeping its top 3 often gets the cut wrong. Asking only about options near the cut got it right twice as often in simulation."
tags: [quick-pick-survey, pairwise-comparison, bradley-terry, top-k, statistics, product]
---

The free [list ranker](https://marisstella.app/quick-pick-survey/rank.html)
ranks a list by asking "this or that?" until the order is settled. People often
need something smaller: the three candidates to interview, the five features for
next quarter, the three names to test. The obvious approach is to rank
everything and take the top three. We measured it, and it often gets the cut
wrong.

## Why ranking everything misses the cut

The full-order mode stops once the whole order is 90% settled, measured as how
closely the orders your answers still allow agree with the one shown. Every
place counts the same toward that number. Swapping places 3 and 4 costs it about
as much as swapping places 13 and 14, so it can stop while the one boundary you
care about is still a coin toss.

On simulated people who answer with ordinary noise (sometimes picking the option
they like slightly less), choosing a top 3 or top 5 from 15 to 30 options, the
full order's top k was exactly right **25 times in 96**.

## Asking about the cut instead

The new **Find my top k** mode changes two things:

- **Which pairs it asks.** After every answer it estimates each option's
  chance of being in your top k. It then pairs only options that could still
  fall on either side of the cut (between 1% and 99%). An option that is
  clearly in, or clearly out, is not asked about again.
- **When it stops.** It stops once the shortlist is 90% settled, meaning that
  on average 90% of the k it shows also make the top k in the orders your
  answers still allow. Like the full-order rule, it then checks again with a
  model fitted to how strongly you seem to feel, so a run of near coin flips
  does not count as a settled shortlist.

Our first stop rule asked for a 90% chance that the whole set was exactly right.
It almost never passed for anyone who ever wavers, because the model always
allows for a slip, so we dropped it.

## What it measured

Same simulated people, same answers, 16 people per cell, k = 3 and 5:

| people | options | full order: exact top k | shortlist mode: exact top k | questions, shortlist vs full |
|---|---|---|---|---|
| never wrong | 15-30 | 91 of 96 | 96 of 96 | about 1.2x |
| ordinary noise | 15-30 | 25 of 96 | **54 of 96** | about 1.6x |
| close calls | 15-30 | 12 of 96 | 23 of 96 | both mostly hit the cap |
| ordinary noise | 10 | 26 of 32 | 27 of 32 | about the same |

So the shortlist mode gets the right shortlist about twice as often on longer
lists, and it costs more questions. Most of the gain comes from which pairs it
asks, not from the stricter stop. When the full-order picker was run to the
same shortlist stop, it got 31 of 96 right and asked more questions than the
shortlist mode, which got 54. On a list of 10 there is nothing to gain: short
lists already end up asking nearly every pair.

We also tried a looser 80% stop. It asked about as many questions as the full
order and was right about as often, so it was dropped.

## What it doesn't do

These are simulated people with evenly spaced likes, no ties and no fatigue.
Real answers may behave differently. A shared link still opens in full-order
mode. The page counts which mode people pick, in local storage only, so we will
learn whether anyone wants a shortlist.

Method, raw rows and tests are in
[docs/RANK-PAGE.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/quick-pick-survey/docs/RANK-PAGE.md),
"Find my top k". The sweep is `scripts/top-k-sweep.mjs`.
