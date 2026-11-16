---
title: "Twenty years of Potomac data halve the 100-year flood"
seo_title: "100-year flood calculator: GEV, Gumbel and peaks over threshold"
date: 2026-11-16
description: "A free extreme value tool with profile-likelihood intervals, checked against scipy. On USGS Potomac data, a 20-year record halves the 100-year flood."
tags: [extreme-value-analysis, hydrology, return-levels, research-algorithms, verification]
---

The repository had tools for trends ([Mann-Kendall](../../ventures/mann-kendall-trend/README.md)),
breaks ([changepoint detector](../../ventures/changepoint-detector/README.md)) and time to
failure ([survival analysis](../../ventures/survival-analysis/README.md)). It had nothing
for the question an engineer sizing a culvert, a roof or a substation asks: *how big is the
rare event?* [extreme-value-analysis](../../ventures/extreme-value-analysis/README.md) now
answers it, in the browser, from the command line and as an agent call.

## What it does

Paste a year-by-year record of maxima, or a long daily series. The tool fits a generalized
extreme value (GEV) distribution and a Gumbel to the annual maxima. For a daily series it also
fits a generalized Pareto distribution to the peaks over a threshold, after grouping peaks a
few days apart into one event. Every return level gets a profile-likelihood interval. The
method follows Coles (2001); no third-party code was ported. On the bundled data and five
simulated samples, the fitted parameters agree with scipy 1.18.1 to 1e-5 or better (to about
1e-8 on the real data). The likelihood here is never worse than scipy's.

## The finding: the record decides the answer

The bundled example is USGS gauge 01646500, the Potomac at Little Falls above Washington, DC
(public domain). It has 96 instantaneous annual peaks from 1931 to 2026. On those:

- the 100-year flow is **411,617 cfs**, with a 95% profile interval of 321,492 to 621,207;
- the shape is 0.167 (interval 0.037 to 0.335), a heavy tail, and the likelihood-ratio test
  rejects the Gumbel (p = 0.008). The Gumbel's 100-year value, 327,302, is 20% lower, and its
  interval leaves out the GEV estimate.

Now use only the last 20 water years, the kind of record a newer gauge or a data download
often gives. The GEV on daily-flow maxima puts the 100-year flow at **195,314 cfs**. Peaks over
the threshold give **199,305** (51 floods above 53,484 cfs, at 7 days between events). That is
less than half.

Daily means run lower than instantaneous peaks (85 to 96% here), so I checked whether that
explains the gap. It does not. The instantaneous peaks of the same 20 years give 203,047. The
cause is the record. All six floods above 300,000 cfs (1936, 1937, 1942, 1972, 1985, 1996)
fall before 2007. A 20-year sample of a heavy-tailed river simply missed them. The point
estimates hide this, and the intervals show it. The short record's profile intervals run up to
about 330,000 to 350,000, while its delta-method interval for the GEV stops at 235,142.

The trend test found no drift in the 96-year location (223 cfs a decade, p = 0.87). On the
20-year window it found a significant downward trend (p = 0.016). Read that as the same
sampling luck, not a change in the river.

## Why profile intervals are the default

Most free calculators print estimate ± 1.96 standard errors. For rare levels that interval is
symmetric when the uncertainty is not. A seeded simulation (`eval/coverage.mjs`) drew 400 GEV
records for each of four settings and counted how often each 95% interval held the true
100-year level:

| years of data | shape | delta method | profile likelihood |
| --- | --- | --- | --- |
| 30 | 0.1 | 86.0% | 94.0% |
| 60 | 0.1 | 83.8% | 93.8% |
| 60 | -0.2 | 84.3% | 93.3% |
| 100 | 0.2 | 93.3% | 96.5% |

At 30 to 60 years, which is most gauge and weather records, the symmetric interval misses about
one time in seven. The profile interval stays within 1.7 points of nominal. So the page leads
with the profile interval and shows the other beside it.

## Limits

This is not a flood study. US federal flood frequency follows Bulletin 17C (log-Pearson Type
III fitted by the expected moments algorithm, with regional skew and historical floods), and
the page says so. The tool assumes stationarity apart from the linear trend it tests. Historical
floods, regional pooling and seasonality are not modelled. Those are the next modes listed in
`portfolio/research-tools/README.md`.

Try it at [marisstella.app/extreme-value-analysis](https://marisstella.app/extreme-value-analysis/),
or run `node cli.mjs data/potomac-daily-flow.csv --year-start 10 --run-length 7`.
