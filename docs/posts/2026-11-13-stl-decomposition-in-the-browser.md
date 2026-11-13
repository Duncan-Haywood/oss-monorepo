---
title: "STL decomposition in a browser tab, and the Mauna Loa CO2 cycle that grew"
seo_title: "Free STL decomposition online: trend, seasonality, remainder"
date: 2026-11-13
tags: [stl, time-series, seasonality, research-algorithms, browser]
description: "A free STL tool matches statsmodels to 1e-11. On 52 years of Mauna Loa CO2 it finds the seasonal swing grew about 0.09 ppm a decade, whatever the window."
---

Most people who look at a monthly chart ask the same question: was that a
good month, or is it always good at this time of year? Statisticians answer
it by decomposition. You split the series into a slowly moving **trend**, a
**seasonal** pattern that repeats every cycle and a **remainder**. Then you
look at the trend, or at the series with the seasonal part taken off.

The new [STL decomposition tool](../../ventures/stl-decomposition/) does
this in the page. It uses STL, the loess-based procedure of Cleveland,
Cleveland, McRae & Terpenning (1990, *Journal of Official Statistics*).
You paste a CSV with dates and values, and the period comes from the dates
(12 for monthly, 7 for daily, 24 for hourly). You get the trend, the seasonal
component, the remainder, the seasonally adjusted series, the strength of
trend and of seasonality (Wang, Smith & Hyndman 2006) and a seasonal profile
by month, weekday or hour. It also lists the points that stand out from both
trend and season. Robust mode runs the paper's outer loop, which gives
spikes low bisquare weights so they do not bend the other two components.
The same engine is a zero-dependency CLI (`node cli.mjs data.csv --robust`)
and an agent call (`platform/agents/tools.mjs call stl-decomposition analyze`).
It is the seventh tool in the
[research algorithms as tools](../../portfolio/research-tools/README.md)
series.

## Checked against statsmodels, to the eleventh decimal

STL is fiddly. Each cycle-subseries (every January, every February, ...) is
smoothed with loess and extended one cycle past each end. A low-pass filter
of three moving averages and another loess removes slow drift from that
pattern. Each loess can be evaluated every *k* points and interpolated, and
a window wider than the data has its own bandwidth rule. Small slips in any
of these give a decomposition that looks plausible and is wrong.

So the engine was written from the paper and then compared with
**statsmodels 0.15.0**'s `STL` on nine cases. They cover default, robust,
wide-window and degree-0-with-jumps settings on the CO₂ example, daily data
with eight planted spikes (plain and robust), hourly data with a 24-step
period, a quarterly series with jumps, and a short series whose seasonal
window is longer than each subseries. On every point of every case the
trend, seasonal, remainder and robustness weights agree to **2.6e-11 or
better**. The first comparison differed in one place: statsmodels returns the
robustness weights used in the final pass, and the engine had computed one
more set after it. That convention is now matched. The tests assert 1e-9, so
the reference file (`eval/reference.json`, from `eval/reference.py`) would
catch a regression.

## What the example says: the CO₂ cycle has grown

The example is NOAA's monthly mean CO₂ at Mauna Loa, May 1974 to September
2026 (629 months; the earlier Scripps months are left out so the example
uses only NOAA's own measurements). With the default settings:

- seasonality strength is 0.991 and trend strength 1.000;
- the seasonal high is May and the low September, a swing of 6.85 ppm in the
  latest year against 6.25 ppm in the first;
- the trend rose 99.5 ppm over the series and 1.78 ppm in the last year.

The bigger swing in the latest year could be one noisy year. So I averaged
each full calendar year's peak-to-trough seasonal swing and repeated it over
four smoothing settings:

| Seasonal window | Robust | 1975-1984 | 2016-2025 | Slope over 51 years |
| --- | --- | ---: | ---: | ---: |
| 7 | no | 6.33 ppm | 6.66 ppm | 0.088 ppm / decade |
| 13 | no | 6.31 | 6.68 | 0.090 |
| 35 | no | 6.31 | 6.66 | 0.087 |
| 7 | yes | 6.25 | 6.68 | 0.110 |

The direction and the size (about a third of a ppm, or 5 to 7%, over forty
years) hold however steady you force the seasonal pattern to be. That is the
point of a sensitivity check: the seasonal window is the one setting a user
has to choose, and the conclusion does not hang on it. It describes this
decomposition of this record and nothing more. Why the cycle grew is a
question for atmospheric scientists, not for a smoothing procedure.

NOAA's file also carries its own deseasonalized series, made by a different
method. STL's seasonally adjusted series is within 0.075 ppm of it on average
and 0.38 ppm at worst, and a test pins both numbers. Two independent
adjustments agreeing that closely is a useful sanity check on both.

The table came from this script, run from the venture folder:

```js
import { readFileSync } from "node:fs";
import { analyze } from "./engine.mjs";
const csv = readFileSync("data/mauna-loa-co2-monthly.csv", "utf8");
for (const [seasonal, robust] of [[7, false], [13, false], [35, false], [7, true]]) {
  const r = analyze({ csv, seasonal, robust });
  const byYear = {};
  r.dates.forEach((d, i) => (byYear[d.slice(0, 4)] ??= []).push(r.seasonal[i]));
  const swing = Object.entries(byYear).filter(([, a]) => a.length === 12)
    .map(([y, a]) => [+y, Math.max(...a) - Math.min(...a)]);
  // ...average 1975-1984 and 2016-2025, least-squares slope over all years
}
```

## A caveat the tool states up front

The "points that stand out" list is a screen, not a test. It flags remainders
at least 3.5 robust standard deviations from the median. In robust mode the
ordinary remainders shrink, because the fit no longer bends toward the
spikes, so more points pass that line: 43 of 629 on the CO₂ example, against
3 without robust mode. The README says so, and the weights column shows which
points the robust fit actually ignored.

## What next

STL fits one period. Hourly electricity load or daily web traffic has two or
three (a day, a week, a year). MSTL (Bandara, Hyndman & Bergmeir) runs STL
once per period, in turn, and is the natural next mode. It can be checked
against statsmodels' `MSTL` the same way.

*Written with AI assistance. The numbers above were produced by the engine in
`ventures/stl-decomposition/` on the bundled file; the comparison with
statsmodels is in its tests.*
