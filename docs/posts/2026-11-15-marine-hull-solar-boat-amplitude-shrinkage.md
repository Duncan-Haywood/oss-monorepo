---
title: "Halve the cosine: shrinking a solar boat's one-year seasonal correction"
seo_title: "Solar USV forecast correction: shrink the seasonal amplitude"
date: 2026-11-15
tags: [research, marine-hull]
description: "Shrinking a one-year seasonal cosine by its own noise helps a solar boat a little on ordinary water and costs it at high latitude, where the swing is real."
---

A solar boat plans its battery use from a sun climatology that is a little wrong in a seasonal way. The [last step](2026-11-15-marine-hull-solar-boat-harmonic-seasonal-correction.md) found the best way to learn that error from one season of the boat's own log: fit a yearly cosine to the ratio of logged harvest to forecast. That cosine still came out too big from one year (a median swing of 4.4%, against 2.3% from five years), because one year's weather leaks into it.

This step shrinks the cosine's swing toward zero by its own standard error. That is empirical-Bayes shrinkage on two numbers, the cosine and sine terms. We tried two versions. One estimates the prior from the fit itself. The other pools it over all 30 ocean points, like a fleet sharing what it knows. We wrote nine predictions down before running anything. The test reused the same 168 cases: NASA POWER daily sunlight 2005 to 2014, four battery sizes, the climatology's real error plus 20 added seasonal biases. Seven predictions held.

What came out:

- **It helps a little on ordinary water.** The win count against the plain 7-day rule (further, with no more payload downtime) rises from 126 to 130 of 168 cases with the per-fit prior and to 132 with the pooled one. On the climatology's own error, point by point, it reaches 136 of 240. That is the best one-year count so far (no correction: 126).
- **It still does not beat no correction from one year.** Over all 168 cases no correction wins 139. With two years and the pooled prior the shrunk cosine reaches 143.
- **It hurts at high latitude.** At the nine points above about 50 degrees the real seasonal error is bigger than one year's noise, so shrinking throws away signal. There the win count falls from 89 to 61 (per-fit) and 54 (pooled). The pooled prior is set mostly by low-latitude points, so it shrinks hardest exactly where it should not.
- **The typical shrinkage is about half.** The median weight kept on the fitted swing is 0.53 per fit and 0.61 pooled. Either way the shrunk swing ends up near what five years give unshrunk.

For anyone building a solar boat's energy manager: after one season on ordinary water, fit the yearly cosine and halve its swing. Above about 50 degrees, keep the full cosine. After two seasons, either works.

The next test makes the prior depend on latitude, so the shrinkage stays on in the tropics and switches off near the poles.

Limits: the noise estimate treats months as independent. The per-fit prior has two degrees of freedom and switches off entirely in a third of one-year fits. The added biases are pure cosines that repeat between learning and scored years, which favours no shrinkage, so the real-error cases are the fair test. History length and recency are still mixed. This is simulation only, with calm water, daily steps, NASA POWER sunlight and one 4 m hull. Code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zze). Written with AI assistance.
