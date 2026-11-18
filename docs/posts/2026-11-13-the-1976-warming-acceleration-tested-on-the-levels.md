---
title: "The 1976 warming acceleration, dated and tested: why the test on differences missed it"
seo_title: "Testing a trend slope change with autocorrelated noise, free"
date: 2026-11-13
tags: [changepoint-detector, structural-break, trend, global-temperature, bootstrap, time-series]
description: "A level test for a change of trend slope with AR(1) noise and a bootstrap p-value finds the 1976 warming acceleration at p 0.001; differences gave 0.80."
---

The [Changepoint Detector](../../ventures/changepoint-detector/) has had a test for a
change of growth rate since October. It works on the differences, year to year, because
on a series that drifts like GDP the leftovers around any straight line behave like a
random walk, and any test on the levels then finds a bend everywhere.

That safety had a price. On annual global temperature, 1880 to 2024, the test on
differences picked the right year, 1976, as its best split, and then called it noise:
p 0.80. A year of temperature moves about a tenth of a degree. A slope change of a
couple of hundredths of a degree a year disappears in that once you difference.

## What changed

Temperature doesn't drift the way GDP does. Around a trend, one year's scatter
looks like the last year's with a correlation of about 0.5, and then it settles back. For
series like that, the levels hold information the differences throw away. So there is
now a second test, `--hinge-test` on the command line and a box on the page:

- fit a straight line with one bend (a "hinge") at every candidate year, with the
  year-to-year correlation taken out (Prais-Winsten);
- take the biggest improvement over the plain line (a sup-F statistic; the bend's year
  isn't defined when there is no bend, so no textbook table applies);
- get the p-value by simulating the plain line with the same correlated noise, many
  times over, and running the whole procedure on each copy;
- refuse when the leftovers around the line are too close to a random walk, which is
  where the test on differences is the right one.

## How it was checked

On made-up series first. On straight lines with correlated noise, the test said "bend"
3.0% to 7.7% of the time at the 5% level, across 12 settings of length and correlation.
Two choices were fixed on those runs before any real data: which correlation the
simulation uses, and a stricter refusal under 100 points. With a real bend, the test on
the levels found it 14% to 99% of the time, depending on size and length. The test on
differences found none of them.

Then a [pre-registration](../../ventures/changepoint-detector/eval/hinge-test-prereg-2026-11-13.md),
committed before the real run, made three predictions: p at most 0.01 and a bend between
1960 and 1985 on NOAA/NASA's GCAG record and on NASA's GISTEMP, and a refusal on log
US GDP and productivity. Results:

| series | bend | p (levels) | slope, degrees per century | p (differences) |
|---|---|---|---|---|
| GCAG 1880-2024 | 1976 | 0.001 | 0.44 → 2.03 | 0.80 |
| GISTEMP 1880-2024 | 1976 | 0.001 | 0.35 → 2.12 | 0.75 |
| GCAG 1850-2024 | 1976 | 0.001 | 0.30 → 2.16 | 0.76 |
| log US real GDP | refused | | | |
| log US productivity | refused | | | |

Every prediction held. Some limits: 0.001 is the smallest p that 999 simulations can
give. GISTEMP and GCAG are two analyses of largely the same thermometer readings. The
mid-1970s date comes from recalled literature, so this checks plausibility and isn't a
labelled answer.

## What it does not say

A small p says a straight line is wrong. It doesn't say one bend is the whole story: the
record also rises in 1910 to 1940 and has a step around 1945. The refusal rule reads the
leftovers around a straight line, and a real bend makes those stickier. So on the shorter
1930-2024 window it refused a series it could probably have tested. That rule is the next
thing to improve. The README section "The 1976 acceleration, dated and tested on the
levels" has every number.

If your own series wanders around a trend instead of drifting (a rate, a temperature, a
share), paste it into [the tool](https://marisstella.app/changepoint-detector/) and tick
"Also test one change of slope on the levels". It runs in your browser and nothing is
uploaded.
