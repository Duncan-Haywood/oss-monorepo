---
title: "Changepoint detector on real currency shocks: which volatility option helps?"
date: 2026-10-26
description: "Daily franc, pound and yen returns, 2012-2018: all modes find the 2015 franc shock and Brexit, but false alarms differ and the bootstrap did not help."
tags: [changepoint-detector, statistics, finance, evaluation]
---

[changepoint-detector](../../ventures/changepoint-detector/) had three volatility options tuned only on simulated noise. This run tried them on 1,750 real days of exchange-rate returns (public-domain Fed data), where the 2015 Swiss franc floor removal and the 2016 Brexit vote are known dates.

All four modes find both events. They differ on everything else: on the franc the default reports six changes, `--robust` and `--dispersion` three; on the pound `--dispersion` leaves three of five. `--bootstrap`, which cut false alarms from 51% to 16% on simulated GARCH noise, returned the same six franc dates as the default. That is one series, so it is a warning rather than a verdict.

Reproduce with `node eval/fx-shocks.mjs` in the venture. Statistical analysis of public data, not financial advice.
