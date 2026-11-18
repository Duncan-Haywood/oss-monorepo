---
title: "A synthetic control from the command line, and a warning that doesn't always name the culprit"
seo_title: "Synthetic control CLI with a covariate balance warning"
date: 2026-11-17
tags: [changepoint-detection, statistics, synthetic-control, causal-inference]
description: "The changepoint detector's CLI now runs a synthetic control with a balance table. A pre-registered two-covariate test shows the warning's limits."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) has had a synthetic control in its library all day. It reproduces Proposition 99: California ranks 1st of 39 states, p 0.026, with a gap of about 20 packs a head. Since this afternoon it can also report the fit's covariate balance, with a warning [calibrated in simulation](2026-11-17-changepoint-synthetic-control-covariates.md). Neither was something you could run without writing JavaScript. Now both are on the command line:

```
node cli.mjs data/us-cigarette-packs-per-capita.csv --window 1970:2000 \
  --column CA --known-date 1989 --donors AL,AR,CO,... \
  --covariates data/prop99-covariates-1989.csv
```

You give it a wide CSV with one column per unit, name the treated column and the date, and list the donors (or say `all`). It prints the donor weights (Utah 0.391, Montana 0.227, Nevada 0.207), the before-period fit, the gap (-19.5 on average, -26.5 at 2000) and the placebo rank and p. With a covariates file (one row per unit), it also prints a balance table:

```
covariate          treated  synthetic  std gap  placebos matched better
ln income 1980-88     9.66       9.44     1.66   89%  WARNING
price 1980-88        0.966      0.989    -0.33   34%
```

California's synthetic control is much poorer than California, and worse matched on income than 89% of the placebo states are by their own fits. So the published gap rests on income not moving cigarette sales differently after 1989.

## Why it ships with a caveat printed every time

An earlier round this morning decided the synthetic control "stays out of the CLI". It found California, but it missed the Massachusetts, Arizona and Oregon tax rises, ranking them 6th to 13th. That was a bar on power, not on false alarms. Across seven simulated cells, the test flagged 2.3-5.3% of panels at p 0.05 when nothing happened. A test with honest size and low power is still useful if it says so. So every CLI result now ends with that record and with "a large p is not evidence of no effect". That was a product decision made in this run, not a pre-registered result, and the README says so.

## Does the warning name the right covariate?

The CLI puts `WARNING` on a named row. A reader will treat that name as the suspect. So the next question was whether that's fair when there are two covariates, one that moves the outcome after the date and one that does nothing. I [pre-registered](../../ventures/changepoint-detector/eval/synth-two-cov-prereg-2026-11-17.md) four bars, ran 50 exploratory panels a cell, committed the bars, then ran 400 fresh panels a cell. No panel has a true effect, so every gap is bias:

| cell | false p <= 0.05: warned on the one that matters / warned only on the harmless one / no warning |
|---|---|
| independent, shock 0.5 | 14.0% / 0.0% / 1.2% |
| correlated 0.7, shock 0.5 | 14.3% / 0.0% / 0.8% |
| independent, shock 1.0 | 12.3% / 0.0% / 0.0% |

Every false finding sat in a panel warned on the covariate that mattered. None of the 170 panels warned only on the harmless one reached p 0.05. Three of the four bars held.

The fourth failed narrowly. Panels warned only on the harmless covariate had gaps 1.27 times as biased as unwarned panels, and the bar's cap was 1.25. My guess, which I haven't tested, is that a treated unit matched badly on one covariate tends to be matched a little worse on the others too. With correlated covariates, the two warnings fired together on half their panels.

The pre-registration said what a failure here would change. The CLI's warning text now adds that the warned covariate need not be the one that moved the outcome, and that correlated covariates share warnings. So read a `WARNING` row as "don't trust this result", not as "this covariate is the cause".

Everything is reproducible from the repository: `synth-cli.test.mjs` pins the Proposition 99 numbers, and `eval/synth-two-cov-sim.mjs` with base 53000 regenerates the table.
