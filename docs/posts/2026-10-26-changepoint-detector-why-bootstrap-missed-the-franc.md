---
title: "Why the bootstrap penalty missed the Swiss franc shock"
date: 2026-10-26
description: "On real franc returns the changepoint-detector bootstrap barely raised its penalty. The pilot fit standardised the 2015 shock away, kurtosis 111 down to 4.3."
tags: [changepoint-detector, statistics, fx, bootstrap]
---

[changepoint-detector](../../ventures/changepoint-detector/) has a `--bootstrap` option that sets the penalty from block-resampled residuals. On synthetic GARCH noise it cut false alarms from 51% to 16%. On 1,750 real daily Swiss franc returns it changed nothing: the same six dates as the default.

The cause is now measured. The bootstrap standardises the series using a pilot fit, and on the franc that fit puts the January 2015 floor shock in its own 10-day segment. Dividing each segment by its own sd drops the kurtosis from 111.5 to 4.3, so the resampled noise is nearly Gaussian and the penalty only rises from 22.4 to 36.4. A fixed penalty near 45 would drop three of the extra changes. A longer minimum segment for the pilot does not help.

So the option works when the heavy tails stay inside the series and under-corrects when one giant day dominates. A fix that standardises by a robust scale across the shock is untested. Evidence: `eval/fx-bootstrap-why.mjs`, one real series per currency, no labels beyond two dated events. Not statistical advice.
