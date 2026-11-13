---
title: "A filter for careless survey answers only works if you can spot them, and we couldn't"
seo_title: "Gating an empirical-Bayes prior on a lapse estimate"
date: 2026-11-13
description: "A pooled prior would narrow honest respondents' intervals by 10-12% if careless people were left out of it. Their answers could not find them."
tags: [quick-pick-survey, surveys, ranking, statistics, empirical-bayes, simulation]
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by asking
you to choose between two items at a time. Its results screen shows an
interval for how far apart any two of your items are. Those intervals come
from a refit with a fixed prior, and that prior is wider than most people's
real spread, so the intervals are wider than they need to be.

Earlier today we found a prior estimated from the whole survey that would
fix this: the upper end of a 95% likelihood interval on the survey's pooled
spread. With honest respondents it kept 95% coverage at about 15% less
width. With careless respondents (people who answer some questions at
random) it fell apart, to 0.72-0.76 in the worst cells.

The obvious fix was to give the narrower prior only to people a lapse
estimate calls honest, pooled over those same people. This run measured
whether that works.

## The idea is sound

We simulated panels of 40 respondents where 0, 25%, 50% or all of them
answer carelessly, at lapse rates of 0.2 and 0.4, over 18 combinations of
list length and answers per item. A perfect detector would work well:
pooled over the honest people only and applied only to them, honest
coverage held 0.957-0.961, no cell under 0.93, at 10-12% less width than the
fixed prior. Careless people kept the fixed prior and lost nothing.

The simulation also showed how careless respondents do harm. It isn't
mostly through their own intervals. A random answer looks like a smaller
spread, so when half the panel is careless the pooled estimate drops, and
that narrower prior is then given to everyone, honest people included. With
no gate, honest coverage under the default question picker fell to 0.927
on average and 0.679 in the worst cell.

## The detector is the problem

The lapse estimates we can compute from a person's own answers can't
reliably tell careless people from honest ones. AUC is the chance that a
random careless respondent scores higher than a random honest one. Under
the default question picker it was 0.58-0.69, close to the 0.5 of guessing.
That picker asks about close pairs, and a close pair is close to a coin
flip for everyone, so a random answer doesn't stand out. Under the older
picker the AUC reached 0.80, and only at the higher lapse rate. With a
fixed threshold of 0.1, one of the estimates let every respondent through.

A rank gate, which pools only the more consistent half of the panel, was
safe: on every mixed panel it did at least as well as the fixed prior. But
it was only 1-4% narrower, against 10-12% for the perfect detector.
Ranking people by consistency mostly picks out people whose likes are far
apart, so their pooled prior ends up close to the fixed one anyway.

## What we did

We didn't ship it. The intervals keep the fixed prior, and we won't store
the upper end until there's a gate worth feeding it to. The next attempt
needs a better detector: anchor pairs (planted pairs whose answer is
obvious) or answer times, tested on a real survey's answers and measured
by the AUC this sweep now reports.

Caveats: simulated Bradley-Terry respondents with uniformly spread likes,
careless from the first answer, 40 people per panel, one threshold and one
cut. The sweep is `scripts/gated-upper-sweep.ts`. Every row is in
`docs/gated-upper-2026-11-13.jsonl`, and the full write-up is in the
venture's `docs/INFORMATION-GAIN-SELECTOR.md`, "A lapse gate for the upper
end".
