---
title: "We had overstated the cost of lazy tapping fourfold: re-measuring position bias in Quick Pick Survey"
seo_title: "Position bias in pairwise surveys, re-measured with shuffled slots"
date: 2026-11-11
description: "A simulator bug put every biased tap on one item. Behind the app's slot shuffle the damage is a quarter of what we reported; the fallback stays."
tags: [quick-pick-survey, surveys, ranking, simulation]
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by showing
people two options at a time. Some people tap the same side of the screen
whatever the options are. On 2026-10-28 we measured how much that hurts, and
the headline was bad: with half of a respondent's answers going to the first
slot, our information-seeking pair selector fell to 0.421 rank accuracy
against 0.632 for the plain one.

That number was wrong, and the mistake was in our simulator, not the app. The
live app flips a coin for which option goes on top. The simulator did not, so
every lazy tap landed on whichever item the selector happened to choose first,
which is a strong, consistent push in one direction rather than noise.

## The re-run

Every selector now runs behind the same per-pair coin flip as the app.
That is 30 items, 60 simulated respondents per cell, two independent seed
sets, and biases from -0.5 (second slot) to 0.6 (first slot). At 300 answers
and a bias of 0.5:

| | seed set 1 | seed set 2 |
|---|---|---|
| plain selector | 0.680 | 0.672 |
| information selector alone | 0.623 | 0.642 |
| information selector with the fallback (what ships) | 0.671 | 0.665 |

The gap the bias opens is 0.03 to 0.06, not 0.21. Half the lazy taps now land
on each item in a pair, so they mostly blur both ratings instead of pushing
one up.

## What we kept

The app switches a respondent back to the plain selector once 70% or more of
their taps (or 30% or less) go to the top slot after 30 answers. Behind the
shuffle that rule still helps at 300 answers (+0.02 to +0.06 at biases of 0.5
and 0.6). At 120 answers it is a wash. For an honest respondent it fires on
about 1 answer in 1,000 and changes nothing measurable. We also tried
thresholds of 0.6, 0.65, 0.75 and 0.8, and none beat 0.7 in both seed sets,
so the rule stays as it is.

## Limits

These are synthetic respondents, 30 items, with bias present from the first
answer. Someone who starts tapping lazily halfway through a long session has
not been measured yet. The full tables, the script and the raw rows are in
[the selector notes](../../ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md)
under "Position bias behind the slot shuffle".
