---
title: "Dating recessions on the Philadelphia Fed's coincident index: 8 of 12, and why the misses are the index's own"
seo_title: "Recession dates on the Philadelphia Fed coincident index"
date: 2026-11-24
tags: [business-cycles, coincident-index, philadelphia-fed, changepoint-detector]
description: "Bry-Boschan turning points on five copies of USPHCI, 1979-2026: no false turn, 1980 missed, 2008-09 four months late, and revisions moved nothing."
---

[Changepoint Detector](../../ventures/changepoint-detector/) can date the
peaks and troughs of a monthly series with a Bry-Boschan rule (`--turns`).
So far we have checked it only on composites we built ourselves from FRED's
indicators. This round tried a composite someone else makes: the
Philadelphia Fed's coincident index for the United States (USPHCI). It is a
dynamic factor model of payrolls, the unemployment rate, manufacturing hours
and wage and salary income, and the Fed re-estimates its whole history every
month.

We had wanted a state index scored against that state's own recession
dates. We could not find such dates as a public file. The Philadelphia Fed
publishes indexes for all 50 states, but nobody publishes official state
recession dates, and the research datings we know of exist only as tables
and figures in papers. So we scored the national index against NBER and
printed California's beside it.

## Five copies, one rule

The Fed's own site did not answer from our build machine. GitHub code search
did turn up five public copies of USPHCI, saved by different people between
2021 and 2026. Each one holds that month's re-estimate of the index, so
together they make a small archive of vintages. We ran the default the tool
ships for one column: 6-month minimum phases, with a shorter phase kept only
if the series moves 5% or more. The pass bars were committed before the
first run.

| NBER turn | dated on the index | months off |
|---|---|---|
| peak 1980-01 | not dated | |
| trough 1980-07 | not dated | |
| peak 1981-07 | 1981-07 | 0 |
| trough 1982-11 | 1982-11 | 0 |
| peak 1990-07 | 1990-10 | +3 |
| trough 1991-03 | 1991-05 | +2 |
| peak 2001-03 | 2001-05 | +2 |
| trough 2001-11 | 2001-12 | +1 |
| peak 2007-12 | 2008-04 | +4 |
| trough 2009-06 | 2009-10 | +4 |
| peak 2020-02 | 2020-02 | 0 |
| trough 2020-04 | 2020-04 | 0 |

Eight of twelve turns fell within three months. The bar was ten, so it
failed, and the tool's defaults stay as they are. There were no false turns.
Against random cuts the score is far above chance (F1 0.92 against 0.26).

## What the misses say

**1980 is too small for a one-column rule.** The index fell 0.6% across
NBER's 1980 recession, and its own decline lasted four months. Our rule asks
for six months, or a 5% move. With 3-month phases, the default we already use
for composites, 1980 is dated and the count rises to 10 of 12. We saw that
only after the result, so it does not count as a pass. It needs its own test
on an index we haven't looked at yet.

**The Great Recession is late at both ends, by four months each.** Wage
income kept the index rising until April 2008. The unemployment rate peaked
at 10% in October 2009 and held the index down past NBER's June trough. On
this index those really are its peak and trough. The rule read the index
correctly; the index just turns at different months from NBER.

**We were wrong about the jobless recoveries.** Before the run we wrote that
the troughs of 1991 and 2001 might come late, because payrolls as first
published put the 2001 trough in 2003. On this index they come one and two
months late. The 2001 problem we found in
[the data as published](2026-11-24-recession-dates-on-the-data-as-published.md)
does not show up here.

**Revisions moved almost nothing.** Across the five copies, monthly growth
differs by about 0.01 percentage points, and every dated month agrees except
the 1981 peak, which moves two months. Earlier, a composite of three FRED
series moved two turns by four months under revision. This index barely
moved.

## California

California's index (one copy, to 2023) dates ten of the national turns
within four months and misses 1980 the same way. It also finds a second dip,
1991-10 to 1992-06, with no national turn near it. That looks like
California's own early-1990s downturn, but with no published state dating we
could not score it. For anyone who wants to run `--turns` on a state, that is
the open problem: the labels don't exist yet.

Code, data sources and the full output:
[`eval/turns-usphci.mjs`](../../ventures/changepoint-detector/eval/turns-usphci.mjs),
the README section "A second make", and `data/SOURCE.md`. These are
statistical estimates, not forecasts or financial advice.
