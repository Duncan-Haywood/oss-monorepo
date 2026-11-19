---
title: "The one-sided p-value hiding in every LISA map, and 81 years of US state incomes"
seo_title: "Free Moran's I calculator: spatial autocorrelation, LISA, hot spots"
date: 2026-11-18
tags: [spatial-statistics, morans-i, lisa, hot-spot-analysis, statistics, research-algorithms, browser]
description: "A free Moran's I and LISA tool checked against PySAL. The usual permutation p rejects 9-12% at 0.05, and 89% of pattern-free maps show a 'cluster'."
---

Put a number on every place on a map (an income, a disease rate, a house
price) and the first question is whether the map has a pattern at all: do
high values sit next to high values? Moran's I answers that, and its local
version, LISA, colours the map by where the clusters and outliers are. The
new [spatial autocorrelation tool](../../ventures/spatial-autocorrelation/)
does both, plus Geary's C, Getis-Ord General G, Gi* hot spots and a distance
correlogram. You give it a CSV with coordinates or a list of which areas share
a border, and it runs in the browser, on the command line or as an agent call,
without a GIS.

It agrees with PySAL. On nine weight set-ups that libpysal built itself
(shared borders, great-circle nearest neighbours, distance bands, inverse
distance with powers 1 and 2), every analytic number from esda 2.9.0 matches
to 1e-9: Moran's I, Geary's C, General G, their variances and z-scores, and
every local I and Gi* z. The engine was written from the papers, not ported.
Before writing a page that tells people what their p-values mean, I checked
what those p-values actually do.

## The permutation p is one-sided

PySAL and GeoDa get the permutation p-value by shuffling the values over the
map 999 times and counting the shuffles at least as extreme as the real map
*in the direction the real statistic fell*. That makes it a one-sided p-value
reported for whichever side the statistic landed on. Testing it at 0.05 is a
two-sided test at 0.10.

A simulation shows the size of the effect. I put values with no spatial
pattern at all (normal and lognormal) on two maps, the 48 states with shared
borders and 120 random points with 6 nearest neighbours, 1,000 times each,
and counted how often each test said "significant at 0.05"
([`eval/calibration-output.txt`](../../ventures/spatial-autocorrelation/eval/calibration-output.txt)):

| Test | False positives at 0.05 |
| --- | --- |
| Moran's I, analytic (randomisation) | 3.9% to 5.3% |
| Moran's I, folded permutation p (PySAL, GeoDa) | 9.1% to 10.4% |
| Moran's I, twice the folded p | 4.4% to 5.8% |
| Geary's C, folded permutation p | 10.0% to 12.0% |
| Geary's C, twice the folded p | 3.8% to 6.1% |

So the tool reports twice the folded p as `p_sim`, and keeps the one-sided
value beside it as `p_sim_one` for anyone comparing with GeoDa.

## Local maps of pure noise light up

LISA runs one test per place. On the same pattern-free data, even with the
two-sided p, the 48-state map showed at least one "significant" local cluster
in 88.7% to 89.8% of the simulated maps, and the 120-point map in 99.0%. A
cluster map at p < 0.05 with no correction is a list of places worth a look,
not a finding.

The usual fix is a false-discovery-rate cut-off (Benjamini-Hochberg), and it
has a trap. With 999 permutations the smallest possible two-sided p is 0.002.
The first Benjamini-Hochberg step for 48 places needs p ≤ 0.05/48 = 0.00104,
so nothing can ever pass. With the option on, the tool now runs at least
2n/α permutations for the local tests (1,920 for 48 places) and says so. With
that, maps of pure noise showed any cluster in 4.5% to 9.0% of runs.

## 81 years of state incomes

The example is per-capita personal income for the 48 contiguous states from
1929 to 2009, from the Bureau of Economic Analysis, with shared borders as the
neighbours. It is the series Rey and Montouri (1999) used for the spatial side
of US income convergence, and it ships with PySAL. The tool analyses every
year column at once:

- Income is clustered in every one of the 81 years.
- Moran's I peaks at **0.667 in 1934**, falls to **0.248 in 1981**, and is
  back to **0.429 in 2009** (z = 4.65). For half a century the map of rich and
  poor regions blurred; after 1981 the clusters re-formed.
- In 2009, Connecticut, Delaware, Massachusetts, New York and Rhode Island
  form a high-high cluster, Tennessee sits in a low-low one, and Vermont is a
  low-high outlier (a lower-income state beside rich ones). All seven are
  flagged under each of 50 random seeds. Pennsylvania, Louisiana, Georgia,
  Mississippi and Arkansas are flagged under 12 to 24 of the 50: they are
  coin flips at the cut-off. With the FDR cut-off, only New York and Rhode
  Island remain.
- General G is *not* significant in 2009 (z = -0.89). G only responds when
  high values cluster more than low ones, and here the rich north-east and the
  poorer south cluster about equally. Moran's I sees both clusters, so it
  responds.

## One difference from esda

esda's local Gi* divides by the sum of the values and squares the mean in its
variance, so when the values sum to a negative number (a column of changes,
say), its z-scores come out with the opposite sign. Ord and Getis's (1995)
standardised form, which the tool uses, does not have that problem. The
reference test checks that case explicitly instead of hiding it.

## What it does not do

It handles one variable at a time (no bivariate Moran or spatial regression)
and does no rate smoothing, so a rate from a small population will look like
an outlier. It compares every pair of places, which caps it at 5,000. The map
is a dot map of the coordinates, not polygons. If those limits matter, the
next steps are empirical-Bayes rate smoothing and a bivariate Moran.

[Try it](https://marisstella.app/spatial-autocorrelation/) or run
`node ventures/spatial-autocorrelation/cli.mjs places.csv --neighbors borders.csv --fdr`.
It is free, MIT licensed, and nothing you paste leaves the browser. It is not
public-health, planning or other professional advice: a cluster is a
pattern, not a cause.
