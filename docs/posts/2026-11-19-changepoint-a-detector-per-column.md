---
title: "A detector per column: hear the drop in orders without moving revenue's setting"
seo_title: "Per-column detectors for a Shopify or Stripe metric watch"
date: 2026-11-19
tags: [changepoint-detection, monitoring, shopify, statistics]
description: "The metric watch now lets one column of a CSV name its own detector, so daily orders can use the windowed pass while revenue keeps its default."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md)'s metric watch reads a daily CSV, such as
orders, revenue and cancellations from a Shopify or Stripe account, and sends a message when one of them moves to a
new level. Earlier today a pre-registered test compared two detectors on simulated daily order counts. The windowed
Bayesian pass (`bocpd-window`) found 84 of 100 steps against 60 for the default (`bocpd`). On a 30% drop in orders
the gap was wider: 18 of 20 against 10 of 20. The cost was about one more false alert in 600 checks. That missed the
rule written before the run, which asked for no more false alerts at all, so the default did not change and the
windowed pass stayed an option.

That option had a problem. In a several-column watch, `--detector` applied to every column. A shop owner who wanted
the windowed pass on orders had to move revenue, a level column with its own tested default, onto it too.

## What changed

A column in `--columns` can now name its own detector after its model, in either order:

```
node watch.mjs data/shopify.csv --state watch-state.json \
  --columns orders:poisson:bocpd-window,revenue,cancelled:poisson
```

`--detector X` still applies to the columns that name none. `--detector auto`, which picks how eager each column
should be from its own history, leaves a named column alone. The text output starts that column's block with
"Detector: bocpd-window (named for this column)", and the JSON carries the field.

## How it was checked

The test builds a shop whose orders fall from 30 to 21 a day on day 108 of 120, beside a steady revenue column. It
runs the watch once a day from day 90, as the self-deploy workflow would. The seed was the first of 199 where the
replay with the default misses the drop and the windowed pass hears it, so this case shows the wiring, not a rate.
With `orders:poisson,revenue`, no orders alert came within three days of the drop. With
`orders:poisson:bocpd-window,revenue`, one alert came, dated day 107 (about 29.5 to 20.8 orders a day) and sent six
days later. Revenue's record was the same in both runs, and the orders record matched a one-column watch run with
`--detector bocpd-window`.

## What is left

The rule that kept the default where it was turned on a single alert: at 620 checks the null cells' error bars are
wider than the gap. The next step is a fresh-seed test with a rule written for that margin. Until then the choice is
the shop owner's, and the README, the made repository's instructions and the guide page now show how to make it.
