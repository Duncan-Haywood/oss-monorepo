---
title: "A random walk under the steps: 406 false changes become 1, and where it still fails"
seo_title: "Changepoints on drifting series: a random-walk level model on TCPD"
date: 2026-11-11
tags: [changepoint-detector, statistics, time-series, changepoint, benchmarks, negative-result]
description: "A level that wanders between jumps cut false changes on US population from 406 to 1, beat the plain model on a benchmark, but not our older fix."
---

The [changepoint detector](../../ventures/changepoint-detector/) has had the same
weakness since its first benchmark run. Its default model assumes the level is flat
between changes. Give it a series that drifts, such as a population, a price or a
passenger count, and it buys a step for every bend. On the Turing Change Point
Dataset's 816 months of US population it reported 406 changes. The five people who
labelled that series marked none.

Earlier runs kept the flat level and changed how the noise was measured: an
autocorrelation term, noise floors, and a warning that refits with a floor when the
count looks too high. This run changed the model itself.

## The model

Between changes the level now follows a random walk: each step it moves by a small
random amount with variance omega squared. A change is a jump too big for that walk.
This is the simplest case of DeCAFS (Romano, Rigaill, Runge and Fearnhead, JASA 2022).
We solve it in a different way from the paper. A change restarts the level from a flat
prior, so the segments are independent, and each segment's cost is the likelihood of
a small Kalman filter run over it. Exact optimal partitioning then tries every
segment start. All 38 benchmark series take 44 ms together.

The two noise sizes come from the data before any change is fitted. The difference
between points k apart has variance 2 sigma² + k omega², and a median-based spread of
those differences is barely moved by a few jumps. A straight line through lags 1 to
10 gives both.

## What we wrote down before scoring

The settings and the rule went into the evaluation script's header before any
benchmark series was run through the model. The rule had two parts:

- offer the model if it beats the plain level model on both the 31 shipped and the
  7 held-out series;
- add it to the default panel only if it also beats the existing over-cut warning's
  refit on both.

## What happened

| | F1, 31 shipped | F1, 7 held out |
|---|---|---|
| drift model | 0.677 | 0.420 |
| plain level model | 0.477 | 0.296 |
| level, following the over-cut warning | 0.655 | 0.497 |
| reporting no change | 0.663 | 0.639 |

The first part passed easily. Against the plain model the drift model gains 0.200 F1
on the shipped series (95% bootstrap interval 0.115 to 0.286) and 0.124 on the held-out
ones, where it is better on all 7. US population drops from 406 cuts to 1, JFK
passengers from 57 to 0 and UK seat-belt casualties from 24 to 1.

The second part failed. Against the warning's refit the drift model is +0.022 on the
shipped series, an interval that spans zero, and -0.077 on the held-out ones. So it
ships as an option (`node cli.mjs data.csv --model drift`) and the default panel is
unchanged.

## Why it lost on the held-out set

Four of the seven held-out series are bitcoin prices, a stock price, weekly measles
counts and an image scanline. Their trouble is heavy tails and bursts of volatility,
not slow drift. A random walk cannot explain a sudden burst of large moves, so the
model still cuts it: 103 changes on bitcoin and 30 on measles. The `bank` series in
the shipped set fails in the same way.

The model also pays the expected price for absorbing drift. The Nile's well-known 1899
drop is read as wander, because the jump inflates the robust estimate of omega it is
measured against. The plain model finds that drop and the drift model does not.

## A post-hoc extra, labelled as such

A random walk with no drift term cannot follow a steady growth. On Australia's
quarterly population, a smooth curve with no documented break, it still gave 31 cuts.
Taking out the series' median step first (`--drift-slope`) brings that to 0. We added
this after the benchmark run, so its small benchmark gain is in-sample and proves
nothing. It stays opt-in.

## Next

The paper's full model also has autocorrelated noise around the walk, which we have
not built yet. The other open work is a check that can tell drift from heavy tails
before choosing a model, and an omega estimate that a single big step cannot inflate.
All of the figures above are in the venture's README, under "Jumps on a drifting
level", with the commands that reproduce them.
