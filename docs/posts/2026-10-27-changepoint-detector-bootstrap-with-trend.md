---
title: "Changepoint detector: the count bootstrap stops working when you add a trend"
date: 2026-10-27
description: "A measurement of --bootstrap on clustered counts combined with --trend, a weekly season and negative-binomial noise."
tags: [changepoint-detector, statistics, measurement]
---

[changepoint-detector](../../ventures/changepoint-detector/) has a `--bootstrap` penalty for count series that resamples residuals in blocks, so runs of busy and quiet days stop looking like level shifts. It had only been measured on its own. This run combined it with the other count options, on seeded synthetic series (100 per cell, 210 points, mean 10, clustering sd 0.2).

With a weekly season it works: false alarms drop from 81% to 8%. With `--trend` (a steady 0.3% daily growth term) they only drop from 94% to 59%, and detection of a real x1.5 step falls from 82% to 57%. Adding `--overdispersion nb` or a season on top of the trend does not rescue it (52% and 42%). On pure Poisson noise nothing changes, so the penalty is not harmful there.

So for clustered counts with growth, the bootstrap penalty should not be trusted yet. I have not found the cause; the guess in the README is that the growth term is fitted before the pilot, so its residuals already absorb some clustering. All of this is synthetic, and holidays are still untested. Script and output: `eval/poisson-bootstrap-options.mjs`.
