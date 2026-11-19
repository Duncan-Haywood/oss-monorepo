---
title: "A stale-feed test meets real trade prices: sharp on carried data, fooled by the trades themselves"
seo_title: "Testing a stale-feed detector on real last-trade prices"
date: 2026-11-19
tags: [changepoint-detection, data-quality, statistics, market-data]
description: "Pre-registered: the detector caught 84 of 85 carried-forward windows and estimated the carried share, but called all 56 windows of raw trade prints stale."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) has a check that asks whether a series
whose values often repeat is *stale*: a figure someone carried forward instead of measuring again. It compares two
models of a slow walk. In the first, every repeat is rounding. In the second, some steps simply repeat the last
record. Five rounds of simulation shaped it. Until today none of it had been scored on real data where we knew
which values were carried.

## Real data with the answer attached

A last-trade price sampled every few seconds is exactly that kind of data. If no trade happened in a one-second
slot, the price you read is the previous trade's, carried forward, and the trade times tell you which slots those
were. The trade prints themselves, one value per trade, carry nothing forward, so they are the natural control.

We used the trade samples that ship with the R package
[highfrequency](https://github.com/jonathancornelissen/highfrequency): one day of a European stock, 33,488 trades.
The data is fetched, not committed. The script and its three bars were committed
[before the first run](../../ventures/changepoint-detector/eval/stale-real-trades.mjs):

- **B1:** windows where at least 30% of samples were carried are called stale at least 80% of the time.
- **B2:** windows of trade prints are called stale at most 10% of the time.
- **B3:** where it calls stale, its estimate of the carried share is within 0.10 of the truth at least 80% of the time.

## The first run found a bug in the product

The price file holds 39.8025 next to 39.802499999999995, written that way after some float arithmetic. The
detector takes the smallest move as the "tick", and it took the difference between those two numbers, 7 × 10⁻¹⁵.
After that every real move counted as about a trillion ticks, and the check refused to run. Any user file with values
like that would have hit the same thing. Values that agree to nine significant digits are now treated as one value
written twice. The rerun used the same script and the same bars.

## What happened

| bar | result |
|---|---|
| B1: carried windows called stale | 84 of 85, pass |
| B2: trade-print windows called stale | **56 of 56, fail** |
| B3: carried share estimated within 0.10 | 112 of 119, pass (median error 0.04-0.06) |

On data that really was carried forward, the test does very well. It says *how much* was carried to within about
five percentage points. But it says the same about the raw trades, where nothing was carried: it estimated 27%.

## Why it was fooled

The answer is not a catch-up. When a carried feed resumes, its first move should be bigger the longer it sat still.
In the trade prints it isn't: the move after three or more repeats is no larger than any other. What the prints do
have is a lot of repeats, 40% of trades at the same price as the last one, because a price sits at the bid or ask
until that queue is used up. A walk with 3-4-tick steps would rarely land on the same price by chance, so the only
way the plain model can produce that many repeats is to shrink its steps. The carried-forward model has a cheaper
way to explain them, and the test rewards it for that.

So once moves are bigger than a tick, the test is detecting *excess repeats*, not staleness. The shipped detector
only runs it on stretches whose moves are about one tick, which is the setting the simulations covered. This result
is the reason that limit stays. The next step is a test that looks at the growth of the move after a run of
repeats instead of the number of repeats. These trade prints are now the real control to check it against.

The full write-up, with the per-window output, is in the
[README](../../ventures/changepoint-detector/README.md#a-real-carried-forward-feed-last-trade-prices-2026-11-19-pre-registered-b1-and-b3-pass-b2-fails-the-one-tick-gate-stays).
