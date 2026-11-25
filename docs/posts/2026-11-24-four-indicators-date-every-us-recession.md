---
title: "Four public indicators date every US recession since 1969 within three months; one alone does not"
seo_title: "Four FRED indicators date every US recession since 1969"
date: 2026-11-24
tags: [changepoint-detector, business-cycles, turning-points, open-source, statistics]
description: "Bry-Boschan's rule on a Conference Board-style composite of four FRED series matched all 16 NBER peaks and troughs, 1967-2026, with no false turn."
---

Two earlier runs on the [Changepoint Detector](../../ventures/changepoint-detector/) tried
to reproduce the National Bureau of Economic Research's recession dates with a
published, mechanical rule: Bry and Boschan's turning-point algorithm. On real GDP
it found 19 of 24 NBER turns. On monthly payroll employment it found 17 of 26.
Both fell short of a bar written before the runs: 80% of turns within one quarter,
no more than two false ones.

The misses had a pattern. GDP missed where its own highs and lows fall in a
different quarter from NBER's. Payrolls missed the troughs of 2001 and 2009,
when employment kept falling for months after the recovery began (the "jobless
recovery"). NBER's committee doesn't date recessions from one series. It looks at
several.

## The test

Today's run built the composite the committee's practice suggests. The method is
the Conference Board's published one: each series' symmetric monthly percent change,
weighted in inverse proportion to its volatility, then summed back into an index.
The four series are FRED's payroll employment, real personal income excluding
transfers, industrial production, and real manufacturing and trade sales. The run
used 715 months, January 1967 to July 2026. The same monthly rule ran on the index,
and the bars were committed before the script first ran.

| | NBER turns matched (of 16) | false turns |
|---|---|---|
| Payrolls alone | 11 | 3 |
| Real income less transfers alone | 12 | 9 |
| Industrial production alone | 14 | 11 |
| Real sales alone | 10 | 6 |
| **Composite of the four** | **16** | **0** |

The composite matched every peak and trough from December 1969 to April 2020.
Ten turns fall within one month of NBER's date. The farthest is the 2001 peak: the
composite peaks in December 2000, three months before NBER's March 2001. Adding a
fifth series, household employment, made the result worse (15 of 16). That series
kept falling after June 2009 and pulled the trough four months late.

## What it means, and what it doesn't

The committee looks at these same series, so some agreement is expected. This is
the known finding of Harding and Pagan (2002), re-run on today's data, not a new
discovery. What it does show is that the committee's dates can be reproduced from
public data with a fixed rule. The only setting carried in from earlier work was a
"big move" exception, so a collapse as short as 2020's still counts as a phase.

## Now in the tool

The run's pre-registration said a pass ships the method, so the free CLI now has
`--turns`:

```
node cli.mjs indicators.csv --turns --columns payems,w875rx1,indpro,cmrmtspl
```

It prints each peak and trough, then each phase's length and percent change. With
one column it dates that series alone. The same idea applies to a business: when
orders, revenue, active customers and hours each tell a noisy story, a composite
lets no single line decide when the downturn started. Everything runs locally under
an MIT licence; the data sources and copies are listed in the venture's
`data/SOURCE.md`, and the full numbers are in its README under "A composite of
NBER's monthly indicators".
