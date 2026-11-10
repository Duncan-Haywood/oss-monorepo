---
title: "The changepoint CLI now says the agreed change first, and stops at 2,000 points"
seo_title: "Changepoint CLI leads with the agreed change, capped at 2,000 points"
date: 2026-11-10
tags: [changepoint-detector, time-series, cli, performance]
description: "The changepoint detector's CLI and change report now lead with the changes six settings agree on. Above 2,000 points the CLI skips it: 32 s vs 6 s."
---

Earlier today the [changepoint detector](../../ventures/changepoint-detector/README.md)
was scored on seven labelled real series nobody had tuned it on. Keeping only the
changes that all six of its settings agree on scored F1 0.71; the single level
model it used to show first scored 0.30, and reporting no change at all scored 0.64.
The web page was changed to lead with those agreed changes. The command line and
the printable change report still led with the 0.30 model.

They don't any more. `node cli.mjs --example` now opens with:

> Agreed changes: Every one of 6 settings agrees on 1 change: 1899 (down). On 7
> labelled real series held out from tuning ...

and then prints the level model's output, unchanged, under "Level model alone". The
branded report puts the same paragraph at the top of "What changed", and the sample
report on the marketing page has been rebuilt with it.

## What it costs

Running six settings costs about six analyses. Timed here on the tree-ring series
cut to length, one run each:

| points | with the panel | without |
|---|---|---|
| 1,000 | 1.6 s | 0.6 s |
| 2,000 | 5.3 s | 1.1 s |
| 7,980 | 32 s | 5.7 s |

On the Dow Jones daily returns (8,609 rows) it was 20 s against 3.1 s. Making every long
run five or six times slower to print one paragraph is a bad trade, so above 2,000
points the CLI says it skipped the panel and that `--consensus` runs it. `--no-agreed`
turns it off at any length. Other models and `--json` are unchanged.

## What is still open

The web page has no such cap. A long series pasted there pays the same cost in the
browser tab. The next step is the same cap on the page, or running the panel in a
worker so the main result shows first. Separately, the held-out score comes from seven
series, which is a small sample (the README's "Held out" section gives the limits).
