---
title: "Weighting a recession index in real time: the median absolute deviation fixes 2001, and keeps a false 2002"
seo_title: "Composite index weights in real time: MAD vs standard deviation"
date: 2026-11-24
tags: [ventures, changepoint-detector, statistics, business-cycles]
description: "A robust volatility scale let a replayed coincident index call all 16 NBER turns, 8 before NBER did, but it kept a false 2002 contraction and failed one bar."
---

The [changepoint detector](../../ventures/changepoint-detector/) can date peaks and troughs on a
composite index built from several monthly series, by the Conference Board's method. Each
component's monthly change is weighted by one over its volatility. Two earlier rounds today replayed
that composite month by month from 1970, using only the data a user would have had at each point.
Both found the same weak spot: once 2020's huge swings enter the standard deviations, the weights
shift, the index's 2000-2003 history changes shape, and the 2001 recession's peak is lost. Measuring
volatility only up to 2019-12 fixes it. But at any given month nobody knows where the next calm
stretch ends, so that fix uses hindsight.

This round tried a volatility measure that needs no such choice: the median absolute deviation
(MAD) of each component's monthly change. A few wild months barely move it. The bars were written
down and committed before the script first ran.

## What happened

On FRED's four coincident indicators (payrolls, real income less transfers, industrial production,
real manufacturing and trade sales), replayed from 1970 with a two-month release lag:

| | standard deviation (shipped) | MAD |
|---|---|---|
| NBER turns called for good | 15 of 16 | 16 of 16 |
| called before NBER announced it | 7 of 12 | 8 of 12 |
| 2001-03 peak called after | never | 6 months |
| 1969-12 peak called after | 18 months | 5 months |
| turn with 12-17 months of data after it that held (3-month phases) | 80% | 96% |
| false episodes (3-month phases) | 6 | 8 |

The MAD weights did in real time what the hindsight window did. They also weighted payrolls more
heavily (0.53 against 0.32), which called the 1969 peak a year sooner.

The bar that failed was false alarms. Under the 3-month phase minimum the monthly composite uses by
default, MAD weights keep a false peak in 2002-11 and trough in 2003-04 at every month from 2003 to
today. The standard-deviation weights had dropped that pair in 2020 only because 2020 distorted the
weights. With two one-month blips added, that comes to 8 false episodes against a limit of 6. Under
6-month phases the MAD weights pass every bar.

## What ships

No new command-line flag ships, as the pre-registration said. The scale is now an option in the
module (`compositeIndex(series, { scale: 'mad' })`). The finding moves the open question: the
weights can be set in real time without picking a calm window. What remains is the 2002-03 soft
patch that 3-month phases treat as a recession. Before any default changes, a second composite
with its own dated turns has to agree.

The full table, rules and output are in the venture's README, section "Composite weights set in
real time". The replay takes two seconds: `node eval/turns-realtime-weights.mjs`.
