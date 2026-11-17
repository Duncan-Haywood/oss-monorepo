---
title: "A synthetic control in the browser: paste a wide CSV, name the date, read the balance table"
seo_title: "Synthetic control in the browser, with a covariate balance table"
date: 2026-11-17
tags: [changepoint-detection, synthetic-control, causal-inference, product]
description: "The changepoint detector's page now runs a synthetic control with placebo test and covariate balance warnings, all in the tab. No install, no upload."
---

Until today the [changepoint detector](../../ventures/changepoint-detector/README.md) could run a synthetic control only from its command line. That is the method of Abadie, Diamond and Hainmueller (2010): it compares one treated unit against a weighted blend of untreated ones. The people who ask the question it answers mostly don't keep Node installed. They are an analyst checking whether one store moved after a price change, or a policy researcher looking at one state's new law. So the page now does it too.

## How to use it

In "One column" mode, paste a wide CSV with one column per unit. Name the treated column in **Column** and the first row after the change in **Test a date you name**. Then type `all`, or a list of column names, into **Compare with other columns at that date**. You can also paste a covariates table: one row per unit, its column name first, then numbers, with a header naming them. A new card, "Against a synthetic control", shows:

- the gap after the date, on average and at the last point;
- the donor weights, and how closely the blend tracked the treated unit before the date, with a warning when it fitted worse than 80% of the placebos;
- the placebo test, in which each donor gets the same date. It shows the rank and p of the floored ratio, plus the paper's plain ratio for comparison;
- the covariate balance table, with a **Warning** cell on any covariate where 80% or more of the donors are matched better by their own synthetic controls than the treated unit is;
- the power caveat, a chart of the treated series against its synthetic, and a CSV download.

Everything runs in the page's background worker. Nothing is uploaded.

## The example is the published one

**Load example: California's 1989 tobacco tax against 38 states** fills in the boxes with Proposition 99 data. The data is packs sold per person from 1970 to 2000 and six 1980s covariates for each state. The donor pool is the 38 states with no large tax rise. The page shows the same numbers the command line prints, and a test checks they match. California ranks 1st of 39 (p 0.026). Its synthetic control is mostly Utah (0.391), Montana (0.227) and Nevada (0.207). The gap is -19.5 packs a head on average and -26.5 by 2000. The warning sits on income: California is 1.66 sd richer than its synthetic, and 89% of the donors are matched more closely.

That warning is the reason the table is on the page at all. Earlier rounds found that this "placebos matched better" share, not the usual 0.25 sd flag, was the signal to read. In simulation, panels warned this way gave false p ≤ 0.05 results 13 to 21% of the time when the covariate mattered. Unwarned panels did so 0 to 0.6% of the time. So the page shows California's result together with that caveat. The method's limits are printed with every result. It found California but missed Massachusetts, Arizona and Oregon (6th to 13th), so a large p does not show there was no effect.

## What's next

No new statistics landed in this change: every number on the card comes from code the command line already tested. Next comes shocks that are not steps, such as a covariate that drifts in after the date. After that, a real deployer's panel run through the same card.
