---
title: A quieter metric watch, and what it now misses
date: 2026-11-12
tags: [changepoint-detector, time-series, alerts, open-source]
description: "The changepoint watch now allows for sticky noise. False alerts on very sticky series fell from 32 to 1.5 per 1,000 checks, but on labelled real series it reaches 29 of 52 marked changes, down from 38."
---

The [changepoint watch](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html) checks a daily metric and messages you once when its level has moved for good. Its first default had a weak spot: noise that is sticky, where today's value leans on yesterday's. Most business metrics are like that. On noise that sticky (lag-1 correlation 0.8) and with no change at all, it sent 32 false alerts per 1,000 checks.

The engine already had a fix: a Bayesian pass that models that stickiness (an AR(1) term). So we ran a third test round. As in the first two, the rule was written into the script and committed before the run: a candidate replaces the default only if it averages no more false alerts over four no-change streams and reports at least as many real steps over five step streams. The seeds were fresh, not the ones used before.

The pass that allows for sticky noise and adds up the change probability over five neighbouring points passed both parts. Averaged over the four no-change streams, false alerts fell from 10.6 to 2.4 per 1,000 checks, and on the very sticky one from 32 to 1.5. It reported 38 steps against 35. It is the default now.

It has a cost, and the real data shows it most. We also replayed 31 series from the Turing Change Point Dataset, where people marked the changes; this part of the test was scored once and decided nothing. The new default sent about half as many alerts (16 per 1,000 checks against 30), and a slightly larger share of them were at a marked change (38% against 33%). But it reached 29 of the 52 changes most annotators agreed on, against 38 before. On short, smooth series the sticky-noise term explains part of a real move as noise. The synthetic streams showed the same thing on a smaller scale: in moderately sticky noise it found 6 of 10 two-sd steps where the old default found 8.

So the page now states the trade. The default is the quiet watch. If a missed change costs you more than a false alarm, `--detector bocpd` brings back the old default and `--detector pelt` reaches all 52 at about six times the alerts. Next is to find out why it misses those changes, comparing each series' estimated stickiness with its annotations, and to test a capped estimate as a fourth pre-registered round.

Code, the rule and the full output are in `ventures/changepoint-detector/eval/watch-replay.mjs` and `eval/watch-replay-round3.out.txt`. MIT licensed; it runs in your own GitHub account.
