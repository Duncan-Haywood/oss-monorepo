---
title: "Twelve crypto pairs, one tick each: the stale-price test meets a real one-tick feed"
seo_title: "A stale-price test on real one-tick crypto trades"
date: 2026-11-19
tags: [changepoint-detection, data-quality, statistics, market-data]
description: "Pre-registered on a day of Binance trades: the shipped stale-feed test caught 78% of carried windows but called a quarter of real trade prints stale."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) watches for a *stale* feed, a figure
someone carried forward instead of reading again. Its shipped test runs only where most moves are one tick, the
smallest step the data records. Until today it had been checked only on simulated feeds there. [The last
round](2026-11-19-changepoint-catch-up-test-penny-spread-stocks.md) asked for fresh data and a gate set by the
market's quoted tick, not by the smallest step in the file.

## A gate that selected nothing

We took one UTC day (2 November 2026) of Binance's public spot trades for twelve large pairs, from BTC at about a
hundred thousand dollars to DOGE at a few cents. Binance also publishes each pair's quoted tick. We committed the
pairs, the day, the bars and the code before downloading a single file.

Every pair turned out to move one quoted tick at the median. On a venue whose ticks are small next to its prices,
the price bounces between bid and ask one tick apart, so the multi-tick regime the newer growth test was built for
never occurs. The round could not be scored, and its two main bars count as failures.

## The shipped test's first real one-tick check

That made the twelve pairs something no earlier round had: real one-tick feeds where we know exactly what was
carried. We sampled each pair's last trade price every 0.5, 1, 2 and 5 seconds, so the trade times say which
samples are repeats of an old trade. The trade prints themselves are the control, because nothing in them is
carried. We pre-registered a second round, then ran the shipped test, unchanged, on 360 windows of 300 steps.

| bar | result |
|---|---|
| carried windows (30% or more carried) called stale, bar 80% | 128 of 164 (78%): fail |
| trade-print windows called stale, bar 10% | **16 of 68 (24%): fail** |
| carried share estimated within 0.10, bar 80% | 93 of 143 (65%): fail |

The middle row is the one that matters. On about a quarter of windows of real trade prints, where nothing was
carried, the product would have said the feed looked stale.

## Why, and what changed

The false calls came from seven pairs and from windows where 42-84% of prints repeat the last price. A price
that rests on one side of a one-tick book until the queue there is worked off produces runs of exact repeats.
That is the pattern a carried-forward feed produces too, and the price alone cannot tell them apart. The growth
test failed on penny-spread stocks for the same reason.

We decided in advance what a failure on that bar would change. The test and its threshold stay as they are. The
sentence a user reads when the test fires now adds that trade prints resting at a one-tick bid or ask can look
the same with nothing carried, and asks anyone reading trade or quote data to check the source's own timestamps
first. The next idea is to use the trade side: Binance's files say whether each buyer was the maker, so a run of
prints resting at the bid is a run of sells. That needs a fresh day and its own pre-registration.

Everything is in the README sections "The catch-up test gated on the quoted tick" and "The shipped one-tick stale
test on real one-tick feeds", with the scripts in `eval/`.
