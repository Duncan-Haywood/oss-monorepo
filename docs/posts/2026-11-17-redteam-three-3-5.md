---
title: "Three tools that read 3,5 as two numbers"
seo_title: "Decimal commas in semicolon CSVs: three parsers that split 3,5 into 3 and 5"
date: 2026-11-17
tags: [redteam, testing, csv, changepoint-detector, pay-transparency, building-science]
description: "A red-team run on the synthetic control found its covariates file split 3,5 into two numbers. The same split was in a pay-gap checker (a -6300% gap) and a wall condensation check (R 6 for 0.06)."
---

Excel in a comma-decimal locale (most of Europe) saves a CSV with semicolons
between cells and commas inside numbers: `Engineers;3200,50;3400,00`. A parser
that splits every line on any of `,`, `;` or tab turns that into five cells:
`Engineers`, `3200`, `50`, `3400`, `00`. If it then takes the second and third
cells as the numbers, it raises no error, and the answer is wrong.

Today's red-team run found three of these in tools that serve exactly those
users.

| Tool | What a user typed | What it read |
|---|---|---|
| Pay transparency directive checker (EU Directive 2023/970) | `Engineers;3200,50;3400,00` | women 3200, men 50: a pay gap of **-6300%**, flagged as a category that needs a joint pay assessment |
| Wall condensation check, SI units | `Gypsum;0,06;2860` | a layer named "Gypsum, 0" with R **6** m²K/W, 100 times too much insulation |
| Change-point detector, synthetic-control covariates file | `unit;income` then `a;3,5` | two covariates, 3 and 5, under one header name, so the balance table showed an income of 3 and a phantom "covariate 2" |

The change-point detector's main CSV reader already handled this: when a file
has a semicolon, it splits on `;` only and reads the comma as a decimal point.
The covariates file, added today, had its own three-line splitter instead.
It now uses the main reader's helpers. It also refuses a row whose count of
numbers disagrees with the header, and a unit that appears on two rows (the
second row used to silently replace the first). The other two tools got the
same rule. A line with a semicolon splits on `;` and tab only. `3.200,50`
reads as 3200.5 and `52.000` as 52,000 (dot-grouped thousands). A bare `3.5`
stays 3.5. Comma-separated input reads exactly as before.

`parseClimate` in the wall check has the same split, but it refuses the
result loudly ("too many values"), so a user is told rather than misled. It
was left alone.

## The seeded faults

The run also seeded 8 faults into `synth-control.mjs` with
`prompts/redteam.py`. The changepoint-detector suite, about 250 test files,
caught 3. Of the 5 that got through, 3 are equivalent: one extra
power-iteration step; a floor of 1e-300 against 1e-301 that matters only when
the target is all zeros; and a softmax that drops its overflow guard, which
gave identical fits in 600 probes, including some where the search reached
theta = 428. The other 2 were real gaps, both in the row-form solver's
estimate of its step size. Starting the norm at 1 instead of 0 makes the step
100,000 times too small on tiny predictors, and the solver stops early. Never
updating the first coordinate makes the step about 3 times too large when one
predictor row dominates, and the solver oscillates. Neither changed any
published number, because the shipped fit scales every predictor to unit
spread. A direct caller could still hit them. The new test checks the
row-form solver against the other solver in the same file, run to
convergence, on both shapes. It fails under each fault and passes on the real
code.

Catch rate on this file: 3 of 8 before, 5 of 8 after (the other 3 are
equivalent). The run record is
`prompts/runs/2026-11-17-session_01E5sJKmCBdnc3iQHnGLLHuQ.json`.

## What is still open

22 venture files split on `,` and `;` together
(`grep -rn 'split(/\[,;' ventures`). Most of those split lists of codes or
names, where that is harmless. Seven more lines split a whole CSV line of
numbers on `/[,;\t]/`, in van-westendorp-pricing-analyzer,
gabor-granger-price-analyzer, saas-feature-packaging-optimizer,
patent-maintenance-fee-planner, aws-commitment-breakeven-calculator and
car-hauler-load-planner. Some of them may refuse the extra cells, as
`parseClimate` does. Each deserves the same two-minute probe with a
semicolon line, and that probe is where the next red-team run can start.
