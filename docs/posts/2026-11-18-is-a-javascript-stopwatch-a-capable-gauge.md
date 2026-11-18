---
title: "Is a JavaScript stopwatch a capable gauge? A Gage R&R on three timing harnesses"
seo_title: "Free Gage R&R calculator: ANOVA, nested, with confidence intervals"
date: 2026-11-18
tags: [gage-rr, measurement-system-analysis, quality, benchmarking, research-algorithms, browser]
description: "A free Gage R&R tool tried on a real study of three JavaScript timers: 22.5% of study variation, one harness behind the reproducibility, an interval to 64 µs."
---

A Gage R&R asks one question of a measurement: how much of the spread in the
numbers is the thing being measured, and how much is the gauge and the person
holding it? Factories ask it before a new caliper or test rig is trusted to
pass or reject parts. The new
[Gage R&R tool](../../ventures/gage-rr/) answers it by the ANOVA method, for
crossed studies (every operator measures every part) and nested ones
(destructive tests, where each operator gets their own parts). It runs in the
page, the command line or an agent call, and nothing is uploaded.

## A stopwatch is a gauge

The tool needed a real study for its example, not an invented caliper. A
benchmark harness turns a function into a number, which makes it a gauge, and
this one could be measured on the spot. So: ten "parts" (sorting copies of
arrays of 400 to 4,000 random numbers), three "operators" (timing harnesses),
three trials each, 90 readings in shuffled order
([`eval/benchmark-study.mjs`](../../ventures/gage-rr/eval/benchmark-study.mjs)):

- `single`: one call between two `performance.now()` readings;
- `loop50`: fifty calls, total divided by fifty;
- `median15`: the median of fifteen single calls timed with `process.hrtime.bigint()`.

With the part × operator interaction kept in the model:

| Source | %study variation |
| --- | --- |
| Gauge R&R | 22.5 |
| Repeatability | 15.7 |
| Reproducibility | 16.1 |
| Part-to-part | 97.4 |

That gives 6 distinct categories. By the AIAG manual's usual bands, that is
"may be acceptable": between 10% and 30%.

The reproducibility is nearly all one harness. `single` averages 101.5 µs a
call; `loop50` and `median15` read 83.4 and 85.0. Timing a single short call
adds the timer's own cost to every reading, so the harness reads high on
every part. The interaction plot shows it as a line sitting above the other
two. Drop `single` and gauge R&R falls to 14.7%, with 9 distinct categories.

These are one container's timings on one day. A rerun gives different numbers,
which is the point of a gauge study. The file the page ships is the one
measured for it.

## The number nobody prints: how sure the study is

Gauge reports usually print 22.5% as if it were a fact. But it comes from ten
parts and three operators, and with three operators reproducibility rests on
two degrees of freedom. The tool gives every variance component a confidence
interval: an exact chi-square interval for repeatability, and modified
large-sample intervals (Graybill & Wang 1980; Ting et al. 1990, reviewed for
gauge studies by Burdick, Borror & Montgomery 2003) for the rest. For the
benchmark, the gauge R&R standard deviation is 14.7 µs, with a 95% interval
of **11.6 to 64.1 µs**. The study can say that the gauge is not perfect. It
cannot say whether it is merely marginal or badly off.

Formulas like these are easy to get subtly wrong, so the tool checks the
intervals by simulation instead of trusting them. It drew 2,000 studies from
the random-effects model, with known variances, for each of seven designs:
crossed and nested, 5 to 20 parts, some with no operator or interaction
effect at all. Each interval was then checked for whether it contained the
true value. Every component's 95% interval did so 94.5% to 97.7% of the time
([`eval/coverage-output.txt`](../../ventures/gage-rr/eval/coverage-output.txt)).
That is slightly conservative, which is how MLS intervals are known to behave.

One choice goes beyond the papers. The total gauge interval's lower end is
not allowed to fall below repeatability's, because gauge variance cannot be
smaller than one of its own parts. The nested example needed it: there the
unbounded MLS lower limit was 0, while repeatability's was 1.56. The change
can only raise coverage, and the simulation agrees.

## Checked against

- Sums of squares from statsmodels 0.15.0 OLS ANOVA on eight generated
  studies, variance components from numpy solving the expected mean squares,
  and p-values and quantiles from scipy 1.18.1, all to 1e-9
  ([`reference.test.mjs`](../../ventures/gage-rr/reference.test.mjs)).
- A 2 × 2 × 2 study worked by hand. The first draft of that test was wrong:
  the hand arithmetic, not the engine. That is a fair reminder of why the
  Python reference exists.

## What it does not do yet

It handles balanced studies only, and treats operators as random. It does not
yet do the average-and-range method, attribute agreement, or bias and
linearity studies. The next useful addition is probably a bias and linearity
study, the other half of a typical measurement system analysis package.

Not affiliated with the cited authors, the AIAG or any statistics vendor.
Statistical estimates, not engineering certification. Written with AI
assistance.
