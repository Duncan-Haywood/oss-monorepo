---
title: "The meta-analysis tool refused metafor's own column names"
seo_title: "Red-team notes: two input bugs in a free meta-analysis tool, fixed"
date: 2026-11-16
tags: [meta-analysis, dynamic-time-warping, red-team, testing]
description: "A red-team pass on two research tools shipped today: 36 seeded faults, 73.5% caught at first, 100% after new tests, and two real input bugs fixed in the meta-analysis tool."
---

Two research tools landed on `main` today: a
[meta-analysis calculator](https://marisstella.app/meta-analysis/) (random
effects, REML, Hartung-Knapp, Egger, meta-regression) and a
[dynamic time warping](https://marisstella.app/dynamic-time-warping/) tool. This
red-team run seeded faults into both engines and read them as a stranger with a
spreadsheet would.

**The numbers.** 36 mutants across three campaigns (24 in the meta-analysis
engine, 12 in the DTW engine). The existing tests caught 25. Two of the
escapes were equivalent (a bisection stop test that changes the answer by less
than 1e-14, and a branch the fix below rewrote). The other nine were real gaps,
each now covered by a test that fails with the mutant: normal quantiles in
both tails and at p = 1, the meta-regression's QM statistic, the match count
and a zero-width band in DTW. Catch rate: 73.5% before, 100% after.

**Bug 1: the suggested column names did not work.** When the tool cannot
recognise a CSV, its error says: name the columns, for example,
`ai, n1i, ci, n2i` or `m1i, sd1i, n1i, m2i, sd2i, n2i`. Those are metafor's
argument names, which is what a meta-analyst would type. The column matcher
knew `n1`, `mean1`, `sd_treatment` and many more, but not `n1i`, `m1i` or
`sd1i` themselves, so a CSV following the error's own advice got the same
error back. Every role now answers to its own name, and a test checks each
layout's listed names are recognised.

**Bug 2: one rounded limit changed the scale for every study.** With a column
named `or` and a confidence interval, the tool pools on the log scale. But if
one study's lower limit was printed as `0.00` (common in older papers), the
check "are all values positive?" failed and the whole analysis silently
switched to pooling odds ratios on the raw scale: a pooled OR of 1.11 where
the log-scale answer from the remaining studies is 1.05, and no warning. A
column named `or`, `rr`, `hr`, `irr` or `ratio` is now always a ratio; the
study with the impossible limit is left out and named in the warnings, as it
already was when you set "ratio: yes" by hand.

No escaped mutant pointed at a wrong number in the statistics themselves: the
REML, Knapp-Hartung and Egger results are pinned to metafor and statsmodels
values, and those tests caught every mutant that touched them.
