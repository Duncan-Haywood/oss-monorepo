---
title: "Stale or just slow? Telling a frozen data feed from a series rounded to its precision"
seo_title: "Repeated values in a time series: stale feed or rounding?"
date: 2026-11-12
tags: [changepoint-detector, time-series, data-quality, stale-data, rounding]
description: "A repeated value can mean a stale feed or a series rounded to its precision. A tick check tells them apart, tested on simulated and real data."
---

A value that repeats exactly from one month to the next can mean two
different things. Either nobody refreshed it (a stale quote, a figure carried
forward), or it was refreshed and simply moved less than the precision it is
recorded to. The [Changepoint Detector](../../ventures/changepoint-detector/)
has, since this morning, said when the share of exact repeats in a series
changes. Today that check reached the tool's two remaining outputs, several
columns at once and the six-setting consensus, and the first file it ran on
showed why the two meanings need separating.

## Two columns, two stories

The tool ships a monthly file of Florida frozen orange juice prices
(1950 to 2000) with the US producer price index beside it. Run with
`--columns`, the check speaks on both:

- **price**: repeats fall from 60% of months before about August 1981 to 12%
  after. In the stickier stretch, when the price did move, the median move was
  19.5 times the smallest step in the data. A repeat there is a month nobody
  updated the figure.
- **ppi**: repeats fall from 33% of months before about April 1969 to 8%
  after. The index was published every month. It is recorded to 0.1, and in
  the 1950s and 1960s half of the months it moved, it moved by exactly 0.1.
  Those repeats come from rounding a slow series. They say inflation picked up,
  not that the feed was fixed.

The old wording ("this describes how often the data was refreshed: a stale
feed...") would have been wrong about the second column.

## The check

For each change, take the stretch with more repeats and its own smallest move
between neighbours (its tick). If the median move, among steps that moved, is
at most 1.5 ticks, the repeats may be rounding, and the text now says so. The
rule was written down before it ran, then checked once on simulated series:
rounded random walks that speed up or slow down were flagged 600 times in 600,
and stale feeds carried forward at changing rates 0 times in 583. On real
labelled benchmark series it flags children per woman (two decimals, moving
0.01 a year) and an image scanline (integer pixel values), and leaves the
measles counts and the orange juice price alone.

One case it cannot separate: a stale feed whose real moves are themselves
about one tick. There it says "may".

## A trap in several-column files

Multi-column files have blank cells, and to keep the columns aligned the tool
carries the last value forward. Fed to a repeat check, every blank becomes a
repeat. A column with scattered blanks from some row onward would show a
change of update rate that is not in the data. The parser now lists those
cells and the check reads them as missing.

Details, tables and the test are in the venture's README, "The update-rate
check on every output, and repeats from rounding". The tool is free and runs
in the browser or as `node cli.mjs`. Its results are statistical estimates,
not advice.
