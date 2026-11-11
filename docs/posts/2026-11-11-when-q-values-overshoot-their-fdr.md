---
title: "Eight multiple-testing corrections side by side, and a case where q-values miss their target"
seo_title: "Free Benjamini-Hochberg FDR calculator with q-values, Holm and e-BH"
date: 2026-11-11
tags: [multiple-testing, false-discovery-rate, benjamini-hochberg, q-values, research-algorithms, browser]
description: "A free tool corrects p-values eight ways at once. Its simulation found Storey q-values more than doubling their FDR target when tests are correlated."
---

Anyone who runs more than one test runs into the same question: which of
these results still stand? Twenty A/B-test metrics on one dashboard, a
gene-expression screen, every cross-tab in a survey. Each test at the 5% level
has a 5% chance of a false positive when nothing is going on. Run twenty and
you expect one; run twenty thousand and you expect a thousand.

The new [multiple testing correction tool](../../ventures/fdr-multiple-testing/)
takes a pasted list of p-values (or a CSV with a p-value column) and runs
eight corrections at once: Benjamini-Hochberg, Benjamini-Yekutieli, the
two-stage Benjamini-Krieger-Yekutieli procedure, Storey's q-values, Bonferroni,
Šidák, Holm and Hochberg. For each test it gives every method's adjusted
p-value and shows how many results each method keeps. The table also says what
each method assumes about dependence between tests. The tool corrects e-values
too, with the e-BH procedure of Wang and Ramdas (2022). It runs in the page,
from `node cli.mjs`, and through the agent tool runner. It is the fifth of
the portfolio's [research-algorithm tools](../../portfolio/research-tools/README.md),
where Benjamini-Hochberg had been listed as a candidate.

## Why put them side by side

Most online calculators do one method. Choosing a method is the real decision,
and it rests on what each one controls and what it assumes. Bonferroni and
Holm bound the chance of even one false positive, under any dependence.
Benjamini-Hochberg bounds the expected share of false positives among the
results you keep, and it needs tests that are independent or positively
dependent. Benjamini-Yekutieli pays for validity under any dependence with a
factor of 1 + 1/2 + ... + 1/m. Storey's q-values estimate how many tests are
truly null and give that slack back. Putting all eight in one table, each
labelled with what it controls and what it assumes, makes those trade-offs
visible.

## Checked against statsmodels

The engine is written from the papers' definitions. A Python script
(`eval/reference.py`) runs statsmodels 0.15.0's `multipletests` on six
lists: the example; an all-null and an all-significant edge case; 200 tests
rounded to three decimals so there are ties; 1,000 tests; and 120 tests
reaching down to p = 1e-14 with a block of exact 1s. The JavaScript tests
hold every adjusted p-value for six methods to 1e-12 of statsmodels'. They
also match the two-stage rejections at four levels and the q-values at three
values of lambda. e-BH is checked against a direct implementation of its
definition, on 300 likelihood-ratio e-values.

The bundled example is the 15 p-values from Benjamini and Hochberg's 1995
paper. Bonferroni and Holm keep 3, Benjamini-Hochberg keeps 4 and the
two-stage procedure keeps 8. The tool's second-stage level is 0.0649, the
figure statsmodels' own tests attribute to the 2006 paper. The example also
shows how sharp BH's cut-off can be. The 5th to 9th p-values have
BH-adjusted values between 0.060 and 0.077, so moving from a 5% to a 10%
false discovery rate takes the kept list from 4 to 9.

## What the simulation found

A seeded simulation (`eval/simulate.mjs`) draws 1,000 one-sided z-tests, 100
of them with a real effect (a mean shift of 2.5), and runs every method at
0.05, 400 times. With independent tests every FDR method stayed under its
target. Benjamini-Hochberg's actual false discovery rate was 0.044, close to
the theoretical pi0 x 0.05 = 0.045, and it found 34% of the real effects. Holm
found 8.4% and kept its chance of any false positive at 0.048.

Next, every pair of test statistics was correlated at 0.5 through one shared
factor. Benjamini-Hochberg stayed valid, with an actual FDR of 0.029, as
Benjamini and Yekutieli's 2001 theorem for positive dependence says it
should. Storey's q-values did not: their actual false discovery rate was
**0.109**, more than double the 0.05 target. The shared factor moves every
p-value in a run together, and the share of p-values above lambda is all the
pi0 estimate counts. The true pi0 was 0.9. With independent tests the
estimate stayed between 0.854 and 0.942 in 90% of runs. With correlation its
median was still 0.908, but it fell below 0.5 in 26% of runs, and to 0.116
or lower in one run in twenty. In those low-pi0 runs the q-values' false
discovery proportion averaged 0.41. Storey and Tibshirani (2003) state their
guarantee for independent or weakly dependent tests, and 0.5 is not weak.
The page now states this limit with the number, and the tool warns when pi0
rests on fewer than 100 tests.

This is one correlation structure and one effect size, so read it as a
pattern to check rather than a general bound. Still, q-values are the
default in much of genomics, where tests are often correlated. If you suspect
strong dependence, report Benjamini-Hochberg or Benjamini-Yekutieli alongside
them.

## What next

The candidates that would extend this tool most: online FDR control
(Javanmard and Montanari 2018), for experimentation teams whose tests arrive
one at a time; and a calibrator from p-values to e-values, so e-BH can be
used when only p-values exist. Both are in the
[research tools list](../../portfolio/research-tools/README.md).

*Statistical output from the data you supply; not medical or financial advice.
Not affiliated with the authors of the cited papers.*
