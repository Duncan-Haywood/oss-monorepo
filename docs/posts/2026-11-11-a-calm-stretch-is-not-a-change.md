---
title: "A calm stretch is not a change: giving each segment its own volatility, and why it still failed its test"
seo_title: "Volatility-robust changepoint detection: a pre-registered miss"
date: 2026-11-11
tags: [changepoint-detector, changepoint-detection, time-series, volatility, kalman-filter, negative-result]
description: "A scale per segment stops the drift model cutting volatility bursts into jumps (17 cuts to 2.4), yet fails its pre-registered held-out rule on TCPD."
---

The [Changepoint Detector](../../ventures/changepoint-detector/)'s `--model drift`
lets the level of a series wander as a random walk, so a population curve or a
lake level is not cut into a staircase. It has one known failure: when a series
goes through a burst of volatility, a stretch where everything moves five times
as much, the model has one noise scale for the whole series, so it reads the
burst as a run of separate jumps. On the Turing Change Point Dataset (TCPD) that
is 63 cuts on the `bank` series, where the annotators mark none, and 52 on
bitcoin.

## The change

The fix tried today gives every segment its own scale. Inside a segment the noise
and the wander are both multiplied by that segment's scale; the ratio between them
stays shared. The scale is profiled out of each segment's Kalman filter
innovations, so the exact optimal partition stays O(n²) and a change now costs a
penalty for two new numbers (a level and a scale), 3 log n. A volatility burst
becomes two cuts, one where it starts and one where it ends, and each is reported
with the scale before and after it.

## What we said would count, before running it

The rule went in the scripts' headers first. Offer it as an opt-in flag if:

1. on a synthetic random walk whose steps are five times larger for 60 of 300
   points, it reports at most half the shipped model's cuts;
2. it loses no more than 6 of 60 series' worth of power on plain level steps;
3. on TCPD it is no more than 0.02 below the shipped drift model on **both** the
   31 shipped and the 7 held-out series.

## What happened

The synthetic half passed easily. The volatility-burst walk went from **17.0 cuts
to 2.4**, with both burst edges found almost every time; white noise whose spread
triples for a while went from 7.1 cuts to 2.0; level steps were found 60 of 60
and 59 of 60 times.

On TCPD the shipped set gave F1 **0.756**, the highest mean any setting of this
detector has scored there, above the published binseg default (0.714). Bitcoin
went from 52 cuts to 28. The held-out set gave **0.464** against the shipped
model's 0.527: a drop of 0.064, well past the 0.02 guard. So the rule fails, and
nothing changes for users. The option stays in the library with its tests and
both evaluation outputs, in the README section "Volatility on a drifting level".

## Why `bank` got worse, not better

`bank` went from 63 cuts to 170. It turns out not to be bursty at all. It is
*sticky*: 246 of its 580 steps are exactly zero. Give each segment its own scale
and every flat run becomes a segment whose scale drops to the floor, buying far
more likelihood than the penalty costs. The median segment is three points long.
A scanline image in the held-out set does the same thing (233 zero steps, 27 cuts
to 75).

That points at the next try: a scale floor tied to the data's resolution, or a
noise term that knows some steps are exactly zero. Since that idea came from
looking at the result, it needs its own pre-registration before it can count.

The code is MIT licensed; everything above can be rerun with
`sh eval/tcpd-fetch.sh tcpd-data && node eval/tcpd-drift-scale.mjs tcpd-data`
and `node eval/drift-scale-sim.mjs` in the venture's folder. This is statistical
analysis of data you supply, not advice.
