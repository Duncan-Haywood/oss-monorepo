---
title: "Synthetic control in a browser tab, and how the placebo screen changes the p-value"
seo_title: "Free synthetic control method online: weights, placebos, leave-one-out"
date: 2026-11-12
tags: [synthetic-control, causal-inference, policy-evaluation, research-algorithms, browser]
description: "A free synthetic control tool reproduces the West Germany weights. On the same data the placebo p-value runs from 0.059 to 1 on one screening choice."
---

When one unit gets an intervention (a state passes a law, a region gets a
new store format, a country goes through a shock), the natural question is
what would have happened without it. You only see one of those two worlds.
The synthetic control method (Abadie & Gardeazabal 2003; Abadie, Diamond &
Hainmueller 2010) builds the other one from untreated peers. It finds a
weighted average of them that tracks the treated unit before the
intervention and reads the effect as the gap afterwards. The weights are
non-negative and sum to one, so the comparison is a visible mix of real units
and never extrapolates beyond them.

The new [synthetic control tool](../../ventures/synthetic-control/) runs the
whole method in the page. You upload a long panel (one row per unit and
period), pick the treated unit and the first affected period, and get the
donor weights, a predictor balance table, both paths on one chart, the
average post-period gap, a placebo permutation p-value and a leave-one-out
check, with a summary in words. The same engine is a zero-dependency CLI
(`node cli.mjs --example`) and an agent call.

## Checked against an R-parity implementation

The example is the West German reunification study of Abadie, Diamond &
Hainmueller (2015): GDP per head for West Germany and 16 OECD countries,
1960 to 2003. The tests compare it with
[pysyncon](https://github.com/sdfordham/pysyncon) 1.7.0, an independent MIT
Python implementation whose own parity tests pin it to R's Synth. With the
paper's cross-validated predictor weights, every donor weight lands within
0.01 of pysyncon's. Austria comes out at 0.413 against 0.415, the USA 0.216
against 0.216, Japan 0.163 against 0.162, Switzerland 0.109 against 0.108
and the Netherlands 0.099 against 0.098. The synthetic path is within 0.5%
in every year, and the average 1990-2003 gap is -1,555 dollars per head
against pysyncon's -1,555.13.

The inner problem (the weights for a given predictor importance V) is a small
quadratic programme on the simplex. pysyncon and Synth hand it to a
general-purpose optimiser; this tool solves it exactly with an active-set
method, checked against brute-force enumeration on 200 random problems. That
matters more than it sounds. On the nested fit, where V is searched to
minimise pre-period error, the exact solver reaches a pre-period MSPE of
13,396 against pysyncon's 14,765. On the fit that matches the raw GDP path
it reaches 5,522 against 5,627. The outer Nelder-Mead search walks a
slightly different surface, so the nested weights differ in the second
decimal (Austria 0.449 against 0.423, Netherlands 0.056 against 0.092). The
average gap moves from -1,585 to -1,515. The tests therefore compare these
two fits by objective, not by weights.

## The p-value depends on a screen you choose

Inference in synthetic control is by placebo. You rerun the whole fit with
every donor as if it had been treated and ask where the real unit's ratio of
post- to pre-intervention fit error ranks. On the example West Germany ranks
first of 17, so the permutation p-value is 1/17 = 0.059, the smallest
possible with 16 donors.

ADH (2010) also screen out placebos whose pre-period fit is much worse than
the treated unit's, because a placebo that never fitted tells you nothing.
West Germany's pre-period fit is unusually good (RMSPE 128 dollars on a mean
near 8,000), so the screen bites hard. Here is what the tool reports, with
West Germany first in every case:

| Screen (pre-period MSPE at most) | Units kept | p-value |
| --- | --- | --- |
| none | 17 | 0.059 |
| 20x the treated unit's | 12 | 0.083 |
| 5x | 3 | 0.333 |
| 2x | 1 | 1.000 |

None of these is wrong. Each is a different question about which comparisons
count. But a reader who sees "p = 0.06" and one who sees "p = 0.33" on the same
data should know they differ only in this choice. So the summary states both
the unscreened rank and the screened one, and the placebo table marks each
unit kept or dropped.

## Leave-one-out needs the fit next to it

Dropping each donor with positive weight and refitting is the standard
robustness check (ADH 2015). On the example four of the five drops keep the
gap between -1,505 and -2,805. Dropping the USA flips it to +116. Read
alone, that looks like the estimate hangs on one country. But the refit
without the USA tracks West Germany's pre-1990 GDP with an RMSPE of 935
against 128. West Germany was richer than every remaining donor, so no
convex mix of them can reach it. The summary says this in words: a sign flip
on a refit with a much worse pre-period fit is a weak counterfactual, not
evidence against the effect. A flip on a comparable fit gets a different
sentence, saying the estimate leans on that donor.

## Limits

The tool handles one treated unit, assumes the donors were not touched by the
intervention or its spillovers, and warns when the treated unit sits outside
the donors' range on a predictor. Placebo p-values are ranks, bounded below by
1/(J+1). The augmented synthetic control of Ben-Michael, Feller & Rothstein
(2021), which corrects the bias left by imperfect pre-period fit, is the
natural next mode; it is listed as the next candidate in
`portfolio/research-tools/README.md`.

Statistical output from your data, not legal, financial or policy advice.
The method is from the cited papers; the tool is not affiliated with their
authors, pysyncon or Synth.
